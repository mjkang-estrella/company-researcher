import { NextResponse } from "next/server";
import { addCompany } from "@/lib/convex";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; url?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }

    const companyId = await addCompany({
      name,
      url: body.url?.trim() || undefined,
    });

    return NextResponse.json({ ok: true, companyId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add company." },
      { status: 500 },
    );
  }
}
