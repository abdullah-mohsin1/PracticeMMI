"use client";

import type { User } from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { logger } from "@/lib/logger";
import { firestoreImportStore, importDrafts, toImportDraft, type ImportDraft, type ImportResult } from "@/lib/questions/import/importer";
import { parseQuestions } from "@/lib/questions/import/parser";
import { extractPdfLines, PdfReadError } from "@/lib/questions/import/pdf";
import { computeStatuses, toPreviewRows, type PreviewRow, type RowStatus } from "@/lib/questions/import/plan";
import { listQuestions } from "@/lib/questions/repository";
import { CATEGORIES, CATEGORY_LABELS, type Category, type Question } from "@/lib/questions/schema";
import styles from "./ImportQuestions.module.css";

type RowFilter = "all" | "ready" | "duplicates" | "attention";

const matchesFilter = (status: RowStatus, row: PreviewRow, filter: RowFilter) => {
  if (filter === "ready") return status.kind === "ready";
  if (filter === "duplicates") return status.kind === "duplicate_library" || status.kind === "duplicate_file";
  if (filter === "attention") return status.kind === "invalid" || row.warning !== null;
  return true;
};

function statusText(status: RowStatus): string {
  switch (status.kind) {
    case "ready":
      return "Ready to import";
    case "excluded":
      return "Won't be imported";
    case "invalid":
      return status.message;
    case "duplicate_library":
      return "Skipped: already in your library";
    case "duplicate_file":
      return `Skipped: same as question ${status.firstNumber} in this file`;
  }
}

