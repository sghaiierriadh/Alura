declare module "pdf-parse-fork" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    text: string;
    version: string | null;
    info: unknown;
    metadata: unknown;
  }
  function pdfParse(
    data: Buffer,
    options?: {
      max?: number;
      version?: string;
    },
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
