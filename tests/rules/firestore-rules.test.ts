import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { firestoreImportStore, importDrafts, type ImportDraft } from "@/lib/questions/import/importer";
import { createQuestion, deleteQuestion, listQuestions, updateQuestion } from "@/lib/questions/repository";
import type { QuestionInput } from "@/lib/questions/schema";

let env: RulesTestEnvironment;

const input: QuestionInput = {
  category: "ethical",
  questionText: "A private question",
  description: "",
  difficulty: "medium",
  topics: ["consent"],
};
const asListed = { ...input, followUpQuestions: [], source: "manual", originalCategory: null };
const stored = () => ({ ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

const person = (uid: string, email = `${uid}@example.test`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore() as unknown as Firestore;
const alice = () => person("alice");
const bob = () => person("bob");
const anonymous = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const questionDoc = (db: Firestore, uid: string, id = "q1") => doc(db, "users", uid, "questions", id);

async function seedAliceQuestion() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore() as unknown as Firestore;
    await setDoc(questionDoc(db, "alice"), { ...input, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-practicemmi",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(() => env.cleanup());

describe("question CRUD through the app's repository", () => {
  it("creates, reads, edits and deletes an owner's question", async () => {
    const db = alice();
    const id = await createQuestion(db, "alice", input);

    expect(await listQuestions(db, "alice")).toEqual([{ id, ...asListed }]);

    await updateQuestion(db, "alice", id, { ...input, questionText: "Edited", difficulty: "hard" });
    expect((await listQuestions(db, "alice"))[0]).toMatchObject({ id, questionText: "Edited", difficulty: "hard" });

    await deleteQuestion(db, "alice", id);
    expect(await listQuestions(db, "alice")).toEqual([]);
  });

  it("keeps each person's questions separate", async () => {
    await createQuestion(alice(), "alice", input);
    await createQuestion(bob(), "bob", { ...input, questionText: "Bob's" });
    expect((await listQuestions(alice(), "alice")).map((question) => question.questionText)).toEqual([input.questionText]);
    expect((await listQuestions(bob(), "bob")).map((question) => question.questionText)).toEqual(["Bob's"]);
  });

  it("refuses repository calls against another person's account", async () => {
    await assertFails(createQuestion(alice(), "bob", input));
    await assertFails(listQuestions(alice(), "bob"));
  });
});

describe("ownership", () => {
  beforeEach(seedAliceQuestion);

  it("lets the owner read", async () => {
    await assertSucceeds(getDoc(questionDoc(alice(), "alice")));
  });

  it("stops another signed-in user reading, listing, creating, editing or deleting", async () => {
    await assertFails(getDoc(questionDoc(bob(), "alice")));
    await assertFails(getDocs(collection(bob(), "users", "alice", "questions")));
    await assertFails(setDoc(questionDoc(bob(), "alice", "planted"), stored()));
    await assertFails(updateDoc(questionDoc(bob(), "alice"), { questionText: "Hacked", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(questionDoc(bob(), "alice")));
  });

  it("does not expose a list of all accounts", async () => {
    await assertFails(getDocs(collection(alice(), "users")));
  });
});

describe("two independent accounts", () => {
  it("lets any new account use its own library without setup", async () => {
    const db = person("brand-new-user");
    const id = await createQuestion(db, "brand-new-user", input);
    expect(await listQuestions(db, "brand-new-user")).toEqual([{ id, ...asListed }]);
  });

  it("denies every operation in both directions", async () => {
    const aliceId = await createQuestion(alice(), "alice", input);
    const bobId = await createQuestion(bob(), "bob", { ...input, questionText: "Bob's" });

    for (const [db, owner, id] of [
      [bob(), "alice", aliceId],
      [alice(), "bob", bobId],
    ] as const) {
      await assertFails(getDoc(questionDoc(db, owner, id)));
      await assertFails(getDocs(collection(db, "users", owner, "questions")));
      await assertFails(listQuestions(db, owner));
      await assertFails(createQuestion(db, owner, input));
      await assertFails(setDoc(questionDoc(db, owner, id), stored()));
      await assertFails(updateQuestion(db, owner, id, { ...input, questionText: "Changed" }));
      await assertFails(deleteQuestion(db, owner, id));
    }

    expect((await listQuestions(alice(), "alice")).map((question) => question.questionText)).toEqual([input.questionText]);
    expect((await listQuestions(bob(), "bob")).map((question) => question.questionText)).toEqual(["Bob's"]);
  });

  it("identifies people by UID, not by email address", async () => {
    await seedAliceQuestion();
    await assertFails(getDoc(questionDoc(person("impostor", "alice@example.test"), "alice")));
  });

  it("denies signed-out visitors", async () => {
    await seedAliceQuestion();
    await assertFails(getDoc(questionDoc(anonymous(), "alice")));
    await assertFails(getDocs(collection(anonymous(), "users", "alice", "questions")));
    await assertFails(addDoc(collection(anonymous(), "users", "alice", "questions"), stored()));
    await assertFails(deleteDoc(questionDoc(anonymous(), "alice")));
  });
});

describe("question validation", () => {
  it.each([
    ["an empty question", { questionText: "" }],
    ["an oversized question", { questionText: "x".repeat(2001) }],
    ["an unknown category", { category: "surgery" }],
    ["an unknown difficulty", { difficulty: "impossible" }],
    ["a non-list topics field", { topics: "consent" }],
    ["too many topics", { topics: Array.from({ length: 11 }, (_, index) => `t${index}`) }],
    ["an extra field", { ownerId: "bob" }],
  ])("rejects %s", async (_name, change) => {
    await assertFails(setDoc(questionDoc(alice(), "alice"), { ...stored(), ...change }));
  });

  it("rejects a missing field", async () => {
    const { description: _description, ...incomplete } = stored();
    await assertFails(setDoc(questionDoc(alice(), "alice"), incomplete));
  });

  it("rejects client-chosen timestamps", async () => {
    await assertFails(setDoc(questionDoc(alice(), "alice"), { ...stored(), createdAt: Timestamp.fromMillis(0) }));
  });

  it("rejects rewriting the creation time", async () => {
    await seedAliceQuestion();
    await assertFails(
      updateDoc(questionDoc(alice(), "alice"), { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }),
    );
  });
});

describe("imported questions", () => {
  const draft = (id: string, questionText: string): ImportDraft => ({
    id,
    key: id,
    category: "communication",
    questionText,
    followUpQuestions: ["And then what?"],
    originalCategory: "Communication skills",
  });
  const imported = () => ({
    ...stored(),
    source: "pdf_import",
    originalCategory: "Section",
    importedAt: serverTimestamp(),
  });

  it("saves to the signed-in person's library with the metadata", async () => {
    const result = await importDrafts(firestoreImportStore(alice(), "alice"), [draft("pdf_1", "Imported one")]);
    expect(result).toEqual({ saved: 1, alreadySaved: 0, failed: [] });
    expect(await listQuestions(alice(), "alice")).toEqual([
      {
        id: "pdf_1",
        category: "communication",
        questionText: "Imported one",
        description: "",
        difficulty: "medium",
        topics: [],
        followUpQuestions: ["And then what?"],
        source: "pdf_import",
        originalCategory: "Communication skills",
      },
    ]);
  });

  it("doesn't create copies when the same import runs again", async () => {
    const drafts = [draft("pdf_1", "One"), draft("pdf_2", "Two")];
    await importDrafts(firestoreImportStore(alice(), "alice"), drafts);
    const second = await importDrafts(firestoreImportStore(alice(), "alice"), drafts);
    expect(second).toEqual({ saved: 0, alreadySaved: 2, failed: [] });
    expect(await listQuestions(alice(), "alice")).toHaveLength(2);
  });

  it("commits more than one batch", async () => {
    const drafts = Array.from({ length: 5 }, (_, index) => draft(`pdf_${index}`, `Question ${index}`));
    const result = await importDrafts(firestoreImportStore(alice(), "alice"), drafts, { batchSize: 2 });
    expect(result.saved).toBe(5);
    expect(await listQuestions(alice(), "alice")).toHaveLength(5);
  });

  it("stops another person importing into, reading or deleting an account's imports", async () => {
    await importDrafts(firestoreImportStore(alice(), "alice"), [draft("pdf_1", "Private import")]);
    await assertFails(setDoc(questionDoc(bob(), "alice", "pdf_2"), imported()));
    await assertFails(getDoc(questionDoc(bob(), "alice", "pdf_1")));
    await assertFails(getDocs(collection(bob(), "users", "alice", "questions")));
    await assertFails(deleteDoc(questionDoc(bob(), "alice", "pdf_1")));
    const failed = await importDrafts(firestoreImportStore(bob(), "alice"), [draft("pdf_3", "Planted")], {
      sleep: async () => undefined,
    });
    expect(failed.failed).toHaveLength(1);
  });

  it("lets the owner edit and delete an import, keeping its metadata", async () => {
    await importDrafts(firestoreImportStore(alice(), "alice"), [draft("pdf_1", "Original")]);
    await updateQuestion(alice(), "alice", "pdf_1", { ...input, questionText: "Corrected" });
    expect((await listQuestions(alice(), "alice"))[0]).toMatchObject({
      questionText: "Corrected",
      source: "pdf_import",
      originalCategory: "Communication skills",
    });
    await deleteQuestion(alice(), "alice", "pdf_1");
    expect(await listQuestions(alice(), "alice")).toEqual([]);
  });

  it("rejects changing import metadata, overwriting through batches or invalid metadata", async () => {
    await importDrafts(firestoreImportStore(alice(), "alice"), [draft("pdf_1", "Original")]);
    await assertFails(updateDoc(questionDoc(alice(), "alice", "pdf_1"), { source: "manual", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(questionDoc(alice(), "alice", "pdf_1"), { originalCategory: "Other", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(questionDoc(alice(), "alice", "pdf_1"), { importedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(questionDoc(alice(), "alice", "pdf_1"), imported()));
    await assertFails(setDoc(questionDoc(alice(), "alice", "x1"), { ...imported(), source: "web" }));
    await assertFails(setDoc(questionDoc(alice(), "alice", "x2"), { ...imported(), importedAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(questionDoc(alice(), "alice", "x3"), { ...imported(), followUpQuestions: "text" }));
    await assertFails(setDoc(questionDoc(alice(), "alice", "x4"), { ...imported(), originalCategory: "x".repeat(201) }));
  });

  it("still accepts questions saved before imports existed", async () => {
    await seedAliceQuestion();
    await updateQuestion(alice(), "alice", "q1", { ...input, questionText: "Edited old question" });
    expect((await listQuestions(alice(), "alice"))[0]).toMatchObject({ questionText: "Edited old question", source: "manual" });
  });
});

describe("everything else", () => {
  it("is denied by default", async () => {
    await assertFails(getDoc(doc(alice(), "other", "doc")));
    await assertFails(setDoc(doc(alice(), "users", "alice"), { name: "x" }));
    await assertFails(getDoc(doc(alice(), "approvedUsers", "alice@example.test")));
  });
});
