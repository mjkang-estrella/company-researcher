import { NextResponse } from "next/server";
import { getWorkspaceSnapshot, seedDemoWorkspace } from "@/lib/convex";

export async function GET() {
  try {
    let snapshot = await getWorkspaceSnapshot();
    if (!snapshot.profile && snapshot.companies.length === 0) {
      await seedDemoWorkspace();
      snapshot = await getWorkspaceSnapshot();
    }
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workspace." },
      { status: 500 },
    );
  }
}
