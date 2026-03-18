import { NextResponse } from "next/server";
import { collectCompanySources } from "@/lib/sources";
import { getWorkspaceSnapshot, saveBrief, setCompanyStatus } from "@/lib/convex";
import { synthesizeBrief } from "@/lib/brief";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;

  try {
    const snapshot = await getWorkspaceSnapshot();
    const company = snapshot.companies.find((item) => item._id === companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    if (!snapshot.profile) {
      return NextResponse.json(
        { error: "Upload the shared resume before generating a company brief." },
        { status: 400 },
      );
    }

    await setCompanyStatus({ companyId, status: "generating" });

    const sources = await collectCompanySources(company.name, company.url);
    if (sources.length === 0) {
      await setCompanyStatus({
        companyId,
        status: "failed",
        lastError: "No live sources were found for this company. Add an official URL or try again later.",
      });
      return NextResponse.json(
        { error: "No live sources were found for this company. Add an official URL or try again later." },
        { status: 400 },
      );
    }

    const { brief, status } = await synthesizeBrief(company, snapshot.profile.derived, sources);
    await saveBrief({
      companyId,
      sources,
      brief: {
        ...brief,
        status,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await setCompanyStatus({
      companyId,
      status: "failed",
      lastError: error instanceof Error ? error.message : "Failed to generate brief.",
    }).catch(() => undefined);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate brief." },
      { status: 500 },
    );
  }
}
