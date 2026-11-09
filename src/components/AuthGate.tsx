"use client";

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";
import { isApprovedUser } from "@/lib/firebase/access";
import { getFirebase } from "@/lib/firebase/client";
import { logger } from "@/lib/logger";

type Access =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "unapproved"; user: User }
  | { status: "approved"; user: User }
  | { status: "error" };

const errorCode = (error: unknown) => (error instanceof Error && "code" in error ? String(error.code) : "unknown");

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [access, setAccess] = useState<Access>({ status: "loading" });
  const [signInFailed, setSignInFailed] = useState(false);

  useEffect(() => {
    const { auth, db } = getFirebase();
    let latest = 0;
    return onAuthStateChanged(auth, async (user) => {
      const run = ++latest;
      if (!user) {
        setAccess({ status: "signedOut" });
        return;
      }
      setAccess({ status: "loading" });
      try {
        const approved = await isApprovedUser(db, user);
        if (run === latest) setAccess({ status: approved ? "approved" : "unapproved", user });
      } catch (error) {
        logger.error("access_check_failed", { code: errorCode(error) });
        if (run === latest) setAccess({ status: "error" });
      }
    });
  }, []);

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

  const logOut = () => signOut(getFirebase().auth);

  if (access.status === "loading") return <p role="status">Loading…</p>;

  if (access.status === "signedOut") {
    return (
      <section>
        <p>PracticeMMI is private. Sign in with an approved Google account to continue.</p>
        <button type="button" onClick={signIn}>
          Sign in with Google
        </button>
        {signInFailed && <p role="alert">We couldn&apos;t sign you in. Please try again.</p>}
      </section>
    );
  }

  if (access.status === "error") {
    return (
      <p role="alert">
        We couldn&apos;t check your access. Reload the page to try again.{" "}
        <button type="button" onClick={logOut}>
          Sign out
        </button>
      </p>
    );
  }

  if (access.status === "unapproved") {
    return (
      <section>
        <p role="alert">{access.user.email} isn&apos;t approved to use PracticeMMI. Ask the owner for access.</p>
        <button type="button" onClick={logOut}>
          Sign out
        </button>
      </section>
    );
  }

  return (
    <>
      <p>
        Signed in as {access.user.email}.{" "}
        <button type="button" onClick={logOut}>
          Sign out
        </button>
      </p>
      {children(access.user)}
    </>
  );
}
