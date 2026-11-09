import { z } from "zod";

export const CATEGORIES = ["ethical", "critical_thinking", "problem_solving", "communication", "policy", "personal"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ethical: "Ethical decision-making",
  critical_thinking: "Critical thinking",
  problem_solving: "Problem-solving and conflict management",
  communication: "Communication skills",
  policy: "Healthcare and societal issues",
  personal: "Standard interview questions",
};

export const MAX_QUESTION_LENGTH = 2000;
export const MAX_FOLLOW_UPS = 20;

export const questionInputSchema = z.strictObject({
  category: z.enum(CATEGORIES),
  questionText: z
    .string()
    .trim()
    .min(1, "Enter a question.")
    .max(MAX_QUESTION_LENGTH, "Keep the question under 2,000 characters."),
  description: z.string().trim().max(2000, "Keep the context under 2,000 characters."),
  difficulty: z.enum(DIFFICULTIES),
  topics: z.array(z.string().trim().min(1).max(50)).max(10, "Use at most 10 topics."),
  followUpQuestions: z
    .array(z.string().trim().min(1).max(MAX_QUESTION_LENGTH))
    .max(MAX_FOLLOW_UPS, "Use at most 20 follow-up prompts.")
    .default([]),
});

export type QuestionInput = z.input<typeof questionInputSchema>;

export type QuestionSource = "manual" | "pdf_import";

export type Question = z.output<typeof questionInputSchema> & {
  id: string;
  source: QuestionSource;
  originalCategory: string | null;
};

export const parseTopics = (value: string): string[] => [
  ...new Set(
    value
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean),
  ),
];

export const parseFollowUps = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
