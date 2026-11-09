import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { questionInputSchema, type Question, type QuestionInput } from "./schema";

const questionsOf = (db: Firestore, uid: string) => collection(db, "users", uid, "questions");

export async function listQuestions(db: Firestore, uid: string): Promise<Question[]> {
  const snapshot = await getDocs(query(questionsOf(db, uid), orderBy("createdAt", "desc")));
  return snapshot.docs.map((entry) => {
    const { category, questionText, description, difficulty, topics } = entry.data();
    return { id: entry.id, ...questionInputSchema.parse({ category, questionText, description, difficulty, topics }) };
  });
}

export async function createQuestion(db: Firestore, uid: string, input: QuestionInput): Promise<string> {
  const data = questionInputSchema.parse(input);
  const created = await addDoc(questionsOf(db, uid), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

export async function updateQuestion(db: Firestore, uid: string, id: string, input: QuestionInput): Promise<void> {
  const data = questionInputSchema.parse(input);
  await updateDoc(doc(questionsOf(db, uid), id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteQuestion(db: Firestore, uid: string, id: string): Promise<void> {
  await deleteDoc(doc(questionsOf(db, uid), id));
}
