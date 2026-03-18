import OpenAI from "openai";
import { z } from "zod";
import type { DerivedProfile } from "@/lib/types";

const derivedProfileSchema = z.object({
  titles: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  accomplishments: z.array(z.string()).default([]),
  quantifiedResults: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  careerTrajectory: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sliceLines(text: string, predicate: (line: string) => boolean, limit = 6) {
  return unique(
    text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(predicate)
      .slice(0, limit),
  );
}

export function deriveProfileHeuristically(text: string, supplementalNotes: string): DerivedProfile {
  const combined = `${text}\n${supplementalNotes}`.trim();
  const lines = combined.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const titles = sliceLines(combined, (line) =>
    /\b(engineer|manager|lead|director|founder|analyst|developer|designer|architect)\b/i.test(line),
  );
  const quantifiedResults = sliceLines(combined, (line) =>
    /\b\d+%|\$\d+|\b\d+[kKmMbB]?\b|\b(increased|reduced|grew|saved|improved)\b/i.test(line),
  );
  const projects = sliceLines(combined, (line) =>
    /\b(project|platform|system|tool|product|pipeline|dashboard|service)\b/i.test(line),
  );
  const accomplishments = sliceLines(combined, (line) =>
    /\b(launched|built|led|owned|delivered|scaled|optimized|improved|shipped)\b/i.test(line),
  );
  const domains = sliceLines(combined, (line) =>
    /\b(ai|ml|machine learning|infra|platform|payments|fintech|health|enterprise|data)\b/i.test(line),
  );

  const skillTokens = unique(
    [...combined.matchAll(/\b[A-Z][A-Za-z0-9+.#/-]{1,20}\b/g)].map((match) => match[0]),
  )
    .filter((token) => token.length > 2)
    .slice(0, 16);

  const careerTrajectory = unique(lines.slice(0, 8)).slice(0, 6);
  const summary =
    accomplishments[0] ||
    quantifiedResults[0] ||
    lines[0] ||
    "Resume profile captured and ready for company-specific tailoring.";

  return {
    titles,
    skills: skillTokens,
    projects,
    accomplishments,
    quantifiedResults,
    domains,
    careerTrajectory,
    summary,
  };
}

export async function deriveProfileWithLlm(
  text: string,
  supplementalNotes: string,
): Promise<DerivedProfile | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `
You extract a structured candidate profile from resume text.
Return strict JSON with keys:
titles, skills, projects, accomplishments, quantifiedResults, domains, careerTrajectory, summary.
Each list should contain concise strings. Use only information grounded in the input.

Resume text:
${text.slice(0, 18000)}

Supplemental notes:
${supplementalNotes.slice(0, 4000)}
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

  const parsed = derivedProfileSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function deriveProfile(text: string, supplementalNotes: string) {
  const llm = await deriveProfileWithLlm(text, supplementalNotes);
  return llm ?? deriveProfileHeuristically(text, supplementalNotes);
}
