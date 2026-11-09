"use client";

import type { User } from "firebase/auth";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { logger } from "@/lib/logger";
import { createQuestion, deleteQuestion, listQuestions, updateQuestion } from "@/lib/questions/repository";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTIES,
  parseFollowUps,
  parseTopics,
  questionInputSchema,
  type Question,
} from "@/lib/questions/schema";
import styles from "./QuestionManager.module.css";

const emptyForm = {
  category: "ethical" as Question["category"],
  questionText: "",
  description: "",
  difficulty: "medium" as Question["difficulty"],
  topics: "",
  followUpQuestions: "",
};

const PAGE_SIZE = 50;

const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

export function QuestionManager({ user }: { user: User }) {
  const { db } = getFirebase();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (questions ?? []).filter(
      (question) =>
        (!categoryFilter || question.category === categoryFilter) &&
        (!sourceFilter || question.source === sourceFilter) &&
        (!term || question.questionText.toLowerCase().includes(term)),
    );
  }, [questions, search, categoryFilter, sourceFilter]);

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
    const parsed = questionInputSchema.safeParse({
      ...form,
      topics: parseTopics(form.topics),
      followUpQuestions: parseFollowUps(form.followUpQuestions),
    });
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
      followUpQuestions: question.followUpQuestions.join("\n"),
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
                  {CATEGORY_LABELS[category]}
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
        <label>
          Follow-up prompts (one per line)
          <textarea
            rows={2}
            value={form.followUpQuestions}
            onChange={(event) => setForm({ ...form, followUpQuestions: event.target.value })}
          />
        </label>
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
      <p>
        <Link href="/questions/import/">Import questions from a PDF</Link>
      </p>
      {questions === null && !error && <p role="status">Loading…</p>}
      {questions?.length === 0 && <p>You haven&apos;t added any questions yet.</p>}
      {questions !== null && questions.length > 0 && (
        <div className={styles.filters}>
          <label>
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            />
          </label>
          <label>
            Filter by category
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filter by source
            <select
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <option value="">All sources</option>
              <option value="manual">Added by you</option>
              <option value="pdf_import">Imported</option>
            </select>
          </label>
          <p role="status">
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
          </p>
        </div>
      )}
      {questions !== null && questions.length > 0 && filtered.length === 0 && <p>No questions match these filters.</p>}
      <ul className={styles.list}>
        {filtered.slice(0, visibleCount).map((question) => (
          <li key={question.id}>
            <p>{question.questionText}</p>
            {question.description && <p className={styles.meta}>{question.description}</p>}
            {question.followUpQuestions.length > 0 && (
              <ul>
                {question.followUpQuestions.map((prompt) => (
                  <li key={prompt} className={styles.followUp}>
                    {prompt}
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.meta}>
              {[
                CATEGORY_LABELS[question.category],
                capitalize(question.difficulty),
                ...(question.source === "pdf_import" ? ["Imported"] : []),
                ...question.topics,
              ].join(" · ")}
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
      {visibleCount < filtered.length && (
        <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </>
  );
}
