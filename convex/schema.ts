import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const confidenceLevel = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

const citation = v.object({
  sourceId: v.optional(v.id("sources")),
  title: v.string(),
  url: v.string(),
  note: v.optional(v.string()),
});

const legacyDerivedProfile = v.object({
  titles: v.array(v.string()),
  skills: v.array(v.string()),
  projects: v.array(v.string()),
  accomplishments: v.array(v.string()),
  quantifiedResults: v.array(v.string()),
  domains: v.array(v.string()),
  careerTrajectory: v.array(v.string()),
  summary: v.string(),
});

const derivedProfile = v.object({
  name: v.string(),
  contact: v.object({
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    location: v.optional(v.string()),
  }),
  education: v.array(
    v.object({
      school: v.string(),
      degree: v.optional(v.string()),
      fieldOfStudy: v.optional(v.string()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      accomplishments: v.array(v.string()),
    }),
  ),
  work: v.array(
    v.object({
      company: v.string(),
      role: v.optional(v.string()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      accomplishments: v.array(v.string()),
    }),
  ),
  others: v.object({
    skills: v.array(v.string()),
    projects: v.array(v.string()),
    domains: v.array(v.string()),
    summary: v.string(),
  }),
});

export default defineSchema({
  workspaces: defineTable({
    slug: v.string(),
    selectedCompanyId: v.optional(v.id("companies")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  profiles: defineTable({
    workspaceId: v.id("workspaces"),
    sourceFileName: v.optional(v.string()),
    supplementalNotes: v.string(),
    extractedTextPreview: v.string(),
    derived: v.union(derivedProfile, legacyDerivedProfile),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  companies: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    url: v.optional(v.string()),
    status: v.union(
      v.literal("idle"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("limited-data"),
    ),
    lastError: v.optional(v.string()),
    lastGeneratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["workspaceId"] }),

  briefs: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("companies"),
    generatedAt: v.number(),
    overview: v.string(),
    currentDirectionAndNeeds: v.string(),
    suggestedQuestions: v.object({
      general: v.array(v.string()),
      personalized: v.array(v.string()),
    }),
    appealAngle: v.object({
      talkTracks: v.array(v.string()),
      talkingPoints: v.array(v.string()),
    }),
    sections: v.array(
      v.object({
        key: v.string(),
        title: v.string(),
        confidence: confidenceLevel,
        limitedData: v.boolean(),
        citations: v.array(citation),
      }),
    ),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_company", ["companyId"]),

  sources: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("companies"),
    title: v.string(),
    url: v.string(),
    sourceType: v.string(),
    excerpt: v.string(),
    signals: v.array(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_company", ["companyId"]),
});
