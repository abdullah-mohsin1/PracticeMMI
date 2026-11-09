"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { useAsync } from "@/hooks/use-async";
import { extensionFor, saveBlob, saveTranscriptFile, stationFilename } from "@/lib/download";
import { formatDuration } from "@/lib/practice/timeline";
import { getServices } from "@/lib/services";
import {
  deleteSession,
  getRecordingBlob,
  getSession,
  listRecordings,
  listTranscripts,
  recoverSession,
  saveTranscript,
  transcriptId,
  type PracticeSession,
  type RecordingMeta,
  type StationPlan,
  type TranscriptRecord,
} from "@/lib/storage/sessions";

const SAVE_DELAY_MS = 500;

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}

function RecordingPlayer({ meta, sessionStartedAt }: { meta: RecordingMeta; sessionStartedAt: string }) {
  const [state, setState] = useState<{ blob: Blob; url: string } | "loading" | "error">("loading");
  const fixingDuration = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    getRecordingBlob(meta).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ blob, url });
      },
      () => {
        if (!cancelled) setState("error");
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [meta]);

  if (state === "loading") return <LoadingRows rows={1} />;
  if (state === "error" || state.blob.size === 0) return <ErrorState message="This recording couldn't be loaded." />;

  const isVideo = meta.mimeType.startsWith("video/");
  const label = `Recording of station ${meta.station}${meta.part > 1 ? `, part ${meta.part}` : ""}`;
  const mediaProps = {
    src: state.url,
    controls: true,
    preload: "metadata",
    "aria-label": label,
    // Browsers don't write a total length into WebM recordings. Seeking past
    // the end makes them work it out, which gives the scrubber a real length.
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      if (media.duration === Infinity) {
        fixingDuration.current = true;
        media.currentTime = 1e9;
      }
    },
    onSeeked: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      if (!fixingDuration.current) return;
      fixingDuration.current = false;
      event.currentTarget.currentTime = 0;
    },
  };

  return (
    <div className="stack-tight">
      {isVideo ? <video className="player" playsInline {...mediaProps} /> : <audio style={{ width: "100%" }} {...mediaProps} />}
      <div className="spread">
        <span className="hint">
          {meta.durationMs > 0 ? `${formatDuration(meta.durationMs / 1000)} · ` : ""}
          {formatMegabytes(meta.sizeBytes)}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => saveBlob(state.blob, stationFilename(sessionStartedAt, meta.station, extensionFor(meta.mimeType), meta.part))}
        >
          {meta.part > 1 ? `Download recording, part ${meta.part}` : "Download recording"}
        </button>
      </div>
      {meta.note ? <p className="alert alert-warning">{meta.note}</p> : null}
    </div>
  );
}

function transcriptNotice(record: TranscriptRecord | undefined): string | null {
  if (!record) return "No transcript was made for this station. You can type one here.";
  if (record.edited) return null;
  if (record.status === "off") return "Transcription was off for this session. You can type a transcript here.";
  if (record.status === "unsupported") return "This browser doesn't support live transcription. You can type a transcript here.";
  if (record.status === "failed") return record.message ?? "Transcription failed. You can type a transcript here.";
  if (record.status === "partial") return "The session stopped early, so this transcript may be incomplete.";
  if (!record.text) return "No speech was picked up. You can type a transcript here.";
  return "Automatic transcripts can contain mistakes. You can correct this one here.";
}

