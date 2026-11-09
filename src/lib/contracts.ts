// The boundary between the interface and Terminal 1's Firebase work.
//
// The simulator only talks to these two interfaces. src/lib/firebase-services.ts
// implements them on the Firebase sign-in and question storage.
// tests/unit/question-repository-contract.ts is the behaviour they must have.
//
// Recordings and transcripts are deliberately not part of this boundary. They
// stay in the browser (see src/lib/storage/sessions.ts).

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
}

export interface AuthGateway {
  /** The signed-in user, or null when nobody is signed in. */
  getCurrentUser(): AppUser | null;
  /** Calls `listener` on every change. Returns a function that unsubscribes. */
  onUserChanged(listener: (user: AppUser | null) => void): () => void;
  signOut(): Promise<void>;
}

export interface Question {
  id: string;
  /** Equals AppUser.uid. Firestore rules should enforce this. */
  ownerId: string;
  text: string;
  category: string | null;
  notes: string | null;
  /** ISO 8601, or null when the store doesn't report it. */
  createdAt: string | null;
  /** ISO 8601, or null when the store doesn't report it. */
  updatedAt: string | null;
}

export interface QuestionInput {
  text: string;
  category: string | null;
  notes: string | null;
}

export type RepositoryErrorCode = "not_found" | "invalid" | "permission_denied" | "unavailable";

/** Implementations must throw this, so that the interface can show the right message. */
export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export const QUESTION_TEXT_LIMIT = 2000;
export const QUESTION_NOTES_LIMIT = 2000;
export const QUESTION_CATEGORY_LIMIT = 60;

/**
 * Always scoped to the current user: there is no way to name another owner.
 * Every method rejects with a RepositoryError when it fails.
 */
export interface QuestionRepository {
  /** Newest first. */
  list(): Promise<Question[]>;
  create(input: QuestionInput): Promise<Question>;
  update(id: string, input: QuestionInput): Promise<Question>;
  /** Removing a question that no longer exists succeeds. */
  remove(id: string): Promise<void>;
}

export interface AppServices {
  auth: AuthGateway;
  questions: QuestionRepository;
}

/** Trims the input and rejects anything the bank cannot hold. Shared by all implementations. */
export function normalizeQuestionInput(input: QuestionInput): QuestionInput {
  const text = input.text.trim();
  const category = input.category?.trim() || null;
  const notes = input.notes?.trim() || null;
  if (!text) throw new RepositoryError("invalid", "Enter a question.");
  if (text.length > QUESTION_TEXT_LIMIT) throw new RepositoryError("invalid", `Keep the question under ${QUESTION_TEXT_LIMIT} characters.`);
  if (category && category.length > QUESTION_CATEGORY_LIMIT) throw new RepositoryError("invalid", `Keep the category under ${QUESTION_CATEGORY_LIMIT} characters.`);
  if (notes && notes.length > QUESTION_NOTES_LIMIT) throw new RepositoryError("invalid", `Keep the notes under ${QUESTION_NOTES_LIMIT} characters.`);
  return { text, category, notes };
}
