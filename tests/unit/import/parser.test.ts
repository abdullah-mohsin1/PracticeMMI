import { describe, expect, it } from "vitest";
import { categoryFromHeading, parseQuestions, type PdfLine } from "@/lib/questions/import/parser";

const body = (text: string, x = 72): PdfLine => ({ text, x, fontSize: 12 });
const more = (text: string) => body(text, 90);
const heading = (text: string): PdfLine => ({ text, x: 72, fontSize: 16 });

describe("parseQuestions", () => {
  it("joins a question that spans several lines", () => {
    const [question, ...rest] = parseQuestions([
      [body("1. You witness an accident on your way"), more("to an exam. What do you do"), more("next?")],
    ]);
    expect(question.questionText).toBe("You witness an accident on your way to an exam. What do you do next?");
    expect(rest).toEqual([]);
  });

  it("joins a question that crosses a page, ignoring headers and footers", () => {
    const header = body("Ver 1.0");
    const footer = body("example.org © 2014. All Rights Reserved.", 170);
    const parsed = parseQuestions([
      [header, body("1. First question that continues"), more("on the following"), footer],
      [header, more("page. Discuss."), body("2. Second question?"), footer],
      [header, body("3. Third question?"), footer],
    ]);
    expect(parsed.map((question) => question.questionText)).toEqual([
      "First question that continues on the following page. Discuss.",
      "Second question?",
      "Third question?",
    ]);
    expect(parsed[0].page).toBe(1);
  });

  it("keeps a numbered question that repeats at the top of several pages", () => {
    const page = (ending: string) => [body("1. The same question appears"), more("in the document."), more("Some middle text."), more(ending)];
    const parsed = parseQuestions([page("alpha"), page("beta"), page("gamma")]);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].questionText).toContain("The same question appears");
  });

  it("keeps repeated wording in the middle of a page", () => {
    const page = (number: number, ending: string) => [
      body("Header"),
      body(`${number}. Question`),
      more("What would you do?"),
      more("Discuss."),
      more(ending),
      body("Footer"),
    ];
    const parsed = parseQuestions([page(1, "alpha"), page(2, "beta"), page(3, "gamma")]);
    expect(parsed.map((question) => question.questionText)).toEqual([
      "Question What would you do? Discuss. alpha",
      "Question What would you do? Discuss. beta",
      "Question What would you do? Discuss. gamma",
    ]);
  });

  it("removes page numbers", () => {
    const parsed = parseQuestions([[body("1. Question one"), body("Page 1 of 2")], [more("continued"), body("2")]]);
    expect(parsed[0].questionText).toBe("Question one continued");
  });

  it("assigns categories from section headings and restarts numbering", () => {
    const parsed = parseQuestions([
      [
        heading("Section 1. Ethical scenarios"),
        body("1. Ethics one"),
        body("2. Ethics two"),
        heading("Section 2. Critical thinking"),
        body("1. Thinking one"),
      ],
    ]);
    expect(parsed.map(({ number, category, sectionTitle }) => [number, category, sectionTitle])).toEqual([
      [1, "ethical", "Ethical scenarios"],
      [2, "ethical", "Ethical scenarios"],
      [1, "critical_thinking", "Critical thinking"],
    ]);
  });

  it("ignores introduction text before the first question", () => {
    const parsed = parseQuestions([[body("This guide took a long time."), body("1. Real question")]]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].questionText).toBe("Real question");
  });

  it("leaves a question uncategorized when the heading is unknown", () => {
    const parsed = parseQuestions([[heading("Section 1. Miscellaneous"), body("1. Question")]]);
    expect(parsed[0].category).toBeNull();
    expect(parsed[0].sectionTitle).toBe("Miscellaneous");
  });

  it("doesn't treat a number at the start of a wrapped line as a new question", () => {
    const parsed = parseQuestions([
      [body("1. The fee rose from"), more("3000 dollars. Their share was"), more("12. What do you think?"), body("2. Next question")],
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].questionText).toBe("The fee rose from 3000 dollars. Their share was 12. What do you think?");
  });

  it("preserves wording and repairs misencoded apostrophes", () => {
    const [question] = parseQuestions([[body("1. Dr. Lee doesn‟t agree, saying „no‟ — “never”. Is this OK?")]]);
    expect(question.questionText).toBe("Dr. Lee doesn't agree, saying 'no' — “never”. Is this OK?");
  });

  it("keeps real compound words split across lines", () => {
    const [question] = parseQuestions([[body("1. A fire-"), more("related tragedy occurred.")]]);
    expect(question.questionText).toBe("A fire-related tragedy occurred.");
  });

  it.each([
    ["1) Bracket style", "Bracket style"],
    ["Q1. Short style", "Short style"],
    ["Question 1: Long style", "Long style"],
  ])("recognizes %s", (line, expected) => {
    expect(parseQuestions([[body(line)]])[0].questionText).toBe(expected);
  });

  it("separates labelled and bulleted follow-up prompts", () => {
    const [question] = parseQuestions([
      [
        body("1. Main question?"),
        more("Follow-up: What would change if the patient"),
        more("were a minor?"),
        more("• Who else is affected?"),
        more("a) Would you tell anyone?"),
      ],
    ]);
    expect(question.questionText).toBe("Main question?");
    expect(question.followUpQuestions).toEqual([
      "What would change if the patient were a minor?",
      "Who else is affected?",
      "Would you tell anyone?",
    ]);
  });

  it("flags a gap in the numbering", () => {
    const parsed = parseQuestions([[body("1. One"), body("2. Two"), body("5. Five")]]);
    expect(parsed[2].warning).toContain("jumps from 2 to 5");
    expect(parsed[0].warning).toBeNull();
  });

  it("returns nothing for text with no numbered questions", () => {
    expect(parseQuestions([[body("Just a paragraph.")], []])).toEqual([]);
  });
});

describe("categoryFromHeading", () => {
  it.each([
    ["Ethical decision making", "ethical"],
    ["Critical thinking", "critical_thinking"],
    ["Problem solving & conflict management", "problem_solving"],
    ["Communication skills (acting)", "communication"],
    ["Current healthcare & societal issues", "policy"],
    ["Standard interview questions (redundant)", "personal"],
    ["Something else", null],
  ])("maps %s", (heading, expected) => {
    expect(categoryFromHeading(heading)).toBe(expected);
  });
});
