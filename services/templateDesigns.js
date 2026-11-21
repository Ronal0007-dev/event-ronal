'use strict';
/**
 * Original, recolourable card designs.
 *
 * Every design is drawn in code as an SVG background (1080 x 1500) from a single accent colour,
 * so an organiser can pick ANY colour and the whole card re-tints: paper, ink, ornaments.
 * Decoration stays in the margins and the top band; the centre column is kept clear for the
 * guest details and the QR code that cardGeneratorService draws on top.
 */

const W = 1080;
const H = 1500;

/* ----------------------------- colour helpers ----------------------------- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt((m ? m[1] : 'e4572e'), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function palette(accent, dark) {
  const [h, s0, l0] = hexToHsl(accent);
  const s = clamp(s0, 0.28, 0.92);
  if (!dark) {
    const l = clamp(l0, 0.38, 0.62);
    return {
      dark: false,
      bg: hslToHex(h, clamp(s * 0.55, 0.14, 0.5), 0.955),
      text: hslToHex(h, clamp(s * 0.6, 0.15, 0.55), 0.16),
      mid: hslToHex(h, s, l),
      deep: hslToHex(h, s, 0.3),
      soft: hslToHex(h, s, 0.87),
      alt1: hslToHex(h + 18, s, l),
      alt2: hslToHex(h - 18, s, l),
    };
  }
  const bright = clamp(l0, 0.58, 0.72);
  return {
    dark: true,
    bg: hslToHex(h, clamp(s * 0.6, 0.15, 0.5), 0.12),
    text: hslToHex(h, clamp(s * 0.5, 0.1, 0.4), 0.93),
    mid: hslToHex(h, s, bright),
    deep: hslToHex(h, s, 0.78),
    soft: hslToHex(h, clamp(s * 0.6, 0.15, 0.6), 0.25),
    alt1: hslToHex(h + 18, s, bright),
    alt2: hslToHex(h - 18, s, bright),
  };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ shape helpers ------------------------------ */

const f = (n) => Math.round(n * 10) / 10;
const inCentre = (x, y, pad = 0) => x > 100 - pad && x < 980 + pad && y > 250 - pad && y < 1430 + pad;

const star4 = (x, y, r, fill, op = 1) =>
  `<path d="M${f(x)} ${f(y - r)}Q${f(x + r * 0.16)} ${f(y - r * 0.16)} ${f(x + r)} ${f(y)}Q${f(x + r * 0.16)} ${f(y + r * 0.16)} ${f(x)} ${f(y + r)}Q${f(x - r * 0.16)} ${f(y + r * 0.16)} ${f(x - r)} ${f(y)}Q${f(x - r * 0.16)} ${f(y - r * 0.16)} ${f(x)} ${f(y - r)}Z" fill="${fill}" opacity="${op}"/>`;

const heart = (x, y, s, { fill = 'none', stroke = 'none', sw = 4, rot = 0, op = 1 } = {}) =>
  `<path transform="translate(${f(x)} ${f(y)}) rotate(${rot})" d="M0 ${f(0.9 * s)}C${f(-1.4 * s)} ${f(-0.2 * s)} ${f(-0.7 * s)} ${f(-1 * s)} 0 ${f(-0.35 * s)}C${f(0.7 * s)} ${f(-1 * s)} ${f(1.4 * s)} ${f(-0.2 * s)} 0 ${f(0.9 * s)}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" opacity="${op}"/>`;

const flower = (x, y, r, petal, centre) => {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += `<ellipse cx="${f(x)}" cy="${f(y - r * 0.6)}" rx="${f(r * 0.34)}" ry="${f(r * 0.6)}" transform="rotate(${i * 60} ${f(x)} ${f(y)})" fill="${petal}"/>`;
  }
  return `${out}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.24)}" fill="${centre}"/>`;
};

const leaf = (x, y, len, rot, fill, op = 1) =>
  `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(len * 0.28)}" ry="${f(len * 0.5)}" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="${fill}" opacity="${op}"/>`;

