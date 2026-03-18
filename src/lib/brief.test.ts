import { describe, expect, it } from "vitest";
import { buildSection, computeBriefStatus } from "@/lib/brief";
import { dedupeSources } from "@/lib/sources";
import { deriveProfileHeuristically } from "@/lib/profile";

describe("deriveProfileHeuristically", () => {
  it("extracts a usable derived profile from resume text", () => {
    const profile = deriveProfileHeuristically(
      `
      Senior Software Engineer
      Built internal analytics platform that improved activation by 18%.
      Led payments migration project across 3 teams.
      Skills: TypeScript, React, AWS, Stripe
      `,
      "Additional note: interested in AI infrastructure",
    );

    expect(profile.titles[0]).toContain("Engineer");
    expect(profile.quantifiedResults.join(" ")).toContain("18%");
    expect(profile.skills.length).toBeGreaterThan(0);
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

describe("brief confidence", () => {
  it("marks low-source sections as limited data", () => {
    const section = buildSection("overview", "Overview", [], 1);
    expect(section.confidence).toBe("low");
    expect(section.limitedData).toBe(true);
    expect(computeBriefStatus([section])).toBe("limited-data");
  });
});
