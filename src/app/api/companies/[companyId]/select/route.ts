import { NextResponse } from "next/server";
import { selectCompany } from "@/lib/convex";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    await selectCompany(companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to select company." },
      { status: 500 },
    );
  }
}