const cloud = (x, y, k, fill) =>
  `<g fill="${fill}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(44 * k)}"/><circle cx="${f(x + 62 * k)}" cy="${f(y - 20 * k)}" r="${f(58 * k)}"/><circle cx="${f(x + 130 * k)}" cy="${f(y)}" r="${f(46 * k)}"/><rect x="${f(x)}" y="${f(y)}" width="${f(130 * k)}" height="${f(46 * k)}"/></g>`;

/* --------------------------------- motifs --------------------------------- */

const motifs = {
  confetti(P) {
    const r = rng(7);
    const cols = [P.mid, P.alt1, P.alt2, P.soft, P.deep];
    let out = `<circle cx="70" cy="90" r="190" fill="${P.soft}" opacity="0.7"/><circle cx="1030" cy="1440" r="210" fill="${P.soft}" opacity="0.7"/>`;
    for (let i = 0; i < 90; i += 1) {
      const x = r() * W;
      const y = r() * H;
      if (inCentre(x, y, 10)) continue;
      const c = cols[Math.floor(r() * cols.length)];
      const k = r();
      const rot = Math.floor(r() * 180);
      if (k < 0.4) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(6 + r() * 11)}" fill="${c}"/>`;
      else if (k < 0.75) out += `<rect x="${f(x)}" y="${f(y)}" width="${f(8 + r() * 6)}" height="${f(24 + r() * 14)}" rx="3" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="${c}"/>`;
      else out += `<path d="M${f(x)} ${f(y)}l${f(18)} ${f(30)}h${f(-36)}z" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="${c}"/>`;
    }
    return out;
  },

  balloons(P) {
    const cluster = (cx, cy, items) =>
      items
        .map(([dx, dy, rx, col, tx]) => {
          const x = cx + dx;
          const y = cy + dy;
          return `<path d="M${f(x)} ${f(y + rx * 1.3)}C${f(x + tx)} ${f(y + 200)} ${f(x - tx)} ${f(y + 320)} ${f(x + tx * 0.4)} ${f(y + 420)}" stroke="${P.deep}" stroke-width="2.5" fill="none" opacity="0.6"/>
          <ellipse cx="${f(x)}" cy="${f(y)}" rx="${rx}" ry="${f(rx * 1.22)}" fill="${col}"/>
          <ellipse cx="${f(x - rx * 0.35)}" cy="${f(y - rx * 0.45)}" rx="${f(rx * 0.16)}" ry="${f(rx * 0.3)}" fill="#fff" opacity="0.35" transform="rotate(25 ${f(x - rx * 0.35)} ${f(y - rx * 0.45)})"/>
          <path d="M${f(x - 9)} ${f(y + rx * 1.22 + 10)}l9 -12 9 12z" fill="${col}"/>`;
        })
        .join('');
    return (
      cluster(930, 120, [[0, 0, 62, P.mid, 14], [-92, 38, 52, P.alt1, -18], [78, 70, 48, P.alt2, 22]]) +
      cluster(120, 1180, [[0, 0, 54, P.alt2, 12], [78, 52, 46, P.mid, -14]]) +
      `<circle cx="1000" cy="1400" r="120" fill="${P.soft}" opacity="0.6"/>`
    );
  },

  florals(P, o = {}) {
    let out = '';
    // climbing vine along the left edge
    let d = 'M50 1500';
    for (let y = 1480; y >= 620; y -= 20) d += `L${f(52 + 24 * Math.sin(y / 85))} ${y}`;
    out += `<path d="${d}" stroke="${P.deep}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.75"/>`;
    let side = 1;
    for (let y = 1440; y >= 660; y -= 62) {
      const x = 52 + 24 * Math.sin(y / 85);
      out += leaf(x + side * 26, y, 62, side * 55, y % 124 === 0 ? P.mid : P.alt1, 0.9);
      side *= -1;
    }
    out += flower(70, 640, 30, P.soft, P.mid);
    out += flower(88, 1400, 36, P.soft, P.mid);
    // top-right spray
    out += `<path d="M1090 40C980 90 930 150 900 250" stroke="${P.deep}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.75"/>`;
    out += leaf(1000, 100, 70, 110, P.alt1, 0.9) + leaf(950, 160, 66, 130, P.mid, 0.9) + leaf(920, 220, 58, 150, P.alt1, 0.9);
    out += flower(1000, 190, 52, P.soft, P.mid) + flower(900, 110, 38, P.mid, P.bg) + flower(1040, 300, 30, P.soft, P.mid);
    return o.flip ? `<g transform="translate(${W} 0) scale(-1 1)">${out}</g>` : out;
  },

  arch(P) {
    return `
      <path d="M60 1445V560A480 480 0 0 1 1020 560V1445Z" fill="#ffffff" opacity="0.6"/>
      <path d="M60 1445V560A480 480 0 0 1 1020 560V1445" fill="none" stroke="${P.mid}" stroke-width="5"/>
      <path d="M82 1445V560A458 458 0 0 1 998 560V1445" fill="none" stroke="${P.soft}" stroke-width="3"/>
      ${star4(40, 60, 20, P.mid)}${star4(1040, 70, 16, P.alt1)}${star4(540, 56, 14, P.mid)}
      <circle cx="40" cy="260" r="6" fill="${P.soft}"/><circle cx="1038" cy="420" r="5" fill="${P.mid}"/>`;
  },

  deco(P) {
    const corner = (x, y, sx, sy) =>
      `<path transform="translate(${x} ${y}) scale(${sx} ${sy})" d="M0 120V30L30 0H120" fill="none" stroke="${P.mid}" stroke-width="3"/>
       <path transform="translate(${x} ${y}) scale(${sx} ${sy})" d="M14 120V40L40 14H120" fill="none" stroke="${P.mid}" stroke-width="1.5" opacity="0.7"/>`;
    return `
      <rect x="40" y="40" width="1000" height="1420" fill="none" stroke="${P.mid}" stroke-width="1.5" opacity="0.6"/>
      ${corner(40, 40, 1, 1)}${corner(1040, 40, -1, 1)}${corner(40, 1460, 1, -1)}${corner(1040, 1460, -1, -1)}
      <path d="M170 170H470M610 170H910" stroke="${P.mid}" stroke-width="2"/>
      <path d="M540 146l24 24-24 24-24-24z" fill="${P.mid}"/>
      <path d="M492 170l10 10 10-10-10-10zM568 170l10 10 10-10-10-10z" fill="${P.alt1}"/>
      <path d="M170 176H470M610 176H910" stroke="${P.mid}" stroke-width="0.8" opacity="0.7"/>
      <path d="M440 1455h200" stroke="${P.mid}" stroke-width="2"/>`;
  },

  hearts(P) {
    return (
      `<circle cx="1000" cy="130" r="170" fill="${P.soft}" opacity="0.75"/>` +
      heart(930, 150, 74, { stroke: P.mid, sw: 5, rot: -10 }) +
      heart(1000, 210, 50, { fill: P.mid, rot: 12 }) +
      heart(120, 120, 24, { fill: P.alt1, rot: -18 }) +
      heart(200, 190, 14, { fill: P.mid, rot: 10 }) +
      heart(110, 1370, 46, { fill: P.alt1, rot: -14, op: 0.9 }) +
      heart(60, 1290, 24, { stroke: P.mid, sw: 4, rot: 8 }) +
      heart(990, 1400, 32, { fill: P.mid, rot: 14, op: 0.9 }) +
      heart(1030, 1320, 16, { fill: P.soft })
    );
  },

  rings(P) {
    const bracket = (x, y, sx, sy) => `<path transform="translate(${x} ${y}) scale(${sx} ${sy})" d="M0 110V0H110" fill="none" stroke="${P.mid}" stroke-width="4"/>`;
    return `
      ${bracket(56, 56, 1, 1)}${bracket(1024, 56, -1, 1)}${bracket(56, 1444, 1, -1)}${bracket(1024, 1444, -1, -1)}
      <circle cx="502" cy="150" r="54" fill="none" stroke="${P.mid}" stroke-width="8"/>
      <circle cx="578" cy="150" r="54" fill="none" stroke="${P.deep}" stroke-width="8"/>
      <path d="M502 96a54 54 0 0 1 38 15" stroke="${P.mid}" stroke-width="8" fill="none"/>
      <path d="M540 82l11 14-11 14-11-14z" fill="${P.alt1}"/>
      <path d="M170 150H380M700 150H910" stroke="${P.soft}" stroke-width="3"/>
      ${star4(940, 1370, 26, P.mid)}${star4(130, 1300, 16, P.alt1)}`;
  },

  sparkle(P) {
    const r = rng(21);
    const cols = [P.mid, P.alt1, P.soft, P.deep];
    let out = '';
    for (let i = 0; i < 38; i += 1) {
      const x = r() * W;
      const y = r() * H;
      if (inCentre(x, y, 6)) continue;
      const c = cols[Math.floor(r() * cols.length)];
      if (r() < 0.7) out += star4(x, y, 12 + r() * 34, c);
      else out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3 + r() * 5)}" fill="${c}"/>`;
    }
    return out + `<circle cx="960" cy="110" r="140" fill="${P.soft}" opacity="0.6"/>`;
  },

  bunting(P) {
    const cols = [P.mid, P.alt1, P.soft, P.alt2, P.deep];
    let out = `<path d="M-20 56Q540 176 1100 56" stroke="${P.deep}" stroke-width="4" fill="none"/>`;
    for (let i = 0; i < 12; i += 1) {
      const t = (i + 0.5) / 12;
      const x = -20 + 1120 * t;
      const y = (1 - t) ** 2 * 56 + 2 * (1 - t) * t * 176 + t ** 2 * 56;
      const slope = (2 * (1 - t) * (176 - 56) + 2 * t * (56 - 176)) / 1120;
      const rot = (Math.atan(slope) * 180) / Math.PI;
      out += `<path transform="rotate(${f(rot)} ${f(x)} ${f(y)})" d="M${f(x - 38)} ${f(y)}h76l-38 84z" fill="${cols[i % cols.length]}"/>`;
    }
    for (let i = 0; i < 9; i += 1) out += `<circle cx="${70 + i * 117}" cy="1456" r="${i % 2 ? 6 : 10}" fill="${cols[(i + 2) % cols.length]}"/>`;
    return out;
  },

  moonstars(P) {
    return `
      <circle cx="170" cy="150" r="76" fill="${P.mid}"/><circle cx="206" cy="128" r="66" fill="${P.bg}"/>
      ${star4(330, 90, 18, P.alt1)}${star4(900, 120, 30, P.mid)}${star4(990, 230, 16, P.alt1)}${star4(70, 300, 14, P.mid)}
      <circle cx="270" cy="210" r="5" fill="${P.soft}"/><circle cx="800" cy="60" r="5" fill="${P.soft}"/>
      ${cloud(-40, 1440, 1.1, P.soft)}${cloud(850, 1455, 1, P.soft)}`;
  },

  scallop(P) {
    let out = '';
    for (let row = 0; row < 2; row += 1) {
      const y = row === 0 ? 4 : H - 4;
      for (let i = 0; i < 12; i += 1) {
        const x = 45 + i * 90;
        out += `<circle cx="${x}" cy="${y}" r="62" fill="${P.mid}"/><circle cx="${x}" cy="${y}" r="46" fill="${P.bg}"/><circle cx="${x}" cy="${y}" r="30" fill="${P.soft}"/>`;
      }
    }
    return out + `<path d="M38 180V1320M1042 180V1320" stroke="${P.soft}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`;
  },

  sunset(P) {
    const cols = [P.soft, P.alt1, P.mid, P.deep];
    let out = '';
    cols.forEach((c, i) => {
      out += `<circle cx="540" cy="-6" r="${230 - i * 52}" fill="${c}"/>`;
    });
    out += `<path d="M110 232H340M740 232H970" stroke="${P.mid}" stroke-width="3"/><path d="M180 248H300M780 248H900" stroke="${P.soft}" stroke-width="3"/>`;
    out += `<circle cx="70" cy="1380" r="140" fill="${P.soft}" opacity="0.7"/><circle cx="1020" cy="1230" r="80" fill="${P.soft}" opacity="0.6"/>`;
    return out;
  },

  waves(P, o = {}) {
    const wave = (y, amp, fill, up) =>
      `<path d="M0 ${y}Q90 ${y - amp} 180 ${y}T360 ${y}T540 ${y}T720 ${y}T900 ${y}T1080 ${y}V${up ? 0 : H}H0Z" fill="${fill}"/>`;
    const bottom = wave(1442, 16, P.soft) + wave(1462, 14, P.alt1) + wave(1482, 12, P.mid);
    const top = wave(58, -14, P.soft, true) + wave(38, -12, P.alt1, true) + wave(18, -10, P.mid, true);
    return o.flip ? bottom + top + `<circle cx="990" cy="180" r="70" fill="${P.soft}" opacity="0.7"/>` : bottom + top;
  },

  cap(P) {
    return `
      <path d="M440 150V204Q540 244 640 204V150Z" fill="${P.deep}"/>
      <path d="M540 56L720 118 540 182 360 118Z" fill="${P.text}"/>
      <path d="M540 118L706 124V214" stroke="${P.mid}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="696" y="206" width="20" height="46" rx="6" fill="${P.mid}"/>
      ${star4(200, 120, 26, P.mid)}${star4(880, 90, 18, P.alt1)}${star4(980, 210, 12, P.mid)}${star4(110, 230, 12, P.alt1)}
      <circle cx="60" cy="1400" r="120" fill="${P.soft}" opacity="0.7"/><circle cx="1030" cy="1330" r="90" fill="${P.soft}" opacity="0.7"/>`;
  },

  plane(P) {
    return `
      <path d="M70 250C250 60 520 300 800 180" stroke="${P.deep}" stroke-width="4" fill="none" stroke-dasharray="3 16" stroke-linecap="round"/>
      <g transform="translate(830 150) rotate(-14)">
        <path d="M0 0L170 -50L70 48Z" fill="${P.mid}"/>
        <path d="M0 0L70 48L58 12Z" fill="${P.deep}"/>
        <path d="M170 -50L58 12" stroke="${P.bg}" stroke-width="3" opacity="0.7"/>
      </g>
      ${cloud(60, 140, 0.8, P.soft)}${cloud(900, 280, 0.55, P.soft)}${cloud(-30, 1420, 1, P.soft)}${cloud(860, 1450, 0.9, P.soft)}`;
  },

  cross(P) {
    let rays = '';
    for (let a = 190; a <= 350; a += 16) {
      const rad = (a * Math.PI) / 180;
      rays += `<path d="M${f(540 + Math.cos(rad) * 104)} ${f(125 + Math.sin(rad) * 104)}L${f(540 + Math.cos(rad) * 150)} ${f(125 + Math.sin(rad) * 150)}" stroke="${P.soft}" stroke-width="5" stroke-linecap="round"/>`;
    }
    return `${rays}
      <rect x="520" y="48" width="40" height="160" rx="4" fill="${P.mid}"/><rect x="474" y="98" width="132" height="40" rx="4" fill="${P.mid}"/>
      ${star4(150, 150, 20, P.alt1)}${star4(930, 170, 24, P.mid)}${star4(990, 60, 12, P.alt1)}
      <circle cx="60" cy="1390" r="130" fill="${P.soft}" opacity="0.7"/><circle cx="1040" cy="1400" r="100" fill="${P.soft}" opacity="0.7"/>`;
  },
};

