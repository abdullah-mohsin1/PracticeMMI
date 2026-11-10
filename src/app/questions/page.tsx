"use client";

import { AuthGate } from "@/components/AuthGate";
import { QuestionManager } from "@/components/QuestionManager";

export default function QuestionsPage() {
  return (
    <main className="stack">
      <h1>Questions</h1>
      <AuthGate>{(user) => <QuestionManager user={user} />}</AuthGate>
    </main>
  );
}
