// Copy the MediaPipe vision WASM runtime out of node_modules into public/, so
// it's self-hosted (no CDN) and served from our own origin alongside the app —
// keeping the nothing-uploaded / works-offline promise intact.
//
// Runs as a prebuild/predev hook. The .wasm is ~11 MB and deliberately kept out
// of git (see .gitignore); the browser fetches it lazily only the first time
// green-screen is used, and the service worker caches it after that.
import { copyFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const outDir = join(root, 'public', 'mediapipe', 'wasm');

// SIMD build only — every browser PopStrip targets supports WASM SIMD in 2026;
// shipping the nosimd fallback would roughly double the payload for a
// vanishingly rare client (which instead gets a graceful "background
// unavailable" fallback in segment.ts).
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

await mkdir(outDir, { recursive: true });
for (const f of files) {
  const from = join(srcDir, f);
  try {
    await access(from);
  } catch {
    console.error(`[copy-mediapipe-wasm] missing ${from} — run \`npm install\` first (@mediapipe/tasks-vision).`);
    process.exit(1);
  }
  await copyFile(from, join(outDir, f));
}
console.log(`[copy-mediapipe-wasm] ${files.length} file(s) → public/mediapipe/wasm/`);
