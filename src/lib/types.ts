export type ConfidenceLevel = "high" | "medium" | "low";
export type CompanyStatus = "idle" | "generating" | "ready" | "failed" | "limited-data";

export type DerivedProfile = {
  titles: string[];
  skills: string[];
  projects: string[];
  accomplishments: string[];
  quantifiedResults: string[];
  domains: string[];
  careerTrajectory: string[];
  summary: string;
};

export type ProfileRecord = {
  _id: string;
  sourceFileName?: string;
  supplementalNotes: string;
  extractedTextPreview: string;
  derived: DerivedProfile;
  updatedAt: number;
};

export type CompanyRecord = {
  _id: string;
  name: string;
  url?: string;
  status: CompanyStatus;
  lastError?: string;
  lastGeneratedAt?: number;
  updatedAt: number;
};

export type SourceRecord = {
  title: string;
  url: string;
  sourceType: string;
  excerpt: string;
  signals: string[];
  fetchedAt: number;
};

export type Citation = {
  sourceId?: string;
  title: string;
  url: string;
  note?: string;
};

export type BriefSection = {
  key: string;
  title: string;
  confidence: ConfidenceLevel;
  limitedData: boolean;
  citations: Citation[];
};

export type BriefRecord = {
  _id?: string;
  companyId: string;
  generatedAt: number;
  overview: string;
  currentDirectionAndNeeds: string;
  suggestedQuestions: {
    general: string[];
    personalized: string[];
  };
  appealAngle: {
    talkTracks: string[];
    talkingPoints: string[];
  };
  sections: BriefSection[];
};

export type WorkspaceSnapshot = {
  workspace: { _id: string } | null;
  profile: ProfileRecord | null;
  companies: CompanyRecord[];
  selectedCompanyId: string | null;
  briefsByCompanyId: Record<string, BriefRecord>;
};

export type WorkspaceResponse = {
  snapshot: WorkspaceSnapshot;
};
