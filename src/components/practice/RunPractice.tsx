"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CameraPreview } from "@/components/practice/CameraPreview";
import { DeviceCheck, type StartChoices } from "@/components/practice/DeviceCheck";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { useAsync } from "@/hooks/use-async";
import { PracticeRunner, type RunnerSnapshot } from "@/lib/practice/runner";
import { formatCountdown, type Phase } from "@/lib/practice/timeline";
import { getServices } from "@/lib/services";
import * as store from "@/lib/storage/sessions";
import type { PracticeSession } from "@/lib/storage/sessions";

const TICK_MS = 200;

function phaseLabel(phase: Phase | null): string {
  if (!phase) return "";
  if (phase.kind === "prep") return "Prepare";
  if (phase.kind === "speak") return "Speak";
  return "Break";
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Refused, for example on low battery. The session carries on without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

function LiveSession({ session, choices }: { session: PracticeSession; choices: StartChoices }) {
  const router = useRouter();
  const runnerRef = useRef<PracticeRunner | null>(null);
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<RunnerSnapshot | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    // React's development mode mounts twice. The delayed dispose below lets the
    // same runner survive that, so the session and its devices aren't torn down.
    if (disposeTimer.current) clearTimeout(disposeTimer.current);
    runnerRef.current ??= new PracticeRunner({
      session: { ...session, captureMode: choices.captureMode, transcriptionEnabled: choices.transcriptionEnabled },
      stream: choices.stream,
      store,
      onDeviceSpeech: choices.onDeviceSpeech,
      onChange: setSnapshot,
    });
    const runner = runnerRef.current;
    if (runner.current.state === "ready") runner.start();
    const interval = setInterval(() => runner.tick(), TICK_MS);
    // A hidden tab's timers are slowed, so catch up the moment it's visible.
    const onVisible = () => runner.tick();
    document.addEventListener("visibilitychange", onVisible);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", warn);
      disposeTimer.current = setTimeout(() => runner.dispose(), 0);
    };
    // The session starts once, when this component mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finished = snapshot?.state === "finished";
  const running = snapshot?.state === "running";
  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    // A second history entry at the same URL absorbs the Back button, so that
    // pressing it asks first instead of leaving the interview.
    const hold = () => window.history.pushState(window.history.state, "", window.location.href);
    const onBack = () => {
      hold();
      setConfirmEnd(true);
    };
    hold();
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [running]);

  useEffect(() => {
    if (finished) router.replace(`/sessions/view/?id=${session.id}`);
  }, [finished, router, session.id]);

  if (!snapshot || snapshot.state === "finished" || snapshot.state === "saving") {
    return (
      <div className="stack" role="status">
        <h1>Saving your session…</h1>
        <p className="muted">Keep this page open for a moment.</p>
      </div>
    );
  }

  const { phase } = snapshot;
  const showTranscript = phase?.kind === "speak" && choices.transcriptionEnabled;
  const station = phase && phase.kind !== "break" ? phase.station : null;
  const nextStation = phase?.kind === "break" ? phase.afterStation + 1 : null;

  return (
    <div className="stack live-session">
      <p className="sr-only" aria-live="assertive">
        {phaseLabel(phase)}
        {station ? `, station ${station}` : ""}
      </p>
      <div className="spread">
        <span className="muted" data-testid="station-progress">
          {station ? `Station ${station} of ${session.config.stationCount}` : `Next: station ${nextStation} of ${session.config.stationCount}`}
        </span>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmEnd(true)}>
          End session
        </button>
      </div>

      {snapshot.warning ? (
        <div className="alert alert-warning" role="alert">
          <p>{snapshot.warning}</p>
          {snapshot.canReconnect ? (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void runnerRef.current?.reconnect()}>
              Reconnect
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="runner">
        <div className="stack">
          <div className="stack-tight">
            <div className="row">
              <h1 data-testid="phase-label">{phaseLabel(phase)}</h1>
              {snapshot.isRecording ? <span className="rec">Recording</span> : null}
            </div>
            <div className="timer" role="timer" data-testid="countdown">
              {formatCountdown(snapshot.remainingMs)}
            </div>
          </div>
          {snapshot.question ? (
            <section className="question-box" aria-label="Question">
              <p className="question-text" data-testid="question">
                {snapshot.question}
              </p>
            </section>
          ) : (
            <p className="muted">Take a moment. The next station starts automatically.</p>
          )}
          {showTranscript ? (
            <section className="card stack-tight" aria-label="Live transcript">
              <h2>Live transcript</h2>
              {snapshot.transcriptMessage ? <p className="hint">{snapshot.transcriptMessage}</p> : null}
              <p className="live-transcript" data-testid="live-transcript">
                {snapshot.finalTranscript} <span className="interim">{snapshot.interimTranscript}</span>
              </p>
            </section>
          ) : null}
        </div>
        <div className="stack-tight">
          {snapshot.stream && snapshot.stream.getVideoTracks().length > 0 ? (
            <CameraPreview stream={snapshot.stream} />
          ) : (
            <p className="hint">{choices.captureMode === "none" ? "Not recording in this session." : "Audio only."}</p>
          )}
          <p className="hint">Keep this tab open and visible.</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title="End this session?"
        confirmLabel="End session"
        cancelLabel="Keep going"
        onConfirm={() => {
          setConfirmEnd(false);
          void runnerRef.current?.endEarly();
        }}
        onCancel={() => setConfirmEnd(false)}
      >
        <p>Everything recorded so far will be kept. Stations you haven&apos;t reached won&apos;t be recorded.</p>
      </ConfirmDialog>
    </div>
  );
}

function SessionLoader({ id }: { id: string }) {
  const router = useRouter();
  const uid = getServices().auth.getCurrentUser()?.uid ?? "";
  const session = useAsync(() => store.getSession(id, uid), id);
  const [choices, setChoices] = useState<StartChoices | null>(null);

  const stale = session.status === "ready" && session.data !== null && session.data.status !== "draft";
  useEffect(() => {
    // This page can't resume a session: a reload loses the camera and recorder.
    if (stale && choices === null) router.replace(`/sessions/view/?id=${id}`);
  }, [stale, choices, router, id]);

  if (session.status === "loading") return <LoadingRows rows={6} />;
  if (session.status === "error") return <ErrorState message="We couldn't open this session." onRetry={session.reload} />;
  if (session.data === null) return <ErrorState message="This session no longer exists." />;
  if (choices) return <LiveSession session={session.data} choices={choices} />;
  if (stale) return <LoadingRows rows={6} />;
  return <DeviceCheck session={session.data} onStart={setChoices} />;
}

export function RunPractice() {
  const id = useSearchParams().get("id");
  if (!id) return <ErrorState message="No session was selected." />;
  return <SessionLoader id={id} />;
}
