import OpenAI from "openai";
import { z } from "zod";
import type {
  BriefRecord,
  BriefSection,
  Citation,
  CompanyRecord,
  ConfidenceLevel,
  DerivedProfile,
  SourceRecord,
} from "@/lib/types";

const llmBriefSchema = z.object({
  companyIntro: z.string(),
  overview: z.string(),
  currentDirectionAndNeeds: z.string(),
  suggestedQuestions: z.object({
    general: z.array(z.string()),
    personalized: z.array(z.string()),
  }),
  appealAngle: z.object({
    talkTracks: z.array(z.string()),
    talkingPoints: z.array(z.string()),
  }),
});

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function confidenceFromSourceCount(count: number): ConfidenceLevel {
  if (count >= 5) return "high";
  if (count >= 3) return "medium";
  return "low";
}

export function buildSection(
  key: string,
  title: string,
  citations: Citation[],
  sourceCount: number,
): BriefSection {
  const confidence = confidenceFromSourceCount(sourceCount);
  return {
    key,
    title,
    confidence,
    limitedData: confidence === "low",
    citations: citations.slice(0, 4),
  };
}

export function computeBriefStatus(sections: BriefSection[]): "ready" | "limited-data" {
  return sections.some((section) => section.limitedData) ? "limited-data" : "ready";
}

function sanitizeSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function profileSkills(profile: DerivedProfile) {
  return cleanProfileList(profile.others.skills, 6);
}

function profileProjects(profile: DerivedProfile) {
  return cleanProfileList(profile.others.projects, 6);
}

function profileDomains(profile: DerivedProfile) {
  return cleanProfileList(profile.others.domains, 6);
}

function profileWorkAccomplishments(profile: DerivedProfile) {
  return cleanProfileList(profile.work.flatMap((item) => item.accomplishments), 8);
}

function profileEducationAccomplishments(profile: DerivedProfile) {
  return cleanProfileList(profile.education.flatMap((item) => item.accomplishments), 6);
}

function sentenceList(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map(sanitizeSentence)
    .filter((sentence) => sentence.length > 25);
}

function firstUsefulSentences(value: string, count = 2) {
  return sentenceList(value).slice(0, count).join(" ");
}

function isCareersSource(source: SourceRecord) {
  const text = `${source.title} ${source.url} ${source.excerpt}`.toLowerCase();
  return /\b(careers|jobs|job|hiring|open roles|open positions|join our team)\b/.test(text);
}

function introSources(sources: SourceRecord[]) {
  return [
    ...sources.filter((source) => source.sourceType === "official" && !isCareersSource(source)),
    ...sources.filter((source) => source.sourceType === "search"),
    ...sources.filter((source) => source.sourceType === "official" && isCareersSource(source)),
  ];
}

function needsSources(sources: SourceRecord[]) {
  return [
    ...sources.filter((source) => source.sourceType === "official" && !isCareersSource(source)),
    ...sources.filter((source) => source.sourceType === "news"),
    ...sources.filter((source) => source.sourceType === "search"),
    ...sources.filter((source) => source.sourceType === "official" && isCareersSource(source)),
  ];
}

function recentNewsSources(sources: SourceRecord[]) {
  return sources.filter((source) => source.sourceType === "news");
}

function summarizeSignals(sources: SourceRecord[]) {
  return unique(
    sources.flatMap((source) => source.signals).map(sanitizeSentence).filter((signal) => signal.length > 30),
  ).slice(0, 8);
}

function containsPromptLeak(value: string) {
  return /\b(start for free|read more|pricing|careers|docs|view open roles|health & fitness|flexible pto|benefits)\b/i.test(
    value,
  );
}

function isWeakIntro(value: string) {
  const compact = sanitizeSentence(value);
  return (
    !compact ||
    sentenceList(compact).length !== 1 ||
    compact.length > 180 ||
    containsPromptLeak(compact) ||
    /\b(we raised|we're looking to grow fast|we'd love to hear from you|build the future)\b/i.test(compact)
  );
}

function isWeakOverview(value: string) {
  const compact = sanitizeSentence(value);
  return (
    !compact ||
    containsPromptLeak(compact) ||
    compact.split(" - ").length > 2 ||
    sentenceList(compact).length === 0
  );
}

function isWeakNeeds(value: string) {
  const compact = sanitizeSentence(value);
  const careersMentions = compact.match(/\b(careers|jobs|job|hiring|open roles|team)\b/gi)?.length ?? 0;
  return (
    !compact ||
    containsPromptLeak(compact) ||
    careersMentions >= 3 ||
    !/\b(need|needs|priority|priorities|risk|execution|strategy|strategic|bottleneck|focus|phase)\b/i.test(compact)
  );
}

