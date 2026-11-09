import type { User } from "firebase/auth";
import { doc, getDoc, type Firestore } from "firebase/firestore";

// Rules enforce this too. The check here only decides what to show.
export async function isApprovedUser(db: Firestore, user: User): Promise<boolean> {
  if (!user.email || !user.emailVerified) return false;
  const entry = await getDoc(doc(db, "approvedUsers", user.email.toLowerCase()));
  return entry.exists();
}
