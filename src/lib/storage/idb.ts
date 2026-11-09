// A small promise wrapper over IndexedDB. Blobs live here too: browsers keep
// them on disk, so a long recording does not sit in memory.

const DB_NAME = "practicemmi";
const DB_VERSION = 1;

export type StoreName = "questions" | "sessions" | "recordings" | "chunks" | "transcripts";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("questions", { keyPath: "id" }).createIndex("ownerId", "ownerId");
      db.createObjectStore("sessions", { keyPath: "id" }).createIndex("ownerId", "ownerId");
      db.createObjectStore("recordings", { keyPath: "id" }).createIndex("sessionId", "sessionId");
      db.createObjectStore("chunks", { keyPath: ["recordingId", "seq"] });
      db.createObjectStore("transcripts", { keyPath: "id" }).createIndex("sessionId", "sessionId");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => (opening = null);
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("Could not open browser storage."));
    };
  });
  return opening;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolves only when the transaction has committed, so a resolved write is durable. */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("Storage write aborted.", "AbortError"));
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOne<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  return result<T | undefined>(db.transaction(store).objectStore(store).get(key));
}

export async function getByIndex<T>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
  const db = await open();
  return result<T[]>(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function getRange<T>(store: StoreName, range: IDBKeyRange): Promise<T[]> {
  const db = await open();
  return result<T[]>(db.transaction(store).objectStore(store).getAll(range));
}

export async function put(store: StoreName, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await committed(tx);
}

export async function remove(store: StoreName, key: IDBValidKey | IDBKeyRange): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await committed(tx);
}

/** Forgets the open connection. Only tests need this, after replacing indexedDB. */
export function resetConnectionForTests(): void {
  opening = null;
}
