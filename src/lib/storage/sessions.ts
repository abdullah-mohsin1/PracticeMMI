// Practice sessions, recordings and transcripts. These stay in this browser and
// are never sent anywhere by the application.

import type { PracticeConfig } from "@/lib/practice/timeline";
import { getByIndex, getOne, getRange, put, remove } from "@/lib/storage/idb";

export type CaptureMode = "video" | "audio" | "none";
export type SessionStatus = "draft" | "running" | "completed" | "ended_early" | "interrupted";

export interface StationPlan {
  station: number;
  /** Null for a one-off question typed for this session. */
  questionId: string | null;
  text: string;
}

export interface PracticeSession {
  id: string;
  ownerId: string;
  config: PracticeConfig;
  stations: StationPlan[];
  status: SessionStatus;
  captureMode: CaptureMode;
  transcriptionEnabled: boolean;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export type RecordingStatus = "recording" | "complete" | "interrupted";

export interface RecordingMeta {
  id: string;
  sessionId: string;
  station: number;
  /** Starts at 1. A reconnect part-way through a station starts a new part. */
  part: number;
  mimeType: string;
  status: RecordingStatus;
  startedAt: string;
  durationMs: number;
  sizeBytes: number;
  note: string | null;
}

export type TranscriptStatus = "listening" | "complete" | "partial" | "unsupported" | "failed" | "off";

export interface TranscriptRecord {
  id: string;
  sessionId: string;
  station: number;
  text: string;
  status: TranscriptStatus;
  message: string | null;
  edited: boolean;
  updatedAt: string;
}

interface ChunkRow {
  recordingId: string;
  seq: number;
  blob: Blob;
}

export function transcriptId(sessionId: string, station: number): string {
  return `${sessionId}:${station}`;
}

export function saveSession(session: PracticeSession): Promise<void> {
  return put("sessions", session);
}

export async function getSession(id: string, ownerId: string): Promise<PracticeSession | null> {
  const session = await getOne<PracticeSession>("sessions", id);
  return session && session.ownerId === ownerId ? session : null;
}

/** Newest first. Drafts that were never started are left out. */
export async function listSessions(ownerId: string): Promise<PracticeSession[]> {
  const rows = await getByIndex<PracticeSession>("sessions", "ownerId", ownerId);
  return rows.filter((row) => row.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveRecordingMeta(meta: RecordingMeta): Promise<void> {
  return put("recordings", meta);
}

export function appendChunk(recordingId: string, seq: number, blob: Blob): Promise<void> {
  return put("chunks", { recordingId, seq, blob } satisfies ChunkRow);
}

function chunkRange(recordingId: string): IDBKeyRange {
  return IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]);
}

export async function listRecordings(sessionId: string): Promise<RecordingMeta[]> {
  const rows = await getByIndex<RecordingMeta>("recordings", "sessionId", sessionId);
  return rows.sort((a, b) => a.station - b.station || a.part - b.part);
}

export async function getRecordingBlob(meta: RecordingMeta): Promise<Blob> {
  const rows = await getRange<ChunkRow>("chunks", chunkRange(meta.id));
  return new Blob(
    rows.map((row) => row.blob),
    { type: meta.mimeType },
  );
}

export function saveTranscript(record: TranscriptRecord): Promise<void> {
  return put("transcripts", record);
}

export async function listTranscripts(sessionId: string): Promise<TranscriptRecord[]> {
  const rows = await getByIndex<TranscriptRecord>("transcripts", "sessionId", sessionId);
  return rows.sort((a, b) => a.station - b.station);
}

/**
 * Closes out a session the page stopped running, after a reload or crash.
 * Everything already written stays playable.
 */
export async function recoverSession(session: PracticeSession): Promise<PracticeSession> {
  if (session.status !== "running") return session;
  for (const meta of await listRecordings(session.id)) {
    if (meta.status !== "recording") continue;
    const blob = await getRecordingBlob(meta);
    await saveRecordingMeta({
      ...meta,
      status: "interrupted",
      sizeBytes: blob.size,
      note: "The page closed during this recording. Everything captured up to then was kept.",
    });
  }
  for (const transcript of await listTranscripts(session.id)) {
    if (transcript.status === "listening") await saveTranscript({ ...transcript, status: "partial" });
  }
  const recovered: PracticeSession = { ...session, status: "interrupted" };
  await saveSession(recovered);
  return recovered;
}

export async function deleteSession(session: PracticeSession): Promise<void> {
  for (const meta of await listRecordings(session.id)) {
    await remove("chunks", chunkRange(meta.id));
    await remove("recordings", meta.id);
  }
  for (const transcript of await listTranscripts(session.id)) await remove("transcripts", transcript.id);
  await remove("sessions", session.id);
}
