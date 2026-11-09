"use client";

import { useState, type ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { createFirebaseServices } from "@/lib/firebase-services";
import { configureServices } from "@/lib/services";

function Services({ uid, children }: { uid: string; children: ReactNode }) {
  // Runs before the first render of the children, which read the services.
  useState(() => configureServices(createFirebaseServices(uid)));
  return children;
}

/** Shows the page only once someone is signed in, using their private library. */
export function SignedIn({ children }: { children: ReactNode }) {
  return (
    <div className="auth-area">
      <AuthGate>
        {(user) => (
          <Services key={user.uid} uid={user.uid}>
            {children}
          </Services>
        )}
      </AuthGate>
    </div>
  );
}