export function ImportQuestions({ user }: { user: User }) {
  const { db } = getFirebase();
  const [library, setLibrary] = useState<Question[] | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [totals, setTotals] = useState({ saved: 0, alreadySaved: 0 });

  useEffect(() => {
    listQuestions(db, user.uid)
      .then(setLibrary)
      .catch((cause) => {
        logger.error("import_library_load_failed", { errorType: cause instanceof Error ? cause.name : "unknown" });
        setError("We couldn't check your existing questions. Reload the page to try again.");
      });
  }, [db, user.uid]);

  const statuses = useMemo(() => computeStatuses(rows ?? [], library ?? []), [rows, library]);
  const readyRows = (rows ?? []).filter((row) => statuses.get(row.key)?.kind === "ready");
  const duplicateCount = [...statuses.values()].filter((status) => status.kind.startsWith("duplicate")).length;
  const attentionCount = (rows ?? []).filter(
    (row) => statuses.get(row.key)?.kind === "invalid" || row.warning !== null,
  ).length;
  const busy = progress !== null;

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setRows(null);
    setResult(null);
    setTotals({ saved: 0, alreadySaved: 0 });
    setFileName(file.name);
    setReading(true);
    try {
      const parsed = parseQuestions(await extractPdfLines(file));
      if (parsed.length === 0) {
        setError("We couldn't find numbered questions in this PDF. Scanned PDFs without selectable text can't be read.");
        return;
      }
      setRows(toPreviewRows(parsed));
    } catch (cause) {
      logger.error("pdf_read_failed", { errorType: cause instanceof Error ? cause.name : "unknown" });
      setError(cause instanceof PdfReadError ? cause.message : "We couldn't read this PDF.");
    } finally {
      setReading(false);
    }
  };

  const updateRow = (key: string, change: Partial<PreviewRow>) => {
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...change } : row)) ?? null);
  };

  const run = async (drafts: ImportDraft[]) => {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: drafts.length });
    try {
      const outcome = await importDrafts(firestoreImportStore(db, user.uid), drafts, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(outcome);
      setTotals((current) => ({
        saved: current.saved + outcome.saved,
        alreadySaved: current.alreadySaved + outcome.alreadySaved,
      }));
      if (outcome.failed.length === 0) setLibrary(await listQuestions(db, user.uid));
    } catch (cause) {
      logger.error("import_failed", { errorType: cause instanceof Error ? cause.name : "unknown" });
      setError("We couldn't finish the import. Nothing else was changed, and you can try again.");
    } finally {
      setProgress(null);
    }
  };

  const startImport = async () => {
    const importable = readyRows.filter((row): row is PreviewRow & { category: Category } => row.category !== "");
    await run(await Promise.all(importable.map(toImportDraft)));
  };

  return (
    <>
      <p>
        <Link href="/questions/">Back to your questions</Link>
      </p>
      <p>
        Your PDF is read in this browser and isn&apos;t uploaded. Only the questions you approve are saved, to your private
        library.
      </p>
      <label className={styles.field}>
        PDF file
        <input type="file" accept="application/pdf,.pdf" onChange={chooseFile} disabled={reading || busy || library === null} />
      </label>

      {reading && <p role="status">Reading {fileName}…</p>}
      {error && <p role="alert">{error}</p>}

      {progress && (
        <p role="status">
          Saving {progress.done} of {progress.total} questions…
        </p>
      )}

      {result && result.failed.length > 0 && (
        <div role="alert" className={styles.notice}>
          <p>
            {totals.saved} saved. {result.failed.length} couldn&apos;t be saved. It&apos;s safe to retry, and nothing will be
            saved twice.
          </p>
          <button type="button" onClick={() => run(result.failed)} disabled={busy}>
            Retry {result.failed.length} remaining
          </button>
        </div>
      )}

      {result && result.failed.length === 0 && (
        <p role="status">
          Import complete. {totals.saved} saved
          {totals.alreadySaved > 0 ? `, ${totals.alreadySaved} were already saved` : ""}.{" "}
          <Link href="/questions/">View your questions</Link>
        </p>
      )}

      {rows && (
        <>
          <h2>Preview</h2>
          <p>
            {rows.length} found in {fileName}. {readyRows.length} ready, {duplicateCount} duplicates, {attentionCount} need
            attention.
          </p>
          <div className={styles.toolbar}>
            <label className={styles.field}>
              Show
              <select value={filter} onChange={(event) => setFilter(event.target.value as RowFilter)}>
                <option value="all">All questions</option>
                <option value="ready">Ready to import</option>
                <option value="duplicates">Duplicates</option>
                <option value="attention">Needs attention</option>
              </select>
            </label>
            <button type="button" onClick={startImport} disabled={busy || readyRows.length === 0}>
              Import {readyRows.length} questions
            </button>
          </div>

          <ol className={styles.rows}>
            {rows
              .filter((row) => matchesFilter(statuses.get(row.key)!, row, filter))
              .map((row) => {
                const status = statuses.get(row.key)!;
                return (
                  <li key={row.key} data-testid={`row-${row.key}`}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) => updateRow(row.key, { selected: event.target.checked })}
                      />
                      Include question {row.number} (page {row.page})
                    </label>
                    <label className={styles.field}>
                      Question text
                      <textarea
                        rows={4}
                        value={row.questionText}
                        onChange={(event) => updateRow(row.key, { questionText: event.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      Follow-up prompts (one per line)
                      <textarea
                        rows={2}
                        value={row.followUpText}
                        onChange={(event) => updateRow(row.key, { followUpText: event.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      Category
                      <select
                        value={row.category}
                        onChange={(event) => updateRow(row.key, { category: event.target.value as Category | "" })}
                      >
                        <option value="">Choose a category</option>
                        {CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className={styles.meta}>
                      {statusText(status)}
                      {row.originalCategory ? ` · From: ${row.originalCategory}` : ""}
                    </p>
                    {row.warning && <p className={styles.meta}>{row.warning}</p>}
                    {status.kind === "duplicate_library" && (
                      <details>
                        <summary>Review the existing question</summary>
                        <p>{status.existingText}</p>
                      </details>
                    )}
                  </li>
                );
              })}
          </ol>
        </>
      )}
    </>
  );
}
