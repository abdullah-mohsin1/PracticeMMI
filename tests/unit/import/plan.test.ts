import { describe, expect, it } from "vitest";
import { computeStatuses, normalizeForDuplicates, toPreviewRows, type PreviewRow } from "@/lib/questions/import/plan";

const row = (key: string, questionText: string, change: Partial<PreviewRow> = {}): PreviewRow => ({
  key,
  number: Number(key),
  page: 1,
  originalCategory: "Critical thinking",
  category: "critical_thinking",
  questionText,
  followUpText: "",
  selected: true,
  warning: null,
  ...change,
});

const statusOf = (rows: PreviewRow[], library: string[] = []) =>
  computeStatuses(rows, library.map((questionText) => ({ questionText })));

describe("normalizeForDuplicates", () => {
  it("ignores case, punctuation, spacing and quote style", () => {
    expect(normalizeForDuplicates("  What's   the PLAN?! ")).toBe(normalizeForDuplicates("what’s the plan"));
  });

  it("keeps different wording apart", () => {
    expect(normalizeForDuplicates("Tell your friend")).not.toBe(normalizeForDuplicates("Tell your parent"));
  });
});

describe("computeStatuses", () => {
  it("marks new questions ready", () => {
    expect(statusOf([row("1", "New question")]).get("1")).toEqual({ kind: "ready" });
  });

  it("detects a duplicate of a question already in the library, and shows it for review", () => {
    expect(statusOf([row("1", "what is THE plan?")], ["What is the plan"]).get("1")).toEqual({
      kind: "duplicate_library",
      existingText: "What is the plan",
    });
  });

  it("keeps the first copy within a file and skips later ones", () => {
    const statuses = statusOf([row("1", "Same question"), row("2", "same question!")]);
    expect(statuses.get("1")).toEqual({ kind: "ready" });
    expect(statuses.get("2")).toEqual({ kind: "duplicate_file", firstNumber: 1 });
  });

  it("makes a duplicate importable once its wording is corrected", () => {
    expect(statusOf([row("1", "Corrected wording")], ["Original wording"]).get("1")).toEqual({ kind: "ready" });
  });

  it("doesn't count an excluded row as the first copy", () => {
    const statuses = statusOf([row("1", "Same", { selected: false }), row("2", "Same")]);
    expect(statuses.get("1")).toEqual({ kind: "excluded" });
    expect(statuses.get("2")).toEqual({ kind: "ready" });
  });

  it("requires a category and valid text", () => {
    const statuses = statusOf([row("1", "x", { category: "" }), row("2", "   "), row("3", "y".repeat(2001))]);
    expect(statuses.get("1")).toMatchObject({ kind: "invalid", message: "Choose a category." });
    expect(statuses.get("2")).toMatchObject({ kind: "invalid" });
    expect(statuses.get("3")).toMatchObject({ kind: "invalid" });
  });
});

it("builds preview rows from parsed questions", () => {
  expect(
    toPreviewRows([
      { number: 4, page: 2, sectionTitle: null, category: null, questionText: "Q", followUpQuestions: ["A", "B"], warning: null },
    ])[0],
  ).toMatchObject({ number: 4, category: "", followUpText: "A\nB", selected: true });
});
