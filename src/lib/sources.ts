import * as cheerio from "cheerio";
import type { SourceRecord } from "@/lib/types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";

const BLOCKED_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
];

type ExaResult = {
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  publishedDate?: string;
  highlights?: string[];
  highlightScores?: number[];
};

type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const COMPANY_CONTEXT_RE =
  /\b(company|startup|business|careers|jobs|funding|series|software|platform|api|product|engineering|team|announced|launch|launches|raised|raises|valuation|revenue|hiring|press|news)\b/i;

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

function normalizedHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function significantCompanyTokens(companyName: string) {
  return companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function mentionsCompany(value: string, companyName: string, tokens: string[]) {
  const normalized = sanitizeText(value).toLowerCase();
  const exactPhrase = normalized.includes(companyName.toLowerCase());
  const tokenMatches = tokens.filter((token) => normalized.includes(token)).length;
  return exactPhrase || tokenMatches >= Math.min(tokens.length, 2);
}

export function isRelevantResult(result: SearchHit, companyName: string, officialHost?: string) {
  const titleAndSnippet = `${result.title} ${result.snippet}`;
  const tokens = significantCompanyTokens(companyName);
  const sameOfficialHost = officialHost ? normalizedHost(result.url) === officialHost : false;
  const mentioned = mentionsCompany(titleAndSnippet, companyName, tokens);
  const hasContext = COMPANY_CONTEXT_RE.test(titleAndSnippet) || /\/(about|company|careers|jobs|press|news|blog)\b/i.test(result.url);

  if (sameOfficialHost) {
    return true;
  }

  if (!mentioned) {
    return false;
  }

  if (tokens.length <= 1) {
    return hasContext;
  }

  return true;
}

export function sanitizeText(value: string) {
  const decoded = cheerio.load(`<div>${value}</div>`).text();
  return decoded.replace(/^description:\s*/i, "").replace(/\s+/g, " ").trim();
}

function trimText(value: string, max = 420) {
  const compact = sanitizeText(value);
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

function extractSnippet(result: ExaResult) {
  const candidates = [
    ...(Array.isArray(result.highlights) ? result.highlights : []),
    result.summary,
    result.text,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const cleaned = trimText(candidate, 320);
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

async function searchExa(query: string, numResults = 5) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return [];
  }

  const response = await fetch(EXA_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults,
      contents: {
        text: {
          maxCharacters: 1200,
        },
      },
    }),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Exa search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { results?: ExaResult[] };
  const results = Array.isArray(payload.results) ? payload.results : [];

  return results
    .map((result) => {
      const url = normalizeUrl(result.url ?? "");
      const title = trimText(result.title ?? "", 160);
      if (!url || !title) {
        return null;
      }

      return {
        title,
        url,
        snippet: extractSnippet(result),
      };
    })
    .filter((result): result is SearchHit => Boolean(result))
    .filter((result) => hostAllowed(result.url))
    .slice(0, numResults);
}

async function findOfficialSite(companyName: string, companyUrl?: string) {
  if (companyUrl) {
    return normalizeUrl(companyUrl);
  }

  const results = await searchExa(`${companyName} official site`, 5);
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

      const pathname = new URL(url).pathname;
      results.push({
        title: url === officialSite ? `${companyName} official site` : trimText(pathname || url, 160),
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
  if (!process.env.EXA_API_KEY && !companyUrl) {
    throw new Error("Missing EXA_API_KEY. Add it to .env.local or provide an official company URL.");
  }

  const officialSite = await findOfficialSite(companyName, companyUrl);
  const officialHost = officialSite ? normalizedHost(officialSite) : undefined;
  const officialPagesPromise = officialSite ? fetchOfficialPages(companyName, officialSite) : Promise.resolve([]);

  const [officialPages, searchResults, newsResults] = await Promise.all([
    officialPagesPromise,
    searchExa(`"${companyName}" company careers funding latest news`, 8),
    searchExa(`"${companyName}" company product launches funding press news`, 8),
  ]);

  const searchSources: SourceRecord[] = searchResults
    .filter((result) => isRelevantResult(result, companyName, officialHost))
    .map((result) => ({
    title: result.title,
    url: result.url,
    sourceType: "search",
    excerpt: result.snippet,
    signals: [result.snippet].filter(Boolean),
    fetchedAt: Date.now(),
    }));

  const newsSources: SourceRecord[] = newsResults
    .filter((result) => isRelevantResult(result, companyName, officialHost))
    .map((result) => ({
    title: result.title,
    url: result.url,
    sourceType: "news",
    excerpt: result.snippet,
    signals: [result.snippet].filter(Boolean),
    fetchedAt: Date.now(),
    }));

  const sources = dedupeSources([...officialPages, ...searchSources, ...newsSources]).slice(0, 10);
  if (sources.length > 0) {
    return sources;
  }

  if (!companyUrl) {
    throw new Error(`Search results for "${companyName}" are ambiguous. Add the official company URL to disambiguate it.`);
  }

  return sources;
}
