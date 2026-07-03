// GIF / boomerang encoder — runs OFF the main thread.
//
// gifenc is imported *here* (never on the main thread) so it lands in this
// worker's own chunk and stays out of the base bundle. App posts the sampled
// RGBA frames in; we quantize to a single 256-colour palette, index every frame
// against it, and write an animated GIF, then transfer the bytes back.

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

type EncodeRequest = {
  width: number;
  height: number;
  /** Per-frame delay in ms (gifenc rounds delay/10 to whole centiseconds). */
  delay: number;
  /** Ping-pong: play forward then back. */
  boomerang: boolean;
  frames: Uint8ClampedArray[];
};

// DOM lib types (MessageEvent/Transferable) are available; the WebWorker lib is
// not, so reach the worker globals through a narrow cast rather than pulling in
// a second lib that would clash with DOM's `self`/`postMessage`.
const post = (buffer: ArrayBuffer): void =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage({ buffer }, [buffer]);

function encode(req: EncodeRequest): ArrayBuffer {
  const { width, height, delay, boomerang, frames } = req;
  if (!frames.length) return new Uint8Array().buffer;

  // One global palette from a representative middle frame — consistent colours
  // across the whole clip, and far cheaper than quantizing every frame.
  const mid = frames[Math.floor(frames.length / 2)] ?? frames[0];
  const palette = quantize(mid, 256);

  // Forward, then the middle run reversed (endpoints dropped so the turnarounds
  // don't show a stuttered double frame).
  const seq = boomerang ? frames.concat(frames.slice(1, -1).reverse()) : frames;

  const gif = GIFEncoder();
  seq.forEach((frame, i) => {
    const indexed = applyPalette(frame, palette);
    // Palette on the first frame only → later frames reuse the global colour
    // table instead of writing a redundant local one each time.
    gif.writeFrame(indexed, width, height, i === 0 ? { palette, delay } : { delay });
  });
  gif.finish();

  return gif.bytesView().slice().buffer; // own copy so its buffer can transfer
}

(self as unknown as { onmessage: ((e: MessageEvent<EncodeRequest>) => void) | null }).onmessage = (e) => {
  post(encode(e.data));
};
