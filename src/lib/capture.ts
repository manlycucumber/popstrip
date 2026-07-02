// Grabbing frames off the live camera. Mirroring is baked in here so a captured
// frame matches the mirrored preview the user was looking at. Frames are kept as
// canvases so a burst of them can be composed into a layout (see strip.ts).

export type Layout = 'single' | 'quad' | 'strip';

export type Shot = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  kind: Layout;
  createdAt: number;
};

/** Draw the current video frame (mirrored to match the preview) into a canvas. */
export function grabFrame(video: HTMLVideoElement, mirror: boolean): HTMLCanvasElement {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('The camera is not ready yet — give it a second and try again.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create a drawing canvas.');

  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

export function timestampName(ext = 'png'): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `popstrip-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}.${ext}`;
}
