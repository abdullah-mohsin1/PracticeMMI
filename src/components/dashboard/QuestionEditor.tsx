"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QUESTION_TEXT_LIMIT, RepositoryError, type Question, type QuestionInput } from "@/lib/contracts";

interface QuestionEditorProps {
  /** Null adds a new question. */
  question: Question | null;
  onSave: (input: QuestionInput) => Promise<void>;
  onClose: () => void;
}

export function QuestionEditor({ question, onSave, onClose }: QuestionEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(question?.text ?? "");
  const [category, setCategory] = useState(question?.category ?? "");
  const [notes, setNotes] = useState(question?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError("Enter a question.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ text, category: category || null, notes: notes || null });
    } catch (caught) {
      setSaving(false);
      setError(
        caught instanceof RepositoryError && caught.code === "invalid"
          ? caught.message
          : "We couldn't save this question. Your text is still here.",
      );
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-label={question ? "Edit question" : "Add question"}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form className="stack" onSubmit={(event) => void submit(event)} noValidate>
        <h2>{question ? "Edit question" : "Add question"}</h2>
        <div className="field">
          <label htmlFor="question-text">Question</label>
          <textarea
            id="question-text"
            rows={4}
            maxLength={QUESTION_TEXT_LIMIT}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="question-category">Category (optional)</label>
          <input id="question-category" type="text" maxLength={60} value={category} onChange={(event) => setCategory(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="question-notes">Notes (optional)</label>
          <textarea id="question-notes" rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save question"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
