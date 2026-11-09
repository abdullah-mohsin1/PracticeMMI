import { z } from "zod";

export const CATEGORIES = ["ethical", "personal", "policy"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const questionInputSchema = z.strictObject({
  category: z.enum(CATEGORIES),
  questionText: z.string().trim().min(1, "Enter a question.").max(2000, "Keep the question under 2,000 characters."),
  description: z.string().trim().max(2000, "Keep the context under 2,000 characters."),
  difficulty: z.enum(DIFFICULTIES),
  topics: z.array(z.string().trim().min(1).max(50)).max(10, "Use at most 10 topics."),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type Question = QuestionInput & { id: string };

export const parseTopics = (value: string): string[] => [
  ...new Set(
    value
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean),
  ),
];
