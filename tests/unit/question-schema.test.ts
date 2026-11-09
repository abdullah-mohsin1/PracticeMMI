import { describe, expect, it } from "vitest";
import { parseTopics, questionInputSchema } from "@/lib/questions/schema";

const valid = { category: "ethical", questionText: " A question ", description: "", difficulty: "easy", topics: ["ethics"] };

describe("questionInputSchema", () => {
  it("trims text", () => {
    expect(questionInputSchema.parse(valid).questionText).toBe("A question");
  });

  it.each([
    ["blank question", { questionText: "   " }],
    ["long question", { questionText: "x".repeat(2001) }],
    ["unknown category", { category: "surgery" }],
    ["unknown difficulty", { difficulty: "impossible" }],
    ["too many topics", { topics: Array.from({ length: 11 }, (_, index) => `t${index}`) }],
    ["unknown field", { ownerId: "someone" }],
  ])("rejects %s", (_name, change) => {
    expect(questionInputSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe("parseTopics", () => {
  it("splits, trims, drops blanks and removes repeats", () => {
    expect(parseTopics(" consent, , family,consent ")).toEqual(["consent", "family"]);
  });
});
