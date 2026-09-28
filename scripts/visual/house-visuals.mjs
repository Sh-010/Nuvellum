#!/usr/bin/env node
// Nuvellum house visuals: the restrained section fallback used when a story has no strong
// real photograph and no generated illustration passes the style gate. Engraved-print
// register shared with the Opinion & Ideas illustrations: ivory paper, ink hairlines, one
// burgundy accent, a quiet section label. Motifs sit in the centre so every crop holds.
// Writes public/uploads/house/<key>.svg deterministically: node scripts/visual/house-visuals.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(root, 'public', 'uploads', 'house');
const W = 1600, H = 900, CX = 800, CY = 430;
const PAPER = '#efe8db', INK = '#2a221c', WINE = '#661227', HAIR = 'rgba(42,34,28,.3)', FAINT = 'rgba(42,34,28,.16)';
const f = n => Number(n.toFixed(1));

export const HOUSE_SECTIONS = {
  world: 'World', business: 'Business', technology: 'Technology', science: 'Science', crime: 'Crime',
  sports: 'Sports', culture: 'Culture', 'film-tv': 'Film & TV', anime: 'Anime', gaming: 'Gaming'
};

function frame(label, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + `<defs><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .36 0 0 0 0 .27 0 0 0 0 .17 0 0 0 .06 0"/></filter></defs>`
    + `<rect width="${W}" height="${H}" fill="${PAPER}"/>${inner}`
    + `<line x1="64" y1="${H - 88}" x2="${W - 64}" y2="${H - 88}" stroke="${HAIR}" stroke-width="1"/>`
    + `<text x="64" y="${H - 52}" font-family="Georgia,serif" font-size="22" letter-spacing="6" fill="${WINE}">✦ NUVELLUM · ${label.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`
    + `<rect width="${W}" height="${H}" filter="url(#g)"/></svg>`;
}

const hatch = (x0, x1, y0, y1, step, clip = '') => {
  let s = ''; for (let x = x0; x <= x1; x += step) s += `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y1)}" stroke="${HAIR}" stroke-width="1"${clip}/>`; return s;
};

