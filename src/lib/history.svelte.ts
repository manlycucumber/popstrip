// The photo reel — recent captures kept on-device in IndexedDB and shown along
// the bottom of the booth. Reactive (`reel.items`) so the tray updates live.
// History is capped; the oldest entries are evicted (and their blob URLs
// revoked) so a long session doesn't grow without bound.

import type { Layout, Shot } from './capture';

const DB_NAME = 'popstrip-reel';
const STORE = 'captures';
const CAP = 24;

type Row = {
  id?: number;
  blob: Blob;
  thumb: Blob;
  kind: Layout;
  w: number;
  h: number;
  media?: 'photo' | 'video'; // absent on rows written before v1.2.0 → photo
  createdAt: number;
};

export type ReelEntry = {
  id: number;
  url: string;
  thumbUrl: string;
  blob: Blob;
  kind: Layout;
  w: number;
  h: number;
  media: 'photo' | 'video';
  createdAt: number;
};

export const reel = $state<{ items: ReelEntry[]; ready: boolean }>({ items: [], ready: false });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function toEntry(row: Row & { id: number }): ReelEntry {
  return {
    id: row.id,
    url: URL.createObjectURL(row.blob),
    thumbUrl: URL.createObjectURL(row.thumb),
    blob: row.blob,
    kind: row.kind,
    w: row.w,
    h: row.h,
    media: row.media ?? 'photo',
    createdAt: row.createdAt,
  };
}

const THUMB_W = 220;

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumb'))), 'image/jpeg', 0.82);
  });
}

async function makeImageThumb(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const th = Math.max(1, Math.round((THUMB_W * bmp.height) / bmp.width));
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(bmp, 0, 0, THUMB_W, th);
  bmp.close?.();
  return canvasToJpeg(canvas);
}

// A poster frame off a video blob: createImageBitmap throws on video, so seek a
// detached <video> to just past the start (frame 0 may be undecoded) and grab
// it. A timeout guarantees we never hang the reel if `seeked` never fires; the
// element is torn down either way so no decoder lingers.
async function makeVideoThumb(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'metadata';
  v.src = url;
  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      v.addEventListener('loadeddata', () => {
        try {
          v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
        } catch {
          finish();
        }
      });
      v.addEventListener('seeked', finish);
      v.addEventListener('error', finish);
      setTimeout(finish, 1500);
    });
    const vw = v.videoWidth || 4;
    const vh = v.videoHeight || 3;
    const th = Math.max(1, Math.round((THUMB_W * vh) / vw));
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (ctx && v.videoWidth) {
      ctx.drawImage(v, 0, 0, THUMB_W, th);
    } else if (ctx) {
      ctx.fillStyle = '#1a1626';
      ctx.fillRect(0, 0, THUMB_W, th);
    }
    return await canvasToJpeg(canvas);
  } finally {
    v.src = '';
    v.load();
    URL.revokeObjectURL(url);
  }
}

function makeThumb(blob: Blob, media: 'photo' | 'video'): Promise<Blob> {
  return media === 'video' ? makeVideoThumb(blob) : makeImageThumb(blob);
}

/** Hydrate the reel from IndexedDB (newest first). Safe to call once on load. */
export async function loadReel(): Promise<void> {
  try {
    const db = await openDb();
    const rows = await new Promise<Array<Row & { id: number }>>((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result as Array<Row & { id: number }>);
      r.onerror = () => reject(r.error);
    });
    db.close();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    reel.items = rows.slice(0, CAP).map(toEntry);
  } catch {
    /* history is a nicety — never block the booth on it */
  } finally {
    reel.ready = true;
  }
}

/** Store a fresh capture and prepend it to the reel, evicting the oldest. */
export async function addCapture(shot: Shot): Promise<void> {
  try {
    const thumb = await makeThumb(shot.blob, shot.media);
    const row: Row = {
      blob: shot.blob,
      thumb,
      kind: shot.kind,
      w: shot.width,
      h: shot.height,
      media: shot.media,
      createdAt: shot.createdAt,
    };
    const db = await openDb();
    const id = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).add(row);
      req.onsuccess = () => resolve(req.result as number);
      tx.onerror = () => reject(tx.error);
    });

    reel.items = [toEntry({ ...row, id }), ...reel.items];

    while (reel.items.length > CAP) {
      const old = reel.items.pop();
      if (!old) break;
      URL.revokeObjectURL(old.url);
      URL.revokeObjectURL(old.thumbUrl);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(old.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    /* non-fatal: the photo is still on screen and savable */
  }
}

/** Remove one capture from the reel and disk. */
export async function removeCapture(id: number): Promise<void> {
  const idx = reel.items.findIndex((it) => it.id === id);
  if (idx === -1) return;
  const [gone] = reel.items.splice(idx, 1);
  reel.items = [...reel.items];
  URL.revokeObjectURL(gone.url);
  URL.revokeObjectURL(gone.thumbUrl);
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
}
