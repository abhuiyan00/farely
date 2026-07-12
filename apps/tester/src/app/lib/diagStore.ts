// ─── Diagnostics persistence (IndexedDB, zero-dependency) ────────────────────
// One object store keyed by id, ring-buffered to DIAG_CAP so a long-running
// phone never fills storage. Identical in the browser tester and the Android
// WebView. Writes are fire-and-forget and never throw; every write also fires a
// `farely:diag` window event so an open DiagnosticsScreen refreshes live. If
// IndexedDB is unavailable the log degrades to a bounded in-memory buffer.

import { makeDiag, diagToJson, type DiagEvent, type DiagInput } from "./diagnostics";

const DB_NAME = "farely-diag";
const STORE = "events";
export const DIAG_CAP = 2000;
export const DIAG_EVENT = "farely:diag";

let mem: DiagEvent[] = []; // fallback when IndexedDB is unavailable
let dbp: Promise<IDBDatabase | null> | null = null;

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      if (!idb) return resolve(null);
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("ts", "ts");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function store(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Delete oldest rows (by ts) until at most DIAG_CAP remain. */
async function trim(db: IDBDatabase) {
  const os = store(db, "readwrite");
  const count = await reqP<number>(os.count());
  if (count <= DIAG_CAP) return;
  let toDelete = count - DIAG_CAP;
  await new Promise<void>((resolve) => {
    const cur = os.index("ts").openCursor(); // ascending → oldest first
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c || toDelete <= 0) return resolve();
      c.delete();
      toDelete--;
      c.continue();
    };
    cur.onerror = () => resolve();
  });
}

export async function putDiag(e: DiagEvent): Promise<void> {
  const db = await openDb();
  if (!db) {
    mem = [e, ...mem].slice(0, DIAG_CAP);
    return;
  }
  try {
    await reqP(store(db, "readwrite").put(e));
    await trim(db);
  } catch {
    /* swallow — logging must never break the app */
  }
}

export async function allDiag(): Promise<DiagEvent[]> {
  const db = await openDb();
  if (!db) return [...mem];
  try {
    const all = await reqP<DiagEvent[]>(store(db, "readonly").getAll());
    return all.sort((a, b) => b.ts - a.ts); // newest first
  } catch {
    return [...mem];
  }
}

export async function countDiag(): Promise<number> {
  const db = await openDb();
  if (!db) return mem.length;
  try {
    return await reqP<number>(store(db, "readonly").count());
  } catch {
    return mem.length;
  }
}

export async function unresolvedCount(): Promise<number> {
  return (await allDiag()).filter((e) => !e.resolved).length;
}

export async function setResolved(id: string, resolved: boolean): Promise<void> {
  const db = await openDb();
  if (!db) {
    mem = mem.map((e) => (e.id === id ? { ...e, resolved } : e));
    return;
  }
  try {
    const os = store(db, "readwrite");
    const e = await reqP<DiagEvent | undefined>(os.get(id));
    if (e) await reqP(os.put({ ...e, resolved }));
  } catch {
    /* ignore */
  }
}

export async function clearDiag(): Promise<void> {
  const db = await openDb();
  mem = [];
  if (!db) return;
  try {
    await reqP(store(db, "readwrite").clear());
  } catch {
    /* ignore */
  }
}

/**
 * The single entry point the whole app calls. Fire-and-forget, never throws.
 * Returns the built event so callers can also surface it (e.g. a notice).
 */
export function logDiag(input: DiagInput): DiagEvent {
  const e = makeDiag(input);
  putDiag(e).catch(() => {});
  try {
    window.dispatchEvent(new CustomEvent(DIAG_EVENT, { detail: e }));
  } catch {
    /* non-DOM environment */
  }
  return e;
}

/** Browser export: hand the whole DB to the OS as a JSON download. */
export function downloadDiag(events: DiagEvent[]) {
  try {
    const blob = new Blob([diagToJson(events)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `farely-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    /* ignore */
  }
}