function isWeakQuestion(value: string) {
  const compact = sanitizeSentence(value);
  return (
    !compact ||
    compact.length < 20 ||
    /@|linkedin\.com|github\.com|https?:\/\/|www\./i.test(compact) ||
    /\+?\d[\d\s().-]{7,}\d/.test(compact) ||
    /\b(education|contact|phone|email)\b/i.test(compact)
  );
}

function cleanProfileValue(value: string) {
  const cleaned = sanitizeSentence(value);
  if (!cleaned) return null;
  if (/@|linkedin\.com|github\.com|https?:\/\/|www\./i.test(cleaned)) return null;
  if (/\+?\d[\d\s().-]{7,}\d/.test(cleaned)) return null;
  if (/^(education|experience|skills|projects|summary|contact)$/i.test(cleaned)) return null;
  if (/^[A-Z][A-Z\s,.-]{4,}$/.test(cleaned)) return null;
  return cleaned;
}

function cleanProfileList(values: string[], limit: number) {
  return unique(values.map((value) => cleanProfileValue(value)).filter((value): value is string => Boolean(value))).slice(0, limit);
}

function companyDescription(company: CompanyRecord, sources: SourceRecord[]) {
  const prioritized = introSources(sources);
  const official = prioritized.find((source) => source.sourceType === "official");
  const search = prioritized.find((source) => source.sourceType === "search");
  const source = official ?? search;
  if (!source) {
    return `${company.name} is a company with limited public source coverage in the current brief.`;
  }

  return (
    firstUsefulSentences(source.excerpt, 2) ||
    `${company.name} is described in its public materials and related company coverage.`
  );
}

function singleSentenceIntro(value: string, fallback: string) {
  const first = sentenceList(value)[0];
  if (!first) return fallback;
  return first.replace(/[;:]\s.*$/, "").trim();
}

function inferStrategicNeeds(company: CompanyRecord, sources: SourceRecord[]) {
  const scoped = needsSources(sources);
  const official = scoped.filter((source) => source.sourceType === "official" && !isCareersSource(source));
  const news = scoped.filter((source) => source.sourceType === "news");
  const search = scoped.filter((source) => source.sourceType === "search");
  const combined = `${official.map((item) => item.excerpt).join(" ")} ${news.map((item) => item.excerpt).join(" ")} ${search.map((item) => item.excerpt).join(" ")}`.toLowerCase();

  const needs: string[] = [];

  if (/\b(partner|partnership|collaboration|collaborat|alliance)\b/.test(combined)) {
    needs.push("turning new partnerships into repeatable execution and measurable customer or research outcomes");
  }
  if (/\b(launch|launched|product|platform|api|release|released)\b/.test(combined)) {
    needs.push("converting recent product momentum into adoption, proof points, and operational reliability");
  }
  if (/\b(funding|raised|investor|valuation|seed|series)\b/.test(combined)) {
    needs.push("showing disciplined execution after recent capital or investor attention");
  }
  if (/\b(careers|jobs|hiring|team|role|roles)\b/.test(combined)) {
    needs.push("hiring selectively for the functions most tied to current strategic bottlenecks");
  }
  if (/\b(biotech|drug|genomic|genomics|therapeutic|pharma|disease|clinical)\b/.test(combined)) {
    needs.push("validating the platform through scientific throughput, partner trust, and credible downstream outcomes");
  }
  if (/\b(enterprise|customer|clients|b2b|commercial)\b/.test(combined)) {
    needs.push("tightening the path from product capability to repeatable commercial value");
  }

  const uniqueNeeds = unique(needs).slice(0, 3);
  if (uniqueNeeds.length === 0) {
    uniqueNeeds.push(
      "translating visible company momentum into a sharper execution plan",
      "focusing the team on a few high-leverage priorities rather than broad activity",
    );
  }

  const recentNews = news
    .map((item) => item.title)
    .filter(Boolean)
    .slice(0, 2)
    .join("; ");
  const newsContext = recentNews ? `Recent coverage points to ${recentNews}. ` : "";

  return `${newsContext}${company.name} appears to be in a phase where the core challenge is not just shipping or announcing new work, but proving that the current direction can compound into durable traction. The most likely near-term needs are ${uniqueNeeds.join(", ")}.`;
}

function buildGeneralQuestions(company: CompanyRecord, sources: SourceRecord[]) {
  const newsTitles = recentNewsSources(sources)
    .map((source) => source.title)
    .slice(0, 2);

  const questions = [
    `What changed internally that made ${newsTitles[0] ? `"${newsTitles[0]}"` : "the current direction"} a priority right now?`,
    `What has to go right over the next 6 to 12 months for ${company.name}'s current strategy to feel validated?`,
    `Where do you see the biggest execution risk right now: product, go-to-market, partnerships, or team capacity?`,
  ];

  return questions.slice(0, 3);
}

