// Getting a photo off the device without a server: the native share sheet
// (Web Share API with files) and copy-to-clipboard. Both are capability-gated.

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError');
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

export function canShareFile(blob: Blob, filename: string): boolean {
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  if (typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [new File([blob], filename, { type: blob.type })] });
  } catch {
    return false;
  }
}

export async function shareFile(blob: Blob, filename: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  if (typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: 'PopStrip', text: 'Made with PopStrip 📸' });
    return 'shared';
  } catch (e) {
    if (isAbort(e)) return 'cancelled';
    throw e;
  }
}

export function canCopyImage(): boolean {
  return !!(navigator.clipboard && 'write' in navigator.clipboard) && 'ClipboardItem' in window;
}

export async function copyImage(blob: Blob): Promise<boolean> {
  if (!canCopyImage()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}
