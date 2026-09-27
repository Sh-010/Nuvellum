// Text normalisation shared by the country desk routes and the World Explorer
// client (kept separate from countries.js so the browser bundle does not pull in
// the map path data twice).
export function normalizeCountry(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
