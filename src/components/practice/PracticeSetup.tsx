"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { useAsync } from "@/hooks/use-async";
import { QUESTION_TEXT_LIMIT, type Question } from "@/lib/contracts";
import { getServices } from "@/lib/services";
import {
  DEFAULT_SPEAK_SECONDS,
  MOCK_STATIONS,
  formatDuration,
  makeConfig,
  totalSeconds,
  validateConfig,
  type PracticeMode,
} from "@/lib/practice/timeline";
import { saveSession } from "@/lib/storage/sessions";

interface QueueItem {
  key: string;
  questionId: string | null;
  text: string;
}

function TimeField({
  id,
  label,
  seconds,
  error,
  onChange,
}: {
  id: string;
  label: string;
  seconds: number;
  error?: string;
  onChange: (seconds: number) => void;
}) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const toWhole = (value: string) => Math.max(0, Math.floor(Number(value) || 0));
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="time-inputs">
        <input id={`${id}-minutes`} type="number" min={0} aria-label={`${label} minutes`} value={minutes} onChange={(event) => onChange(toWhole(event.target.value) * 60 + rest)} />
        <span className="hint">min</span>
        <input id={`${id}-seconds`} type="number" min={0} max={59} aria-label={`${label} seconds`} value={rest} onChange={(event) => onChange(minutes * 60 + Math.min(59, toWhole(event.target.value)))} />
        <span className="hint">sec</span>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function SetupForm({ bank, preselected }: { bank: Question[]; preselected: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<PracticeMode>("custom");
  const [stationCount, setStationCount] = useState(1);
  const [speakSeconds, setSpeakSeconds] = useState(DEFAULT_SPEAK_SECONDS);
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const found = bank.find((question) => question.id === preselected);
    return found ? [{ key: found.id, questionId: found.id, text: found.text }] : [];
  });
  const [oneOff, setOneOff] = useState("");
  const [oneOffError, setOneOffError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const config = makeConfig(mode, stationCount, 0, speakSeconds);
  const errors = validateConfig(config);
  const needed = config.stationCount - queue.length;
  const canStart = Object.keys(errors).length === 0 && needed === 0 && !starting;

  const toggleBank = (question: Question) => {
    setQueue((items) =>
      items.some((item) => item.questionId === question.id)
        ? items.filter((item) => item.questionId !== question.id)
        : [...items, { key: question.id, questionId: question.id, text: question.text }],
    );
  };

  const addOneOff = () => {
    const text = oneOff.trim();
    if (!text) {
      setOneOffError("Type a question first.");
      return;
    }
    setQueue((items) => [...items, { key: crypto.randomUUID(), questionId: null, text }]);
    setOneOff("");
    setOneOffError(null);
  };

  const fillAtRandom = () => {
    setQueue((items) => {
      const unused = bank.filter((question) => !items.some((item) => item.questionId === question.id));
      for (let i = unused.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [unused[i], unused[j]] = [unused[j]!, unused[i]!];
      }
      const added = unused.slice(0, Math.max(0, config.stationCount - items.length));
      return [...items, ...added.map((question) => ({ key: question.id, questionId: question.id, text: question.text }))];
    });
  };

  const move = (index: number, by: number) => {
    setQueue((items) => {
      const next = [...items];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });
  };

  const start = async () => {
    setStarting(true);
    setSaveFailed(false);
    const id = crypto.randomUUID();
    try {
      await saveSession({
        id,
        ownerId: getServices().auth.getCurrentUser()?.uid ?? "",
        config,
        stations: queue.map((item, index) => ({ station: index + 1, questionId: item.questionId, text: item.text })),
        status: "draft",
        captureMode: "video",
        transcriptionEnabled: false,
        createdAt: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
      });
      router.push(`/practice/run/?id=${id}`);
    } catch {
      setStarting(false);
      setSaveFailed(true);
    }
  };

  const status =
    needed > 0
      ? `Add ${needed} more question${needed === 1 ? "" : "s"}.`
      : needed < 0
        ? `Remove ${-needed} question${needed === -1 ? "" : "s"}.`
        : Object.keys(errors).length === 0
          ? `Total time: ${formatDuration(totalSeconds(config))}`
          : "";

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Set up practice</h1>
        <p className="lead">Choose a format, then pick one question for each station. Each station is one timed answer, recorded on this device.</p>
      </div>

      <section className="panel" aria-labelledby="format-heading">
        <div className="panel-head">
          <h2 id="format-heading">Choose a format</h2>
          <p className="hint">Practise a few stations, or run a full mock interview.</p>
        </div>
        <div className="mode-options" role="radiogroup" aria-label="Practice type">
          <label className="mode-option">
            <input type="radio" name="mode" checked={mode === "custom"} onChange={() => setMode("custom")} />
            <span>
              <strong>Custom</strong>
              <br />
              <span className="hint">Choose how many stations you want</span>
            </span>
          </label>
          <label className="mode-option">
            <input type="radio" name="mode" checked={mode === "mock"} onChange={() => setMode("mock")} />
            <span>
              <strong>Full mock</strong>
              <br />
              <span className="hint">{MOCK_STATIONS} stations, with a 2-minute break after station 4</span>
            </span>
          </label>
        </div>
        <div className="settings-grid">
          {mode === "custom" ? (
            <div className="field">
              <label htmlFor="station-count">Stations</label>
              <input id="station-count" type="number" min={1} max={12} value={stationCount} onChange={(event) => setStationCount(Math.floor(Number(event.target.value) || 0))} />
              {errors.stationCount ? (
                <p className="field-error" role="alert">
                  {errors.stationCount}
                </p>
              ) : null}
            </div>
          ) : null}
          <TimeField id="speak" label="Speaking time" seconds={speakSeconds} error={errors.speakSeconds} onChange={setSpeakSeconds} />
        </div>
      </section>

      <section className="panel" aria-labelledby="questions-heading">
        <div className="spread">
          <div className="panel-head">
            <h2 id="questions-heading">Add your questions</h2>
            <p className="hint">Type a new question, or tick questions from your bank.</p>
          </div>
          <span className="count-pill" data-complete={needed === 0}>
            {queue.length} of {config.stationCount} added
          </span>
        </div>

        <div className="stack-tight">
          <label htmlFor="one-off">
            <strong>One-off question</strong>
          </label>
          <textarea id="one-off" rows={2} maxLength={QUESTION_TEXT_LIMIT} value={oneOff} onChange={(event) => setOneOff(event.target.value)} placeholder="Used for this session only. It won't be saved to your bank." />
          {oneOffError ? (
            <p className="field-error" role="alert">
              {oneOffError}
            </p>
          ) : null}
          <div>
            <button type="button" className="btn btn-secondary btn-small" onClick={addOneOff}>
              Add to this session
            </button>
          </div>
        </div>

        {bank.length > 0 ? (
          <div className="stack-tight">
            <div className="spread">
              <strong>Choose from your bank</strong>
              <button type="button" className="btn btn-quiet btn-small" onClick={fillAtRandom} disabled={needed <= 0}>
                Fill remaining at random
              </button>
            </div>
            <ul className="list">
              {bank.map((question) => (
                <li key={question.id} className="pick">
                  <label className="check">
                    <input type="checkbox" checked={queue.some((item) => item.questionId === question.id)} onChange={() => toggleBank(question)} />
                    <span>{question.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel" aria-label="Session order">
        <div className="panel-head">
          <h2>
            This session ({queue.length} of {config.stationCount})
          </h2>
          <p className="hint">Stations run in this order. Use Up and Down to change it.</p>
        </div>
        {queue.length === 0 ? <p className="empty">Add one question for each station.</p> : null}
        <ol className="list">
          {queue.map((item, index) => (
            <li key={item.key} className="queue-item">
              <span className="station-badge" aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <span className="sr-only">Station {index + 1}. </span>
                {item.text}
              </span>
              <span className="row">
                <button type="button" className="btn btn-quiet btn-small" disabled={index === 0} aria-label={`Move station ${index + 1} up`} onClick={() => move(index, -1)}>
                  Up
                </button>
                <button type="button" className="btn btn-quiet btn-small" disabled={index === queue.length - 1} aria-label={`Move station ${index + 1} down`} onClick={() => move(index, 1)}>
                  Down
                </button>
                <button type="button" className="btn btn-quiet btn-small" aria-label={`Remove station ${index + 1}`} onClick={() => setQueue((items) => items.filter((other) => other.key !== item.key))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {saveFailed ? <ErrorState message="We couldn't set up this session. Check that this browser allows site storage." /> : null}

      <div className="action-bar">
        <p className="hint" role="status">
          {status}
        </p>
        <button type="button" className="btn btn-gold btn-large" disabled={!canStart} onClick={() => void start()}>
          {starting ? "Setting up…" : "Continue to device check"}
        </button>
      </div>
    </div>
  );
}

export function PracticeSetup() {
  const params = useSearchParams();
  const bank = useAsync(() => getServices().questions.list(), "bank");
  if (bank.status === "loading") return <LoadingRows rows={6} />;
  if (bank.status === "error") return <ErrorState message="We couldn't load your questions." onRetry={bank.reload} />;
  return <SetupForm bank={bank.data} preselected={params.get("question")} />;
}
