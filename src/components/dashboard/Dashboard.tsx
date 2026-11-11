"use client";

import Link from "next/link";
import { useState } from "react";
import { QuestionEditor } from "@/components/dashboard/QuestionEditor";
import { QuestionFilters, categoryShortLabel } from "@/components/QuestionFilters";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { useAsync } from "@/hooks/use-async";
import type { Question, QuestionInput } from "@/lib/contracts";
import { getServices } from "@/lib/services";
import { listSessions, type PracticeSession } from "@/lib/storage/sessions";

const STATUS_LABELS: Partial<Record<PracticeSession["status"], string>> = {
  completed: "Finished",
  ended_early: "Ended early",
  interrupted: "Interrupted",
  running: "Not finished",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function RecentSessions() {
  const uid = getServices().auth.getCurrentUser()?.uid ?? "";
  const sessions = useAsync(() => listSessions(uid), uid);
  if (sessions.status !== "ready" || sessions.data.length === 0) return null;
  return (
    <section className="stack-tight" aria-label="Past practice">
      <h2>Past practice</h2>
      <ul className="list">
        {sessions.data.map((session) => (
          <li key={session.id} className="card spread">
            <span>
              {session.config.mode === "mock" ? "Full mock" : `${session.config.stationCount} station${session.config.stationCount === 1 ? "" : "s"}`}
              <span className="hint"> · {formatDate(session.startedAt ?? session.createdAt)}</span>
            </span>
            <span className="row">
              <span className="chip">{STATUS_LABELS[session.status]}</span>
              <Link className="btn btn-secondary btn-small" href={`/sessions/view/?id=${session.id}`}>
                Review
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Dashboard() {
  const repository = getServices().questions;
  const questions = useAsync(() => repository.list(), "questions");
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");

  const save = async (input: QuestionInput) => {
    if (editing === "new") await repository.create(input);
    else if (editing) await repository.update(editing.id, input);
    setEditing(null);
    questions.reload();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteFailed(false);
    try {
      await repository.remove(deleting.id);
      setDeleting(null);
      questions.reload();
    } catch {
      setDeleteFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const term = filter.trim().toLowerCase();
  const visible =
    questions.status === "ready"
      ? questions.data.filter((question) => (!category || question.category === category) && (!term || question.text.toLowerCase().includes(term)))
      : [];

  return (
    <div className="stack">
      <section className="hero" aria-labelledby="hero-heading">
        <div className="stack-tight">
          <h2 id="hero-heading">Ready to practice?</h2>
          <p>Pick your questions, check your camera, then answer each station against the clock. Recordings stay on this device.</p>
        </div>
        <Link href="/practice/setup/" className="btn btn-gold btn-large">
          Start a practice session
        </Link>
      </section>

      <div className="spread">
        <h1>Your questions</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add question
        </button>
      </div>

      {questions.status === "loading" ? <LoadingRows /> : null}
      {questions.status === "error" ? <ErrorState message="We couldn't load your questions." onRetry={questions.reload} /> : null}
      {questions.status === "ready" && questions.data.length === 0 ? (
        <EmptyState>
          <p>Your question bank is empty. Add a question, or start practice with a one-off question.</p>
        </EmptyState>
      ) : null}
      {questions.status === "ready" && questions.data.length > 0 ? (
        <QuestionFilters
          search={filter}
          onSearch={setFilter}
          category={category}
          onCategory={setCategory}
          status={`Showing ${visible.length} of ${questions.data.length} question${questions.data.length === 1 ? "" : "s"}`}
        />
      ) : null}
      {questions.status === "ready" && questions.data.length > 0 && visible.length === 0 ? (
        <EmptyState>
          <p>No questions match. Try another word or category.</p>
        </EmptyState>
      ) : null}
      {visible.length > 0 ? (
        <ul className="list" aria-label="Question bank">
          {visible.map((question) => (
            <li key={question.id} className="card stack-tight">
              <p style={{ whiteSpace: "pre-wrap" }}>{question.text}</p>
              {question.notes ? <p className="hint">{question.notes}</p> : null}
              <div className="spread">
                <span>{question.category ? <span className="chip">{categoryShortLabel(question.category)}</span> : null}</span>
                <span className="row">
                  <button type="button" className="btn btn-quiet btn-small" aria-label={`Edit: ${question.text}`} onClick={() => setEditing(question)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-quiet btn-small" aria-label={`Delete: ${question.text}`} onClick={() => setDeleting(question)}>
                    Delete
                  </button>
                  <Link className="btn btn-secondary btn-small" aria-label={`Practice: ${question.text}`} href={`/practice/setup/?question=${question.id}`}>
                    Practice
                  </Link>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <RecentSessions />

      {editing ? (
        <QuestionEditor key={editing === "new" ? "new" : editing.id} question={editing === "new" ? null : editing} onSave={save} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this question?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        <p>{deleting?.text}</p>
        {deleteFailed ? (
          <p className="field-error" role="alert">
            We couldn&apos;t delete it. Try again.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
