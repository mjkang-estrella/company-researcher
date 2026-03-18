declare module "pdf-parse" {
  const pdfParse: (buffer: Buffer) => Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }>;

  export default pdfParse;
}
