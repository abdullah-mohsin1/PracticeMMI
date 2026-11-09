"use client";

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { logger } from "@/lib/logger";

type Access = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User };

const errorCode = (error: unknown) => (error instanceof Error && "code" in error ? String(error.code) : "unknown");

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [access, setAccess] = useState<Access>({ status: "loading" });
  const [signInFailed, setSignInFailed] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(getFirebase().auth, (user) =>
        setAccess(user ? { status: "signedIn", user } : { status: "signedOut" }),
      ),
    [],
  );

  const signIn = async () => {
    setSignInFailed(false);
    try {
      await signInWithPopup(getFirebase().auth, new GoogleAuthProvider());
    } catch (error) {
      const code = errorCode(error);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      logger.error("sign_in_failed", { code });
      setSignInFailed(true);
    }
  };

  if (access.status === "loading") return <p role="status">Loading…</p>;

  if (access.status === "signedOut") {
    return (
      <section>
        <p>Sign in with your Google account to see your private question library.</p>
        <button type="button" onClick={signIn}>
          Sign in with Google
        </button>
        {signInFailed && <p role="alert">We couldn&apos;t sign you in. Please try again.</p>}
      </section>
    );
  }

  return (
    <>
      <p>
        Signed in as {access.user.email}.{" "}
        <button type="button" onClick={() => signOut(getFirebase().auth)}>
          Sign out
        </button>
      </p>
      {children(access.user)}
    </>
  );
}
