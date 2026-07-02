// Grab the current video frame into a PNG blob. Mirroring is baked in here so
// the saved photo matches the mirrored preview the user was looking at.

export type Shot = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

export async function captureFrame(video: HTMLVideoElement, mirror: boolean): Promise<Shot> {
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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo.'))), 'image/png');
  });

  return { blob, url: URL.createObjectURL(blob), width, height };
}

export function timestampName(ext = 'png'): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `popstrip-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}.${ext}`;
}