function TranscriptEditor({
  sessionId,
  sessionStartedAt,
  plan,
  initial,
  onEdited,
}: {
  sessionId: string;
  sessionStartedAt: string;
  plan: StationPlan;
  initial: TranscriptRecord | undefined;
  onEdited: (record: TranscriptRecord) => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      flush.current?.();
    },
    [],
  );

  const change = (value: string) => {
    setText(value);
    setSaveState("saving");
    const record: TranscriptRecord = {
      id: transcriptId(sessionId, plan.station),
      sessionId,
      station: plan.station,
      text: value,
      status: initial?.status ?? "off",
      message: initial?.message ?? null,
      edited: true,
      updatedAt: new Date().toISOString(),
    };
    onEdited(record);
    const write = () => {
      flush.current = null;
      timer.current = null;
      saveTranscript(record).then(
        () => setSaveState("saved"),
        () => setSaveState("failed"),
      );
    };
    if (timer.current) clearTimeout(timer.current);
    flush.current = write;
    timer.current = setTimeout(write, SAVE_DELAY_MS);
  };

  const notice = transcriptNotice(initial);
  const inputId = `transcript-${plan.station}`;

  return (
    <div className="field">
      <label htmlFor={inputId}>Transcript</label>
      {notice ? <p className="hint">{notice}</p> : null}
      <textarea id={inputId} rows={8} value={text} onChange={(event) => change(event.target.value)} />
      <div className="spread">
        <span className="hint" role="status">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved in this browser" : ""}
          {saveState === "failed" ? "Couldn't save. Download a copy so you don't lose it." : ""}
        </span>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => saveTranscriptFile(sessionStartedAt, plan.station, plan.text, text)}>
          Download transcript (.txt)
        </button>
      </div>
    </div>
  );
}

interface LoadedSession {
  session: PracticeSession;
  recordings: RecordingMeta[];
  transcripts: TranscriptRecord[];
}

function Review({ data }: { data: LoadedSession }) {
  const router = useRouter();
  const { session, recordings } = data;
  const [transcripts, setTranscripts] = useState(data.transcripts);
  const [station, setStation] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const plan = session.stations[station - 1]!;
  const stationRecordings = recordings.filter((meta) => meta.station === station);
  const startedAt = session.startedAt ?? session.createdAt;

  const remove = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteSession(session);
      router.replace("/");
    } catch {
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

  return (
    <div className="stack">
      <div className="spread">
        <div className="stack-tight">
          <p className="hint">
            <Link href="/">Back to dashboard</Link>
          </p>
          <h1>Review your practice</h1>
        </div>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(true)}>
          Delete session
        </button>
      </div>

      {session.status === "interrupted" ? (
        <p className="alert alert-warning">This session stopped before it finished. Everything captured up to that point is here.</p>
      ) : null}
      <p className="hint">Recordings stay in this browser. Clearing your browsing data deletes them, so download anything you want to keep.</p>

      {session.stations.length > 1 ? (
        <nav className="station-tabs" aria-label="Stations">
          {session.stations.map((item) => (
            <button
              key={item.station}
              type="button"
              className="btn btn-secondary btn-small station-tab"
              aria-current={item.station === station ? "true" : undefined}
              onClick={() => setStation(item.station)}
            >
              Station {item.station}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="stack" aria-label={`Station ${station}`}>
        <p className="question-text">{plan.text}</p>
        {stationRecordings.length === 0 ? (
          <EmptyState>
            <p>No recording for this station.</p>
          </EmptyState>
        ) : (
          stationRecordings.map((meta) => <RecordingPlayer key={meta.id} meta={meta} sessionStartedAt={startedAt} />)
        )}
        <TranscriptEditor
          key={station}
          sessionId={session.id}
          sessionStartedAt={startedAt}
          plan={plan}
          initial={transcripts.find((record) => record.station === station)}
          onEdited={(record) => setTranscripts((rows) => [...rows.filter((row) => row.id !== record.id), record])}
        />
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this session?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>Its recordings and transcripts will be permanently removed from this browser.</p>
        {deleteFailed ? (
          <p className="field-error" role="alert">
            We couldn&apos;t delete it. Try again.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function Loader({ id }: { id: string }) {
  const uid = getServices().auth.getCurrentUser()?.uid ?? "";
  const loaded = useAsync<LoadedSession | null>(async () => {
    const found = await getSession(id, uid);
    if (!found) return null;
    const session = await recoverSession(found);
    const [recordings, transcripts] = await Promise.all([listRecordings(id), listTranscripts(id)]);
    return { session, recordings, transcripts };
  }, id);

  if (loaded.status === "loading") return <LoadingRows rows={6} />;
  if (loaded.status === "error") return <ErrorState message="We couldn't load this session." onRetry={loaded.reload} />;
  if (loaded.data === null) return <ErrorState message="This session no longer exists." />;
  return <Review data={loaded.data} />;
}

export function SessionView() {
  const id = useSearchParams().get("id");
  if (!id) return <ErrorState message="No session was selected." />;
  return <Loader id={id} />;
}
