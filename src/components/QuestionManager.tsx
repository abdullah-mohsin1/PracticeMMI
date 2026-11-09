"use client";

import type { User } from "firebase/auth";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { logger } from "@/lib/logger";
import { createQuestion, deleteQuestion, listQuestions, updateQuestion } from "@/lib/questions/repository";
import { CATEGORIES, DIFFICULTIES, parseTopics, questionInputSchema, type Question } from "@/lib/questions/schema";
import styles from "./QuestionManager.module.css";

const emptyForm = {
  category: "ethical" as Question["category"],
  questionText: "",
  description: "",
  difficulty: "medium" as Question["difficulty"],
  topics: "",
};

const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

export function QuestionManager({ user }: { user: User }) {
  const { db } = getFirebase();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setQuestions(await listQuestions(db, user.uid));
  }, [db, user.uid]);

  useEffect(() => {
    reload().catch((cause) => {
      logger.error("questions_load_failed", { errorType: cause instanceof Error ? cause.name : "unknown" });
      setError("We couldn't load your questions. Reload the page to try again.");
    });
  }, [reload]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = questionInputSchema.safeParse({ ...form, topics: parseTopics(form.topics) });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) await updateQuestion(db, user.uid, editingId, parsed.data);
      else await createQuestion(db, user.uid, parsed.data);
      resetForm();
      await reload();
    } catch (cause) {
      logger.error("question_save_failed", { errorType: cause instanceof Error ? cause.name : "unknown" });
      setError("We couldn't save your question. Your text is still here. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (question: Question) => {
    setEditingId(question.id);
    setConfirmingDeleteId(null);
    setError(null);
    setForm({
      category: question.category,
      questionText: question.questionText,
      description: question.description,
      difficulty: question.difficulty,
      topics: question.topics.join(", "),
    });
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteQuestion(db, user.uid, id);
      if (editingId === id) resetForm();
      setConfirmingDeleteId(null);
      await reload();
    } catch (cause) {
      logger.error("question_delete_failed", { errorType: cause instanceof Error ? cause.name : "unknown" });
      setError("We couldn't delete that question. Please try again.");
    }
  };

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        <h2>{editingId ? "Edit question" : "New question"}</h2>
        <label>
          Question
          <textarea
            required
            maxLength={2000}
            rows={4}
            value={form.questionText}
            onChange={(event) => setForm({ ...form, questionText: event.target.value })}
          />
        </label>
        <label>
          Context (optional)
          <textarea
            maxLength={2000}
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <div className={styles.row}>
          <label>
            Category
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as Question["category"] })}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {capitalize(category)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select
              value={form.difficulty}
              onChange={(event) => setForm({ ...form, difficulty: event.target.value as Question["difficulty"] })}
            >
              {DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {capitalize(difficulty)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Topics (comma separated)
            <input value={form.topics} onChange={(event) => setForm({ ...form, topics: event.target.value })} />
          </label>
        </div>
        <div className={styles.actions}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add question"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && <p role="alert">{error}</p>}

      <h2>Your questions</h2>
      {questions === null && !error && <p role="status">Loading…</p>}
      {questions?.length === 0 && <p>You haven&apos;t added any questions yet.</p>}
      <ul className={styles.list}>
        {questions?.map((question) => (
          <li key={question.id}>
            <p>{question.questionText}</p>
            {question.description && <p className={styles.meta}>{question.description}</p>}
            <p className={styles.meta}>
              {[capitalize(question.category), capitalize(question.difficulty), ...question.topics].join(" · ")}
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={() => startEditing(question)}>
                Edit
              </button>
              {confirmingDeleteId === question.id ? (
                <button type="button" onClick={() => remove(question.id)}>
                  Confirm delete
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmingDeleteId(question.id)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
