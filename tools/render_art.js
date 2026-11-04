// Check and preview the GFD exercise illustrations (src/js/gfd-exercise-art.js) without opening the app.
//
// Usage:  node tools/render_art.js [ids...] [--day mon] [--all] [--check] [--out art-preview]
//   ids      exercise ids from GFDArt.EX (default: --all)
//   --day    every exercise in one day of DAYS (mon..fri)
//   --check  only validate; write nothing. Exit code 1 when anything fails.
//   --out    folder for the preview (default art-preview/, git-ignored)
//
// For each exercise it checks the entry (name, two frame captions, known muscles), renders the start, middle and
// end of the rep in both themes and every view the app uses, and flags SVG with NaN/undefined/Infinity in it.
// The preview is one index.html contact sheet: open it once and review the whole batch in one look,
// instead of screenshotting exercises one at a time in the app.
const fs = require('fs'), path = require('path');
const GFDArt = require('../src/js/gfd-exercise-art.js');
const { EX, DAYS, MUSCLES, THEMES } = GFDArt;

const args = process.argv.slice(2), flag = k => args.includes(k), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = opt('--out') || 'art-preview', day = opt('--day');
let ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--day'].includes(args[i - 1]));
if (day) { const d = DAYS.find(x => x.id === day); if (!d) { console.error('unknown day ' + day + ' (' + DAYS.map(x => x.id).join(', ') + ')'); process.exit(2); } ids = ids.concat(d.ex); }
if (!ids.length || flag('--all')) ids = Object.keys(EX);

const STEPS = [0, .5, 1], bad = /NaN|undefined|Infinity/;
const rows = [];
let failed = 0;
for (const id of ids) {
  const ex = EX[id], issues = [];
  if (!ex) { console.log('FAIL ' + id + ': not in GFDArt.EX'); failed++; continue; }
  if (typeof ex.name !== 'string' || !ex.name) issues.push('no name');
  if (!Array.isArray(ex.frames) || ex.frames.length !== 2) issues.push('frames must be [start caption, end caption]');
  const ms = [...((ex.muscles || {}).primary || []), ...((ex.muscles || {}).secondary || [])];
  if (!((ex.muscles || {}).primary || []).length) issues.push('no primary muscles');
  ms.filter(m => !MUSCLES[m]).forEach(m => issues.push('unknown muscle ' + m));
  const views = [...new Set(['main', ...GFDArt.framesOf(id).map(f => f.view)])];
  const cells = [], renderIssues = {}; // message -> renders it happened in (theme/view/t)
  const t0 = Date.now();
  for (const theme of Object.keys(THEMES)) for (const view of views) for (const t of STEPS) {
    const at = `${theme}/${view}/t=${t}`, note = m => (renderIssues[m] = renderIssues[m] || []).push(at);
    let svg = '';
    try { svg = GFDArt.render(id, theme, t, { view, cues: true }); } catch (e) { note('threw: ' + e.message); continue; }
    if (bad.test(svg)) note(svg.match(bad)[0] + ' in the SVG');
    cells.push({ theme, view, t, svg });
  }
  const total = Object.keys(THEMES).length * views.length * STEPS.length;
  for (const [m, at] of Object.entries(renderIssues)) issues.push(`${m} (${at.length} of ${total} renders, first ${at[0]})`);
  const ms_ = Date.now() - t0, uniq = [...new Set(issues)];
  if (uniq.length) failed++;
  console.log((uniq.length ? 'FAIL ' : 'ok   ') + id.padEnd(14) + ex.name + (uniq.length ? '\n       ' + uniq.join('\n       ') : '') + (ms_ > 1500 ? `  (slow: ${ms_} ms)` : ''));
  rows.push({ id, ex, views, cells, issues: uniq });
}

if (!flag('--check')) {
  const dir = path.resolve(out);
  fs.mkdirSync(dir, { recursive: true });
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = `<!doctype html><meta charset="utf-8"><title>GFD art preview</title><style>
    body{font:14px system-ui,sans-serif;margin:16px;background:#888}h2{margin:24px 0 4px;font-size:15px}p{margin:0 0 6px}
    .row{display:flex;flex-wrap:wrap;gap:6px}.c{width:200px}.c img{width:200px;display:block;border-radius:6px}.c span{font-size:11px}
    .fail{color:#600;font-weight:600}</style><h1>${rows.length} exercises</h1>`;
  for (const r of rows) {
    html += `<h2>${esc(r.ex.name)} <small>(${r.id})</small></h2><p>${esc(r.ex.frames.join(' → '))}</p>`;
    if (r.issues.length) html += `<p class="fail">${r.issues.map(esc).join('<br>')}</p>`;
    html += '<div class="row">';
    for (const c of r.cells) {
      const f = `${r.id}-${c.theme}-${c.view}-${c.t * 100}.svg`;
      fs.writeFileSync(path.join(dir, f), c.svg);
      html += `<div class="c"><img src="${f}" alt=""><span>${c.theme} · ${c.view} · t=${c.t}</span></div>`;
    }
    html += '</div>';
  }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log('\npreview: ' + path.join(dir, 'index.html'));
}
console.log(`${ids.length - failed}/${ids.length} ok`);
process.exit(failed ? 1 : 0);
