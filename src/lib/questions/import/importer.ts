import { collection, doc, getDocsFromServer, serverTimestamp, writeBatch, type Firestore } from "firebase/firestore";
import { parseFollowUps, questionInputSchema, type Category } from "../schema";
import { normalizeForDuplicates, type PreviewRow } from "./plan";

// Well under Firestore's 500-write batch limit, so a failure loses little progress.
export const IMPORT_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;
const DEFAULT_COMMIT_TIMEOUT_MS = 20_000;

export type ImportDraft = {
  id: string;
  key: string;
  category: Category;
  questionText: string;
  followUpQuestions: string[];
  originalCategory: string | null;
};

export type ImportStore = {
  existingIds(): Promise<Set<string>>;
  commit(drafts: ImportDraft[]): Promise<void>;
};

export type ImportResult = {
  saved: number;
  alreadySaved: number;
  failed: ImportDraft[];
};

export type ImportOptions = {
  onProgress?: (done: number, total: number) => void;
  sleep?: (milliseconds: number) => Promise<void>;
  batchSize?: number;
};

// The same wording always maps to the same document, so repeating an import can't create a second copy.
export async function questionDocumentId(questionText: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeForDuplicates(questionText));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pdf_${hex.slice(0, 40)}`;
}

export async function toImportDraft(row: PreviewRow & { category: Category }): Promise<ImportDraft> {
  return {
    id: await questionDocumentId(row.questionText),
    key: row.key,
    category: row.category,
    questionText: row.questionText.trim(),
    followUpQuestions: parseFollowUps(row.followUpText),
    originalCategory: row.originalCategory,
  };
}

function withTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The save timed out.")), milliseconds);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function firestoreImportStore(db: Firestore, uid: string): ImportStore {
  const questions = collection(db, "users", uid, "questions");
  const timeoutMs = Number(process.env.NEXT_PUBLIC_IMPORT_COMMIT_TIMEOUT_MS) || DEFAULT_COMMIT_TIMEOUT_MS;
  return {
    async existingIds() {
      // Writes still queued on this device don't count, or an unsent import would look finished.
      const snapshot = await withTimeout(getDocsFromServer(questions), timeoutMs);
      return new Set(snapshot.docs.filter((entry) => !entry.metadata.hasPendingWrites).map((entry) => entry.id));
    },
    async commit(drafts) {
      const batch = writeBatch(db);
      for (const draft of drafts) {
        const data = questionInputSchema.parse({
          category: draft.category,
          questionText: draft.questionText,
          description: "",
          difficulty: "medium",
          topics: [],
          followUpQuestions: draft.followUpQuestions,
        });
        batch.set(doc(questions, draft.id), {
          ...data,
          source: "pdf_import",
          originalCategory: draft.originalCategory ?? "",
          importedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await withTimeout(batch.commit(), timeoutMs);
    },
  };
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function importDrafts(store: ImportStore, drafts: ImportDraft[], options: ImportOptions = {}): Promise<ImportResult> {
  const { onProgress, sleep = defaultSleep, batchSize = IMPORT_BATCH_SIZE } = options;
  const unique = [...new Map(drafts.map((draft) => [draft.id, draft])).values()];
  let saved = 0;
  let alreadySaved = 0;
  let done = 0;

  for (let start = 0; start < unique.length; start += batchSize) {
    const chunk = unique.slice(start, start + batchSize);
    let committed = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !committed; attempt++) {
      if (attempt > 1) await sleep(500 * 2 ** (attempt - 2));
      try {
        // Checked on every attempt, because a commit that seemed to fail may have reached the server.
        const existing = await store.existingIds();
        const pending = chunk.filter((draft) => !existing.has(draft.id));
        if (pending.length > 0) await store.commit(pending);
        saved += pending.length;
        alreadySaved += chunk.length - pending.length;
        committed = true;
      } catch {
        committed = false;
      }
    }

    if (!committed) return { saved, alreadySaved, failed: unique.slice(start) };
    done += chunk.length;
    onProgress?.(done, unique.length);
  }
  return { saved, alreadySaved, failed: [] };
}
