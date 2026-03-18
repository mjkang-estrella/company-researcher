import OpenAI from "openai";
import { z } from "zod";
import type { DerivedProfile } from "@/lib/types";

const currentDerivedProfileSchema = z.object({
  name: z.string().default(""),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      linkedin: z.string().optional(),
      location: z.string().optional(),
    })
    .default({}),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string().optional(),
        fieldOfStudy: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        accomplishments: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  work: z
    .array(
      z.object({
        company: z.string(),
        role: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        accomplishments: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  others: z
    .object({
      skills: z.array(z.string()).default([]),
      projects: z.array(z.string()).default([]),
      domains: z.array(z.string()).default([]),
      summary: z.string().default(""),
    })
    .default({
      skills: [],
      projects: [],
      domains: [],
      summary: "",
    }),
});

const legacyDerivedProfileSchema = z.object({
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

const SKILL_KEYWORDS = [
  "TypeScript",
  "JavaScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "Ruby",
  "Rails",
  "Go",
  "Java",
  "Kotlin",
  "Swift",
  "AWS",
  "GCP",
  "Azure",
  "Postgres",
  "MySQL",
  "Redis",
  "GraphQL",
  "REST APIs",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Machine Learning",
  "AI Infrastructure",
  "Data Engineering",
  "Analytics",
  "Product Strategy",
  "Growth",
  "Payments",
  "Fintech",
  "B2B SaaS",
];

function isNoiseLine(line: string) {
  return (
    /@|linkedin\.com|github\.com|https?:\/\/|www\./i.test(line) ||
    /\+?\d[\d\s().-]{7,}\d/.test(line) ||
    /^(education|experience|skills|projects|summary|contact)$/i.test(line) ||
    /^[A-Z][A-Z\s,.-]{4,}$/.test(line)
  );
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanList(values: string[], limit = 6) {
  return unique(values.map(cleanLine).filter(Boolean)).slice(0, limit);
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(text: string) {
  return text.match(/\+?\d[\d\s().-]{7,}\d/)?.[0]?.trim();
}

function extractLinkedIn(text: string) {
  return text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
}

function sliceLines(text: string, predicate: (line: string) => boolean, limit = 6) {
  return unique(
    text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => !isNoiseLine(line))
      .filter(predicate)
      .slice(0, limit),
  );
}

function detectName(lines: string[]) {
  return (
    lines.find((line) => /^[A-Z][A-Za-z]+(?:[\s,-]+[A-Z][A-Za-z]+){1,3}$/.test(line) && !isNoiseLine(line)) ?? ""
  );
}

function detectLocation(lines: string[]) {
  return (
    lines.find((line) => /,\s*[A-Z]{2}$/.test(line) || /\b(san francisco|new york|berkeley|seattle|los angeles)\b/i.test(line)) ??
    undefined
  );
}

function extractEducation(lines: string[]) {
  const education: DerivedProfile["education"] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\b(university|college|school|institute|academy)\b/i.test(line)) {
      continue;
    }

    const next = lines[index + 1];
    const following = lines[index + 2];
    const accomplishments = cleanList(
      [next, following].filter((value): value is string => Boolean(value)).filter((value) => !isNoiseLine(value)),
      2,
    );

    education.push({
      school: line,
      degree: next && /\b(BS|BA|MS|MBA|MA|PhD|Bachelor|Master|Doctor)\b/i.test(next) ? next : undefined,
      fieldOfStudy:
        next && /\b(computer science|business|engineering|economics|mathematics|design)\b/i.test(next) ? next : undefined,
      accomplishments,
    });
  }

  return education.slice(0, 3);
}

function extractWork(lines: string[], accomplishments: string[]) {
  const roleLines = lines.filter((line) =>
    /\b(engineer|manager|lead|director|founder|analyst|developer|designer|architect|product)\b/i.test(line),
  );

  const work: DerivedProfile["work"] = roleLines.slice(0, 4).map((roleLine, index) => {
    const companyLine =
      lines.find((line) => line !== roleLine && /\b(inc|corp|company|labs|ai|bio|systems|technologies|group|capital)\b/i.test(line)) ??
      `Role ${index + 1}`;

    return {
      company: companyLine,
      role: roleLine,
      accomplishments: cleanList(accomplishments.slice(index, index + 3), 3),
    };
  });

  if (work.length === 0 && accomplishments.length > 0) {
    work.push({
      company: "Recent Experience",
      role: undefined,
      accomplishments: cleanList(accomplishments, 4),
    });
  }

  return work;
}

export function normalizeDerivedProfile(input: unknown): DerivedProfile {
  const current = currentDerivedProfileSchema.safeParse(input);
  if (current.success) {
    return current.data;
  }

  const legacy = legacyDerivedProfileSchema.safeParse(input);
  if (legacy.success) {
    return {
      name: "",
      contact: {},
      education: [],
      work: legacy.data.titles.slice(0, 3).map((title, index) => ({
        company: legacy.data.careerTrajectory[index] ?? `Previous Role ${index + 1}`,
        role: title,
        accomplishments: cleanList(
          [
            legacy.data.accomplishments[index],
            legacy.data.quantifiedResults[index],
          ].filter((value): value is string => Boolean(value)),
          3,
        ),
      })),
      others: {
        skills: legacy.data.skills,
        projects: legacy.data.projects,
        domains: legacy.data.domains,
        summary: legacy.data.summary,
      },
    };
  }

  return {
    name: "",
    contact: {},
    education: [],
    work: [],
    others: {
      skills: [],
      projects: [],
      domains: [],
      summary: "",
    },
  };
}

export function deriveProfileHeuristically(text: string, supplementalNotes: string): DerivedProfile {
  const combined = `${text}\n${supplementalNotes}`.trim();
  const lines = combined
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isNoiseLine(line));

  const accomplishments = sliceLines(combined, (line) =>
    /\b(launched|built|led|owned|delivered|scaled|optimized|improved|shipped|grew|increased|reduced)\b/i.test(line),
  );
  const projects = sliceLines(combined, (line) =>
    /\b(project|platform|system|tool|product|pipeline|dashboard|service)\b/i.test(line),
  );
  const domains = sliceLines(combined, (line) =>
    /\b(ai|ml|machine learning|infra|platform|payments|fintech|health|enterprise|data|biotech)\b/i.test(line),
  );

  const parsedSkillsFromLabels = unique(
    combined
      .split(/\n+/)
      .filter((line) => /^skills?\s*:/i.test(line))
      .flatMap((line) => line.replace(/^skills?\s*:/i, "").split(/[•,|/]/))
      .map((item) => item.trim())
      .filter((item) => item.length > 1 && !isNoiseLine(item)),
  );

  const lowerCombined = combined.toLowerCase();
  const keywordSkills = SKILL_KEYWORDS.filter((skill) => lowerCombined.includes(skill.toLowerCase()));

  return {
    name: detectName(lines),
    contact: {
      email: extractEmail(combined),
      phone: extractPhone(combined),
      linkedin: extractLinkedIn(combined),
      location: detectLocation(lines),
    },
    education: extractEducation(lines),
    work: extractWork(lines, accomplishments),
    others: {
      skills: cleanList([...parsedSkillsFromLabels, ...keywordSkills], 12),
      projects,
      domains,
      summary:
        cleanList(accomplishments, 1)[0] ||
        cleanList(projects, 1)[0] ||
        "Resume profile captured and ready for company-specific tailoring.",
    },
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
name, contact, education, work, others.

Schema:
- name: string
- contact: { email?, phone?, linkedin?, location? }
- education: [{ school, degree?, fieldOfStudy?, startDate?, endDate?, accomplishments[] }]
- work: [{ company, role?, startDate?, endDate?, accomplishments[] }]
- others: { skills[], projects[], domains[], summary }

Rules:
- Put academic awards, leadership, publications, or notable achievements under education[].accomplishments when relevant.
- Put measurable or concrete execution results under the relevant work[].accomplishments.
- Never put names, emails, phone numbers, LinkedIn URLs, schools, or section headers into others.skills.
- Keep others.summary to one sentence about professional background.
- Use only information grounded in the input.

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

  const parsed = currentDerivedProfileSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function deriveProfile(text: string, supplementalNotes: string) {
  const llm = await deriveProfileWithLlm(text, supplementalNotes);
  return llm ?? deriveProfileHeuristically(text, supplementalNotes);
}
