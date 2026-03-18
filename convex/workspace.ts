import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const WORKSPACE_SLUG = "default";

async function ensureWorkspace(ctx: { db: any }) {
  const existing = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (q: any) => q.eq("slug", WORKSPACE_SLUG))
    .first();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const id = await ctx.db.insert("workspaces", {
    slug: WORKSPACE_SLUG,
    createdAt: now,
    updatedAt: now,
  });

  return (await ctx.db.get(id))!;
}

export const getSnapshot = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q: any) => q.eq("slug", WORKSPACE_SLUG))
      .first();

    if (!workspace) {
      return {
        workspace: null,
        profile: null,
        companies: [],
        selectedCompanyId: null,
        briefsByCompanyId: {},
      };
    }

    const [profile, companies, briefs] = await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
        .first(),
      ctx.db
        .query("companies")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
        .collect(),
      ctx.db
        .query("briefs")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
        .collect(),
    ]);

    const briefsByCompanyId = Object.fromEntries(briefs.map((brief) => [brief.companyId, brief]));

    return {
      workspace,
      profile,
      companies: companies.sort((a, b) => b.updatedAt - a.updatedAt),
      selectedCompanyId: workspace.selectedCompanyId ?? null,
      briefsByCompanyId,
    };
  },
});

export const upsertProfile = mutationGeneric({
  args: {
    sourceFileName: v.optional(v.string()),
    supplementalNotes: v.string(),
    extractedTextPreview: v.string(),
    derived: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    const workspace = await ensureWorkspace(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
      .first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("profiles", {
        workspaceId: workspace._id,
        ...args,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(workspace._id, { updatedAt: now });
  },
});

export const addCompany = mutationGeneric({
  args: {
    name: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ensureWorkspace(ctx);
    const now = Date.now();

    const companyId = await ctx.db.insert("companies", {
      workspaceId: workspace._id,
      name: args.name,
      url: args.url,
      status: "idle",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(workspace._id, {
      selectedCompanyId: companyId,
      updatedAt: now,
    });

    return companyId;
  },
});

export const selectCompany = mutationGeneric({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const workspace = await ensureWorkspace(ctx);
    await ctx.db.patch(workspace._id, {
      selectedCompanyId: args.companyId,
      updatedAt: Date.now(),
    });
  },
});

export const removeCompany = mutationGeneric({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const workspace = await ensureWorkspace(ctx);
    const [briefs, sources] = await Promise.all([
      ctx.db
        .query("briefs")
        .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
        .collect(),
      ctx.db
        .query("sources")
        .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
        .collect(),
    ]);

    for (const brief of briefs) {
      await ctx.db.delete(brief._id);
    }
    for (const source of sources) {
      await ctx.db.delete(source._id);
    }

    await ctx.db.delete(args.companyId);

    const remaining = await ctx.db
      .query("companies")
      .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
      .collect();

    await ctx.db.patch(workspace._id, {
      selectedCompanyId: remaining[0]?._id,
      updatedAt: Date.now(),
    });
  },
});

export const setCompanyStatus = mutationGeneric({
  args: {
    companyId: v.id("companies"),
    status: v.union(
      v.literal("idle"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("limited-data"),
    ),
    lastError: v.optional(v.string()),
    lastGeneratedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      status: args.status,
      lastError: args.lastError,
      lastGeneratedAt: args.lastGeneratedAt,
      updatedAt: Date.now(),
    });
  },
});

export const saveBrief = mutationGeneric({
  args: {
    companyId: v.id("companies"),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        sourceType: v.string(),
        excerpt: v.string(),
        signals: v.array(v.string()),
        fetchedAt: v.number(),
      }),
    ),
    brief: v.object({
      companyIntro: v.optional(v.string()),
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
          confidence: v.union(
            v.literal("high"),
            v.literal("medium"),
            v.literal("low"),
          ),
          limitedData: v.boolean(),
          citations: v.array(
            v.object({
              title: v.string(),
              url: v.string(),
              note: v.optional(v.string()),
            }),
          ),
        }),
      ),
      status: v.union(v.literal("ready"), v.literal("limited-data")),
      generatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const workspace = await ensureWorkspace(ctx);
    const existingBriefs = await ctx.db
      .query("briefs")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();
    const existingSources = await ctx.db
      .query("sources")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    for (const brief of existingBriefs) {
      await ctx.db.delete(brief._id);
    }
    for (const source of existingSources) {
      await ctx.db.delete(source._id);
    }

    const sourceIds = new Map<string, string>();
    for (const source of args.sources) {
      const id = await ctx.db.insert("sources", {
        workspaceId: workspace._id,
        companyId: args.companyId,
        ...source,
      });
      sourceIds.set(source.url, id);
    }

    await ctx.db.insert("briefs", {
      workspaceId: workspace._id,
      companyId: args.companyId,
      generatedAt: args.brief.generatedAt,
      companyIntro: args.brief.companyIntro,
      overview: args.brief.overview,
      currentDirectionAndNeeds: args.brief.currentDirectionAndNeeds,
      suggestedQuestions: args.brief.suggestedQuestions,
      appealAngle: args.brief.appealAngle,
      sections: args.brief.sections.map((section) => ({
        ...section,
        citations: section.citations.map((item) => ({
          sourceId: sourceIds.get(item.url),
          title: item.title,
          url: item.url,
          note: item.note,
        })),
      })),
    });

    await ctx.db.patch(args.companyId, {
      status: args.brief.status,
      lastError: undefined,
      lastGeneratedAt: args.brief.generatedAt,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(workspace._id, { updatedAt: Date.now() });
  },
});

