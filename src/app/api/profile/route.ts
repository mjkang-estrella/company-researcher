import { NextResponse } from "next/server";
import { upsertProfile } from "@/lib/convex";
import { deriveProfile } from "@/lib/profile";
import { ResumeProcessingError, extractPdfText } from "@/lib/resume";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("resume");
    const notes = String(formData.get("notes") ?? "");
    let extractedText = "";
    let sourceFileName: string | undefined;

    if (file instanceof File && file.size > 0) {
      if (file.type && file.type !== "application/pdf") {
        return NextResponse.json({ error: "Only PDF resumes are supported in v1." }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      extractedText = await extractPdfText(Buffer.from(arrayBuffer));
      sourceFileName = file.name;
    }

    if (!extractedText && !notes.trim()) {
      return NextResponse.json(
        { error: "Upload a text-based PDF or add supplemental notes before saving the shared profile." },
        { status: 400 },
      );
    }

    const derived = await deriveProfile(extractedText, notes);
    await upsertProfile({
      sourceFileName,
      supplementalNotes: notes,
      extractedTextPreview: extractedText.slice(0, 4000),
      derived,
    });

    return NextResponse.json({ ok: true, derived });
  } catch (error) {
    if (error instanceof ResumeProcessingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save resume profile." },
      { status: 500 },
    );
  }
}
