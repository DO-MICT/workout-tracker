// GFD exercise illustrations for the default 5-day split, built on the decided reference
// (../gfd-exercise-art.js): one posable, genderless, realistically proportioned figure (1 head = 38 units)
// in the "ghost glow" style, Level 1 detail (fingers and toes, no ears, no face), solid body.
//
// render(exerciseId, theme, t, { view: 'main'|'side'|'front'|'back'|'top', cues, simple, transparent }) -> SVG string
//   t: 0 = the position you set up in, 1 = the other end of the rep.
//   view 'main' is the exercise's teaching view (side for most, front or back where the arms move out to the side).
//
// Solid body: each body layer (far limbs, body, near arm, each arm in the projected views) is one fill colour with
// only its outer outline. There are no seams between body parts; an arm in front of the body keeps its own outline
// so it can still be read.
(function (root) {
  const THEMES = {
    light: { key: 'light', bg: '#F3F2EC', line: '#0D0F12', ink: '#0D0F12', volt: '#D4FF3A', tint: '#CFD0C8', cue: '#4A5A00',
      body: '#E9E8E0', far: '#DEDDD4', bodyOp: .45, farOp: .3, glow: '#A8D400', fib: '#6F8C0A', secLine: '#7F9E08', secFill: .42, grad: ['#F4FFB0', '#D4FF3A', '#A9CF12'] },
    dark: { key: 'dark', bg: '#0D0F12', line: '#F3F2EC', ink: '#0D0F12', volt: '#D4FF3A', tint: '#4A4F57', cue: '#D4FF3A',
      body: '#1C2026', far: '#15181D', bodyOp: .5, farOp: .3, glow: '#D4FF3A', fib: '#5E7300', secLine: '#D4FF3A', secFill: .2, grad: ['#F4FFB0', '#D4FF3A', '#86A80C'] }
  };

  // ---------- vector helpers ----------
  const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map(v => v * k);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = a => Math.hypot(...a), norm = a => mul(a, 1 / (len(a) || 1));
  const lerp = (a, b, s) => a + (b - a) * s, deg = a => a * Math.PI / 180, dir = a => [Math.cos(deg(a)), Math.sin(deg(a))];
  const lerp2 = (a, b, s) => a.map((v, i) => lerp(v, b[i], s)), angOf = v => Math.atan2(v[1], v[0]) * 180 / Math.PI;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const f = n => Math.round(n * 10) / 10, pts = a => a.map(p => f(p[0]) + ',' + f(p[1])).join(' ');
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  function smooth(a) {
    let d = 'M' + pts([mid(a[a.length - 1], a[0])]);
    for (let i = 0; i < a.length; i++) d += 'Q' + pts([a[i]]) + ' ' + pts([mid(a[i], a[(i + 1) % a.length])]);
    return d + 'Z';
  }
  const polyD = a => 'M' + pts(a).replace(/ /g, 'L') + 'Z';
  function hull(P) { // monotone chain
    const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const ellipse = (c, rx, ry, rot = 0, n = 16) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a); o.push([c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)]); } return o; };
  function prof(tab, s) {
    for (let i = 1; i < tab.length; i++) if (s <= tab[i][0]) { const k = (s - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return [lerp(tab[i - 1][1], tab[i][1], k), lerp(tab[i - 1][2], tab[i][2], k)]; }
    return tab[tab.length - 1].slice(1);
  }
  // tapered limb outline A->B; profile rows [s, rLeft, rRight] (left = +p side, p = u rotated +90deg)
  function limb(A, B, tab, s0 = 0, s1 = 1, k = 1) {
    const D = sub(B, A), L = len(D);
    if (L < 2) { const r = prof(tab, (s0 + s1) / 2); return ellipse(A, (r[0] + r[1]) / 2 * k, (r[0] + r[1]) / 2 * k); }
    const u = mul(D, 1 / L), p = [-u[1], u[0]];
    const at = (s, side) => { const r = prof(tab, s), rr = (side > 0 ? r[0] : r[1]) * k; return add(add(A, mul(u, L * s)), mul(p, rr * side)); };
    const lft = [], rgt = [], N = 10;
    for (let i = 0; i <= N; i++) { const s = lerp(s0, s1, i / N); lft.push(at(s, 1)); rgt.push(at(s, -1)); }
    const th = Math.atan2(p[1], p[0]);
    const cap = (s, sgn) => { const c = add(A, mul(u, L * s)), r = prof(tab, s), rr = (r[0] + r[1]) / 2 * k, o = []; for (let j = 1; j < 4; j++) { const a = th + sgn * j * Math.PI / 4; o.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]); } return o; };
    return [...lft, ...(s1 === 1 ? cap(1, -1) : []), ...rgt.reverse(), ...(s0 === 0 ? cap(0, 1).reverse() : [])];
  }
  const half = (rows, side) => rows.map(([s, r]) => side === 'p' ? [s, r, -1] : [s, -1, r]);

  // ---------- body templates (authored in the bench pose: hip (234,166), shoulder (150,160)) ----------
  const H0 = [234, 166], S0 = [150, 160], U0 = norm(sub(S0, H0)), V0 = [-U0[1], U0[0]];
  const toL = p => [dot(sub(p, H0), U0), dot(sub(p, H0), V0)];
  const TORSO = [[136, 178], [132, 166], [134, 156], [141, 150], [152, 144], [164, 139], [175, 137], [186, 139], [194, 144], [201, 149], [214, 152], [228, 153], [240, 156], [248, 163], [249, 172], [243, 179], [230, 181], [214, 178], [196, 176], [176, 178], [156, 180]].map(toL);
  const PELVIS = [[219, 152], [234, 153], [246, 158], [251, 167], [249, 176], [241, 181], [226, 182], [216, 180], [215, 166]].map(toL);
  const HEAD = [[100, 172], [96, 163], [97, 153], [102, 147], [110, 145], [114, 144], [117, 141], [119, 140.5], [121, 143], [123, 146], [127, 147], [130, 150], [131, 156], [128, 163], [126, 172], [118, 178], [108, 178]].map(toL);
  const NECK_A = toL([126, 158]), NECK_B = toL([142, 160]);
  const PEC = [[146, 146], [158, 140], [172, 137], [186, 139], [195, 146], [193, 154], [182, 160], [166, 161], [154, 159]].map(toL);
  const ABS = [[196, 146], [205, 149], [216, 151], [230, 152], [240, 155], [238, 160], [226, 158], [214, 157], [202, 155], [195, 152]].map(toL);
  const OBLQ = [[200, 155], [214, 158], [230, 160], [243, 163], [245, 170], [232, 170], [214, 168], [200, 163]].map(toL);
  const GLUTE = [[222, 171], [238, 168], [250, 166], [251, 175], [244, 182], [228, 183], [217, 180]].map(toL);
  const ERECT = [[160, 177], [190, 174], [214, 176], [232, 178], [232, 172], [212, 170], [190, 169], [160, 171]].map(toL);
  const FOOT = [[-10, 10], [-12, 3], [-8, -4], [2, -6], [11, -3], [22, 1], [32, 5], [38, 9], [37, 13], [26, 13], [14, 10.5], [2, 13]];

  const UPPER = [[0, 12, 11], [.18, 11, 10.5], [.5, 9.5, 9], [.85, 7.5, 7], [1, 7, 6.5]];
  const FORE = [[0, 7, 7], [.25, 8.5, 7.5], [.6, 6.5, 6], [1, 4.8, 4.5]];
  const THIGH = [[0, 17, 15], [.35, 15, 15.5], [.75, 11.5, 11], [1, 9, 9]];
  const SHIN = [[0, 8.5, 8.5], [.28, 12, 8], [.6, 8.5, 6.5], [1, 5.2, 5.2]];
  const NECK = [[0, 8.5, 8.5], [1, 10, 10]];
  const LEN = { torso: 84, upper: 49, fore: 42, thigh: 70, shin: 74, foot: 34 };

  // torso depth (front/back offsets) and half-width along the torso axis, for the projected views
  const bRange = a => { const near = TORSO.concat(PELVIS).filter(q => Math.abs(q[0] - a) < 7); if (!near.length) return [-12, 12]; return [Math.min(...near.map(q => q[1])), Math.max(...near.map(q => q[1]))]; };
  const WIDTH = [[-16, 17], [0, 21], [14, 20], [34, 18.5], [56, 22], [74, 25], [86, 25.5], [96, 12]];
  const wAt = a => { for (let i = 1; i < WIDTH.length; i++) if (a <= WIDTH[i][0]) return lerp(WIDTH[i - 1][1], WIDTH[i][1], (a - WIDTH[i - 1][0]) / (WIDTH[i][0] - WIDTH[i - 1][0])); return WIDTH[WIDTH.length - 1][1]; };

  function ik3(S, H, L1, L2, pole) {
    const D = sub(H, S), d = Math.min(len(D), L1 + L2 - .01), u = norm(D);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const w = norm(sub(pole, mul(u, dot(pole, u))));
    return add(add(S, mul(u, a)), mul(w, h));
  }
  // two-bone 2D solve: angles (deg) of both bones from A so the chain ends at B; the bend goes toward `pref`
  function ik2(A, B, L1, L2, pref) {
    const D = sub(B, A), d = Math.min(Math.max(len(D), Math.abs(L1 - L2) + .01), L1 + L2 - .01), base = Math.atan2(D[1], D[0]);
    const k = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const pick = [base + k, base - k].map(a => { const J = add(A, mul([Math.cos(a), Math.sin(a)], L1)); return { a, J, s: dot(sub(J, mid(A, B)), pref) }; }).sort((x, y) => y.s - x.s)[0];
    const end = add(A, mul(norm(D), d));
    return [pick.a * 180 / Math.PI, angOf(sub(end, pick.J))];
  }
  const legTo = (hip, ankle, pref = [1, 0]) => { const [thighA, shinA] = ik2(hip, ankle, LEN.thigh, LEN.shin, pref); return { thighA, shinA }; };

  // ---------- rig: pose -> 3D joints (x, y as in the side view; z toward the viewer of the side view) ----------
  function rig(ex, t) {
    const P = ex.pose(ease(t));
    let hip = P.hip;
    if (P.ankle) hip = sub(sub(P.ankle, mul(dir(P.shinA), LEN.shin)), mul(dir(P.thighA), LEN.thigh));
    const u = dir(P.torsoA), v = [-u[1], u[0]], S = add(hip, mul(u, LEN.torso));
    const side = sg => {
      const g = sg < 0 && P.farLeg ? P.farLeg : P, lz = g.legZ || P.legZ || [17, 20, 22], a = sg < 0 && P.farArm ? P.farArm : P;
      const K = add(hip, mul(dir(g.thighA), LEN.thigh)), A = add(K, mul(dir(g.shinA), LEN.shin)), T = add(A, mul(dir(g.footA), LEN.foot));
      let E3, H3; const az = a.armZ || [24, 24], S3 = [...S, sg * 24];
      if (a.ik) {
        const tgt = [a.ik.target[0], a.ik.target[1], sg * a.ik.z];
        E3 = ik3(S3, tgt, LEN.upper, LEN.fore, [a.ik.pole[0], a.ik.pole[1], sg * a.ik.pole[2]]);
        H3 = add(E3, mul(norm(sub(tgt, E3)), LEN.fore));
      } else {
        const E = add(S, mul(dir(a.upperA), LEN.upper)), H = add(E, mul(dir(a.foreA), LEN.fore));
        E3 = [E[0], E[1], sg * az[0]]; H3 = [H[0], H[1], sg * az[1]];
      }
      return { K: [...K, sg * lz[0]], A: [...A, sg * lz[1]], T: [...T, sg * lz[2]], footA: g.footA, E: E3, H: H3, S: S3, hip: [...hip, sg * 11], hand: a.hand || P.hand || 'fist' };
    };
    return { P, hip, S, u, v, near: side(1), far: side(-1), hand: P.hand || 'fist' };
  }
  const xy = p => [p[0], p[1]];
  const fromL = (R, q) => add(R.hip, add(mul(R.u, q[0]), mul(R.v, q[1])));
  const fromL3 = (R, q, z = 0) => [...fromL(R, q), z];

  // ---------- muscle definitions ----------
  // torso: side-view template; top: [a along the torso axis, z across] on the front or back surface (projected views)
  const MUSCLES = {
    pec: { torso: PEC, top: [[56, 3], [68, 3], [78, 6], [84, 15], [80, 22], [68, 24], [58, 18], [54, 8]], face: 'front', fibre: 'fan' },
    abs: { torso: ABS, top: [[8, -8], [58, -8], [60, 0], [58, 8], [8, 8], [6, 0]], face: 'front', fibre: 'abs' },
    obliques: { torso: OBLQ, top: [[10, 10], [48, 12], [52, 18], [40, 21], [12, 20]], face: 'front', fibre: 'diag', ang: 40 },
    glutes: { torso: GLUTE, top: [[-16, 3], [8, 3], [12, 12], [4, 20], [-12, 19]], face: 'back', fibre: 'diag', ang: 60 },
    erector: { torso: ERECT, top: [[8, 2], [62, 2], [62, 8], [8, 9]], face: 'back', fibre: 'axis' },
    lats: { torso: [[150, 176], [170, 172], [192, 170], [210, 172], [214, 177], [196, 177], [170, 179], [152, 179]].map(toL), top: [[26, 8], [44, 10], [62, 16], [72, 22], [62, 24], [44, 21], [30, 15]], face: 'back', fibre: 'diag', ang: -25 },
    upperback: { torso: [[142, 176], [150, 172], [162, 171], [170, 174], [164, 178], [150, 180]].map(toL), top: [[62, 3], [76, 5], [80, 15], [72, 19], [63, 12]], face: 'back', fibre: 'diag', ang: -40 },
    traps: { torso: [[129, 168], [135, 160], [141, 156], [147, 160], [146, 170], [140, 177], [133, 175]].map(toL), top: [[70, 1], [86, 2], [95, 7], [90, 19], [82, 21], [74, 10]], face: 'back', fibre: 'diag', ang: 30 },
    fdelt: { limb: 'upper', side: 'np', rows: [[0, 13], [.2, 12], [.45, 8]], s: [0, .45], fibre: 'fan' },
    triceps: { limb: 'upper', side: 'p', rows: [[.22, 10], [.45, 9.5], [.88, 6.5]], s: [.22, .88], fibre: 'axis' },
    biceps: { limb: 'upper', side: 'np', rows: [[.32, 7], [.62, 9], [.9, 6]], s: [.32, .9], fibre: 'axis' },
    rdelt: { limb: 'upper', side: 'p', rows: [[0, 12], [.2, 11], [.42, 7]], s: [0, .42], fibre: 'fan' },
    sdelt: { cap: true, fibre: 'fan' },
    forearm: { limb: 'fore', side: 'p', rows: [[.04, 7], [.3, 8], [.75, 4.5]], s: [.04, .75], fibre: 'axis' },
    quads: { limb: 'thigh', side: 'np', rows: [[.1, 15], [.5, 15], [.92, 10]], s: [.1, .92], fibre: 'axis' },
    hipflex: { limb: 'thigh', side: 'np', rows: [[0, 15], [.25, 14], [.45, 12]], s: [0, .45], fibre: 'axis' },
    hams: { limb: 'thigh', side: 'p', rows: [[.15, 15], [.5, 14.5], [.9, 9]], s: [.15, .9], fibre: 'axis' },
    calves: { limb: 'shin', side: 'p', rows: [[.06, 9], [.3, 12], [.62, 8]], s: [.06, .62], fibre: 'axis' },
    tibialis: { limb: 'shin', side: 'np', rows: [[.08, 7], [.4, 6.5], [.78, 4]], s: [.08, .78], fibre: 'axis' }
  };
  // which muscles sit on which host, drawn in this order (later ones on top)
  const HOSTS = { torso: ['lats', 'upperback', 'erector', 'glutes', 'obliques', 'abs', 'pec'], neck: ['traps'], thigh: ['quads', 'hipflex', 'hams'], shin: ['calves', 'tibialis'], upper: ['triceps', 'biceps', 'rdelt', 'fdelt', 'sdelt'], fore: ['forearm'] };
  const limbEnds = (sd, which) => which === 'upper' ? [sd.S, sd.E] : which === 'thigh' ? [sd.hip, sd.K] : which === 'shin' ? [sd.K, sd.A] : [sd.E, sd.hand === 'flat' ? sd.H : add(sd.E, mul(sub(sd.H, sd.E), .86))];

  // ---------- textures ----------
  let uid = 0;
  function fibreLines(shape, spec) {
    const xs = shape.map(p => p[0]), ys = shape.map(p => p[1]);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 2;
    const out = [];
    if (spec.type === 'fan') {
      for (let i = 0; i < shape.length; i++) { const q = shape[i], q2 = mid(shape[i], shape[(i + 1) % shape.length]); for (const e of [q, q2]) out.push(`M${pts([spec.I])}L${pts([add(spec.I, mul(norm(sub(e, spec.I)), R * 2.2))])}`); }
      return out;
    }
    let d = norm(spec.d); if (!len(d)) d = [0, 1];
    const n = [-d[1], d[0]], gap = spec.gap || 2.3;
    for (let k = -R; k <= R; k += gap) {
      const a = add(add(c, mul(n, k)), mul(d, -R)), b = add(add(c, mul(n, k)), mul(d, R));
      const bow = (spec.bow || 0) * (1 - (k / R) * (k / R));
      out.push(`M${pts([a])}Q${pts([add(mid(a, b), mul(n, bow))])} ${pts([b])}`);
    }
    if (spec.cross) for (const s of spec.cross) { const p0 = add(spec.o, mul(d, s)); out.push(`M${pts([add(p0, mul(n, -R))])}L${pts([add(p0, mul(n, R))])}`); }
    return out;
  }
  let SIMPLE = false;
  // primary: true = main muscle, false = helper, 'dormant' = not used (faint)
  function muscleSVG(T, shape, spec, primary, defs) {
    const id = 'm' + (++uid), d = smooth(shape);
    if (primary === 'dormant') {
      if (SIMPLE) return '';
      defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
      return `<path d="${d}" fill="${T.line}" opacity=".07"/><g clip-path="url(#${id})" fill="none" stroke="${T.line}" stroke-width=".55" opacity=".3">${fibreLines(shape, spec).map(l => `<path d="${l}"/>`).join('')}</g><path d="${d}" fill="none" stroke="${T.line}" stroke-width=".7" opacity=".4"/>`;
    }
    if (SIMPLE) return primary ? `<path d="${d}" fill="${T.glow}" filter="url(#glow)" opacity=".8"/><path d="${d}" fill="${T.volt}"/>` : '';
    defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    const lines = fibreLines(shape, spec).map(l => `<path d="${l}"/>`).join('');
    if (primary) return `<path d="${d}" fill="${T.glow}" filter="url(#glow)" opacity="${T.key === 'dark' ? .85 : .7}"/>
      <path d="${d}" fill="url(#mgrad)"/>
      <g clip-path="url(#${id})" fill="none" stroke="${T.fib}" stroke-width=".7" stroke-linecap="round" opacity=".6">${lines}</g>
      <path d="${d}" fill="none" stroke="${T.fib}" stroke-width=".9" opacity=".8"/>`;
    return `<path d="${d}" fill="${T.volt}" opacity="${T.secFill}"/>
      <g clip-path="url(#${id})" fill="none" stroke="${T.secLine}" stroke-width=".8" stroke-linecap="round" opacity=".85">${lines}</g>
      <path d="${d}" fill="none" stroke="${T.secLine}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
  }
  const roleOf = (ms, n) => ms.primary.includes(n) ? true : (ms.secondary || []).includes(n) ? false : 'dormant';
  // one-arm exercises: the resting (far) arm shows no working muscles
  const ARM_MUSCLES = ['triceps', 'biceps', 'rdelt', 'fdelt', 'sdelt', 'forearm'];
  const restArm = ms => ({ primary: ms.primary.filter(n => !ARM_MUSCLES.includes(n)), secondary: (ms.secondary || []).filter(n => !ARM_MUSCLES.includes(n)) });

  // solid layer: one outline underlay for every shape, then the fills (and muscles) on top
  function layerSVG(T, L, far) {
    if (!L.items.length) return '';
    const items = L.sorted ? L.items.slice().sort((a, b) => b.key - a.key) : L.items;
    return `<g opacity="${far ? T.farOp : T.bodyOp}" fill="${T.line}" stroke="${T.line}" stroke-width="2.4" stroke-linejoin="round">${L.sil.map(d => `<path d="${d}"/>`).join('')}</g>` + items.map(i => i.svg).join('');
  }
  const newLayer = (sorted = false) => ({ sil: [], items: [], sorted });

  // ---------- views ----------
  const VIEWS = {
    side: { p: q => [q[0], q[1]], d: q => -q[2], cam: [0, 0, 1] },
    top: { p: q => [q[0], -q[2]], d: q => q[1], cam: [0, -1, 0] },
    front: { p: q => [q[2], q[1]], d: q => -q[0], cam: [1, 0, 0] },
    back: { p: q => [-q[2], q[1]], d: q => q[0], cam: [-1, 0, 0] }
  };

  // ---------- side view (2D templates: face profile, refined feet and hands) ----------
  const limbPt = (A, B, s, off) => { const D = sub(B, A), L = len(D) || 1, u = mul(D, 1 / L), p = [-u[1], u[0]]; return add(add(A, mul(u, L * s)), mul(p, off)); };
  function sideView(ex, T, t, opts) {
    const R = rig(ex, t), defs = [], ms = ex.muscles;
    const far = newLayer(), core = newLayer(), near = newLayer();
    const body = (L, shape) => { const d = smooth(shape); L.sil.push(d); L.items.push({ svg: `<path d="${d}" fill="${L === far ? T.far : T.body}"/>` }); };
    const raw = (L, svg) => L.items.push({ svg });
    const cl = (a, w = .7, op = .45) => `<polyline points="${pts(a)}" fill="none" stroke="${T.line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
    const shapes = sd => {
      const S = xy(sd.S), E = xy(sd.E), H = xy(sd.H), K = xy(sd.K), A = xy(sd.A);
      const flat = sd.hand === 'flat', wrist = flat ? H : add(E, mul(sub(H, E), .86));
      const fu = dir(sd.footA), fv = [-fu[1], fu[0]], footPt = q => add(A, add(mul(fu, q[0]), mul(fv, q[1])));
      const handRot = Math.atan2(H[1] - E[1], H[0] - E[0]);
      return {
        S, E, H, K, A, wrist, hip: xy(sd.hip), footPt, handRot, flat,
        thigh: limb(xy(sd.hip), K, THIGH), shin: limb(K, A, SHIN), foot: FOOT.map(footPt),
        upper: limb(S, E, UPPER), delt: ellipse(add(S, mul(sub(E, S), .12)), 13, 11.5, Math.atan2(E[1] - S[1], E[0] - S[0])),
        fore: limb(E, wrist, FORE),
        hand: flat ? limb(H, add(H, mul(dir(angOf(sub(H, E)) * .25 + (H[0] > E[0] ? 0 : 135)), 19)), [[0, 4.5, 4], [.6, 5, 4], [1, 3.5, 3]]) : ellipse(H, 8.5, 7.5, handRot + Math.PI / 2, 12)
      };
    };
    const N = shapes(R.near), F = shapes(R.far);
    const handDetail = Q => {
      if (Q.flat) return '';
      const u = dir(Q.handRot * 180 / Math.PI), p = [-u[1], u[0]];
      return [-3.5, 0, 3.5].map(o => cl([add(add(Q.H, mul(p, o)), mul(u, 3)), add(add(Q.H, mul(p, o)), mul(u, 7))])).join('') +
        `<path d="${smooth(ellipse(add(add(Q.H, mul(u, -3)), mul(p, -5)), 2.6, 4.2, Q.handRot + Math.PI / 2, 10))}" fill="none" stroke="${T.line}" stroke-width=".7" opacity=".4"/>`;
    };
    const footDetail = Q => cl([Q.footPt([30, 6]), Q.footPt([33, 12])]) + cl([Q.footPt([26, 7]), Q.footPt([28, 12.5])], .6, .35);
    const mus = name => {
      const m = MUSCLES[name], role = roleOf(ms, name);
      if (m.torso) {
        let shape = m.torso.map(q => fromL(R, q)), spec;
        if (name === 'pec') { const I = add(N.S, mul(sub(N.E, N.S), .2)); shape = [I, ...shape]; spec = { type: 'fan', I }; }
        else if (m.fibre === 'abs') spec = { type: 'axis', d: R.u, gap: 2.6, o: R.hip, cross: [20, 31, 42, 52] };
        else if (m.fibre === 'diag') spec = { type: 'axis', d: dir(angOf(R.u) + m.ang), gap: 2.4 };
        else spec = { type: 'axis', d: R.u, gap: 2.4 };
        return muscleSVG(T, shape, spec, role, defs);
      }
      if (m.cap) { const I = add(N.S, mul(sub(N.E, N.S), .9)); return muscleSVG(T, ellipse(add(N.S, mul(norm(sub(N.E, N.S)), 3)), 10.5, 9.5, 0, 14), { type: 'fan', I }, role, defs); }
      const [A3, B3] = limbEnds(R.near, m.limb), A = xy(A3), B = xy(B3);
      const shape = limb(A, B, half(m.rows, m.side), m.s[0], m.s[1]);
      const spec = m.fibre === 'fan' ? { type: 'fan', I: add(A, mul(sub(B, A), .5)) } : { type: 'axis', d: sub(B, A), gap: 2.2, bow: 1.5 };
      return muscleSVG(T, shape, spec, role, defs);
    };
    // draw muscles in host order, with the used ones last so nothing dormant sits on top of them
    const group = (L, host) => { const ns = HOSTS[host]; const order = ns.filter(n => roleOf(ms, n) === 'dormant').concat(ns.filter(n => roleOf(ms, n) === false), ns.filter(n => roleOf(ms, n) === true)); order.forEach(n => raw(L, mus(n))); };
    // far side: leg and arm, one layer in a darker tone
    body(far, F.thigh); body(far, F.shin); body(far, F.foot); body(far, F.upper); body(far, F.fore); body(far, F.hand);
    // body: torso, head, near leg
    body(core, TORSO.map(q => fromL(R, q))); body(core, PELVIS.map(q => fromL(R, q)));
    group(core, 'torso');
    body(core, limb(fromL(R, NECK_A), fromL(R, NECK_B), NECK)); body(core, HEAD.map(q => fromL(R, q)));
    group(core, 'neck');
    body(core, N.thigh); group(core, 'thigh');
    body(core, N.shin); group(core, 'shin');
    body(core, N.foot); raw(core, footDetail(N));
    // near arm
    body(near, N.upper); body(near, N.delt); group(near, 'upper');
    body(near, N.fore); group(near, 'fore');
    body(near, N.hand); raw(near, handDetail(N));
    const zmax = sd => Math.max(sd.E[2], sd.H[2], 24);
    return {
      R, defs, units: [
        { key: Math.max(-Math.min(R.far.E[2], R.far.H[2], R.far.K[2]), 18), svg: layerSVG(T, far, true) },
        { key: -21, svg: layerSVG(T, core) },
        { key: -zmax(R.near) - .5, svg: layerSVG(T, near) }
      ]
    };
  }

  // ---------- projected views: top-down, front, back ----------
  function projView(ex, T, t, opts, V) {
    const R = rig(ex, t), defs = [], P = V.p, D = V.d;
    let ms = ex.muscles;
    const core = newLayer(true), arms = [newLayer(true), newLayer(true)];
    const part = (L, key, shape, poly = false) => { const d = poly ? polyD(shape) : smooth(shape); L.sil.push(d); L.items.push({ key, svg: `<path d="${d}" fill="${T.body}"/>` }); };
    const kmin = (...q) => Math.min(...q.map(D));
    const xAt = (a, b) => R.hip[0] + a * R.u[0] + b * R.v[0], yAt = (a, b) => R.hip[1] + a * R.u[1] + b * R.v[1];
    const T3 = (a, b, z) => [xAt(a, b), yAt(a, b), z];
    // torso: union of slices
    const torsoPts = [];
    const slices = [];
    for (let a = -16; a < 96; a += 8) {
      const c = [];
      // each cross-section is an ellipse: half-width w across, front-to-back depth from the side template
      for (const aa of [a, a + 8]) { const [b0, b1] = bRange(aa), w = wAt(aa), bm = (b0 + b1) / 2, bh = (b1 - b0) / 2; for (let i = 0; i < 16; i++) { const th = i / 16 * Math.PI * 2, q = T3(aa, bm + bh * Math.sin(th), w * Math.cos(th)); c.push(P(q)); torsoPts.push(q); } }
      slices.push(hull(c));
    }
    const torsoKey = kmin(...torsoPts);
    slices.forEach(s => part(core, torsoKey, s, true));
    // head: an ellipsoid (no face, no ears), and the neck
    const hl = HEAD.map(q => q), ha = hl.map(q => q[0]), hb = hl.map(q => q[1]);
    const hc = fromL3(R, [(Math.min(...ha) + Math.max(...ha)) / 2, (Math.min(...hb) + Math.max(...hb)) / 2]);
    const ra = (Math.max(...ha) - Math.min(...ha)) / 2, rb = (Math.max(...hb) - Math.min(...hb)) / 2, u3 = [...R.u, 0], v3 = [...R.v, 0];
    const headPts = [];
    for (let i = 0; i < 12; i++) for (let j = -3; j <= 3; j++) { const th = i / 12 * Math.PI * 2, ph = j / 3 * Math.PI / 2; headPts.push(add(add(add(hc, mul(u3, ra * Math.cos(ph) * Math.cos(th))), mul(v3, rb * .8 * Math.cos(ph) * Math.sin(th))), [0, 0, 12.5 * Math.sin(ph)])); }
    // from above the head sits over the shoulders, so it gets its own outline there
    const headL = V.cam[1] < 0 ? newLayer(true) : core;
    part(headL, kmin(...headPts) - .5, hull(headPts.map(P)));
    const na = fromL3(R, NECK_A), nb = fromL3(R, NECK_B);
    part(core, kmin(na, nb) + .2, limb(P(na), P(nb), NECK));
    // limbs
    const footShape = sd => {
      const fu = dir(sd.footA), dn = [-fu[1], fu[0]], A = sd.A, Tt = sd.T, c = [];
      const at = (p, o, r) => ellipse(P(add(p, [o[0], o[1], 0])), r, r, 0, 10);
      c.push(...at(A, [0, 0], 6), ...at(A, mul(dn, 9), 6), ...at(Tt, mul(fu, -4), 4.5), ...at(Tt, add(mul(dn, 6), mul(fu, -3)), 4.5));
      return hull(c);
    };
    [R.near, R.far].forEach((sd, i) => {
      const wrist = sd.hand === 'flat' ? sd.H : add(sd.E, mul(sub(sd.H, sd.E), .86)), A = arms[i];
      part(core, kmin(sd.hip, sd.K), limb(P(sd.hip), P(sd.K), THIGH));
      part(core, kmin(sd.K, sd.A) + .1, limb(P(sd.K), P(sd.A), SHIN));
      part(core, kmin(sd.A, sd.T) + 2, footShape(sd));
      part(A, kmin(sd.S, sd.E), limb(P(sd.S), P(sd.E), UPPER));
      part(A, D(sd.S) + .05, ellipse(P(sd.S), 12, 11));
      part(A, kmin(sd.E, wrist) - .1, limb(P(sd.E), P(wrist), FORE));
      part(A, D(sd.H) - .3, sd.hand === 'flat' ? limb(P(sd.H), P(add(sd.H, mul(norm(sub(sd.H, sd.E)), 17))), [[0, 5.5, 5.5], [.6, 6, 6], [1, 4.5, 4.5]]) : ellipse(P(sd.H), 7.5, 6.5));
    });
    // muscles that face the camera
    const cam = V.cam;
    const order = Object.keys(MUSCLES).sort((a, b) => { const r = n => roleOf(ms, n) === true ? 2 : roleOf(ms, n) === false ? 1 : 0; return r(a) - r(b); });
    for (const name of order) {
      const m = MUSCLES[name], role = roleOf(ms, name);
      if (m.torso) {
        const n = m.face === 'front' ? v3 : mul(v3, -1); if (dot(n, cam) < .3) continue;
        for (const sg of [1, -1]) {
          const bf = a => { const [b0, b1] = bRange(a); return m.face === 'front' ? b1 - 2 : b0 + 2; };
          let shape = m.top.map(([a, z]) => P(T3(a, bf(a), sg * z))), spec;
          const pu = sub(P(T3(40, 0, 0)), P(T3(0, 0, 0))), pz = norm(sub(P([0, 0, sg]), P([0, 0, 0])));
          if (name === 'pec') { const sd = sg > 0 ? R.near : R.far, I = P(add(sd.S, mul(sub(sd.E, sd.S), .2))); shape = [I, ...shape]; spec = { type: 'fan', I }; }
          else if (m.fibre === 'abs') spec = { type: 'axis', d: pu, gap: 2.6, o: P(T3(0, bf(0), 0)), cross: [20, 31, 42].map(a => a * len(pu) / 40) };
          else if (m.fibre === 'diag') { const a = deg(m.ang), du = norm(pu); spec = { type: 'axis', d: add(mul(du, Math.cos(a)), mul(pz, Math.sin(a))), gap: 2.4 }; }
          else spec = { type: 'axis', d: pu, gap: 2.4 };
          core.items.push({ key: torsoKey - .05 - (role === true ? .002 : role === false ? .001 : 0), svg: muscleSVG(T, shape, spec, role, defs) });
          if (m.fibre === 'abs') break;
        }
        continue;
      }
      [R.near, R.far].forEach((sd, i) => {
        const role = i === 1 && ex.oneArm && m.limb !== 'thigh' && m.limb !== 'shin' ? roleOf(restArm(ex.muscles), name) : roleOf(ex.muscles, name);
        if (m.cap) {
          const c = add(sd.S, [0, -2, Math.sign(sd.S[2]) * 3]), n = [0, -.3, Math.sign(sd.S[2])];
          if (dot(norm(n), cam) < -.2 && cam[2] !== 0) return;
          arms[i].items.push({ key: D(sd.S) - 400, over: true, svg: muscleSVG(T, ellipse(P(c), 9, 8.5, 0, 14), { type: 'fan', I: P(add(sd.S, mul(sub(sd.E, sd.S), .6))) }, role, defs) });
          return;
        }
        // which way this side of the limb faces: from the side-plane bend when the limb lies in that plane,
        // otherwise (a limb pointing out sideways) the front of the body for 'np' and the back for 'p'
        const [A3, B3] = limbEnds(sd, m.limb), D3 = sub(B3, A3), Dv = xy(D3), p = norm([-Dv[1], Dv[0]]), planar = len(Dv) / (len(D3) || 1);
        const n2 = m.side === 'p' ? p : mul(p, -1), fb = m.side === 'p' ? -1 : 1;
        let nrm = add(mul([...n2, 0], planar), mul([fb, 0, 0], 1 - planar)); nrm = norm(sub(nrm, mul(norm(D3), dot(nrm, norm(D3)))));
        if (dot(nrm, cam) < .35) return;
        const shape = limb(P(A3), P(B3), m.rows.map(([s, r]) => [s, r * .8, r * .8]), m.s[0], m.s[1]);
        const spec = m.fibre === 'fan' ? { type: 'fan', I: mid(P(A3), P(B3)) } : { type: 'axis', d: sub(P(B3), P(A3)), gap: 2.2, bow: 1.5 };
        const L = m.limb === 'upper' || m.limb === 'fore' ? arms[i] : core;
        L.items.push({ key: kmin(A3, B3) - .05, svg: muscleSVG(T, shape, spec, role, defs) });
      });
    }
    const lkey = L => Math.min(...L.items.filter(i => !i.over).map(i => i.key));
    return { R, defs, units: [core, ...arms, ...(headL !== core ? [headL] : [])].filter(L => L.items.length).map(L => ({ key: lkey(L) + (L === core ? .5 : 0), svg: layerSVG(T, L) })) };
  }

  // ---------- equipment: simple 3D shapes, drawn in any view ----------
  // box: axis-aligned corners a, b. slab: a board from p0 to p1 in the side plane, thickness th, across z0..z1.
  // rod: a bar from a to b. disc: a plate of radius r, facing along axis n ('x'|'y'|'z'), thickness th. cable: a thin line.
  const box = (a, b, s = 'frame', o = {}) => ({ kind: 'poly', pts: [0, 1, 2, 3, 4, 5, 6, 7].map(i => [(i & 1 ? b : a)[0], (i & 2 ? b : a)[1], (i & 4 ? b : a)[2]]), s, ...o });
  function slab(p0, p1, th, z0, z1, s = 'pad', o = {}) {
    const u = norm(sub(p1, p0)), n = [-u[1], u[0]], c = [];
    for (const p of [p0, p1]) for (const k of [0, 1]) for (const z of [z0, z1]) c.push([...add(p, mul(n, k * th)), z]);
    return { kind: 'poly', pts: c, s, ...o };
  }
  const rod = (a, b, w = 3, s = 'metal', o = {}) => ({ kind: 'rod', pts: [a, b], w, s, ...o });
  const cable = (a, b, o = {}) => ({ kind: 'rod', pts: [a, b], w: 1, s: 'cable', fit: false, ...o });
  function disc(c, r, n = 'z', th = 4, s = 'plate', o = {}) {
    const ax = { x: [[0, 1, 0], [0, 0, 1]], y: [[1, 0, 0], [0, 0, 1]], z: [[1, 0, 0], [0, 1, 0]] }[n], nn = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[n], q = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; for (const k of [-.5, .5]) q.push(add(add(add(c, mul(ax[0], r * Math.cos(a))), mul(ax[1], r * Math.sin(a))), mul(nn, k * th))); }
    return { kind: 'poly', pts: q, s, ring: true, c, r, ...o };
  }
  const barbell = (c, half = 95, plateZ = 70, r = 35) => [rod([c[0], c[1], -half], [c[0], c[1], half], 3.2), ...[-1, 1].flatMap(s => [disc([c[0], c[1], s * plateZ], r, 'z', 7), disc([c[0], c[1], s * (plateZ - 6)], 5, 'z', 4, 'metalfill')])];
  const dumbbell = (c, axis = 'z', r = 11, half = 17) => { const e = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis]; return [rod(add(c, mul(e, -half)), add(c, mul(e, half)), 3), ...[-1, 1].map(s => disc(add(c, mul(e, s * (half - 3))), r, axis, 7, 'weight'))]; };
  const floor = (x0, x1) => ({ kind: 'floor', x0, x1 });
  const handle = (c, axis = 'z') => { const e = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis]; return rod(add(c, mul(e, -6)), add(c, mul(e, 6)), 3.4, 'metal'); };

  function propSVG(T, it, V) {
    const st = {
      frame: `fill="${T.tint}" opacity="${T.key === 'dark' ? .55 : .5}"`,
      pad: `fill="${T.tint}" opacity="${T.key === 'dark' ? .8 : .75}"`,
      plate: `fill="${T.line}" fill-opacity=".06" stroke="${T.line}" stroke-width="2" stroke-opacity=".5"`,
      weight: `fill="${T.line}" opacity=".45"`,
      metalfill: `fill="${T.line}" opacity=".5"`
    }[it.s];
    if (it.kind === 'rod') {
      const a = V.p(it.pts[0]), b = V.p(it.pts[1]), op = it.s === 'cable' ? .45 : .6;
      return `<polyline points="${pts([a, b])}" fill="none" stroke="${T.line}" stroke-width="${it.w}" stroke-linecap="round" opacity="${op}"/>`;
    }
    const h = hull(it.pts.map(V.p));
    if (it.s === 'plate' && V === VIEWS.side && it.ring) return `<path d="${polyD(h)}" ${st}/>`;
    return `<path d="${polyD(h)}" ${st} stroke-linejoin="round"/>`;
  }

  // ---------- picture-only cues ----------
  const arrowHead = (p, ang, col, s = 6) => `<polygon points="${pts([0, 2.5, -2.5].map(d => [p[0] + s * Math.cos(ang + d), p[1] + s * Math.sin(ang + d)]))}" fill="${col}"/>`;
  const JOINT = { H: r => r.near.H, E: r => r.near.E, S: r => r.near.S, hip: r => r.near.hip, K: r => r.near.K, A: r => r.near.A, T: r => r.near.T, head: r => fromL3(r, [118, 0]), fH: r => r.far.H };
  function motionPath(ex, V, joint, offset, col) {
    const n = []; for (let i = 0; i <= 24; i++) n.push(add(V.p(JOINT[joint](rig(ex, i / 24))), offset));
    if (len(sub(n[24], n[0])) < 8) return '';
    const a = Math.atan2(n[24][1] - n[22][1], n[24][0] - n[22][0]), b = Math.atan2(n[0][1] - n[2][1], n[0][0] - n[2][0]);
    return `<polyline points="${pts(n)}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>${arrowHead(n[24], a, col)}${arrowHead(n[0], b, col)}`;
  }

  // ---------- exercises: the default 5-day split ----------
  const STAND = 238; // ankle height when standing (soles on the floor at y = 250)
  const benchProps = (x0 = 92, x1 = 292, top = 180, z = 15) => [box([x0, top, -z], [x1, top + 12, z], 'pad'), box([x0 + 18, top + 10, -12], [x0 + 25, 246, 12]), box([x1 - 25, top + 10, -12], [x1 - 18, 246, 12]), box([x0 + 6, 244, -20], [x0 + 37, 250, 20]), box([x1 - 37, 244, -20], [x1 - 6, 250, 20])];
  const tower = (x, z, top = -90, w = 16) => box([x - w / 2, top, z - 7], [x + w / 2, 250, z + 7], 'frame', { fit: false });
  // lying on a flat bench (from the reference bench press)
  const LIE = { hip: [234, 166], torsoA: 184.09, thighA: -2.45, shinA: 95.4, footA: 0, legZ: [17, 20, 22] };
  const LIE_S = add(LIE.hip, mul(dir(LIE.torsoA), LEN.torso));
  const barPath = t => { const xt = 1 - Math.pow(1 - t, 2); return [178 + (153 - 178) * xt, 133 + (71 - 133) * t]; };
  // arms crossed on the chest
  const crossed = (hip, torsoA) => { const u = dir(torsoA), v = [-u[1], u[0]], S = add(hip, mul(u, LEN.torso)); return { target: add(add(S, mul(u, -22)), mul(v, 14)), z: -6, pole: [v[0] - u[0] * .5, v[1] - u[1] * .5, 1.2] }; };
  const standLegs = (ax = 200) => ({ ankle: [ax, STAND], shinA: 90, thighA: 90, footA: 0 });
  // hand paths that swing around the shoulder: out to the side (angle from hanging down) or level (angle from straight ahead)
  const SH = [200, 10];
  const sideArc = (a, fwd, px, S = SH, r = 84) => ({ target: [S[0] + fwd, S[1] + r * Math.cos(deg(a))], z: 24 + r * Math.sin(deg(a)), pole: [px, -Math.sin(deg(a)), Math.cos(deg(a))] });
  const flatArc = (a, dy, r, pole, S = SH) => ({ target: [S[0] + r * Math.cos(deg(a)), S[1] + dy], z: 24 + r * Math.sin(deg(a)), pole });

  const EX = {
    // ---------------- Monday: chest & arms ----------------
    bench: {
      name: 'Barbell bench press', muscles: { primary: ['pec'], secondary: ['fdelt', 'triceps'] },
      pose: t => ({ ...LIE, ik: { target: barPath(1 - t), z: 52, pole: [1, 1, 1] } }),
      props: R => [...benchProps(), ...barbell(R.near.H)],
      cues: { side: [['H', [44, 0]]], top: [] }, frames: ['Arms straight over the chest', 'Bar touches mid-chest']
    },
    incdb: {
      name: 'Incline dumbbell press', muscles: { primary: ['pec', 'fdelt'], secondary: ['triceps'] },
      pose: t => { const hip = [236, 168], S = add(hip, mul(dir(210), LEN.torso)); return { hip, torsoA: 210, ...legTo(hip, [300, STAND], [.3, -1]), footA: 0, legZ: [20, 22, 24],
        ik: { target: lerp2([S[0] + 8, S[1] - 84], [S[0] + 14, S[1] - 6], t), z: lerp(24, 54, t), pole: [.4, 1, 1] } }; },
      props: R => { const hip = R.hip, u = R.u, v = R.v; return [slab(add(hip, mul(v, -15)), add(add(hip, mul(u, 92)), mul(v, -15)), -10, -14, 14), box([200, 178, -15], [272, 189, 15], 'pad'),
        box([226, 186, -8], [234, 246, 8]), box([150, 140, -8], [158, 246, 8]), box([140, 244, -22], [250, 250, 22]), ...dumbbell(R.near.H), ...dumbbell(R.far.H)]; },
      cues: { side: [['H', [36, 0]]] }, frames: ['Dumbbells pressed up over the upper chest', 'Lowered beside the chest, about 30° bench']
    },
    cablepress: {
      name: 'Standing cable chest press', muscles: { primary: ['pec'], secondary: ['triceps', 'fdelt', 'abs'] },
      pose: t => { const hip = [196, 98], S = add(hip, mul(dir(-82), LEN.torso)); return { hip, torsoA: -82, ...legTo(hip, [236, STAND], [1, -.2]), footA: 0,
        farLeg: { ...legTo(hip, [150, STAND], [1, 0]), footA: 0 }, legZ: [14, 14, 16],
        ik: { target: lerp2([S[0] + 10, S[1] + 18], [S[0] + 84, S[1] + 20], t), z: lerp(40, 10, t), pole: [lerp(-1, 0, t), 1, 1] } }; },
      props: R => { const py = R.S[1] + 18; return [floor(0, 0), tower(100, 72), tower(100, -72), ...[R.near, R.far].map(sd => cable([100, py, Math.sign(sd.H[2]) * 72], sd.H)), handle(R.near.H, 'y'), handle(R.far.H, 'y')]; },
      cues: { side: [['H', [0, -18]]] }, frames: ['Handles beside the chest, split stance', 'Arms pressed straight forward']
    },
    crossfly: {
      name: 'Cable crossover fly', view: 'front', muscles: { primary: ['pec'], secondary: ['fdelt', 'biceps'] },
      pose: t => { const hip = [196, 98], S = add(hip, mul(dir(-80), LEN.torso)); return { hip, torsoA: -80, ...legTo(hip, [234, STAND], [1, -.2]), footA: 0,
        farLeg: { ...legTo(hip, [154, STAND], [1, 0]), footA: 0 }, legZ: [13, 13, 13],
        ik: flatArc(lerp(84, -12, t), lerp(4, 24, t), 78, [lerp(.2, -.4, t), 1, lerp(.2, 1, t)], S) }; },
      props: R => { const py = R.S[1] - 10; return [floor(0, 0), tower(186, 124), tower(186, -124), ...[R.near, R.far].map(sd => cable([186, py, Math.sign(sd.H[2]) * 124], sd.H)), handle(R.near.H, 'y'), handle(R.far.H, 'y')]; },
      cues: { front: [['H', [0, -16]]], top: [['H', [0, 0]]] }, frames: ['Arms open wide, soft elbows', 'Hands meet in front of the chest']
    },
    ezcurl: {
      name: 'EZ-bar curl', muscles: { primary: ['biceps'], secondary: ['forearm'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 13], upperA: lerp(91, 86, t), foreA: lerp(84, -62, t), armZ: [20, 18] }),
      props: R => [floor(0, 0), rod([R.near.H[0], R.near.H[1], -62], [R.near.H[0], R.near.H[1], 62], 3), ...[-1, 1].map(s => disc([R.near.H[0], R.near.H[1], s * 46], 22, 'z', 6))],
      cues: { side: [['H', [16, 0]]] }, frames: ['Arms straight, elbows at your sides', 'Curled up, elbows still pinned']
    },
    ropepush: {
      name: 'Rope pushdown', muscles: { primary: ['triceps'], secondary: ['forearm'] },
      pose: t => ({ hip: [194, 97], torsoA: -80, ...legTo([194, 97], [200, STAND]), footA: 0, legZ: [12, 12, 13], upperA: 94, foreA: lerp(-12, 92, t), armZ: [20, lerp(10, 22, t)] }),
      props: R => { const c = [R.near.H[0] + 2, R.near.H[1] - 10, 0], top = [268, -70, 0]; return [floor(0, 0), box([top[0], -96, -8], [top[0] + 24, 250, 8], 'frame', { fit: false }), cable(top, c), rod(c, R.near.H, 2.4, 'metal'), rod(c, R.far.H, 2.4, 'metal')]; },
      cues: { side: [['H', [18, 0]]] }, frames: ['Forearms up, elbows at your sides', 'Pushed down, rope pulled apart']
    },
    // ---------------- Tuesday: back & shoulders ----------------
    bbrow: {
      name: 'Barbell bent-over row', muscles: { primary: ['lats', 'upperback'], secondary: ['rdelt', 'biceps', 'erector'] },
      pose: t => { const hip = [160, 106], ta = -38, u = dir(ta), v = [-u[1], u[0]], S = add(hip, mul(u, LEN.torso));
        return { hip, torsoA: ta, ...legTo(hip, [200, STAND], [1, 0]), footA: 0, legZ: [14, 14, 15],
          ik: { target: lerp2([S[0] + 2, S[1] + 88], add(add(hip, mul(u, 30)), mul(v, 22)), t), z: 30, pole: [-1, lerp(.4, -1, t), .4] } }; },
      props: R => [floor(0, 0), ...barbell(R.near.H)],
      cues: { side: [['H', [40, 0]]] }, frames: ['Hinged to about 45°, bar hanging', 'Bar pulled to the belly button']
    },
    cablerow: {
      name: 'Seated cable row', muscles: { primary: ['lats', 'upperback'], secondary: ['biceps', 'rdelt', 'erector'] },
      pose: t => { const hip = [178, 164], ta = lerp(-80, -94, t), S = add(hip, mul(dir(ta), LEN.torso));
        return { hip, torsoA: ta, ...legTo(hip, [300, 206], [.3, -1]), footA: -60, legZ: [13, 12, 12],
          ik: { target: lerp2([S[0] + 84, S[1] + 26], [hip[0] + 30, hip[1] - 38], t), z: 10, pole: [lerp(0, -1, t), 1, .6] } }; },
      props: R => [floor(0, 0), box([120, 175, -16], [236, 186, 16], 'pad'), box([130, 184, -10], [226, 250, 10]), slab([306, 236], [316, 168], 8, -24, 24, 'frame'),
        box([326, -40, -14], [346, 250, 14], 'frame', { fit: false }), disc([328, 122, 0], 7, 'z', 6, 'metalfill'), cable([328, 122, 0], [R.near.H[0], R.near.H[1], 0]), rod(R.near.H, R.far.H, 3)],
      cues: { side: [['H', [0, -16]]] }, frames: ['Arms long, sitting tall', 'Handle pulled to the stomach, shoulder blades squeezed']
    },
    widepull: {
      name: 'Wide-grip lat pulldown', muscles: { primary: ['lats'], secondary: ['biceps', 'rdelt', 'upperback'] },
      pose: t => { const hip = [190, 160], S = add(hip, mul(dir(-96), LEN.torso));
        return { hip, torsoA: -96, ...legTo(hip, [262, STAND], [.4, -1]), footA: 0, legZ: [14, 14, 15],
          ik: { target: lerp2([S[0] + 12, S[1] - 82], [S[0] + 18, S[1] + 4], t), z: lerp(60, 52, t), pole: [-.4, lerp(0, 1, t), 1] } }; },
      props: R => { const h = R.near.H; return [floor(0, 0), box([140, 170, -18], [222, 180, 18], 'pad'), box([176, 178, -8], [186, 250, 8]), box([238, 136, -40], [264, 148, 40], 'pad'), box([262, 140, -6], [302, 146, 6]),
        box([300, -150, -10], [320, 250, 10], 'frame', { fit: false }), box([178, -150, -6], [320, -138, 6], 'frame', { fit: false }), rod([h[0], h[1], -86], [h[0], h[1], 86], 3.2), cable([h[0], h[1] - 2, 0], [186, -138, 0])]; },
      cues: { side: [['H', [24, 0]]] }, frames: ['Wide grip, arms straight up', 'Bar pulled to the upper chest']
    },
    shouldermach: {
      name: 'Seated shoulder press machine', muscles: { primary: ['fdelt', 'sdelt'], secondary: ['triceps', 'pec'] },
      pose: t => { const hip = [190, 160], S = add(hip, mul(dir(-92), LEN.torso));
        return { hip, torsoA: -92, ...legTo(hip, [252, STAND], [.4, -1]), footA: 0, legZ: [16, 16, 17],
          ik: { target: lerp2([S[0] + 8, S[1] - 6], [S[0] + 6, S[1] - 84], t), z: lerp(40, 30, t), pole: [.2, 1, 1] } }; },
      props: R => { const pv = [R.S[0] - 46, R.S[1] - 30]; return [floor(0, 0), box([150, 170, -18], [228, 180, 18], 'pad'), slab([165, 168], [158, 40], -10, -16, 16), box([138, 40, -8], [150, 250, 8]),
        ...[R.near, R.far].map(sd => rod(sd.H, [pv[0], pv[1], sd.H[2]], 3.4)), handle(R.near.H, 'x'), handle(R.far.H, 'x')]; },
      cues: { side: [['H', [24, 0]]] }, frames: ['Handles just above the shoulders, back on the pad', 'Pressed up, arms nearly straight']
    },
    lateral: {
      name: 'Dumbbell lateral raise', view: 'front', muscles: { primary: ['sdelt'], secondary: ['traps', 'fdelt'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 12], ik: sideArc(lerp(12, 84, t), 10, lerp(-.3, 0, t)) }),
      props: R => [floor(0, 0), ...dumbbell(R.near.H, 'x'), ...dumbbell(R.far.H, 'x')],
      cues: { front: [['H', [0, 0]]], top: [] }, frames: ['Arms down, dumbbells by your thighs', 'Raised out to shoulder height']
    },
    facepull: {
      name: 'Rope face pull', muscles: { primary: ['rdelt', 'upperback'], secondary: ['traps'] },
      pose: t => { const hip = [192, 96], S = add(hip, mul(dir(-93), LEN.torso));
        return { hip, torsoA: -93, ...legTo(hip, [200, STAND]), footA: 0, legZ: [12, 12, 13],
          ik: { target: lerp2([S[0] + 84, S[1] - 12], [S[0] + 6, S[1] - 20], t), z: lerp(10, 40, t), pole: [-.6, lerp(.5, -.2, t), 1] } }; },
      props: R => { const c = [R.near.H[0] + 6, R.near.H[1], 0], pul = [R.S[0] + 140, R.S[1] - 12, 0]; return [floor(0, 0), box([pul[0] - 4, -96, -8], [pul[0] + 16, 250, 8], 'frame', { fit: false }), cable(pul, c), rod(c, R.near.H, 2.4), rod(c, R.far.H, 2.4)]; },
      cues: { side: [['H', [0, -16]]] }, frames: ['Arms out toward the pulley at head height', 'Rope pulled to your eyes, hands by your ears']
    },
    // ---------------- Wednesday: legs, glutes & abs ----------------
    goblet: {
      name: 'Goblet squat', muscles: { primary: ['quads', 'glutes'], secondary: ['abs', 'upperback'] },
      pose: t => { const hip = lerp2([198, 96], [160, 186], t), ta = lerp(-90, -62, t), u = dir(ta), v = [-u[1], u[0]], S = add(hip, mul(u, LEN.torso));
        return { hip, torsoA: ta, ...legTo(hip, [204, STAND], [1, 0]), footA: 0, legZ: [22, 20, 26], ik: { target: add(add(S, mul(u, -22)), mul(v, 18)), z: 8, pole: [.2, 1, 1] } }; },
      props: R => [floor(0, 0), ...dumbbell([R.near.H[0] + 4, R.near.H[1], 0], 'y', 13, 17)],
      cues: { side: [['hip', [-30, 0]]] }, frames: ['Standing tall, dumbbell at your chest', 'Sitting down between your heels']
    },
    rdl: {
      name: 'Barbell Romanian deadlift', muscles: { primary: ['hams', 'glutes'], secondary: ['erector', 'forearm', 'abs'] },
      pose: t => { const hip = lerp2([198, 96], [140, 112], t), ta = lerp(-90, -20, t), S = add(hip, mul(dir(ta), LEN.torso));
        return { hip, torsoA: ta, ...legTo(hip, [204, STAND], [1, 0]), footA: 0, legZ: [12, 12, 13], ik: { target: [lerp(S[0] + 8, S[0] - 4, t), S[1] + 87], z: 28, pole: [1, 0, .2] } }; },
      props: R => [floor(0, 0), ...barbell(R.near.H)],
      cues: { side: [['hip', [-30, -10]]] }, frames: ['Standing tall, bar at your thighs', 'Hips pushed back, bar just below the knees']
    },
    hipthrust: {
      name: 'Barbell hip thrust', muscles: { primary: ['glutes'], secondary: ['hams', 'quads'] },
      pose: t => { const hip = lerp2([226, 220], [246, 166], t), Sf = [162, 166], ta = angOf(sub(Sf, hip)), u = dir(ta), v = [-u[1], u[0]];
        return { hip, torsoA: ta, ...legTo(hip, [328, STAND], [0, -1]), footA: 0, legZ: [18, 18, 20], ik: { target: add(add(hip, mul(u, 8)), mul(v, 18)), z: 40, pole: [0, 1, 1] } }; },
      props: R => { const b = add(add(R.hip, mul(R.u, 6)), mul(R.v, 22)); return [floor(0, 0), box([118, 178, -40], [172, 250, 40], 'pad'), ...barbell(b)]; },
      cues: { side: [['hip', [0, 30]]] }, frames: ['Upper back on the bench, hips down', 'Hips driven up level with the shoulders']
    },
    bss: {
      name: 'Bulgarian split squat', muscles: { primary: ['quads', 'glutes'], secondary: ['hams', 'abs'] },
      pose: t => { const hip = lerp2([196, 100], [186, 158], t), S = add(hip, mul(dir(-86), LEN.torso)), back = [128, 168];
        return { hip, torsoA: -86, ...legTo(hip, [250, STAND], [1, 0]), footA: 0, legZ: [12, 12, 13],
          farLeg: { ...legTo(hip, back, [0, 1]), footA: 176 }, ik: { target: [S[0] + 4, S[1] + 88], z: 30, pole: [-1, 0, .2] } }; },
      props: R => [floor(0, 0), ...benchProps(60, 150, 178), ...dumbbell(R.near.H, 'x'), ...dumbbell(R.far.H, 'x')],
      cues: { side: [['hip', [-28, 0]]] }, frames: ['Back foot laces-down on the bench', 'Dropped straight down, back knee near the floor']
    },
    situp: {
      name: 'Decline sit-up', muscles: { primary: ['abs', 'hipflex'], secondary: ['obliques'] },
      pose: t => { const hip = [236, 154], ta = lerp(162, 255, t);
        return { hip, torsoA: ta, thighA: -18.5, shinA: -18.5, footA: -104, legZ: [12, 12, 12], ik: crossed(hip, ta) }; },
      props: R => [floor(0, 0), slab([96, 210], [392, 114], 10, -14, 14), box([120, 214, -8], [128, 250, 8]), box([346, 136, -8], [354, 250, 8]), disc([360, 98, 0], 8, 'z', 40, 'pad'), disc([382, 92, 0], 8, 'z', 40, 'pad')],
      cues: { side: [['head', [0, 0]]] }, frames: ['Lying back on the decline, legs straight, feet hooked', 'Rolled up until the torso is upright']
    },
    backext: {
      name: 'Back extension', muscles: { primary: ['erector', 'glutes'], secondary: ['hams'] },
      pose: t => { const hip = [214, 108], ta = lerp(-45, 76, t);
        return { hip, torsoA: ta, thighA: 135, shinA: 135, footA: 45, legZ: [11, 11, 12], ik: crossed(hip, ta) }; },
      props: R => { const lu = dir(135), fr = dir(45), A = xy(R.near.A), hp = R.hip, at = (o, a, b) => add(o, add(mul(lu, a), mul(fr, b)));
        return [floor(0, 0), slab(at(hp, 4, 17), at(hp, 46, 17), -12, -18, 18), slab(at(A, 9, -10), at(A, 9, 40), 6, -22, 22, 'frame'),
          rod([...at(hp, 26, 30), 0], [hp[0] + 34, 250, 0], 6), rod([at(A, 14, 0)[0], 250, 0], [hp[0] + 60, 250, 0], 6)]; },
      cues: { side: [['head', [0, 0]]] }, frames: ['Body in one straight line', 'Lowered with a flat back']
    },
    // ---------------- Thursday: chest & arms ----------------
    lyingpress: {
      name: 'Lying chest press machine', muscles: { primary: ['pec'], secondary: ['fdelt', 'triceps'] },
      pose: t => ({ ...LIE, ik: { target: barPath(t), z: 50, pole: [1, 1, 1] } }),
      props: R => [...benchProps(), box([30, 60, -40], [60, 250, 40], 'frame'), ...[R.near, R.far].map(sd => rod(sd.H, [64, 80, sd.H[2]], 4)), ...[R.near, R.far].map(sd => handle(sd.H, 'x'))],
      cues: { side: [['H', [44, 0]]] }, frames: ['Handles level with your chest', 'Pressed up, arms straight']
    },
    flatdb: {
      name: 'Flat dumbbell press', muscles: { primary: ['pec', 'triceps'], secondary: ['fdelt'] },
      pose: t => ({ ...LIE, ik: { target: lerp2([158, 72], [176, 140], t), z: lerp(30, 56, t), pole: [1, 1, 1] } }),
      props: R => [...benchProps(), ...dumbbell(R.near.H), ...dumbbell(R.far.H)],
      cues: { side: [['H', [40, 0]]] }, frames: ['Dumbbells up over the chest', 'Lowered to the sides of the chest']
    },
    bbcurl: {
      name: 'Barbell curl', muscles: { primary: ['biceps'], secondary: ['forearm'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 13], upperA: lerp(91, 86, t), foreA: lerp(84, -62, t), armZ: [24, 24] }),
      props: R => [floor(0, 0), ...barbell(R.near.H, 80, 58, 30)],
      cues: { side: [['H', [16, 0]]] }, frames: ['Arms straight, shoulder-width grip', 'Curled up without swinging']
    },
    skull: {
      name: 'EZ-bar skull crusher', muscles: { primary: ['triceps'], secondary: ['forearm'] },
      pose: t => ({ ...LIE, upperA: -106, foreA: lerp(-106, -222, t), armZ: [18, 14] }),
      props: R => [...benchProps(), rod([R.near.H[0], R.near.H[1], -56], [R.near.H[0], R.near.H[1], 56], 3), ...[-1, 1].map(s => disc([R.near.H[0], R.near.H[1], s * 42], 20, 'z', 6))],
      cues: { side: [['H', [-14, -14]]] }, frames: ['Arms straight, angled slightly back toward the head', 'Upper arms still, bar lowered toward the hairline']
    },
    ropecurl: {
      name: 'Rope hammer curl', muscles: { primary: ['forearm'], secondary: ['biceps'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 13], upperA: lerp(90, 86, t), foreA: lerp(82, -64, t), armZ: [20, 12] }),
      props: R => { const c = [R.near.H[0] + 4, R.near.H[1] + 8, 0], pul = [282, 236, 0]; return [floor(0, 0), box([pul[0], -60, -8], [pul[0] + 22, 250, 8], 'frame', { fit: false }), cable(pul, c), rod(c, R.near.H, 2.4), rod(c, R.far.H, 2.4)]; },
      cues: { side: [['H', [16, 0]]] }, frames: ['Arms down, palms facing each other', 'Curled up, squeeze at the top']
    },
    sapush: {
      name: 'Single-arm cable pushdown', oneArm: true, muscles: { primary: ['triceps'], secondary: ['forearm'] },
      pose: t => ({ hip: [194, 97], torsoA: -82, ...legTo([194, 97], [200, STAND]), footA: 0, legZ: [12, 12, 13], upperA: 94, foreA: lerp(-14, 92, t), armZ: [20, 20],
        farArm: { upperA: 98, foreA: 70, armZ: [26, 22] } }),
      props: R => { const top = [268, -70, 20]; return [floor(0, 0), box([top[0], -96, 12], [top[0] + 24, 250, 28], 'frame', { fit: false }), cable(top, R.near.H), handle(R.near.H, 'x')]; },
      cues: { side: [['H', [18, 0]]] }, frames: ['Forearm up, elbow pinned to your side', 'Arm straightened fully']
    },
    // ---------------- Friday: back & shoulders ----------------
    cgpull: {
      name: 'Close-grip lat pulldown', muscles: { primary: ['lats'], secondary: ['biceps', 'upperback', 'traps'] },
      pose: t => { const hip = [190, 160], S = add(hip, mul(dir(-96), LEN.torso));
        return { hip, torsoA: -96, ...legTo(hip, [262, STAND], [.4, -1]), footA: 0, legZ: [14, 14, 15],
          ik: { target: lerp2([S[0] + 12, S[1] - 84], [S[0] + 24, S[1] + 8], t), z: 9, pole: [lerp(1, -.2, t), lerp(-.2, 1, t), .6] } }; },
      props: R => { const h = R.near.H; return [floor(0, 0), box([140, 170, -18], [222, 180, 18], 'pad'), box([176, 178, -8], [186, 250, 8]), box([238, 136, -40], [264, 148, 40], 'pad'), box([262, 140, -6], [302, 146, 6]),
        box([300, -150, -10], [320, 250, 10], 'frame', { fit: false }), box([178, -150, -6], [320, -138, 6], 'frame', { fit: false }), rod(R.near.H, R.far.H, 3.2), cable([h[0], h[1] - 4, 0], [186, -138, 0])]; },
      cues: { side: [['H', [24, 0]]] }, frames: ['Close grip, arms straight up', 'Handle pulled to the upper chest']
    },
    dbrow: {
      name: 'One-arm dumbbell row', oneArm: true, muscles: { primary: ['lats', 'upperback'], secondary: ['rdelt', 'biceps'] },
      pose: t => { const hip = [190, 106], S = add(hip, mul(dir(-4), LEN.torso));
        return { hip, torsoA: -4, ...legTo(hip, [176, STAND], [1, 0]), footA: 0, legZ: [16, 18, 19],
          farLeg: { thighA: 76, shinA: 180, footA: 172, legZ: [17, 17, 17] }, farArm: { ik: { target: [296, 180], z: 22, pole: [1, 0, 0] } },
          ik: { target: lerp2([S[0] + 2, S[1] + 87], [hip[0] + 44, hip[1] + 14], t), z: 26, pole: [lerp(0, -1, t), lerp(1, -1, t), .4] } }; },
      props: R => [floor(0, 0), box([86, 182, -42], [330, 194, -4], 'pad'), box([104, 192, -34], [111, 250, -12]), box([305, 192, -34], [312, 250, -12]), ...dumbbell(R.near.H, 'x')],
      cues: { side: [['H', [34, 0]]] }, frames: ['Knee and hand on the bench, arm hanging', 'Dumbbell pulled toward your hip']
    },
    straightarm: {
      name: 'Straight-arm pulldown', muscles: { primary: ['lats'], secondary: ['triceps', 'abs'] },
      pose: t => ({ hip: [186, 98], torsoA: -72, ...legTo([186, 98], [200, STAND]), footA: 0, legZ: [12, 12, 13], upperA: lerp(-36, 80, t), foreA: lerp(-30, 86, t), armZ: [20, 18] }),
      props: R => { const h = R.near.H, top = [R.S[0] + 130, -80, 0]; return [floor(0, 0), box([top[0] - 4, -110, -8], [top[0] + 16, 250, 8], 'frame', { fit: false }), rod([h[0], h[1], -30], [h[0], h[1], 30], 3), cable(top, [h[0], h[1], 0])]; },
      cues: { side: [['H', [16, 0]]] }, frames: ['Arms up and forward, nearly straight', 'Bar swept down to the thighs']
    },
    ohp: {
      name: 'Standing barbell overhead press', muscles: { primary: ['fdelt', 'sdelt'], secondary: ['triceps', 'pec', 'abs'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 13], ik: { target: lerp2([216, 16], [202, -78], t), z: 34, pole: [lerp(1, .2, t), 1, 1] } }),
      props: R => [floor(0, 0), ...barbell(R.near.H)],
      cues: { side: [['H', [36, 0]]] }, frames: ['Bar on the front of the shoulders', 'Pressed straight up over the middle of the feet']
    },
    cablelat: {
      name: 'Cable lateral raise', view: 'front', oneArm: true, muscles: { primary: ['sdelt'], secondary: ['traps'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 12], ik: sideArc(lerp(-22, 84, t), lerp(20, 10, t), -.2),
        farArm: { ik: { target: [214, 70], z: 52, pole: [0, 1, 1] } } }),
      props: R => [floor(0, 0), tower(210, -76, -60), cable([210, 236, -70], R.near.H), handle(R.near.H, 'x')],
      cues: { front: [['H', [0, 0]]], top: [] }, frames: ['Handle in front of the hips, cable crossing the body', 'Raised out to shoulder height']
    },
    revfly: {
      name: 'Reverse cable fly', view: 'back', views: ['side', 'back'], muscles: { primary: ['rdelt'], secondary: ['upperback'] },
      pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 12], ik: flatArc(lerp(-26, 96, t), 18, 84, [lerp(0, -.4, t), 1, lerp(1, .2, t)]) }),
      props: R => { const py = R.S[1] + 8; return [floor(0, 0), tower(300, 124, -90), tower(300, -124, -90), ...[R.near, R.far].map(sd => cable([300, py, -Math.sign(sd.H[2] || 1) * 124], sd.H))]; },
      cues: { side: [['H', [0, -16]]], back: [['H', [0, -16]]], top: [['H', [0, 0]]] }, frames: ['Arms crossed in front, holding the opposite cables', 'Arms pulled out wide and back']
    }
  };
  // the 5-day split, in order
  const DAYS = [
    { id: 'mon', title: 'Chest & arms', sub: 'Heavy day', ex: ['bench', 'incdb', 'cablepress', 'crossfly', 'ezcurl', 'ropepush'] },
    { id: 'tue', title: 'Back & shoulders', sub: 'Heavy day', ex: ['bbrow', 'cablerow', 'widepull', 'shouldermach', 'lateral', 'facepull'] },
    { id: 'wed', title: 'Legs, glutes & abs', sub: 'Lower body', ex: ['goblet', 'rdl', 'hipthrust', 'bss', 'situp', 'backext'] },
    { id: 'thu', title: 'Chest & arms', sub: 'Volume day', ex: ['lyingpress', 'flatdb', 'bbcurl', 'skull', 'ropecurl', 'sapush'] },
    { id: 'fri', title: 'Back & shoulders', sub: 'Volume day', ex: ['cgpull', 'dbrow', 'straightarm', 'ohp', 'cablelat', 'revfly'] }
  ];

  // ---------- compose ----------
  function scene(id, theme, t, opts) {
    const ex = EX[id], T = THEMES[theme], vname = opts.view === 'main' || !opts.view ? (ex.view || 'side') : opts.view, V = VIEWS[vname];
    const r = vname === 'side' ? sideView(ex, T, t, opts) : projView(ex, T, t, opts, V);
    const items = r.units.slice();
    let floorY = null;
    for (const it of ex.props ? ex.props(r.R) : []) {
      if (it.kind === 'floor') { floorY = vname === 'top' ? null : 250; continue; }
      const key = it.key !== undefined ? it.key : Math.min(...it.pts.map(V.d));
      items.push({ key, svg: propSVG(T, it, V), fit: it.fit !== false });
    }
    items.sort((a, b) => b.key - a.key);
    return { ex, T, V, vname, r, items, floorY };
  }
  const fitCache = {};
  function fit(id, vname, simple) {
    const k = id + vname + simple; if (fitCache[k]) return fitCache[k];
    let xs = [], ys = [];
    for (const t of [0, .5, 1]) {
      const s = scene(id, 'light', t, { view: vname });
      const body = s.items.filter(i => i.fit !== false && (!simple || !i.prop)).map(i => i.svg).join('');
      for (const m of body.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
      if (s.floorY !== null) ys.push(s.floorY);
    }
    const pad = simple ? 6 : 16;
    let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad, w = x1 - x0, h = y1 - y0;
    if (w / h > 4 / 3) { const nh = w * 3 / 4; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * 4 / 3; x0 -= (nw - w) / 2; w = nw; }
    if (vname !== 'top' && y0 + h < 256) y0 = 256 - h; // keep the floor near the bottom edge
    return (fitCache[k] = [f(x0), f(y0), f(w), f(h)]);
  }

  function render(id, theme, t = 1, opts = {}) {
    SIMPLE = !!opts.simple;
    const s = scene(id, theme, t, opts), { ex, T, V, vname, r } = s;
    const vb = fit(id, vname, false);
    const cueList = opts.cues && !SIMPLE ? ((ex.cues || {})[vname] || []) : [];
    const cue = cueList.map(([j, off]) => motionPath(ex, V, j, off, T.cue)).join('');
    const g = T.grad;
    const defs = `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${T.key === 'dark' ? 4.5 : 3.2}"/></filter>
      <radialGradient id="mgrad" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="${g[0]}"/><stop offset=".55" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></radialGradient>${r.defs.join('')}</defs>`;
    const bg = opts.transparent ? '' : `<rect x="${vb[0] - 80}" y="${vb[1] - 80}" width="${vb[2] + 160}" height="${vb[3] + 160}" fill="${T.bg}"/>`;
    const floorSvg = s.floorY !== null ? `<rect x="${vb[0] - 80}" y="${s.floorY}" width="${vb[2] + 160}" height="1.5" fill="${T.line}" opacity=".3"/>` : '';
    const ns = 'g' + (++uid) + '_';
    const label = `${ex.name}, ${vname === 'top' ? 'top-down' : vname} view`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" role="img" aria-label="${label}">${bg}${defs}${floorSvg}${s.items.map(i => i.svg).join('')}${cue}</svg>`;
    return svg.replace(/id="([^"]+)"/g, (m, k) => `id="${ns}${k}"`).replace(/url\(#([^)]+)\)/g, (m, k) => `url(#${ns}${k})`);
  }
  // the teaching views for the start and end frames
  const framesOf = id => { const ex = EX[id], v = ex.views || [ex.view || 'side', ex.view || 'side']; return [{ t: 0, view: v[0] }, { t: 1, view: v[1] }]; };
  const api = { render, framesOf, EX, DAYS, THEMES, MUSCLES };
  if (typeof module !== 'undefined') module.exports = api; else root.GFDArt = api;
})(this);
