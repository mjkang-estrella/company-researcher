import { ConvexHttpClient } from "convex/browser";
import type { BriefRecord, CompanyRecord, ProfileRecord, WorkspaceSnapshot } from "@/lib/types";

function getConvexUrl() {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("Missing CONVEX_URL. Add it to .env.local before running the app.");
  }
  return url;
}

function client() {
  return new ConvexHttpClient(getConvexUrl());
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return client().query("workspace:getSnapshot" as any, {});
}

export async function upsertProfile(input: {
  sourceFileName?: string;
  supplementalNotes: string;
  extractedTextPreview: string;
  derived: ProfileRecord["derived"];
}) {
  return client().mutation("workspace:upsertProfile" as any, input);
}

export async function addCompany(input: { name: string; url?: string }) {
  return client().mutation("workspace:addCompany" as any, input);
}

export async function selectCompany(companyId: string) {
  return client().mutation("workspace:selectCompany" as any, { companyId });
}

export async function removeCompany(companyId: string) {
  return client().mutation("workspace:removeCompany" as any, { companyId });
}

export async function setCompanyStatus(input: {
  companyId: string;
  status: CompanyRecord["status"];
  lastError?: string;
  lastGeneratedAt?: number;
}) {
  return client().mutation("workspace:setCompanyStatus" as any, input);
}

export async function saveBrief(input: {
  companyId: string;
  sources: Array<{
    title: string;
    url: string;
    sourceType: string;
    excerpt: string;
    signals: string[];
    fetchedAt: number;
  }>;
  brief: Omit<BriefRecord, "companyId" | "_id"> & {
    status: "ready" | "limited-data";
  };
}) {
  return client().mutation("workspace:saveBrief" as any, input);
}

export async function seedDemoWorkspace() {
  return client().mutation("workspace:seedDemoWorkspace" as any, {});
}
