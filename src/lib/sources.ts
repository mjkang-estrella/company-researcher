import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { SourceRecord } from "@/lib/types";

const BLOCKED_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
];

function normalizeUrl(input: string) {
  try {
    return new URL(input).toString();
  } catch {
    return input;
  }
}

function hostAllowed(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !BLOCKED_HOSTS.some((blocked) => host.includes(blocked));
  } catch {
    return false;
  }
}

function trimText(value: string, max = 420) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "company-researcher/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return response.text();
}

function extractPageText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return trimText($("body").text(), 1200);
}

async function searchDuckDuckGo(query: string) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  return $(".result")
    .map((_, element) => {
      const title = trimText($(element).find(".result__title").text(), 160);
      const href = $(element).find(".result__title a").attr("href");
      const snippet = trimText($(element).find(".result__snippet").text(), 260);
      if (!href || !title) {
        return null;
      }
      return { title, url: normalizeUrl(href), snippet };
    })
    .get()
    .filter((result): result is { title: string; url: string; snippet: string } => Boolean(result))
    .filter((result) => hostAllowed(result.url))
    .slice(0, 5);
}

async function getGoogleNews(companyName: string) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(companyName)}`;
  const response = await fetch(rssUrl, { next: { revalidate: 0 } });
  if (!response.ok) {
    return [];
  }
  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.slice(0, 5).map((item: Record<string, string>) => ({
    title: trimText(item.title ?? "News item", 180),
    url: normalizeUrl(item.link ?? ""),
    snippet: trimText(item.description ?? item.title ?? "", 320),
  }));
}

async function findOfficialSite(companyName: string, companyUrl?: string) {
  if (companyUrl) {
    return normalizeUrl(companyUrl);
  }

  const results = await searchDuckDuckGo(`${companyName} official site`);
  return results[0]?.url;
}

async function fetchOfficialPages(companyName: string, companyUrl?: string) {
  const officialSite = await findOfficialSite(companyName, companyUrl);
  if (!officialSite) {
    return [];
  }

  const pages = [officialSite];
  try {
    const html = await fetchHtml(officialSite);
    const $ = cheerio.load(html);
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      const label = $(element).text().toLowerCase();
      if (!href) {
        return;
      }
      if (!/(about|company|careers|jobs|press|news)/i.test(`${href} ${label}`)) {
        return;
      }
      try {
        pages.push(new URL(href, officialSite).toString());
      } catch {
        // Ignore malformed links.
      }
    });
  } catch {
    return [];
  }

  const uniquePages = [...new Set(pages)].slice(0, 4);
  const results: SourceRecord[] = [];
  for (const url of uniquePages) {
    try {
      const html = await fetchHtml(url);
      const text = extractPageText(html);
      if (!text) {
        continue;
      }
      results.push({
        title: url === officialSite ? `${companyName} official site` : new URL(url).pathname || url,
        url,
        sourceType: "official",
        excerpt: text,
        signals: text
          .split(". ")
          .map((sentence) => trimText(sentence, 160))
          .filter(Boolean)
          .slice(0, 4),
        fetchedAt: Date.now(),
      });
    } catch {
      // Ignore fetch failures for secondary pages.
    }
  }
  return results;
}

export function dedupeSources(sources: SourceRecord[]) {
  const byUrl = new Map<string, SourceRecord>();
  for (const source of sources) {
    byUrl.set(source.url, source);
  }
  return [...byUrl.values()];
}

export async function collectCompanySources(companyName: string, companyUrl?: string) {
  const [officialPages, searchResults, newsResults] = await Promise.all([
    fetchOfficialPages(companyName, companyUrl),
    searchDuckDuckGo(`${companyName} careers funding latest news`),
    getGoogleNews(companyName),
  ]);

  const searchSources: SourceRecord[] = searchResults.map((result) => ({
    title: result.title,
    url: result.url,
    sourceType: "search",
    excerpt: result.snippet,
    signals: [result.snippet].filter(Boolean),
    fetchedAt: Date.now(),
  }));

  const newsSources: SourceRecord[] = newsResults
    .filter((result) => result.url)
    .map((result) => ({
      title: result.title,
      url: result.url,
      sourceType: "news",
      excerpt: result.snippet,
      signals: [result.snippet].filter(Boolean),
      fetchedAt: Date.now(),
    }));

  return dedupeSources([...officialPages, ...searchSources, ...newsSources]).slice(0, 10);
}