/* --------------------------------- catalogue -------------------------------- */

const DESIGNS = [
  { key: 'birthday-confetti', category: 'birthday', name: 'Confetti', motif: 'confetti' },
  { key: 'birthday-balloons', category: 'birthday', name: 'Balloon Bunch', motif: 'balloons' },
  { key: 'wedding-arch', category: 'wedding', name: 'The Arch', motif: 'arch' },
  { key: 'wedding-vine', category: 'wedding', name: 'Garden Vine', motif: 'florals' },
  { key: 'anniversary-deco', category: 'anniversary', name: 'Art Deco Night', motif: 'deco', dark: true },
  { key: 'anniversary-hearts', category: 'anniversary', name: 'Hearts & Lines', motif: 'hearts' },
  { key: 'engagement-rings', category: 'engagement', name: 'Two Rings', motif: 'rings' },
  { key: 'engagement-sparkle', category: 'engagement', name: 'Sparkle', motif: 'sparkle' },
  { key: 'baby-shower-bunting', category: 'baby-shower', name: 'Bunting', motif: 'bunting' },
  { key: 'baby-shower-moon', category: 'baby-shower', name: 'Moon & Stars', motif: 'moonstars' },
  { key: 'bridal-shower-scallop', category: 'bridal-shower', name: 'Scallop', motif: 'scallop' },
  { key: 'bridal-shower-bloom', category: 'bridal-shower', name: 'Blush Bloom', motif: 'florals', opts: { flip: true } },
  { key: 'retirement-farewell-sunset', category: 'retirement-farewell', name: 'Sunset', motif: 'sunset' },
  { key: 'retirement-farewell-waves', category: 'retirement-farewell', name: 'Calm Waters', motif: 'waves' },
  { key: 'graduation-cap', category: 'graduation', name: 'Mortarboard', motif: 'cap' },
  { key: 'graduation-night', category: 'graduation', name: 'Night Sparkle', motif: 'sparkle', dark: true },
  { key: 'send-off-plane', category: 'send-off', name: 'Paper Plane', motif: 'plane' },
  { key: 'send-off-waves', category: 'send-off', name: 'Open Water', motif: 'waves', opts: { flip: true } },
  { key: 'confirmation-light', category: 'confirmation', name: 'Morning Light', motif: 'cross' },
  { key: 'confirmation-evening', category: 'confirmation', name: 'Evening Light', motif: 'cross', dark: true },
];

