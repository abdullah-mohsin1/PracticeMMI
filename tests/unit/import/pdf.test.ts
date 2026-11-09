import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseQuestions } from "@/lib/questions/import/parser";
import { linesFromTextItems, type PdfTextItem } from "@/lib/questions/import/pdf";

const item = (str: string, x: number, y: number, width = str.length * 5, size = 12): PdfTextItem => ({
  str,
  width,
  transform: [size, 0, 0, size, x, y],
});

describe("linesFromTextItems", () => {
  it("orders lines from top to bottom and pieces from left to right", () => {
    expect(linesFromTextItems([item("Second", 72, 100), item("world", 110, 200), item("Hello ", 72, 200, 38)]).map((line) => line.text)).toEqual([
      "Hello world",
      "Second",
    ]);
  });

  it("groups pieces on slightly different baselines", () => {
    expect(linesFromTextItems([item("a", 72, 200, 5), item("b", 77, 201, 5)])).toHaveLength(1);
  });

  it("adds a space across a visible gap only", () => {
    expect(linesFromTextItems([item("one", 72, 200, 15), item("two", 100, 200)])[0].text).toBe("one two");
    expect(linesFromTextItems([item("co", 72, 200, 10), item("de", 82, 200)])[0].text).toBe("code");
  });

  it("records position and font size", () => {
    expect(linesFromTextItems([item("Heading", 72, 200, 40, 16)])[0]).toEqual({ text: "Heading", x: 72, fontSize: 16 });
  });

  it("drops blank pieces and lines", () => {
    expect(linesFromTextItems([item("   ", 72, 200)])).toEqual([]);
  });
});

it("reads a real PDF across pages", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([612, 792]);
  first.drawText("Section 1. Critical thinking", { x: 72, y: 700, size: 16, font });
  first.drawText("1. A question that continues", { x: 72, y: 660, size: 12, font });
  first.drawText("onto the next page and", { x: 90, y: 646, size: 12, font });
  const second = pdf.addPage([612, 792]);
  second.drawText("finishes here. Discuss.", { x: 90, y: 700, size: 12, font });
  second.drawText("2. Another question?", { x: 72, y: 670, size: 12, font });

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: await pdf.save() }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push(linesFromTextItems(content.items as PdfTextItem[]));
  }

  const parsed = parseQuestions(pages);
  expect(parsed.map(({ questionText, category }) => [questionText, category])).toEqual([
    ["A question that continues onto the next page and finishes here. Discuss.", "critical_thinking"],
    ["Another question?", "critical_thinking"],
  ]);
});
