import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const articlesDir = join(root, 'src', 'content', 'articles');
const outDir = join(root, 'public', 'generated');
mkdirSync(outDir, { recursive: true });

function parseValue(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch {}
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseFrontmatter(src) {
  if (!src.startsWith('---')) return {};
  const end = src.indexOf('\n---', 3);
  if (end < 0) return {};
  const data = {};
  for (const line of src.slice(3, end).trim().split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2]);
  }
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
  }[ch]));
}

function hashInt(input) {
  return parseInt(createHash('sha256').update(input).digest('hex').slice(0, 8), 16);
}

function palette(section, slug) {
  const bases = {
    world: 18, business: 38, technology: 208, science: 178, sports: 350,
    culture: 315, 'film & tv': 280, anime: 326, gaming: 198, opinion: 24
  };
  const key = String(section || '').toLowerCase();
  const base = bases[key] ?? 12;
  const jitter = (hashInt(slug) % 22) - 11;
  const h1 = (base + jitter + 360) % 360;
  const h2 = (h1 + 28 + (hashInt(slug + 'b') % 30)) % 360;
  return {
    bg1: `hsl(${h1} 25% 13%)`,
    bg2: `hsl(${h2} 28% 30%)`,
    accent: `hsl(${(h2 + 24) % 360} 45% 78%)`,
    soft: `hsl(${h1} 22% 91%)`
  };
}

function motif(title, section, seed, accent) {
  const text = `${title} ${section}`.toLowerCase();
  const k = seed % 5;
  if (/internet|data|ai|artificial|technology|digital|cyber|network/.test(text)) {
    return `
      <g opacity=".42" stroke="${accent}" fill="none">
        <path d="M190 710 C420 500 560 580 760 390 S1110 270 1410 470" stroke-width="5"/>
        <path d="M240 250 L510 420 L760 260 L1050 500 L1370 290" stroke-width="3" opacity=".55"/>
      </g>
      <g fill="${accent}" opacity=".72">
        <circle cx="190" cy="710" r="14"/><circle cx="510" cy="420" r="11"/><circle cx="760" cy="260" r="15"/>
        <circle cx="1050" cy="500" r="12"/><circle cx="1370" cy="290" r="16"/>
      </g>`;
  }
  if (/fuel|diesel|oil|energy|price|business|market|capital/.test(text)) {
    return `
      <g fill="none" stroke="${accent}" opacity=".34">
        <path d="M120 800 C420 680 610 670 820 510 C1030 350 1230 330 1490 200" stroke-width="8"/>
        <path d="M120 875 C430 760 640 760 860 590 C1080 420 1270 410 1490 300" stroke-width="2"/>
      </g>
      <g fill="${accent}" opacity=".18">
        <rect x="180" y="220" width="210" height="430"/><rect x="460" y="330" width="210" height="320"/>
        <rect x="740" y="275" width="210" height="375"/><rect x="1020" y="390" width="210" height="260"/>
      </g>`;
  }
  if (/war|russia|ukraine|world|global|diplom|attack|geopolit/.test(text)) {
    return `
      <g fill="none" stroke="${accent}" opacity=".30">
        <ellipse cx="1030" cy="470" rx="410" ry="290" stroke-width="3"/>
        <ellipse cx="1030" cy="470" rx="190" ry="290" stroke-width="2"/>
        <path d="M620 470 H1440M690 350 H1370M690 590 H1370" stroke-width="2"/>
        <path d="M1030 180 V760" stroke-width="2"/>
      </g>
      <path d="M120 820 L480 530 L720 700 L1010 380 L1450 720 L1450 1000 L120 1000Z" fill="#000" opacity=".18"/>`;
  }
  if (/film|anime|gaming|culture|media|music|art/.test(text)) {
    return `
      <g opacity=".28" fill="${accent}">
        <circle cx="1120" cy="310" r="250"/><circle cx="870" cy="630" r="150"/>
        <rect x="200" y="240" width="420" height="420" transform="rotate(${k * 6 - 12} 410 450)"/>
      </g>
      <g fill="none" stroke="${accent}" opacity=".42" stroke-width="4">
        <path d="M180 760 Q520 330 820 690 T1450 360"/>
      </g>`;
  }
  return `
    <g opacity=".24" fill="${accent}">
      <circle cx="${1080 + k*30}" cy="${260 + k*20}" r="270"/>
      <path d="M80 850 L480 ${500-k*20} L800 720 L1130 ${350+k*15} L1520 760 L1520 1000 L80 1000Z" fill="#000"/>
    </g>`;
}

let count = 0;
for (const name of readdirSync(articlesDir).filter(x => x.endsWith('.md'))) {
  const slug = basename(name, '.md');
  const fm = parseFrontmatter(readFileSync(join(articlesDir, name), 'utf8'));
  if (fm.status !== 'published' || fm.origin !== 'automation') continue;

  const p = palette(fm.section, slug);
  const seed = hashInt(slug);
  const section = String(fm.section || 'Nuvellum').toUpperCase();
  const title = String(fm.title || slug);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-labelledby="t d">
  <title id="t">${esc(title)}</title>
  <desc id="d">Original Nuvellum editorial illustration for ${esc(section)}.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/>
    </linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .055"/></feComponentTransfer></filter>
    <radialGradient id="glow"><stop offset="0" stop-color="${p.soft}" stop-opacity=".20"/><stop offset="1" stop-color="${p.soft}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#bg)"/>
  <circle cx="${1240 - (seed % 130)}" cy="${210 + (seed % 90)}" r="330" fill="url(#glow)"/>
  ${motif(title, section, seed, p.accent)}
  <rect x="88" y="90" width="6" height="138" fill="${p.accent}" opacity=".9"/>
  <text x="122" y="145" fill="${p.accent}" font-family="Georgia,serif" font-size="28" letter-spacing="8">NUVELLUM</text>
  <text x="122" y="197" fill="${p.soft}" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="5">${esc(section)}</text>
  <rect width="1600" height="1000" filter="url(#grain)" opacity=".85"/>
</svg>`;
  writeFileSync(join(outDir, `${slug}.svg`), svg);
  count++;
}

console.log(`Generated ${count} original Nuvellum editorial illustrations.`);