const MOTIFS = {
  // Engraved globe: meridians, parallels and one burgundy meridian.
  world() {
    const r = 250; let s = `<clipPath id="c"><circle cx="${CX}" cy="${CY}" r="${r}"/></clipPath>`;
    s += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    for (let k = 1; k <= 5; k++) s += `<ellipse cx="${CX}" cy="${CY}" rx="${f(r * k / 6)}" ry="${r}" fill="none" stroke="${k === 3 ? WINE : HAIR}" stroke-width="${k === 3 ? 2 : 1.1}"/>`;
    for (let k = -5; k <= 5; k++) { const y = CY + k * r / 6; const half = Math.sqrt(r * r - (y - CY) ** 2); s += `<line x1="${f(CX - half)}" y1="${f(y)}" x2="${f(CX + half)}" y2="${f(y)}" stroke="${HAIR}" stroke-width="1"/>`; }
    s += `<ellipse cx="${CX}" cy="${CY}" rx="${r + 46}" ry="46" fill="none" stroke="${FAINT}" stroke-width="1"/>`;
    return s;
  },
  // Ledger columns rising from a baseline; one column in burgundy.
  business() {
    let s = ''; const base = CY + 230, n = 7, w = 70, gap = 34, x0 = CX - (n * w + (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
      const h = 120 + i * 52 + (i % 2 ? 18 : 0), x = x0 + i * (w + gap);
      s += `<rect x="${f(x)}" y="${f(base - h)}" width="${w}" height="${h}" fill="${i === 5 ? WINE : 'none'}" stroke="${INK}" stroke-width="1.8"/>`;
      if (i !== 5) s += hatch(x + 10, x + w - 10, base - h + 8, base - 8, 12);
    }
    s += `<line x1="${f(x0 - 40)}" y1="${base}" x2="${f(x0 + n * (w + gap) + 6)}" y2="${base}" stroke="${INK}" stroke-width="2.4"/>`;
    return s;
  },
  // Camera aperture / lens: precise, quiet, not circuitry.
  technology() {
    let s = ''; const r = 240;
    for (const k of [1, 0.86, 0.72]) s += `<circle cx="${CX}" cy="${CY}" r="${f(r * k)}" fill="none" stroke="${k === 1 ? INK : HAIR}" stroke-width="${k === 1 ? 2.2 : 1.1}"/>`;
    const blades = 8, ir = 70;
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2, b = a + Math.PI / blades * 1.6;
      const p1 = [CX + Math.cos(a) * r * 0.72, CY + Math.sin(a) * r * 0.72], p2 = [CX + Math.cos(b) * ir, CY + Math.sin(b) * ir];
      s += `<line x1="${f(p1[0])}" y1="${f(p1[1])}" x2="${f(p2[0])}" y2="${f(p2[1])}" stroke="${INK}" stroke-width="1.5"/>`;
    }
    s += `<circle cx="${CX}" cy="${CY}" r="${ir}" fill="none" stroke="${INK}" stroke-width="1.8"/><circle cx="${CX}" cy="${CY}" r="16" fill="${WINE}"/>`;
    return s;
  },
  // Armillary sphere with a burgundy sun.
  science() {
    let s = ''; const r = 230;
    s += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    for (const [rx, rot, c] of [[r, 0, HAIR], [r, 60, HAIR], [r, -60, HAIR]]) s += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${f(r * 0.28)}" transform="rotate(${rot} ${CX} ${CY})" fill="none" stroke="${c}" stroke-width="1.3"/>`;
    s += `<ellipse cx="${CX}" cy="${CY}" rx="${r}" ry="${f(r * 0.4)}" transform="rotate(-23 ${CX} ${CY})" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="34" fill="${WINE}"/><line x1="${CX}" y1="${CY - r - 40}" x2="${CX}" y2="${CY + r + 40}" stroke="${INK}" stroke-width="1.4"/>`;
    return s;
  },
  // Courthouse portico.
  crime() {
    let s = ''; const w = 560, x0 = CX - w / 2, top = CY - 170, base = CY + 210;
    s += `<path d="M${x0 - 30} ${top} L${CX} ${top - 110} L${x0 + w + 30} ${top} Z" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    s += `<rect x="${x0 - 30}" y="${top}" width="${w + 60}" height="22" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
    for (let i = 0; i < 6; i++) { const x = x0 + 20 + i * ((w - 40) / 5); s += `<rect x="${f(x - 22)}" y="${top + 22}" width="44" height="${base - top - 22}" fill="none" stroke="${INK}" stroke-width="1.6"/>` + hatch(x - 14, x + 14, top + 30, base - 8, 7); }
    for (let k = 0; k < 3; k++) s += `<rect x="${x0 - 30 - k * 18}" y="${base + k * 16}" width="${w + 60 + k * 36}" height="16" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
    s += `<circle cx="${CX}" cy="${top - 44}" r="14" fill="${WINE}"/>`;
    return s;
  },
  // Stadium track lanes, one burgundy lane.
  sports() {
    let s = '';
    for (let k = 0; k < 8; k++) s += `<rect x="${CX - 360 - k * 16}" y="${CY - 150 - k * 16}" width="${720 + k * 32}" height="${300 + k * 32}" rx="${150 + k * 16}" fill="none" stroke="${k === 4 ? WINE : k === 0 || k === 7 ? INK : HAIR}" stroke-width="${k === 4 ? 2.2 : k === 0 || k === 7 ? 1.8 : 1.1}"/>`;
    s += `<line x1="${CX}" y1="${CY - 262}" x2="${CX}" y2="${CY - 150}" stroke="${INK}" stroke-width="2"/>`;
    s += hatch(CX - 300, CX + 300, CY - 110, CY + 110, 20);
    return s;
  },
  // Proscenium with drawn curtain.
  culture() {
    let s = ''; const w = 620, h = 440, x0 = CX - w / 2, y0 = CY - h / 2 + 10;
    s += `<path d="M${x0} ${y0 + h} V${y0 + 90} Q${CX} ${y0 - 60} ${x0 + w} ${y0 + 90} V${y0 + h}" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
    s += `<path d="M${x0 - 34} ${y0 + h} V${y0 + 80} Q${CX} ${y0 - 100} ${x0 + w + 34} ${y0 + 80} V${y0 + h}" fill="none" stroke="${HAIR}" stroke-width="1.2"/>`;
    for (let i = 0; i < 9; i++) { const x = x0 + 14 + i * 16; s += `<path d="M${x} ${y0 + 110 - i * 4} Q${x + 30} ${y0 + h / 2} ${x + 8 + i * 5} ${y0 + h}" fill="none" stroke="${i === 4 ? WINE : HAIR}" stroke-width="${i === 4 ? 2 : 1.1}"/>`; s += `<path d="M${x0 + w - 14 - i * 16} ${y0 + 110 - i * 4} Q${x0 + w - 44 - i * 16} ${y0 + h / 2} ${x0 + w - 22 - i * 21} ${y0 + h}" fill="none" stroke="${HAIR}" stroke-width="1.1"/>`; }
    s += `<line x1="${x0 - 60}" y1="${y0 + h}" x2="${x0 + w + 60}" y2="${y0 + h}" stroke="${INK}" stroke-width="2.4"/>`;
    return s;
  },
  // Film strip: three frames of a hairline horizon, burgundy centre frame.
  'film-tv'() {
    let s = ''; const w = 1000, h = 300, x0 = CX - w / 2, y0 = CY - h / 2;
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    for (let i = 0; i < 25; i++) for (const y of [y0 + 14, y0 + h - 34]) s += `<rect x="${x0 + 14 + i * 39.4}" y="${y}" width="20" height="20" rx="3" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
    for (let i = 0; i < 3; i++) {
      const fx = x0 + 30 + i * 320, fy = y0 + 56, fw = 300, fh = h - 112;
      s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="${i === 1 ? WINE : INK}" stroke-width="${i === 1 ? 2.4 : 1.4}"/>`;
      s += `<path d="M${fx} ${fy + fh * 0.72} L${fx + fw * 0.35} ${fy + fh * (0.45 + i * 0.05)} L${fx + fw * 0.6} ${fy + fh * 0.62} L${fx + fw} ${fy + fh * 0.4}" fill="none" stroke="${HAIR}" stroke-width="1.2"/>`;
    }
    return s;
  },
  // Print-style waves beneath a burgundy sun.
  anime() {
    let s = `<circle cx="${CX + 150}" cy="${CY - 90}" r="120" fill="${WINE}"/>`;
    for (let row = 0; row < 5; row++) for (let i = -1; i < 9; i++) {
      const x = CX - 480 + i * 120 + (row % 2) * 60, y = CY + 40 + row * 44;
      s += `<path d="M${x} ${y} Q${x + 30} ${y - 40} ${x + 60} ${y} Q${x + 90} ${y - 40} ${x + 120} ${y}" fill="${PAPER}" stroke="${row === 0 ? INK : HAIR}" stroke-width="${row === 0 ? 1.8 : 1.2}"/>`;
    }
    return s;
  },
  // Two engraved dice on a table line; burgundy pips on the lead die.
  gaming() {
    const cube = (cx, cy, a, pipsColor) => {
      const top = `M${cx} ${cy - a} L${cx + a * 0.87} ${cy - a / 2} L${cx} ${cy} L${cx - a * 0.87} ${cy - a / 2} Z`;
      const left = `M${cx - a * 0.87} ${cy - a / 2} L${cx} ${cy} L${cx} ${cy + a} L${cx - a * 0.87} ${cy + a / 2} Z`;
      const right = `M${cx + a * 0.87} ${cy - a / 2} L${cx} ${cy} L${cx} ${cy + a} L${cx + a * 0.87} ${cy + a / 2} Z`;
      let s = `<path d="${top}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="${left}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="${right}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
      for (let k = 1; k < 9; k++) { const t = k / 9; s += `<line x1="${f(cx + a * 0.87 * t)}" y1="${f(cy - a / 2 * t + a * t * 0 + (a / 2) * t)}" x2="${f(cx + a * 0.87 * t)}" y2="${f(cy + a - a / 2 * t)}" stroke="${FAINT}" stroke-width="1"/>`; }
      const pip = (x, y) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(a * 0.09)}" ry="${f(a * 0.055)}" fill="${pipsColor}"/>`;
      s += pip(cx, cy - a / 2) + pip(cx - a * 0.4, cy - a * 0.7) + pip(cx + a * 0.4, cy - a * 0.3);
      s += pip(cx - a * 0.6, cy + a * 0.05) + pip(cx - a * 0.27, cy + a * 0.55);
      return s;
    };
    return `<line x1="${CX - 420}" y1="${CY + 250}" x2="${CX + 420}" y2="${CY + 250}" stroke="${INK}" stroke-width="2.2"/>`
      + cube(CX - 150, CY + 20, 170, WINE) + cube(CX + 190, CY + 70, 120, INK);
  }
};

export function houseVisual(key) {
  if (!MOTIFS[key]) throw new Error(`no house visual for ${key}`);
  return frame(HOUSE_SECTIONS[key], MOTIFS[key]());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  for (const key of Object.keys(HOUSE_SECTIONS)) writeFileSync(join(OUT, `${key}.svg`), houseVisual(key));
  console.log(`Wrote ${Object.keys(HOUSE_SECTIONS).length} house visuals to public/uploads/house/`);
}