function buildPersonalizedQuestions(profile: DerivedProfile, company: CompanyRecord) {
  const skills = profileSkills(profile).slice(0, 3);
  const projects = profileProjects(profile).slice(0, 2);
  const accomplishments = profileWorkAccomplishments(profile).slice(0, 3);
  const educationWins = profileEducationAccomplishments(profile).slice(0, 2);

  const questions: string[] = [];

  if (skills.length > 0) {
    questions.push(
      `My background includes ${skills.join(", ")}. Which of those capabilities would be most useful against ${company.name}'s current priorities?`,
    );
  }
  if (projects.length > 0) {
    questions.push(
      `I've worked on ${projects[0]}. Which problems on your team are structurally similar right now?`,
    );
  }
  if (accomplishments.length > 0) {
    questions.push(
      `In prior roles I've driven outcomes like ${accomplishments[0]}. How does your team define meaningful impact for similar work?`,
    );
  }
  if (questions.length < 3 && educationWins.length > 0) {
    questions.push(`One part of my academic background was ${educationWins[0]}. Does that kind of background matter for the way your team works today?`);
  }

  if (questions.length === 0) {
    questions.push(
      `Which parts of my background would you want me to emphasize if I were trying to be maximally relevant to ${company.name}'s immediate needs?`,
      `For someone joining now, what kind of past work tends to transfer especially well onto your team?`,
    );
  }

  return questions.slice(0, 3);
}

function buildAppealAngle(profile: DerivedProfile, company: CompanyRecord, sources: SourceRecord[]) {
  const skills = profileSkills(profile).slice(0, 3);
  const accomplishments = profileWorkAccomplishments(profile).slice(0, 3);
  const signals = summarizeSignals(sources).slice(0, 2);

  const talkTracks = [
    cleanProfileValue(profile.others.summary)
      ? `Lead with a concise version of your story: ${cleanProfileValue(profile.others.summary)}`
      : `Lead with the part of your background that best fits ${company.name}'s current operating priorities.`,
    skills.length > 0
      ? `Connect ${skills.join(", ")} directly to the company's visible execution needs.`
      : `Translate your strongest functional strengths into the company's current execution gaps.`,
    accomplishments.length > 0
      ? `Use ${accomplishments[0]} as proof that you can turn strategy into measurable outcomes.`
      : `Anchor your case in one concrete example of moving from ambiguity to measurable execution.`,
  ].filter(Boolean) as string[];

  const talkingPoints = [...accomplishments, ...signals].slice(0, 5);

  return { talkTracks, talkingPoints };
}

function buildFallbackBrief(company: CompanyRecord, profile: DerivedProfile, sources: SourceRecord[]) {
  const intro = companyDescription(company, introSources(sources));
  return {
    companyIntro: singleSentenceIntro(intro, `${company.name} is a company with limited public source coverage in the current brief.`),
    overview: companyDescription(company, introSources(sources)),
    currentDirectionAndNeeds: inferStrategicNeeds(company, needsSources(sources)),
    suggestedQuestions: {
      general: buildGeneralQuestions(company, recentNewsSources(sources)),
      personalized: buildPersonalizedQuestions(profile, company),
    },
    appealAngle: buildAppealAngle(profile, company, needsSources(sources)),
  };
}

