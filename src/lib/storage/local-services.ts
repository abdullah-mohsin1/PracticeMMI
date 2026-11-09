import {
  RepositoryError,
  normalizeQuestionInput,
  type AppServices,
  type AppUser,
  type AuthGateway,
  type Question,
  type QuestionInput,
  type QuestionRepository,
} from "@/lib/contracts";
import { getByIndex, getOne, put, remove } from "@/lib/storage/idb";

export const LOCAL_USER: AppUser = { uid: "local", displayName: null, email: null };

function localAuth(): AuthGateway {
  return {
    getCurrentUser: () => LOCAL_USER,
    onUserChanged: (listener) => {
      listener(LOCAL_USER);
      return () => undefined;
    },
    signOut: async () => undefined,
  };
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError("unavailable", "Browser storage is unavailable.");
  }
}

export function createLocalQuestionRepository(ownerId: string): QuestionRepository {
  const owned = async (id: string): Promise<Question> => {
    const existing = await getOne<Question>("questions", id);
    if (!existing || existing.ownerId !== ownerId) throw new RepositoryError("not_found", "That question no longer exists.");
    return existing;
  };

  return {
    list: () =>
      guarded(async () => {
        const rows = await getByIndex<Question>("questions", "ownerId", ownerId);
        return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
    create: (input: QuestionInput) =>
      guarded(async () => {
        const now = new Date().toISOString();
        const question: Question = { ...normalizeQuestionInput(input), id: crypto.randomUUID(), ownerId, createdAt: now, updatedAt: now };
        await put("questions", question);
        return question;
      }),
    update: (id: string, input: QuestionInput) =>
      guarded(async () => {
        const updated: Question = { ...(await owned(id)), ...normalizeQuestionInput(input), updatedAt: new Date().toISOString() };
        await put("questions", updated);
        return updated;
      }),
    remove: (id: string) =>
      guarded(async () => {
        const existing = await getOne<Question>("questions", id);
        if (existing && existing.ownerId === ownerId) await remove("questions", id);
      }),
  };
}

export function createLocalServices(): AppServices {
  return { auth: localAuth(), questions: createLocalQuestionRepository(LOCAL_USER.uid) };
}
