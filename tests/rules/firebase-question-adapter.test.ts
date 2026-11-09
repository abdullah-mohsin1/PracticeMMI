import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createFirebaseQuestionRepository } from "@/lib/firebase-services";
import { createQuestion, listQuestions } from "@/lib/questions/repository";
import { describeQuestionRepository } from "../unit/question-repository-contract";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-practicemmi",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

describeQuestionRepository("Firebase, under the real security rules", (owner) =>
  createFirebaseQuestionRepository(env.authenticatedContext(owner).firestore() as unknown as Firestore, owner),
);

it("editing through the simulator keeps difficulty, topics and imported follow-ups", async () => {
  const db = env.authenticatedContext("owner").firestore() as unknown as Firestore;
  const id = await createQuestion(db, "owner", {
    category: "critical_thinking",
    questionText: "Imported",
    description: "",
    difficulty: "hard",
    topics: ["triage"],
    followUpQuestions: ["And then?"],
  });
  await createFirebaseQuestionRepository(db, "owner").update(id, { text: "Edited", category: "critical_thinking", notes: null });
  expect((await listQuestions(db, "owner"))[0]).toMatchObject({
    questionText: "Edited",
    category: "critical_thinking",
    difficulty: "hard",
    topics: ["triage"],
    followUpQuestions: ["And then?"],
  });
});
