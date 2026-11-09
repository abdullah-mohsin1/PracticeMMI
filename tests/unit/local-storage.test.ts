import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { resetConnectionForTests } from "@/lib/storage/idb";
import { createLocalQuestionRepository } from "@/lib/storage/local-services";
import {
  appendChunk,
  deleteSession,
  getRecordingBlob,
  getSession,
  listRecordings,
  listSessions,
  listTranscripts,
  recoverSession,
  saveRecordingMeta,
  saveSession,
  saveTranscript,
  type PracticeSession,
  type RecordingMeta,
} from "@/lib/storage/sessions";
import { makeConfig } from "@/lib/practice/timeline";
import { describeQuestionRepository } from "./question-repository-contract";

Object.assign(globalThis, { IDBKeyRange });

beforeEach(() => {
  Object.assign(globalThis, { indexedDB: new IDBFactory() });
  resetConnectionForTests();
});

describeQuestionRepository("local", (owner) => createLocalQuestionRepository(owner));

const session: PracticeSession = {
  id: "s1",
  ownerId: "me",
  config: makeConfig("custom", 1, 0, 10),
  stations: [{ station: 1, questionId: null, text: "Q" }],
  status: "running",
  captureMode: "video",
  transcriptionEnabled: true,
  createdAt: "2026-11-09T00:00:00.000Z",
  startedAt: "2026-11-09T00:00:00.000Z",
  endedAt: null,
};
const meta: RecordingMeta = { id: "s1:1:1", sessionId: "s1", station: 1, part: 1, mimeType: "video/webm", status: "recording", startedAt: "x", durationMs: 0, sizeBytes: 0, note: null };

describe("session storage", () => {
  it("joins chunks in order, whatever order they were written", async () => {
    await saveRecordingMeta(meta);
    await appendChunk(meta.id, 10, new Blob(["c"]));
    await appendChunk(meta.id, 2, new Blob(["b"]));
    await appendChunk(meta.id, 0, new Blob(["a"]));
    const blob = await getRecordingBlob(meta);
    expect(blob.type).toBe("video/webm");
    expect(blob.size).toBe(3);
  });

  it("hides another owner's session and drafts", async () => {
    await saveSession(session);
    await saveSession({ ...session, id: "draft", status: "draft" });
    expect(await getSession("s1", "someone-else")).toBeNull();
    expect((await listSessions("me")).map((row) => row.id)).toEqual(["s1"]);
  });

  it("closes out a session after a reload and keeps what was captured", async () => {
    await saveSession(session);
    await saveRecordingMeta(meta);
    await appendChunk(meta.id, 0, new Blob(["abcd"]));
    await saveTranscript({ id: "s1:1", sessionId: "s1", station: 1, text: "hello", status: "listening", message: null, edited: false, updatedAt: "x" });

    expect((await recoverSession(session)).status).toBe("interrupted");
    const [recording] = await listRecordings("s1");
    expect(recording).toMatchObject({ status: "interrupted", sizeBytes: 4 });
    expect((await listTranscripts("s1"))[0]).toMatchObject({ status: "partial", text: "hello" });
  });

  it("deletes a session with all of its data", async () => {
    await saveSession(session);
    await saveRecordingMeta(meta);
    await appendChunk(meta.id, 0, new Blob(["abcd"]));
    await saveTranscript({ id: "s1:1", sessionId: "s1", station: 1, text: "", status: "complete", message: null, edited: false, updatedAt: "x" });
    await deleteSession(session);
    expect(await getSession("s1", "me")).toBeNull();
    expect(await listRecordings("s1")).toEqual([]);
    expect(await listTranscripts("s1")).toEqual([]);
    expect((await getRecordingBlob(meta)).size).toBe(0);
  });
});
