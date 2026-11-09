import type { Category } from "../schema";

export type PdfLine = { text: string; x: number; fontSize: number };

export type ParsedQuestion = {
  number: number;
  page: number;
  sectionTitle: string | null;
  category: Category | null;
  questionText: string;
  followUpQuestions: string[];
  warning: string | null;
};

const QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.):]\s+(.+)$/i;
const SECTION_HEADING = /^(?:section|category|part)\s+\d+\s*[.:\-–]?\s*(.+)$/i;
const FOLLOW_UP_LABEL = /^(?:follow[- ]?ups?(?:\s+questions?)?|probes?|prompts?)\s*[:\-–]\s*(.*)$/i;
const FOLLOW_UP_MARKER = /^(?:[-•●▪◦–]\s+|\(?[a-h][.)]\s+)(.+)$/;
const PAGE_NUMBER = /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i;

const CATEGORY_KEYWORDS: [RegExp, Category][] = [
  [/ethic/i, "ethical"],
  [/critical\s+thinking/i, "critical_thinking"],
  [/problem[- ]solving|conflict/i, "problem_solving"],
  [/communication|acting/i, "communication"],
  [/health\s?care|societ|policy/i, "policy"],
  [/standard|traditional|personal/i, "personal"],
];

export function categoryFromHeading(heading: string): Category | null {
  return CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(heading))?.[1] ?? null;
}

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

// Some PDFs encode ordinary apostrophes as low or reversed quotation marks.
const repairQuotes = (value: string) => value.replace(/[„‟‚‛]/g, "'");

function joinLines(current: string, next: string): string {
  if (!current) return next;
  // A line-end hyphen stays, because it can't be told apart from a real compound like "fire-related".
  return current.endsWith("-") && /^[a-z]/.test(next) ? current + next : `${current} ${next}`;
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

const EDGE_LINES = 2;

// Running headers and footers repeat at the edges of most pages. Numbered lines are never treated as one,
// so a question that appears twice in a document isn't lost.
function removeRepeatedLines(pages: PdfLine[][]): PdfLine[][] {
  const fingerprint = (text: string) => collapse(text).replace(/\d+/g, "#").toLowerCase();
  const isEdge = (index: number, length: number) => index < EDGE_LINES || index >= length - EDGE_LINES;
  const pagesWith = new Map<string, number>();
  for (const page of pages) {
    const edgeKeys = page.filter((_, index) => isEdge(index, page.length)).map((line) => fingerprint(line.text));
    for (const key of new Set(edgeKeys)) pagesWith.set(key, (pagesWith.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  return pages.map((page) =>
    page.filter((line, index) => {
      const text = collapse(line.text);
      if (!text || PAGE_NUMBER.test(text)) return false;
      if (QUESTION_START.test(text) || !isEdge(index, page.length)) return true;
      return (pagesWith.get(fingerprint(text)) ?? 0) < threshold;
    }),
  );
}

type Draft = Omit<ParsedQuestion, "followUpQuestions"> & { followUpQuestions: string[]; inFollowUp: boolean };

export function parseQuestions(rawPages: PdfLine[][]): ParsedQuestion[] {
  const pages = removeRepeatedLines(rawPages);
  const bodySize = mostCommon(pages.flat().map((line) => line.fontSize));
  const results: ParsedQuestion[] = [];
  let current: Draft | null = null;
  let sectionTitle: string | null = null;
  let category: Category | null = null;
  let lastNumber = 0;
  let questionX: number | null = null;

  const finish = () => {
    if (!current) return;
    const { inFollowUp: _inFollowUp, ...question } = current;
    results.push({
      ...question,
      questionText: repairQuotes(collapse(question.questionText)),
      followUpQuestions: question.followUpQuestions.map((prompt) => repairQuotes(collapse(prompt))).filter(Boolean),
    });
    current = null;
  };

  pages.forEach((lines, pageIndex) => {
    for (const line of lines) {
      const text = collapse(line.text);
      const heading = SECTION_HEADING.exec(text);
      if (heading && text.length <= 120 && (line.fontSize > bodySize || !QUESTION_START.test(text))) {
        const larger = line.fontSize > bodySize;
        if (larger || current === null) {
          finish();
          sectionTitle = collapse(heading[1]);
          category = categoryFromHeading(sectionTitle);
          lastNumber = 0;
          continue;
        }
      }

      const start = QUESTION_START.exec(text);
      if (start) {
        const number = Number(start[1]);
        const expected = lastNumber + 1;
        const atQuestionIndent = questionX === null || line.x <= questionX + 1;
        const isStart =
          number === expected || lastNumber === 0 || (atQuestionIndent && (number > lastNumber || number === 1));
        if (isStart) {
          finish();
          questionX ??= line.x;
          current = {
            number,
            page: pageIndex + 1,
            sectionTitle,
            category,
            questionText: start[2],
            followUpQuestions: [],
            inFollowUp: false,
            warning:
              lastNumber !== 0 && number !== expected ? `Numbering jumps from ${lastNumber} to ${number}. Check this question.` : null,
          };
          lastNumber = number;
          continue;
        }
      }

      if (!current) continue;
      const draft: Draft = current;
      const followUp = FOLLOW_UP_LABEL.exec(text) ?? FOLLOW_UP_MARKER.exec(text);
      if (followUp) {
        draft.followUpQuestions.push(followUp[1]);
        draft.inFollowUp = true;
      } else if (draft.inFollowUp) {
        const last = draft.followUpQuestions.length - 1;
        draft.followUpQuestions[last] = joinLines(draft.followUpQuestions[last], text);
      } else {
        draft.questionText = joinLines(draft.questionText, text);
      }
    }
  });
  finish();
  return results;
}
