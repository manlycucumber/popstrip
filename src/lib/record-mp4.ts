// The mp4 recorder backend: real H.264/AAC mp4 muxed in the browser via
// Mediabunny (WebCodecs). This exists so Chrome/Firefox — which MediaRecorder
// only gives webm — produce an mp4 that imports straight into iOS Photos and
// carries precise duration metadata (MediaRecorder's mp4 does not).
//
// This module is dynamically imported by `createRecorder()` in record.ts, and
// ONLY when the browser can actually encode H.264 — so Mediabunny lands in its
// own lazy chunk and never bloats the base bundle (exactly like pixi). It
// imports the RecorderBackend contract as a type only, for the same reason.

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  MediaStreamVideoTrackSource,
  MediaStreamAudioTrackSource,
  canEncodeAudio,
} from 'mediabunny';
import type { RecorderBackend } from './record';

export class Mp4Backend implements RecorderBackend {
  private output: Output | null = null;
  private target: BufferTarget | null = null;
  private active = false;

  get recording(): boolean {
    return this.active;
  }

  async start(videoTrack: MediaStreamTrack, audioTracks: MediaStreamTrack[]): Promise<void> {
    const target = new BufferTarget();
    // fastStart:'in-memory' writes the moov box at the front → the file is
    // immediately seekable and imports cleanly, at the cost of buffering in RAM
    // (fine for our 30s / ~18MB cap).
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });

    // The tracks come from captureStream()/getUserMedia typed as the generic
    // MediaStreamTrack; they are genuinely video/audio, so narrow for Mediabunny.
    const videoSource = new MediaStreamVideoTrackSource(videoTrack as MediaStreamVideoTrack, {
      codec: 'avc',
      bitrate: 5_000_000,
    });
    output.addVideoTrack(videoSource, { frameRate: 30 });
    // Read + swallow errorPromise to silence Mediabunny's "don't ignore
    // errorPromise" warning and avoid an unhandled rejection. We deliberately
    // DON'T abort here — a transient source hiccup shouldn't kill the clip; a
    // genuine encoder error still surfaces at stop()/finalize(), which App
    // tolerates (keeps whatever was captured).
    void videoSource.errorPromise.catch(() => {});

    // Add the mic only if the browser can encode AAC; otherwise a valid
    // video-only mp4 (mirrors the mic-denied path, where audioTracks is empty).
    const mic = audioTracks[0];
    if (mic && (await canEncodeAudio('aac'))) {
      const audioSource = new MediaStreamAudioTrackSource(mic as MediaStreamAudioTrack, {
        codec: 'aac',
        bitrate: 128_000,
      });
      output.addAudioTrack(audioSource);
      void audioSource.errorPromise.catch(() => {});
    }

    // Assign BEFORE start() so that if start() rejects after an encoder/worker is
    // already live (e.g. a source's async startup fails), abort() can still reach
    // and release it. start() pulls from the live tracks until finalize()/cancel(),
    // so the caller MUST NOT stop the tracks until stop() has resolved.
    this.output = output;
    this.target = target;
    try {
      await output.start();
    } catch (e) {
      await this.abort(); // releases the half-started output; idempotent
      throw e;
    }
    this.active = true;
  }

  async stop(): Promise<Blob> {
    const output = this.output;
    const target = this.target;
    if (!output || !target) throw new Error('Not recording.');
    this.active = false;
    await output.finalize(); // drains the live tracks; must run before they're stopped
    const buffer = target.buffer;
    this.output = null;
    this.target = null;
    if (!buffer) throw new Error('Recording produced no data.');
    return new Blob([buffer], { type: 'video/mp4' });
  }

  async abort(): Promise<void> {
    const output = this.output;
    this.output = null;
    this.target = null;
    this.active = false;
    if (output) {
      try {
        await output.cancel();
      } catch {
        /* already torn down */
      }
    }
  }
}
