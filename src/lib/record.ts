// Movie-clip recording: turn the movie-mode effects canvas into a downloadable
// video, entirely on-device. `MediaRecorder` on the canvas's captureStream is
// all we need for this slice — Safari writes mp4/H.264 natively, Chrome/Firefox
// write webm/VP9 — so there's nothing extra to download (WebCodecs + mp4-muxer
// for mp4-everywhere and GIF/boomerang come later).
//
// Everything here is capability-gated and cleans up after itself: the mic track
// is stopped the instant a recording ends (never held open between clips), and
// the final chunk is flushed in the recorder's own `stop` event before the Blob
// resolves, so a clip is never clipped short.

/** Longest a single clip can run before it auto-stops (memory + sanity guard). */
export const MAX_CLIP_MS = 30_000;

/**
 * What a recording backend must do: consume the live canvas-capture video track
 * (+ optional mic tracks) and hand back a finished clip as a Blob. Two
 * implementations — `ClipRecorder` (MediaRecorder, the universal fallback) and
 * the lazily-loaded `Mp4Backend` (Mediabunny/WebCodecs, real mp4 everywhere) —
 * are interchangeable behind this, so App doesn't care which one it got.
 */
export interface RecorderBackend {
  /** Begin muxing. May be async (the mp4 backend awaits its encoder). */
  start(videoTrack: MediaStreamTrack, audioTracks: MediaStreamTrack[]): void | Promise<void>;
  /** Resolve the finished clip — MUST finalize/flush before resolving. */
  stop(): Promise<Blob>;
  readonly recording: boolean;
  /** Optional fast discard that skips finalizing; absent → caller falls back to stop(). */
  abort?(): void | Promise<void>;
}

// Preferred first: baseline H.264 + AAC in mp4 is the most shareable (imports
// straight into iOS Photos) and is what Safari records natively. Fall back to
// webm (Chrome/Firefox). We take the first the platform actually supports and
// then trust the recorder's *actual* mimeType for the file extension.
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** Can this browser record a canvas at all? Gates whether Movie mode is offered. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  );
}

/** The best container/codec this browser supports, or '' to let the UA choose. */
export function pickVideoMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/** File extension for a recorded blob's mime type. */
export function extForMime(mime: string): 'mp4' | 'webm' {
  return /mp4|mpeg|quicktime|m4v/i.test(mime) ? 'mp4' : 'webm';
}

/**
 * A thin, correctness-focused wrapper around MediaRecorder.
 *
 * - Builds ONE explicit MediaStream from the given tracks (more predictable
 *   across engines than mutating a live captureStream after the fact).
 * - Records into a single blob (no timeslice — a 30s clip at ~5 Mbps is ~18 MB,
 *   so there's no reason to chunk and every reason not to add edge cases).
 * - `stop()` resolves in the recorder's `stop` event, AFTER the final
 *   `dataavailable`, so the tail is never lost.
 */
export class ClipRecorder implements RecorderBackend {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private resolveStop: ((b: Blob) => void) | null = null;
  private rejectStop: ((e: unknown) => void) | null = null;

  /** 'inactive' | 'recording' | 'paused'. */
  get state(): string {
    return this.rec ? this.rec.state : 'inactive';
  }

  get recording(): boolean {
    return this.rec?.state === 'recording';
  }

  /** Start recording the video track (+ any mic tracks). Throws if unsupported. */
  start(videoTrack: MediaStreamTrack, audioTracks: MediaStreamTrack[] = []): void {
    const mime = pickVideoMime();
    const stream = new MediaStream([videoTrack, ...audioTracks]);
    const opts: MediaRecorderOptions = { videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 };
    if (mime) opts.mimeType = mime;

    const rec = new MediaRecorder(stream, opts);
    this.chunks = [];
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      this.resolveStop?.(new Blob(this.chunks, { type }));
      this.resolveStop = this.rejectStop = null;
      this.chunks = [];
    };
    rec.onerror = (e: Event) => {
      const err = (e as unknown as { error?: unknown }).error ?? new Error('Recording failed.');
      this.rejectStop?.(err);
      this.resolveStop = this.rejectStop = null;
    };
    rec.start(); // no timeslice → one dataavailable at stop
    this.rec = rec;
  }

  /** Stop and resolve the finished clip as a Blob (final chunk flushed). */
  stop(): Promise<Blob> {
    const rec = this.rec;
    if (!rec || rec.state === 'inactive') return Promise.reject(new Error('Not recording.'));
    return new Promise<Blob>((resolve, reject) => {
      this.resolveStop = resolve;
      this.rejectStop = reject;
      try {
        rec.stop();
      } catch (e) {
        this.resolveStop = this.rejectStop = null;
        reject(e);
      }
    });
  }
}

/**
 * Whether the Mediabunny mp4 backend is worth using. Only where MediaRecorder
 * CAN'T already give mp4 (i.e. it chose webm — Chrome/Firefox desktop) AND the
 * browser can actually encode H.264. Safari already records native mp4, so it
 * keeps the simpler MediaRecorder path; Firefox-Android / no-WebCodecs keep webm.
 * This cheap check uses raw WebCodecs (no Mediabunny), so the mp4 chunk is only
 * fetched when it will actually be used.
 */
export async function canUseMp4Backend(): Promise<boolean> {
  if (pickVideoMime().includes('mp4')) return false; // MediaRecorder already does mp4 here
  if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42E01E', // H.264 constrained baseline — maximally compatible
      width: 960,
      height: 720,
      framerate: 30,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

/** Pick the best recording backend for this browser. mp4 where possible, else MediaRecorder. */
export async function createRecorder(): Promise<RecorderBackend> {
  if (await canUseMp4Backend()) {
    try {
      const { Mp4Backend } = await import('./record-mp4'); // lazy chunk (Mediabunny)
      return new Mp4Backend();
    } catch {
      /* mp4 chunk failed to load → fall through to the universal fallback */
    }
  }
  return new ClipRecorder();
}

// The mic is a per-session singleton, acquired only when a recording actually
// starts and stopped the moment it ends — so the mic indicator never lingers
// for a "100% on-device" app that has no reason to hold it.
let micStream: MediaStream | null = null;

/** Acquire the microphone for the next clip. Resolves with its audio track(s). */
export async function acquireMic(): Promise<MediaStreamTrack[]> {
  stopMic();
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return micStream.getAudioTracks();
}

/** Release the microphone. Idempotent; safe to call from any teardown path. */
export function stopMic(): void {
  if (micStream) {
    for (const t of micStream.getTracks()) t.stop();
    micStream = null;
  }
}
