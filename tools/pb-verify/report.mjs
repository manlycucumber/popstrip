// Build report.html: one row per effect — Photo Booth reference | PopStrip
// render | metrics | pass badge — sorted worst-first. Reads scores.json (from
// compare.mjs) and embeds the PNGs from refs/ and out/ as data URIs.
// Usage: node tools/pb-verify/report.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const scores = JSON.parse(readFileSync(join(dir, 'scores.json'), 'utf8'));

const uri = (p) => (existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : '');
const img = (p) => (existsSync(p) ? `<img src="${uri(p)}">` : '<span class="miss">—</span>');

const rank = (s) => ('pass' in s ? (s.pass ? 2 : 0) : 1); // fails first, then no-ref, then pass
const rows = Object.entries(scores)
  .sort((a, b) => rank(a[1]) - rank(b[1]) || (a[1].ssim ?? 1) - (b[1].ssim ?? 1))
  .map(([id, s]) => {
    const badge = 'pass' in s ? (s.pass ? '<b class="ok">PASS</b>' : '<b class="bad">FAIL</b>') : '<b class="warn">NO REF</b>';
    const m = 'pass' in s ? `ssim ${s.ssim} · mae ${s.mae} · edgeIoU ${s.edgeIoU}` : (s.status || '');
    return `<tr><td>${id} ${badge}</td><td>${img(join(dir, 'refs', id + '.png'))}</td><td>${img(join(dir, 'out', 'ours-' + id + '.png'))}</td><td class="m">${m}</td></tr>`;
  })
  .join('\n');

const html = `<!doctype html><meta charset="utf-8"><title>pb-verify report</title>
<style>
 body{font:13px/1.4 system-ui,sans-serif;background:#14101f;color:#eee;padding:20px}
 h1{font-size:16px} table{border-collapse:collapse;width:100%} td{border-bottom:1px solid #333;padding:8px;vertical-align:middle}
 img{width:200px;height:150px;object-fit:cover;background:#000;border:1px solid #333}
 th{ text-align:left;padding:8px;color:#aaa}
 .ok{color:#6f6} .bad{color:#f66} .warn{color:#fc6} .m{font-family:monospace;color:#bbb} .miss{color:#666}
</style>
<h1>PopStrip ⇄ Photo Booth — per-effect accuracy</h1>
<table><tr><th>Effect</th><th>Photo Booth (ref)</th><th>PopStrip (ours)</th><th>Metrics</th></tr>
${rows}
</table>`;

writeFileSync(join(dir, 'report.html'), html);
console.log('pb-verify: wrote report.html');