export const seedDemoWorkspace = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    const workspace = await ensureWorkspace(ctx);
    const [existingProfile, existingCompanies] = await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
        .first(),
      ctx.db
        .query("companies")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspace._id))
        .collect(),
    ]);

    if (existingProfile || existingCompanies.length > 0) {
      return;
    }

    const now = Date.now();
    await ctx.db.insert("profiles", {
      workspaceId: workspace._id,
      sourceFileName: "demo-resume.pdf",
      supplementalNotes:
        "Interested in safety engineering, distributed systems, and infrastructure roles at frontier AI companies.",
      extractedTextPreview:
        "Senior backend engineer with experience building evaluation systems, developer platforms, and distributed infrastructure at scale.",
      derived: {
        name: "Demo Candidate",
        contact: {
          email: "demo@example.com",
          location: "San Francisco, CA",
        },
        education: [
          {
            school: "University of California, Berkeley",
            degree: "BS",
            fieldOfStudy: "Computer Science",
            accomplishments: ["Focused on systems, ML, and distributed computing coursework"],
          },
        ],
        work: [
          {
            company: "Scale AI",
            role: "Senior Backend Engineer",
            accomplishments: [
              "Built verifiable backend systems for high-scale ML workflows",
              "Reduced evaluation turnaround time by 42%",
              "Scaled backend services supporting 10x traffic growth",
            ],
          },
          {
            company: "Platform Team",
            role: "Platform Engineer",
            accomplishments: [
              "Improved API reliability to 99.95% uptime",
              "Led infrastructure work that reduced operational bottlenecks",
            ],
          },
        ],
        others: {
          skills: ["Safety Engineering", "Distributed Systems", "Infrastructure", "Evaluations", "APIs", "Startup Scaling"],
          projects: [
            "Constraint-based logic platform at Scale AI",
            "Internal evaluation framework for model quality",
            "Developer infrastructure for enterprise APIs",
          ],
          domains: ["AI Infrastructure", "Platform Tooling", "Enterprise Systems"],
          summary:
            "Backend and platform engineer focused on verifiable systems, evaluation infrastructure, and reliable APIs at scale.",
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    const anthropicId = await ctx.db.insert("companies", {
      workspaceId: workspace._id,
      name: "Anthropic",
      url: "https://www.anthropic.com",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      lastGeneratedAt: now,
    });

    await ctx.db.insert("companies", {
      workspaceId: workspace._id,
      name: "Stripe",
      url: "https://stripe.com",
      status: "idle",
      createdAt: now - 1,
      updatedAt: now - 1,
    });

    await ctx.db.insert("companies", {
      workspaceId: workspace._id,
      name: "Vercel",
      url: "https://vercel.com",
      status: "idle",
      createdAt: now - 2,
      updatedAt: now - 2,
    });

    const sourceItems = [
      {
        title: "Anthropic official site",
        url: "https://www.anthropic.com",
        sourceType: "official",
        excerpt:
          "Anthropic is an AI safety and research company building reliable, interpretable, and steerable AI systems.",
        signals: [
          "AI safety and research company",
          "Building reliable and steerable AI systems",
        ],
      },
      {
        title: "Anthropic Careers",
        url: "https://www.anthropic.com/careers",
        sourceType: "official",
        excerpt:
          "Roles across product engineering, infrastructure, research engineering, and go-to-market signal continued productization.",
        signals: [
          "Hiring across infrastructure and product engineering",
          "Signals shift from pure research toward product delivery",
        ],
      },
      {
        title: "Claude 3.5 Sonnet launch coverage",
        url: "https://www.anthropic.com/news/claude-3-5-sonnet",
        sourceType: "news",
        excerpt:
          "Claude 3.5 Sonnet emphasized coding performance, speed, and practical capability gains.",
        signals: [
          "Claude 3.5 Sonnet emphasized coding and speed",
          "Product capability and quality remain public priorities",
        ],
      },
      {
        title: "Anthropic Computer Use announcement",
        url: "https://www.anthropic.com/news/3-5-models-and-computer-use",
        sourceType: "news",
        excerpt:
          "The Computer Use launch highlighted agentic workflows and the infrastructure demands of broader product surfaces.",
        signals: [
          "Computer Use expands product surface area",
          "More agentic product workloads increase infra complexity",
        ],
      },
    ];

    const sourceIds = new Map<string, string>();
    for (const source of sourceItems) {
      const id = await ctx.db.insert("sources", {
        workspaceId: workspace._id,
        companyId: anthropicId,
        fetchedAt: now,
        ...source,
      });
      sourceIds.set(source.url, id);
    }

    await ctx.db.insert("briefs", {
      workspaceId: workspace._id,
      companyId: anthropicId,
      generatedAt: now,
      companyIntro: "Building frontier AI models and API products with a strong emphasis on safety and reliability.",
      overview:
        "Anthropic is an AI research and safety company building frontier models and API products, with visible momentum in productization, enterprise readiness, and model evaluation infrastructure.",
      currentDirectionAndNeeds:
        "Based on recent job postings and launch signals, Anthropic is moving beyond pure research into productization and enterprise deployment. That creates immediate need for robust APIs, evaluation tooling, and lower-latency infrastructure that can keep pace with model and product expansion.",
      suggestedQuestions: {
        general: [
          "As Anthropic expands beyond pure research, which engineering bottlenecks are most urgent on the product and infrastructure side?",
          "How are enterprise and dedicated-instance demands shaping current platform priorities?",
          "What changed operationally after the Claude 3.5 and Computer Use launches?",
        ],
        personalized: [
          "My background includes evaluation infrastructure and backend reliability work. Where would that experience be most useful against Anthropic’s current bottlenecks?",
          "I’ve built verifiable systems for high-scale ML workflows. How does that map to the way Anthropic thinks about safety guardrails in production infrastructure?",
          "Several of my projects centered on API resilience and developer tooling. How are those areas evolving as Anthropic serves more enterprise users?",
        ],
      },
      appealAngle: {
        talkTracks: [
          "Lead with your experience building verifiable systems rather than generic scale stories.",
          "Connect evaluation tooling work directly to Anthropic’s constitutional and safety-driven product needs.",
          "Frame API and infrastructure wins as preparation for enterprise-grade reliability during rapid productization.",
        ],
        talkingPoints: [
          "Constraint-based logic platform at Scale AI",
          "Evaluation framework work that reduced turnaround time by 42%",
          "Reliability improvements supporting 10x traffic growth",
          "Platform engineering experience aligned with enterprise infrastructure needs",
        ],
      },
      sections: [
        {
          key: "overview",
          title: "Overview",
          confidence: "high",
          limitedData: false,
          citations: [
            {
              sourceId: sourceIds.get("https://www.anthropic.com"),
              title: "Anthropic official site",
              url: "https://www.anthropic.com",
              note: "official",
            },
            {
              sourceId: sourceIds.get("https://www.anthropic.com/careers"),
              title: "Anthropic Careers",
              url: "https://www.anthropic.com/careers",
              note: "official",
            },
          ],
        },
        {
          key: "current-direction",
          title: "Current Direction & Needs",
          confidence: "high",
          limitedData: false,
          citations: [
            {
              sourceId: sourceIds.get("https://www.anthropic.com/careers"),
              title: "Anthropic Careers",
              url: "https://www.anthropic.com/careers",
              note: "official",
            },
            {
              sourceId: sourceIds.get("https://www.anthropic.com/news/claude-3-5-sonnet"),
              title: "Claude 3.5 Sonnet launch coverage",
              url: "https://www.anthropic.com/news/claude-3-5-sonnet",
              note: "news",
            },
            {
              sourceId: sourceIds.get("https://www.anthropic.com/news/3-5-models-and-computer-use"),
              title: "Anthropic Computer Use announcement",
              url: "https://www.anthropic.com/news/3-5-models-and-computer-use",
              note: "news",
            },
          ],
        },
        {
          key: "questions",
          title: "Suggested Questions",
          confidence: "medium",
          limitedData: false,
          citations: [
            {
              sourceId: sourceIds.get("https://www.anthropic.com/careers"),
              title: "Anthropic Careers",
              url: "https://www.anthropic.com/careers",
              note: "official",
            },
            {
              sourceId: sourceIds.get("https://www.anthropic.com/news/3-5-models-and-computer-use"),
              title: "Anthropic Computer Use announcement",
              url: "https://www.anthropic.com/news/3-5-models-and-computer-use",
              note: "news",
            },
          ],
        },
        {
          key: "appeal",
          title: "Personalized Appeal Angle",
          confidence: "medium",
          limitedData: false,
          citations: [
            {
              sourceId: sourceIds.get("https://www.anthropic.com"),
              title: "Anthropic official site",
              url: "https://www.anthropic.com",
              note: "official",
            },
            {
              sourceId: sourceIds.get("https://www.anthropic.com/news/claude-3-5-sonnet"),
              title: "Claude 3.5 Sonnet launch coverage",
              url: "https://www.anthropic.com/news/claude-3-5-sonnet",
              note: "news",
            },
          ],
        },
      ],
    });

    await ctx.db.patch(workspace._id, {
      selectedCompanyId: anthropicId,
      updatedAt: now,
    });
  },
});
