import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { readFirebaseConfig } from "./config";

let services: { auth: Auth; db: Firestore } | undefined;

// Created on first use in the browser, so the static build never needs Firebase.
export function getFirebase(): { auth: Auth; db: Firestore } {
  if (services) return services;
  const app = getApps()[0] ?? initializeApp(readFirebaseConfig());
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  services = { auth, db };
  return services;
}
