// Shared geometry for the World Explorer globe.
//
// world-map-data.js holds Natural Earth admin-0 shapes projected equirectangularly
// into a 1000-unit-wide viewBox that spans 84°N–58°S (see
// scripts/tools/generate-world-map.mjs). The globe's visual texture and its
// country-ID hit map are both rasterised from those same paths with the same
// transform, and the texture is wrapped on a Three.js SphereGeometry whose uv is
// (lon + 180) / 360, (lat + 90) / 180. A raycast's hit.uv therefore indexes the
// ID map at exactly the country drawn under the pointer: no separate
// longitude/latitude pointer maths is involved.
//
// Everything here is plain JavaScript so the same code runs in the browser and in
// the Node test suite, which audits every entity against the real ID map.

export const VIEW_WIDTH = 1000;
export const VIEW_NORTH = 84;
const DEG_PER_UNIT = 360 / VIEW_WIDTH;

export const ID_MAP_WIDTH = 2048;
export const ID_MAP_HEIGHT = 1024;

// Entities covering fewer ID-map pixels than this (about 1° × 1° at the equator)
// are too small to hover reliably at globe zoom, so the explorer adds an
// invisible screen-space hit area around their anchor point.
export const SMALL_TARGET_PIXELS = 40;

export function viewToLonLat(x, y) {
  return { lon: x * DEG_PER_UNIT - 180, lat: VIEW_NORTH - y * DEG_PER_UNIT };
}

// Canvas transform from viewBox units to texture pixels (texture spans 90°N–90°S).
export function textureTransform(width = ID_MAP_WIDTH, height = ID_MAP_HEIGHT) {
  return { scale: width / VIEW_WIDTH, offsetY: (90 - VIEW_NORTH) / 180 * height };
}

export function lonLatToUv(lon, lat) {
  return { u: (lon + 180) / 360, v: (lat + 90) / 180 };
}

// Same pixel addressing for a Three.js hit.uv and for a lon/lat anchor.
export function uvToPixel(u, v, width = ID_MAP_WIDTH, height = ID_MAP_HEIGHT) {
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
  return { x, y, index: y * width + x };
}

// Position on a unit SphereGeometry for a given uv, matching Three.js's own
// vertex/uv generation (phi = u·2π, theta = (1 − v)·π).
export function uvToSphere(u, v, radius = 1) {
  const phi = u * Math.PI * 2;
  const theta = (1 - v) * Math.PI;
  return {
    x: -radius * Math.cos(phi) * Math.sin(theta),
    y: radius * Math.cos(theta),
    z: radius * Math.sin(phi) * Math.sin(theta)
  };
}

// d3-geo emits absolute M/L/Z commands only. Anything else is rejected rather
// than silently mis-drawn.
export function parseRings(d) {
  const rings = [];
  if (!d) return rings;
  const tokens = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let ring = null;
  let command = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^[A-Za-z]$/.test(token)) {
      if (!'MLZ'.includes(token)) throw new Error(`Unsupported path command: ${token}`);
      command = token;
      if (command === 'Z') { if (ring?.length >= 6) rings.push(ring); ring = null; }
      else if (command === 'M') { if (ring?.length >= 6) rings.push(ring); ring = []; }
      continue;
    }
    if (!ring) throw new Error('Path coordinate before move command');
    ring.push(Number(token), Number(tokens[++i]));
  }
  if (ring?.length >= 6) rings.push(ring);
  return rings;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const j = (i + 2) % n;
    area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return area / 2;
}

function insideEvenOdd(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
      const yi = ring[i + 1], yj = ring[j + 1];
      if ((yi > y) !== (yj > y) && x < (ring[j] - ring[i]) * (y - yi) / (yj - yi) + ring[i]) inside = !inside;
    }
  }
  return inside;
}

function edgeDistance(rings, x, y) {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
      const ax = ring[j], ay = ring[j + 1], dx = ring[i] - ax, dy = ring[i + 1] - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      const ex = ax + t * dx - x, ey = ay + t * dy - y;
      best = Math.min(best, ex * ex + ey * ey);
    }
  }
  return Math.sqrt(best);
}

