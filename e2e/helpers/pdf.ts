import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

// Builds an invented question bank at test time, so no question files live in the repository.
export async function buildQuestionBank(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw = (page: PDFPage, text: string, x: number, y: number, size = 12, face: PDFFont = font) =>
    page.drawText(text, { x, y, size, font: face });
  const newPage = (number: number) => {
    const page = pdf.addPage([612, 792]);
    draw(page, "Test Bank", 72, 760);
    draw(page, `example.test footer page ${number}`, 170, 40);
    return page;
  };

  const first = newPage(1);
  draw(first, "This introduction should be ignored.", 72, 720);
  draw(first, "Section 1. Ethical scenarios", 72, 690, 16, bold);
  draw(first, "1. A neighbour asks you to keep a secret that may", 72, 660);
  draw(first, "harm someone else. What would you do?", 90, 646);
  draw(first, "Follow-up: Would your answer change for a family member?", 90, 632);
  draw(first, "2. A classmate copies your lab report and asks you to stay quiet about what", 72, 600);
  draw(first, "happened during the term, and this question continues", 90, 586);

  const second = newPage(2);
  draw(second, "across the page break. How do you respond?", 90, 720);
  draw(second, "Section 2. Communication skills", 72, 690, 16, bold);
  draw(second, "1. Explain a difficult decision to an upset relative.", 72, 660);
  draw(second, "2. A neighbour asks you to keep a secret that may", 72, 630);
  draw(second, "harm someone else. What would you do?", 90, 616);

  const third = newPage(3);
  draw(third, "Section 3. Unsorted material", 72, 690, 16, bold);
  draw(third, "1. Describe a question with no matching category.", 72, 660);

  return Buffer.from(await pdf.save());
}
