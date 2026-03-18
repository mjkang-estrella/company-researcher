import { describe, expect, it } from "vitest";
import { buildSection, computeBriefStatus, synthesizeBrief } from "@/lib/brief";
import { dedupeSources, isRelevantResult, sanitizeText } from "@/lib/sources";
import { deriveProfileHeuristically } from "@/lib/profile";

describe("deriveProfileHeuristically", () => {
  it("extracts a usable derived profile from resume text", () => {
    const profile = deriveProfileHeuristically(
      `
      Jane Doe
      Senior Software Engineer
      Built internal analytics platform that improved activation by 18%.
      Led payments migration project across 3 teams.
      University of California, Berkeley
      MBA, Dean's List
      Skills: TypeScript, React, AWS, Stripe
      `,
      "Additional note: interested in AI infrastructure",
    );

    expect(profile.name).toBe("Jane Doe");
    expect(profile.work[0]?.role).toContain("Engineer");
    expect(profile.work.flatMap((item) => item.accomplishments).join(" ")).toContain("18%");
    expect(profile.others.skills.length).toBeGreaterThan(0);
    expect(profile.education[0]?.accomplishments.join(" ")).toContain("Dean's List");
  });

  it("does not treat resume header noise as skills", () => {
    const profile = deriveProfileHeuristically(
      `
      MYEONGJIN KANG
      mj.kang@example.com
      linkedin.com/in/mj-kang
      EDUCATION
      University of California, Berkeley
      Skills: TypeScript, React, Product Strategy
      `,
      "",
    );

    expect(profile.others.skills).toContain("TypeScript");
    expect(profile.others.skills).not.toContain("MYEONGJIN");
    expect(profile.others.skills).not.toContain("EDUCATION");
  });
});

describe("dedupeSources", () => {
  it("keeps the last source for duplicate URLs", () => {
    const deduped = dedupeSources([
      { title: "A", url: "https://example.com", sourceType: "official", excerpt: "one", signals: [], fetchedAt: 1 },
      { title: "B", url: "https://example.com", sourceType: "news", excerpt: "two", signals: [], fetchedAt: 2 },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].title).toBe("B");
  });
});

describe("sanitizeText", () => {
  it("strips html and leading description labels from snippets", () => {
    const cleaned = sanitizeText(
      'description: <a href="https://example.com">Introducing Kollokium Projekt 02 Variant B</a>',
    );

    expect(cleaned).toBe("Introducing Kollokium Projekt 02 Variant B");
  });
});

describe("isRelevantResult", () => {
  it("rejects generic single-word matches without company context", () => {
    const relevant = isRelevantResult(
      {
        title: "Introducing Kollokium Projekt 02 Variant B",
        url: "https://example.com/design-news",
        snippet: "First public sale opens after the darker revision of Variant B.",
      },
      "Variant",
    );

    expect(relevant).toBe(false);
  });

  it("keeps single-word matches when official-site context terms align", () => {
    const relevant = isRelevantResult(
      {
        title: "Variant launches new design workflow for creative teams",
        url: "https://designnews.example.com/variant-workflow",
        snippet: "Variant introduced a new design canvas and collaboration workflow for visual ideation.",
      },
      "Variant",
      "variant.com",
      ["design", "canvas"],
    );

    expect(relevant).toBe(true);
  });
});

describe("brief confidence", () => {
  it("marks low-source sections as limited data", () => {
    const section = buildSection("overview", "Overview", [], 1);
    expect(section.confidence).toBe("low");
    expect(section.limitedData).toBe(true);
    expect(computeBriefStatus([section])).toBe("limited-data");
  });
});

describe("synthesizeBrief", () => {
  it("builds a company description and strategic needs from sources", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = await synthesizeBrief(
      { _id: "c1", name: "Variant", status: "idle", updatedAt: Date.now() },
      {
        name: "Jane Doe",
        contact: {
          email: "jane@example.com",
        },
        education: [
          {
            school: "UC Berkeley",
            degree: "MBA",
            accomplishments: ["Won a healthcare innovation competition"],
          },
        ],
        work: [
          {
            company: "BankCo",
            role: "Product Manager",
            accomplishments: ["Led cross-functional launch of a new product", "grew MAU by 30%"],
          },
        ],
        others: {
          skills: ["TypeScript", "React", "Product Strategy"],
          projects: ["consumer banking product launch"],
          domains: ["fintech"],
          summary: "Product manager focused on turning product bets into measurable growth.",
        },
      },
      [
        {
          title: "Variant official site",
          url: "https://variant.ai",
          sourceType: "official",
          excerpt:
            "Variant Bio is building a genomic drug discovery platform focused on using human genetics and AI to discover better therapeutics.",
          signals: ["Variant Bio is building a genomic drug discovery platform."],
          fetchedAt: Date.now(),
        },
        {
          title: "Variant Bio launches agentic genomic drug discovery platform",
          url: "https://news.example.com/variant-launch",
          sourceType: "news",
          excerpt:
            "Variant Bio launched an agentic genomics platform and highlighted new collaboration momentum in drug discovery.",
          signals: ["Variant Bio launched an agentic genomics platform."],
          fetchedAt: Date.now(),
        },
      ],
    );

    process.env.OPENAI_API_KEY = previousKey;

    expect(result.brief.overview).toContain("Variant Bio");
    expect(result.brief.currentDirectionAndNeeds.toLowerCase()).toContain("likely near-term needs");
    expect(result.brief.suggestedQuestions.personalized.join(" ")).not.toContain("linkedin.com");
  });
});