async function generateWithLlm(company: CompanyRecord, profile: DerivedProfile, sources: SourceRecord[]) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const safeProfile = {
    name: cleanProfileValue(profile.name) ?? "",
    contact: profile.contact,
    education: profile.education.map((item) => ({
      ...item,
      accomplishments: cleanProfileList(item.accomplishments, 4),
    })),
    work: profile.work.map((item) => ({
      ...item,
      accomplishments: cleanProfileList(item.accomplishments, 4),
    })),
    others: {
      skills: profileSkills(profile),
      projects: profileProjects(profile),
      domains: profileDomains(profile),
      summary: cleanProfileValue(profile.others.summary) ?? "",
    },
  };

  const prompt = `
You are generating a company research brief for a job seeker.
Use only the provided sources and safe candidate profile.
If information is weak, stay conservative and make strategic assumptions explicit.

Return strict JSON with keys:
companyIntro, overview, currentDirectionAndNeeds, suggestedQuestions.general, suggestedQuestions.personalized, appealAngle.talkTracks, appealAngle.talkingPoints.

Rules:
- companyIntro: exactly one sentence, plain English, defining what the company does now. No banner copy, no fundraising CTA, no careers copy, no slogans.
- overview: describe what the company is and what it appears to be doing now. Do not make this a list of news headlines.
- currentDirectionAndNeeds: infer the company's current situation and likely strategic needs. Do not paste raw source text. Do not turn this into a careers summary.
- suggestedQuestions.general: ask strategic, research-backed questions about priorities, execution risks, and current direction.
- suggestedQuestions.personalized: use only safe profile fields below. Never mention names, email, phone, LinkedIn, school, location, or resume headers.
- appealAngle: connect the candidate's useful experience to the company's likely needs without copying noisy resume text.

Company:
${JSON.stringify({ name: company.name, url: company.url ?? null })}

Safe candidate profile:
${JSON.stringify(safeProfile)}

Sources:
${JSON.stringify(sources)}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return null;
  }

  const parsed = llmBriefSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

function repairBrief(base: z.infer<typeof llmBriefSchema>, company: CompanyRecord, profile: DerivedProfile, sources: SourceRecord[]) {
  const fallback = buildFallbackBrief(company, profile, sources);
  const personalized = base.suggestedQuestions.personalized
    .map(sanitizeSentence)
    .filter((question) => !isWeakQuestion(question));
  const general = base.suggestedQuestions.general
    .map(sanitizeSentence)
    .filter((question) => !isWeakQuestion(question));
  const talkingPoints = base.appealAngle.talkingPoints
    .map(sanitizeSentence)
    .filter((point) => !isWeakQuestion(point))
    .slice(0, 5);

  return {
    companyIntro: isWeakIntro(base.companyIntro)
      ? fallback.companyIntro
      : singleSentenceIntro(base.companyIntro, fallback.companyIntro),
    overview: isWeakOverview(base.overview)
      ? fallback.overview
      : firstUsefulSentences(base.overview, 2) || fallback.overview,
    currentDirectionAndNeeds: isWeakNeeds(base.currentDirectionAndNeeds)
      ? fallback.currentDirectionAndNeeds
      : firstUsefulSentences(base.currentDirectionAndNeeds, 4) || fallback.currentDirectionAndNeeds,
    suggestedQuestions: {
      general: (general.length >= 2 ? general : fallback.suggestedQuestions.general).slice(0, 3),
      personalized: (personalized.length > 0 ? personalized : fallback.suggestedQuestions.personalized).slice(0, 3),
    },
    appealAngle: {
      talkTracks: base.appealAngle.talkTracks.map(sanitizeSentence).filter(Boolean).slice(0, 3),
      talkingPoints: (talkingPoints.length > 0 ? talkingPoints : fallback.appealAngle.talkingPoints).slice(0, 5),
    },
  };
}

export async function synthesizeBrief(
  company: CompanyRecord,
  profile: DerivedProfile,
  sources: SourceRecord[],
): Promise<{ brief: Omit<BriefRecord, "_id" | "companyId">; status: "ready" | "limited-data" }> {
  const llm = await generateWithLlm(company, profile, sources);
  const base = llm ? repairBrief(llm, company, profile, sources) : buildFallbackBrief(company, profile, sources);

  const newsSources = recentNewsSources(sources);
  const officialSources = sources.filter((source) => source.sourceType === "official");
  const nonCareerOfficialSources = officialSources.filter((source) => !isCareersSource(source));
  const searchSources = sources.filter((source) => source.sourceType === "search");

  const overviewCitations = [...nonCareerOfficialSources, ...searchSources, ...newsSources]
    .slice(0, 4)
    .map<Citation>((source) => ({
      title: source.title,
      url: source.url,
      note: source.sourceType,
    }));
  const needsCitations = [...newsSources, ...nonCareerOfficialSources, ...searchSources]
    .slice(0, 4)
    .map<Citation>((source) => ({
      title: source.title,
      url: source.url,
      note: source.sourceType,
    }));
  const questionCitations = [...newsSources, ...officialSources]
    .slice(0, 4)
    .map<Citation>((source) => ({
      title: source.title,
      url: source.url,
      note: source.sourceType,
    }));
  const appealCitations = [...officialSources, ...searchSources]
    .slice(0, 4)
    .map<Citation>((source) => ({
      title: source.title,
      url: source.url,
      note: source.sourceType,
    }));

  const sections = [
    buildSection("overview", "Overview", overviewCitations, overviewCitations.length),
    buildSection("current-direction", "Current Direction & Needs", needsCitations, needsCitations.length),
    buildSection("questions", "Suggested Questions", questionCitations, questionCitations.length),
    buildSection("appeal", "Personalized Appeal Angle", appealCitations, appealCitations.length),
  ];

  return {
    brief: {
      generatedAt: Date.now(),
      companyIntro: base.companyIntro,
      overview: base.overview,
      currentDirectionAndNeeds: base.currentDirectionAndNeeds,
      suggestedQuestions: {
        general: base.suggestedQuestions.general.slice(0, 4),
        personalized: base.suggestedQuestions.personalized.slice(0, 4),
      },
      appealAngle: {
        talkTracks: base.appealAngle.talkTracks.slice(0, 4),
        talkingPoints: base.appealAngle.talkingPoints.slice(0, 5),
      },
      sections,
    },
    status: computeBriefStatus(sections),
  };
}
