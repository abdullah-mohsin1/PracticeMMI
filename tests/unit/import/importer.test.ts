import { describe, expect, it } from "vitest";
import { importDrafts, IMPORT_BATCH_SIZE, questionDocumentId, type ImportDraft, type ImportStore } from "@/lib/questions/import/importer";

const draft = (id: string): ImportDraft => ({
  id,
  key: id,
  category: "ethical",
  questionText: `Question ${id}`,
  followUpQuestions: [],
  originalCategory: null,
});
const drafts = (count: number) => Array.from({ length: count }, (_, index) => draft(`q${index}`));

function fakeStore(failCommits: (call: number) => boolean = () => false) {
  const saved = new Set<string>();
  const batches: number[] = [];
  let call = 0;
  const store: ImportStore = {
    existingIds: async () => new Set(saved),
    commit: async (items) => {
      call += 1;
      if (failCommits(call)) throw new Error("unavailable");
      batches.push(items.length);
      for (const item of items) saved.add(item.id);
    },
  };
  return { store, saved, batches };
}

const options = { sleep: async () => undefined };

describe("questionDocumentId", () => {
  it("is the same for equivalent wording", async () => {
    expect(await questionDocumentId("What's the plan?")).toBe(await questionDocumentId("  what’s THE plan "));
  });

  it("differs for different wording", async () => {
    expect(await questionDocumentId("One")).not.toBe(await questionDocumentId("Two"));
  });
});

describe("importDrafts", () => {
  it("splits work into batches within Firestore's limit", async () => {
    expect(IMPORT_BATCH_SIZE).toBeLessThanOrEqual(500);
    const { store, batches } = fakeStore();
    const result = await importDrafts(store, drafts(IMPORT_BATCH_SIZE * 2 + 1), options);
    expect(batches).toEqual([IMPORT_BATCH_SIZE, IMPORT_BATCH_SIZE, 1]);
    expect(result).toEqual({ saved: IMPORT_BATCH_SIZE * 2 + 1, alreadySaved: 0, failed: [] });
  });

  it("is safely repeatable", async () => {
    const { store, saved, batches } = fakeStore();
    await importDrafts(store, drafts(3), options);
    const second = await importDrafts(store, drafts(3), options);
    expect(second).toEqual({ saved: 0, alreadySaved: 3, failed: [] });
    expect(saved.size).toBe(3);
    expect(batches).toEqual([3]);
  });

  it("removes repeated IDs within one import", async () => {
    const { store, saved } = fakeStore();
    const result = await importDrafts(store, [draft("a"), draft("a")], options);
    expect(result.saved).toBe(1);
    expect(saved.size).toBe(1);
  });

  it("retries a temporary failure", async () => {
    const { store, saved } = fakeStore((call) => call === 1);
    const result = await importDrafts(store, drafts(2), options);
    expect(result).toEqual({ saved: 2, alreadySaved: 0, failed: [] });
    expect(saved.size).toBe(2);
  });

  it("reports what remains after a partial failure, then finishes on retry", async () => {
    const failing = new Set([2, 3, 4]);
    const { store, saved } = fakeStore((call) => failing.has(call));
    const first = await importDrafts(store, drafts(5), { ...options, batchSize: 2 });
    expect(first.saved).toBe(2);
    expect(first.failed.map((item) => item.id)).toEqual(["q2", "q3", "q4"]);
    expect(saved.size).toBe(2);

    const retry = await importDrafts(store, first.failed, { ...options, batchSize: 2 });
    expect(retry).toEqual({ saved: 3, alreadySaved: 0, failed: [] });
    expect(saved.size).toBe(5);
  });

  it("doesn't duplicate a commit that reached the server but appeared to fail", async () => {
    const saved = new Set<string>();
    let calls = 0;
    const store: ImportStore = {
      existingIds: async () => new Set(saved),
      commit: async (items) => {
        calls += 1;
        for (const item of items) saved.add(item.id);
        if (calls === 1) throw new Error("connection lost after write");
      },
    };
    const result = await importDrafts(store, drafts(2), options);
    expect(result).toEqual({ saved: 0, alreadySaved: 2, failed: [] });
    expect(calls).toBe(1);
  });

  it("reports failure when the library can't be checked", async () => {
    const store: ImportStore = {
      existingIds: async () => {
        throw new Error("offline");
      },
      commit: async () => undefined,
    };
    expect((await importDrafts(store, drafts(2), options)).failed).toHaveLength(2);
  });

  it("reports progress", async () => {
    const { store } = fakeStore();
    const seen: number[] = [];
    await importDrafts(store, drafts(3), { ...options, batchSize: 2, onProgress: (done) => seen.push(done) });
    expect(seen).toEqual([2, 3]);
  });
});
