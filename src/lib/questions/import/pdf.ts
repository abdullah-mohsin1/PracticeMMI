import type { PdfLine } from "./parser";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export type PdfTextItem = { str: string; transform: number[]; width: number };

const Y_TOLERANCE = 2;

export function linesFromTextItems(items: PdfTextItem[]): PdfLine[] {
  const usable = items
    .filter((item) => item.str.trim() !== "" || item.str === " ")
    .sort((a, b) => b.transform[5] - a.transform[5]);

  const rows: PdfTextItem[][] = [];
  for (const item of usable) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].transform[5] - item.transform[5]) <= Y_TOLERANCE) row.push(item);
    else rows.push([item]);
  }

  return rows
    .map((row) => {
      const sorted = row.sort((a, b) => a.transform[4] - b.transform[4]);
      const fontSize = Math.abs(sorted[0].transform[3]);
      let text = "";
      let end = sorted[0].transform[4];
      for (const item of sorted) {
        const gap = item.transform[4] - end;
        if (text && gap > fontSize * 0.2 && !text.endsWith(" ") && !item.str.startsWith(" ")) text += " ";
        text += item.str;
        end = item.transform[4] + item.width;
      }
      return { text, x: sorted[0].transform[4], fontSize: Math.round(fontSize * 10) / 10 };
    })
    .filter((line) => line.text.trim() !== "");
}

export class PdfReadError extends Error {}

// The file is read in the browser and is never uploaded.
export async function extractPdfLines(file: File): Promise<PdfLine[][]> {
  if (file.size > MAX_PDF_BYTES) throw new PdfReadError("This PDF is larger than 25 MB.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let document;
  try {
    document = await task.promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new PdfReadError(
      name === "PasswordException" ? "This PDF is password-protected." : "This file couldn't be read as a PDF.",
    );
  }

  const pages: PdfLine[][] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(linesFromTextItems(content.items.filter((item): item is PdfTextItem & typeof item => "str" in item)));
  }
  await task.destroy();
  return pages;
}
