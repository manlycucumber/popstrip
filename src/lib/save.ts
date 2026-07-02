// Saving a photo. On Chromium we use the File System Access API to write into a
// real folder the user picks once and we remember (via IndexedDB). Everywhere
// else we fall back to a plain browser download. Nothing is ever uploaded.

const DB_NAME = 'popstrip';
const STORE = 'handles';
const HANDLE_KEY = 'saveDir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function canUseFolder(): boolean {
  return 'showDirectoryPicker' in window;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  if ((await handle.requestPermission?.(opts)) === 'granted') return true;
  return false;
}

export type SaveResult = 'saved' | 'cancelled';

/** Save into the remembered folder, prompting for one the first time. */
export async function saveToFolder(blob: Blob, filename: string): Promise<SaveResult> {
  let handle = (await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null;
  if (handle && !(await ensurePermission(handle))) handle = null;

  if (!handle) {
    try {
      handle = await window.showDirectoryPicker!({ id: 'popstrip', mode: 'readwrite', startIn: 'pictures' });
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      throw e;
    }
    await idbSet(HANDLE_KEY, handle);
  }

  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return 'saved';
}

/** Universal fallback — triggers a normal download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Forget the remembered folder (used by a future "change folder" control). */
export async function forgetFolder(): Promise<void> {
  try {
    await idbSet(HANDLE_KEY, undefined);
  } catch {
    /* ignore */
  }
}
