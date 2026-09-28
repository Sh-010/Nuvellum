// Presentation helpers shared by the interior page families (no data rules live here).
import type { Article } from './articles';
import { slugify } from './articles';

const UTC = { timeZone: 'UTC' } as const;
const day = (a: Article) => new Date(`${a.date}T00:00:00Z`);

export const route = (a: Article) => `/article/${a.slug}`;
export const sectionHref = (section: string) => `/section/${slugify(section)}`;
export const shortDate = (a: Article) => day(a).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...UTC });
export const dayMonth = (a: Article) => day(a).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...UTC });
export const weekday = (a: Article) => day(a).toLocaleDateString('en-GB', { weekday: 'long', ...UTC });
export const longDate = (a: Article) => day(a).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...UTC });
export const isoDate = (a: Article) => (a.publishedAt && a.publishedAt.startsWith(a.date) ? a.publishedAt : `${a.date}T00:00:00Z`);

export function initials(name: string) {
  const words = String(name || '').replace(/^By\s+/i, '').replace(/^Nuvellum\s+/i, '').split(/[\s.]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || 'N').slice(0, 2)).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Stories grouped by publication day, newest first (input is already sorted newest first).
export function byDay(articles: Article[]) {
  const groups = new Map<string, Article[]>();
  for (const a of articles) {
    if (!groups.has(a.date)) groups.set(a.date, []);
    groups.get(a.date)!.push(a);
  }
  return [...groups.values()];
}

// One-line section standfirsts, written as publication copy (no counts or claims).
export const SECTION_DEKS: Record<string, string> = {
  world: 'International reporting filed across Nuvellum’s regional desks, from diplomacy and conflict to elections and disasters.',
  business: 'Markets, companies, trade and the economic forces moving beneath the day’s headlines.',
  technology: 'Platforms, infrastructure, science policy and the industries shaping how the world computes.',
  science: 'Research, discovery and the institutions behind them, reported for the general reader.',
  sports: 'Results, rivalries and the business of sport, told beyond the scoreline.',
  culture: 'Arts, ideas and the shifting currents of cultural life.',
  entertainment: 'Film, television, anime and games: the screen industries and the work they make.',
  'film-tv': 'Film and television, from the festival circuit to the business of streaming.',
  anime: 'Anime and manga, their audiences and the industry around them.',
  gaming: 'Games, studios and the players who make the industry move.',
  opinion: 'Signed opinion, essays and ideas, labelled separately from Nuvellum’s reporting.',
  crime: 'Courts, policing and investigations, reported with attribution and care.'
};

// ---- Locator maps (equirectangular atlas: 1000 × 394.4, 84°N to 58°S) ----
const W = 1000, H = 394.4, NORTH = 84, SOUTH = -58;
export const project = (lon: number, lat: number) => [((lon + 180) / 360) * W, ((NORTH - lat) / (NORTH - SOUTH)) * H] as const;

// Editorial crop for each desk, in lon/lat (west, south, east, north).
const REGION_WINDOWS: Record<string, [number, number, number, number]> = {
  'north-america': [-172, 8, -8, 84],
  'latin-america-caribbean': [-122, -58, -26, 34],
  'europe-central-asia': [-28, 32, 98, 76],
  'middle-east-north-africa': [-20, 10, 66, 44],
  'sub-saharan-africa': [-22, -37, 58, 26],
  'south-asia': [56, 3, 102, 41],
  'east-asia': [70, 16, 150, 56],
  'southeast-asia-oceania': [88, -50, 180, 30]
};

export function regionViewBox(region: string) {
  const [w, s, e, n] = REGION_WINDOWS[region] ?? [-180, SOUTH, 180, NORTH];
  const [x0, y0] = project(w, n);
  const [x1, y1] = project(e, s);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, box: `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}` };
}

// Graticule lines (every 15°) inside a view box, as one path.
export function graticule(region: string) {
  const [w, s, e, n] = REGION_WINDOWS[region] ?? [-180, SOUTH, 180, NORTH];
  const parts: string[] = [];
  for (let lon = Math.ceil(w / 15) * 15; lon <= e; lon += 15) {
    const [x, y0] = project(lon, n), [, y1] = project(lon, s);
    parts.push(`M${x.toFixed(1)},${y0.toFixed(1)}V${y1.toFixed(1)}`);
  }
  for (let lat = Math.ceil(s / 15) * 15; lat <= n; lat += 15) {
    const [x0, y] = project(w, lat), [x1] = project(e, lat);
    parts.push(`M${x0.toFixed(1)},${y.toFixed(1)}H${x1.toFixed(1)}`);
  }
  return parts.join('');
}
