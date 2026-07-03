// Register the service worker for installable + offline use. Production only —
// a service worker in dev would cache aggressively and fight Vite's HMR.

export function registerSW(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a nicety, not required — ignore failures */
    });
  });
}
