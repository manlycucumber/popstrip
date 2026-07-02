// Feature detection — decides what the app can do in this browser, so we can
// degrade gracefully instead of throwing. See the reliability table in ROADMAP.md.

export type Support = {
  secureContext: boolean;
  getUserMedia: boolean;
  fileSystemAccess: boolean;
  webShareFiles: boolean;
  clipboardImage: boolean;
};

export function detectSupport(): Support {
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  return {
    secureContext: window.isSecureContext,
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    fileSystemAccess: 'showDirectoryPicker' in window,
    webShareFiles: typeof nav.canShare === 'function',
    clipboardImage:
      !!(navigator.clipboard && 'write' in navigator.clipboard) && 'ClipboardItem' in window,
  };
}
