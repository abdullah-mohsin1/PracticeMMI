"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { useAsync } from "@/hooks/use-async";
import { QUESTION_TEXT_LIMIT, type Question } from "@/lib/contracts";
import { getServices } from "@/lib/services";
import {
  DEFAULT_PREP_SECONDS,
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
  const [prepSeconds, setPrepSeconds] = useState(DEFAULT_PREP_SECONDS);
  const [speakSeconds, setSpeakSeconds] = useState(DEFAULT_SPEAK_SECONDS);
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const found = bank.find((question) => question.id === preselected);
    return found ? [{ key: found.id, questionId: found.id, text: found.text }] : [];
  });
  const [oneOff, setOneOff] = useState("");
  const [oneOffError, setOneOffError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const config = makeConfig(mode, stationCount, prepSeconds, speakSeconds);
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

  return (
    <div className="stack">
      <h1>Set up practice</h1>

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
        <TimeField id="prep" label="Preparation time" seconds={prepSeconds} error={errors.prepSeconds} onChange={setPrepSeconds} />
        <TimeField id="speak" label="Speaking time" seconds={speakSeconds} error={errors.speakSeconds} onChange={setSpeakSeconds} />
      </div>

      <section className="stack-tight">
        <h2>Type a one-off question</h2>
        <div className="field">
          <label className="sr-only" htmlFor="one-off">
            One-off question
          </label>
          <textarea id="one-off" rows={2} maxLength={QUESTION_TEXT_LIMIT} value={oneOff} onChange={(event) => setOneOff(event.target.value)} placeholder="Used for this session only. It won't be saved to your bank." />
          {oneOffError ? (
            <p className="field-error" role="alert">
              {oneOffError}
            </p>
          ) : null}
        </div>
        <div>
          <button type="button" className="btn btn-secondary btn-small" onClick={addOneOff}>
            Add to this session
          </button>
        </div>
      </section>

      {bank.length > 0 ? (
        <section className="stack-tight">
          <div className="spread">
            <h2>Choose from your bank</h2>
            <button type="button" className="btn btn-quiet btn-small" onClick={fillAtRandom} disabled={needed <= 0}>
              Fill remaining at random
            </button>
          </div>
          <ul className="list">
            {bank.map((question) => (
              <li key={question.id} className="card">
                <label className="check">
                  <input type="checkbox" checked={queue.some((item) => item.questionId === question.id)} onChange={() => toggleBank(question)} />
                  <span>{question.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="stack-tight" aria-label="Session order">
        <h2>
          This session ({queue.length} of {config.stationCount})
        </h2>
        {queue.length === 0 ? <p className="hint">Add one question for each station.</p> : null}
        <ol className="list">
          {queue.map((item, index) => (
            <li key={item.key} className="card spread">
              <span>
                <span className="hint">Station {index + 1}. </span>
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

      <div className="spread">
        <p className="hint" role="status">
          {needed > 0
            ? `Add ${needed} more question${needed === 1 ? "" : "s"}.`
            : needed < 0
              ? `Remove ${-needed} question${needed === -1 ? "" : "s"}.`
              : Object.keys(errors).length === 0
                ? `Total time: ${formatDuration(totalSeconds(config))}`
                : ""}
        </p>
        <button type="button" className="btn btn-primary" disabled={!canStart} onClick={() => void start()}>
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
