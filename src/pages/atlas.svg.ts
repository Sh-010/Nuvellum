import type { APIRoute } from 'astro';
import { WORLD_MAP_VIEWBOX } from '../lib/world-map-data.js';
import { COUNTRIES, countrySlug } from '../lib/countries.js';
import { REGIONS } from '../lib/geography.js';

// Shared atlas sprite for interior locator maps: one path per drawable World Explorer entity,
// grouped by desk. Pages reference fragments with <use href="/atlas.svg#…"> so the ~250 KB of
// Natural Earth geometry is downloaded once instead of inlined on every country page.
// Paths carry no fill or stroke; the referencing <use> element styles them.
export const GET: APIRoute = () => {
  const groups = REGIONS.map(region => {
    const paths = COUNTRIES
      .filter(country => country.region === region.slug && !country.pointOnly && country.d)
      .map(country => `<path id="c-${countrySlug(country.name)}" d="${country.d}"/>`)
      .join('');
    return `<g id="r-${region.slug}">${paths}</g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORLD_MAP_VIEWBOX}"><g id="world">${groups}</g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
};
