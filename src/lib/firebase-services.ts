// Connects the simulator's interfaces to the existing Firebase sign-in and
// question storage. It only calls that code and never changes how it works.

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import {
  RepositoryError,
  type AppServices,
  type AppUser,
  type Question,
  type QuestionInput,
  type QuestionRepository,
} from "@/lib/contracts";
import { getFirebase } from "@/lib/firebase/client";
import { createQuestion, deleteQuestion, listQuestions, updateQuestion } from "@/lib/questions/repository";
import { CATEGORIES, questionInputSchema, type Question as StoredQuestion } from "@/lib/questions/schema";

function toUser(user: User | null): AppUser | null {
  return user && { uid: user.uid, displayName: user.displayName, email: user.email };
}

function failure(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (code === "permission-denied") return new RepositoryError("permission_denied", "You don't have access to this question.");
  if (code === "not-found") return new RepositoryError("not_found", "That question no longer exists.");
  return new RepositoryError("unavailable", "Your question library is unavailable.");
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw failure(error);
  }
}

/** Keeps every stored field the simulator doesn't edit, including any added to the schema later. */
function storedFields(existing: StoredQuestion | undefined): Record<string, unknown> {
  if (!existing) return { difficulty: "medium", topics: [] };
  const values = existing as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.keys(questionInputSchema.shape).map((key) => [key, values[key]]));
}

function toStored(input: QuestionInput, existing?: StoredQuestion) {
  const parsed = questionInputSchema.safeParse({
    ...storedFields(existing),
    questionText: input.text,
    category: input.category?.trim() || existing?.category || CATEGORIES[0],
    description: input.notes ?? "",
  });
  if (!parsed.success) throw new RepositoryError("invalid", parsed.error.issues[0]?.message ?? "Check this question.");
  return parsed.data;
}

export function createFirebaseQuestionRepository(db: Firestore, uid: string): QuestionRepository {
  const toQuestion = (id: string, stored: Pick<StoredQuestion, "questionText" | "category" | "description">): Question => ({
    id,
    ownerId: uid,
    text: stored.questionText,
    category: stored.category,
    notes: stored.description || null,
    createdAt: null,
    updatedAt: null,
  });

  return {
    list: () => guarded(async () => (await listQuestions(db, uid)).map((stored) => toQuestion(stored.id, stored))),
    create: (input) =>
      guarded(async () => {
        const stored = toStored(input);
        return toQuestion(await createQuestion(db, uid, stored), stored);
      }),
    update: (id, input) =>
      guarded(async () => {
        const existing = (await listQuestions(db, uid)).find((stored) => stored.id === id);
        if (!existing) throw new RepositoryError("not_found", "That question no longer exists.");
        const stored = toStored(input, existing);
        await updateQuestion(db, uid, id, stored);
        return toQuestion(id, stored);
      }),
    remove: (id) => guarded(() => deleteQuestion(db, uid, id)),
  };
}

export function createFirebaseServices(uid: string): AppServices {
  const { auth, db } = getFirebase();
  return {
    questions: createFirebaseQuestionRepository(db, uid),
    auth: {
      getCurrentUser: () => toUser(auth.currentUser),
      onUserChanged: (listener) => onAuthStateChanged(auth, (user) => listener(toUser(user))),
      signOut: () => signOut(auth),
    },
  };
}
