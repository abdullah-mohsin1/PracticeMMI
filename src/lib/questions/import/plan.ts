import { MAX_QUESTION_LENGTH, type Category, type Question } from "../schema";
import type { ParsedQuestion } from "./parser";

export type PreviewRow = {
  key: string;
  number: number;
  page: number;
  originalCategory: string | null;
  category: Category | "";
  questionText: string;
  followUpText: string;
  selected: boolean;
  warning: string | null;
};

export type RowStatus =
  | { kind: "ready" }
  | { kind: "excluded" }
  | { kind: "invalid"; message: string }
  | { kind: "duplicate_library"; existingText: string }
  | { kind: "duplicate_file"; firstNumber: number };

export const normalizeForDuplicates = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function toPreviewRows(parsed: ParsedQuestion[]): PreviewRow[] {
  return parsed.map((question, index) => ({
    key: `${index}`,
    number: question.number,
    page: question.page,
    originalCategory: question.sectionTitle,
    category: question.category ?? "",
    questionText: question.questionText,
    followUpText: question.followUpQuestions.join("\n"),
    selected: true,
    warning: question.warning,
  }));
}

export function computeStatuses(rows: PreviewRow[], library: Pick<Question, "questionText">[]): Map<string, RowStatus> {
  const existing = new Map(library.map((question) => [normalizeForDuplicates(question.questionText), question.questionText]));
  const seen = new Map<string, number>();
  const statuses = new Map<string, RowStatus>();

  for (const row of rows) {
    const normalized = normalizeForDuplicates(row.questionText);
    const existingText = existing.get(normalized);
    const firstNumber = seen.get(normalized);
    let status: RowStatus;
    if (!row.questionText.trim()) status = { kind: "invalid", message: "Enter the question text." };
    else if (row.questionText.trim().length > MAX_QUESTION_LENGTH)
      status = { kind: "invalid", message: "This question is over the 2,000-character limit." };
    else if (!row.category) status = { kind: "invalid", message: "Choose a category." };
    else if (existingText !== undefined) status = { kind: "duplicate_library", existingText };
    else if (firstNumber !== undefined) status = { kind: "duplicate_file", firstNumber };
    else if (!row.selected) status = { kind: "excluded" };
    else status = { kind: "ready" };
    if (normalized && !seen.has(normalized) && row.selected) seen.set(normalized, row.number);
    statuses.set(row.key, status);
  }
  return statuses;
}
