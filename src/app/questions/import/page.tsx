"use client";

import { AuthGate } from "@/components/AuthGate";
import { ImportQuestions } from "@/components/ImportQuestions";

export default function ImportQuestionsPage() {
  return (
    <main>
      <h1>Import questions</h1>
      <AuthGate>{(user) => <ImportQuestions user={user} />}</AuthGate>
    </main>
  );
}
