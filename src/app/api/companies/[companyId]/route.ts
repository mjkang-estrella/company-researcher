import { NextResponse } from "next/server";
import { removeCompany } from "@/lib/convex";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    await removeCompany(companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete company." },
      { status: 500 },
    );
  }
}
