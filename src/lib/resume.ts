import pdf from "pdf-parse";

export class ResumeProcessingError extends Error {}

export async function extractPdfText(fileBuffer: Buffer) {
  const parsed = await pdf(fileBuffer);
  const text = parsed.text.replace(/\u0000/g, " ").trim();

  if (text.length < 80) {
    throw new ResumeProcessingError(
      "This PDF does not appear to contain extractable text. Upload a text-based PDF instead of a scanned image.",
    );
  }

  return text;
}