const BY_KEY = Object.fromEntries(DESIGNS.map((d) => [d.key, d]));

/** Starting colour offered for each occasion (the organiser can change it). */
const CATEGORY_COLORS = {
  birthday: '#e4572e',
  wedding: '#b4455f',
  anniversary: '#7d1f3a',
  engagement: '#c46a3a',
  'baby-shower': '#4f9a89',
  'bridal-shower': '#d4688a',
  'retirement-farewell': '#d9801f',
  graduation: '#1f6f50',
  'send-off': '#178c8c',
  confirmation: '#a0782a',
};

const SWATCHES = ['#D95D39', '#E09F3E', '#B08936', '#7A8B45', '#52734D', '#245C45', '#3F7F78', '#A84A3F', '#B45B4B', '#7B3F3F', '#8A6240', '#343A32'];

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Faux text blocks and a QR box so the picker thumbnails show where things will land. */
function placeholders(P) {
  const bar = (x, y, w, h, op = 0.28) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${P.text}" opacity="${op}"/>`;
  return `${bar(420, 292, 240, 10)}${bar(250, 356, 580, 24, 0.4)}${bar(340, 410, 400, 24, 0.4)}
    ${bar(400, 585, 280, 8)}${bar(250, 650, 580, 40, 0.4)}
    <rect x="330" y="736" width="420" height="58" rx="29" fill="none" stroke="${P.text}" stroke-width="3" opacity="0.35"/>
    ${bar(310, 860, 460, 20, 0.35)}${bar(450, 912, 180, 14)}${bar(360, 962, 360, 14)}
    <rect x="370" y="1020" width="340" height="340" rx="22" fill="#fff"/>
    <rect x="396" y="1046" width="288" height="288" rx="6" fill="none" stroke="${P.text}" stroke-width="3" opacity="0.35"/>
    <rect x="410" y="1060" width="70" height="70" fill="${P.text}" opacity="0.35"/><rect x="600" y="1060" width="70" height="70" fill="${P.text}" opacity="0.35"/><rect x="410" y="1250" width="70" height="70" fill="${P.text}" opacity="0.35"/>
    <rect x="520" y="1180" width="60" height="60" fill="${P.text}" opacity="0.2"/>`;
}

/**
 * @returns {{ svg: string, textColor: string, dark: boolean }}
 */
function renderDesign(key, accent, { preview = false } = {}) {
  const design = BY_KEY[key] || BY_KEY['birthday-confetti'];
  const color = HEX_RE.test(accent || '') ? accent : CATEGORY_COLORS[design.category];
  const P = palette(color, Boolean(design.dark));
  const art = motifs[design.motif](P, design.opts || {});
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${P.bg}"/>
    ${art}
    ${preview ? placeholders(P) : ''}
  </svg>`;
  return { svg, textColor: P.text, dark: P.dark };
}

module.exports = { DESIGNS, BY_KEY, CATEGORY_COLORS, SWATCHES, HEX_RE, renderDesign, hexToHsl, hslToHex };