// A point well inside the entity's largest landmass (a coarse pole of
// inaccessibility). Bounding-box centres fall in the sea for countries with
// overseas parts, so Locate and the small-target hit areas use this instead.
export function interiorPoint(rings) {
  if (!rings.length) return null;
  const main = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < main.length; i += 2) {
    minX = Math.min(minX, main[i]); maxX = Math.max(maxX, main[i]);
    minY = Math.min(minY, main[i + 1]); maxY = Math.max(maxY, main[i + 1]);
  }
  let best = null;
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let spanX = maxX - minX, spanY = maxY - minY;
  for (let level = 0; level < 5; level++) {
    const steps = level === 0 ? 24 : 8;
    for (let a = 0; a <= steps; a++) {
      for (let b = 0; b <= steps; b++) {
        const x = cx - spanX / 2 + spanX * a / steps;
        const y = cy - spanY / 2 + spanY * b / steps;
        if (!insideEvenOdd(rings, x, y)) continue;
        const distance = edgeDistance(rings, x, y);
        if (!best || distance > best.distance) best = { x, y, distance };
      }
    }
    if (!best) break;
    cx = best.x; cy = best.y; spanX /= 4; spanY /= 4;
  }
  if (best) return { x: best.x, y: best.y };
  let sx = 0, sy = 0;
  for (let i = 0; i < main.length; i += 2) { sx += main[i]; sy += main[i + 1]; }
  return { x: sx / (main.length / 2), y: sy / (main.length / 2) };
}

// Rasterises every entity into a Uint16 country-ID map (0 = sea) using exact,
// non-antialiased even-odd scanline filling at pixel centres. Canvas fills blend
// neighbouring ID colours along borders into unrelated IDs; this does not.
//
// Guarantees for every entity: islands too small to cover a pixel centre still
// claim the sea pixel under them, and an entity with no pixels at all (a
// point-only microstate, or a polygon below raster resolution) is stamped at its
// anchor. `counts[id]` is the number of pixels each entity finally owns.
// { stamp: false } returns the plain scanline fill (used by the audit tests).
export function rasterizeIdMap(entities, width = ID_MAP_WIDTH, height = ID_MAP_HEIGHT, { stamp = true } = {}) {
  const ids = new Uint16Array(width * height);
  const { scale, offsetY } = textureTransform(width, height);
  const rows = Array.from({ length: height }, () => []);
  const toPixel = (x, y) => ({ x: x * scale, y: y * scale + offsetY });

  for (const entity of entities) {
    if (!entity.rings?.length) continue;
    let top = height, bottom = -1;
    for (const ring of entity.rings) {
      for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
        const x0 = ring[j] * scale, y0 = ring[j + 1] * scale + offsetY;
        const x1 = ring[i] * scale, y1 = ring[i + 1] * scale + offsetY;
        if (y0 === y1) continue;
        const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
        const first = Math.max(0, Math.ceil(lo - 0.5));
        const last = Math.min(height - 1, Math.ceil(hi - 0.5) - 1);
        for (let row = first; row <= last; row++) {
          rows[row].push(x0 + (row + 0.5 - y0) * (x1 - x0) / (y1 - y0));
        }
        if (first <= last) { top = Math.min(top, first); bottom = Math.max(bottom, last); }
      }
    }
    for (let row = top; row <= bottom; row++) {
      const xs = rows[row];
      if (xs.length < 2) { xs.length = 0; continue; }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const start = Math.max(0, Math.ceil(xs[k] - 0.5));
        const end = Math.min(width - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
        if (start <= end) ids.fill(entity.id, row * width + start, row * width + end + 1);
      }
      xs.length = 0;
    }
    for (const ring of stamp ? entity.rings : []) {
      let sx = 0, sy = 0;
      for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; }
      const p = toPixel(sx / (ring.length / 2), sy / (ring.length / 2));
      const index = Math.min(height - 1, Math.max(0, Math.floor(p.y))) * width + Math.min(width - 1, Math.max(0, Math.floor(p.x)));
      if (!ids[index]) ids[index] = entity.id;
    }
  }

  const counts = new Uint32Array(entities.reduce((max, entity) => Math.max(max, entity.id), 0) + 1);
  for (let i = 0; i < ids.length; i++) counts[ids[i]]++;
  for (const entity of stamp ? entities : []) {
    if (!Number.isFinite(entity.lon) || !Number.isFinite(entity.lat)) continue;
    const { u, v } = lonLatToUv(entity.lon, entity.lat);
    const anchor = uvToPixel(u, v, width, height);
    if (counts[entity.id]) {
      // An anchor inside a sub-pixel polygon may sit on a sea texel; claim it.
      if (!ids[anchor.index]) { ids[anchor.index] = entity.id; counts[entity.id]++; }
      continue;
    }
    // Take the anchor pixel unless that would leave its owner with nothing
    // (e.g. Saint Martin and Sint Maarten share a texel); then the nearest
    // pixel that can be spared.
    let index = -1;
    for (let r = 0; r <= 4 && index < 0; r++) {
      for (let dy = -r; dy <= r && index < 0; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = anchor.x + dx, y = anchor.y + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const candidate = y * width + x;
          if (ids[candidate] && counts[ids[candidate]] <= 1) continue;
          index = candidate;
          break;
        }
      }
    }
    if (index < 0) throw new Error(`No free ID-map pixel near ${entity.id}`);
    counts[ids[index]]--;
    ids[index] = entity.id;
    counts[entity.id] = 1;
  }
  counts[0] = 0;
  return { ids, counts };
}
