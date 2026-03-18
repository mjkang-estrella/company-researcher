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
    citations: citations.slice(0, 3),
  };
}

export function computeBriefStatus(sections: BriefSection[]): "ready" | "limited-data" {
  return sections.some((section) => section.limitedData) ? "limited-data" : "ready";
}

function summarizeSignals(sources: SourceRecord[]) {
  return unique(
    sources.flatMap((source) => source.signals).filter((signal) => signal.trim().length > 20),
  ).slice(0, 6);
}

function buildFallbackBrief(company: CompanyRecord, profile: DerivedProfile, sources: SourceRecord[]) {
  const signals = summarizeSignals(sources);
  const official = sources.filter((source) => source.sourceType === "official");
  const news = sources.filter((source) => source.sourceType === "news");

  const overview =
    official[0]?.excerpt ||
    news[0]?.excerpt ||
    `${company.name} has live signals collected from public company pages, search results, and recent coverage.`;

  const currentDirectionAndNeeds = [
    signals[0] ?? `${company.name} appears to be emphasizing publicly visible company and hiring updates.`,
    signals[1] ?? "The current direction should be validated against fresh official and hiring sources.",
    signals[2] ?? "Use the cited sources to calibrate where the company is investing right now.",
  ].join(" ");

  const general = [
    `What has changed most in ${company.name}'s priorities over the last few months?`,
    `Which current team or product bets are getting the most internal attention right now?`,
    `Where do you see the biggest execution bottlenecks as the company scales from here?`,
  ];

  const personalized = [
    `My background includes ${profile.skills.slice(0, 3).join(", ") || "relevant technical work"}. Where would that experience be most useful against the team’s current priorities?`,
    `I’ve worked on ${profile.projects[0] || "cross-functional delivery"}. How does that compare to the problems your team is solving today?`,
    `Several of my wins involved ${profile.quantifiedResults[0] || "measurable business outcomes"}. How does the team evaluate impact for similar work here?`,
  ];

  const talkTracks = [
    `Lead with ${profile.summary}`,
    `Connect ${profile.skills.slice(0, 3).join(", ") || "your core skill set"} to ${company.name}'s visible priorities.`,
    `Use ${profile.quantifiedResults[0] || "a quantified outcome from your resume"} as proof of execution.`,
  ];

  const talkingPoints = [
    ...profile.accomplishments.slice(0, 2),
    ...profile.quantifiedResults.slice(0, 2),
    ...signals.slice(0, 2),
  ].filter(Boolean);

  return {
    overview,
    currentDirectionAndNeeds,
    suggestedQuestions: { general, personalized },
    appealAngle: { talkTracks, talkingPoints },
  };
}

async function generateWithLlm(company: CompanyRecord, profile: DerivedProfile, sources: SourceRecord[]) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `
You are generating a job seeker company research brief.
Use only the provided live sources and the candidate profile.
If information is weak, stay conservative and do not invent specifics.
Return strict JSON with keys:
overview, currentDirectionAndNeeds, suggestedQuestions.general, suggestedQuestions.personalized, appealAngle.talkTracks, appealAngle.talkingPoints.

Company:
${JSON.stringify({ name: company.name, url: company.url ?? null })}

Candidate profile:
${JSON.stringify(profile)}

Sources:
${JSON.stringify(sources)}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.3,
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

export async function synthesizeBrief(
  company: CompanyRecord,
  profile: DerivedProfile,
  sources: SourceRecord[],
): Promise<{ brief: Omit<BriefRecord, "_id" | "companyId">; status: "ready" | "limited-data" }> {
  const llm = await generateWithLlm(company, profile, sources);
  const base = llm ?? buildFallbackBrief(company, profile, sources);

  const overviewCitations = sources.slice(0, 2).map<Citation>((source) => ({
    title: source.title,
    url: source.url,
    note: source.sourceType,
  }));
  const needsCitations = sources.slice(0, 3).map<Citation>((source) => ({
    title: source.title,
    url: source.url,
    note: source.sourceType,
  }));
  const questionCitations = sources.slice(0, 2).map<Citation>((source) => ({
    title: source.title,
    url: source.url,
    note: source.sourceType,
  }));
  const appealCitations = sources
    .filter((source) => source.sourceType === "official" || source.sourceType === "search")
    .slice(0, 2)
    .map<Citation>((source) => ({
      title: source.title,
      url: source.url,
      note: source.sourceType,
    }));

  const sections = [
    buildSection("overview", "Overview", overviewCitations, overviewCitations.length),
    buildSection(
      "current-direction",
      "Current Direction & Needs",
      needsCitations,
      needsCitations.length,
    ),
    buildSection("questions", "Suggested Questions", questionCitations, questionCitations.length),
    buildSection("appeal", "Personalized Appeal Angle", appealCitations, appealCitations.length),
  ];

  return {
    brief: {
      generatedAt: Date.now(),
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
