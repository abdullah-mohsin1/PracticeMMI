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
const stored = () => ({ ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

const person = (uid: string, email: string, emailVerified = true) =>
  env.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore() as unknown as Firestore;
const alice = () => person("alice", "alice@example.test");
const bob = () => person("bob", "bob@example.test");
const stranger = () => person("stranger", "stranger@example.test");
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
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore() as unknown as Firestore;
    await setDoc(doc(db, "approvedUsers", "alice@example.test"), {});
    await setDoc(doc(db, "approvedUsers", "bob@example.test"), {});
  });
});

afterAll(() => env.cleanup());

describe("question CRUD through the app's repository", () => {
  it("creates, reads, edits and deletes an owner's question", async () => {
    const db = alice();
    const id = await createQuestion(db, "alice", input);

    expect(await listQuestions(db, "alice")).toEqual([{ id, ...input }]);

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

  it("stops another approved user reading, listing, creating, editing or deleting", async () => {
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

describe("approved users only", () => {
  beforeEach(seedAliceQuestion);

  it("denies signed-out visitors", async () => {
    await assertFails(getDoc(questionDoc(anonymous(), "alice")));
    await assertFails(addDoc(collection(anonymous(), "users", "alice", "questions"), stored()));
  });

  it("denies an unapproved account, even in its own space", async () => {
    const db = stranger();
    await assertFails(getDocs(collection(db, "users", "stranger", "questions")));
    await assertFails(setDoc(questionDoc(db, "stranger"), stored()));
  });

  it("denies an approved address that isn't verified", async () => {
    const db = person("alice", "alice@example.test", false);
    await assertFails(getDoc(questionDoc(db, "alice")));
  });

  it("matches approved addresses regardless of case", async () => {
    await assertSucceeds(getDoc(questionDoc(person("alice", "Alice@Example.test"), "alice")));
  });

  it("removes access once a person is taken off the list", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore() as unknown as Firestore, "approvedUsers", "alice@example.test"));
    });
    await assertFails(getDoc(questionDoc(alice(), "alice")));
  });
});

describe("approved user list", () => {
  it("lets a person check only their own entry", async () => {
    await assertSucceeds(getDoc(doc(alice(), "approvedUsers", "alice@example.test")));
    await assertSucceeds(getDoc(doc(stranger(), "approvedUsers", "stranger@example.test")));
    await assertFails(getDoc(doc(alice(), "approvedUsers", "bob@example.test")));
  });

  it("can't be listed", async () => {
    await assertFails(getDocs(collection(alice(), "approvedUsers")));
  });

  it("can't be changed by anyone in the app, including to approve themselves", async () => {
    await assertFails(setDoc(doc(stranger(), "approvedUsers", "stranger@example.test"), {}));
    await assertFails(setDoc(doc(alice(), "approvedUsers", "friend@example.test"), {}));
    await assertFails(deleteDoc(doc(alice(), "approvedUsers", "bob@example.test")));
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

describe("everything else", () => {
  it("is denied by default", async () => {
    await assertFails(getDoc(doc(alice(), "other", "doc")));
    await assertFails(setDoc(doc(alice(), "users", "alice"), { name: "x" }));
  });
});
