// Nuvellum identity tokens, copied from the approved v5.1 design (assets/nuvellum-v5.zip).
// Engines use these; they never modify the site design.
export const BRAND = {
  name: 'NUVELLUM',
  tagline: 'Beyond the headline.',
  siteUrl: (process.env.SITE_URL || 'https://nuvellum.vercel.app').replace(/\/$/, ''),
  colors: { paper: '#fbf8f1', ivory: '#f2ede3', ink: '#11110f', ox: '#6d1720', ox2: '#8a2531', muted: '#69635c', line: '#d3ccbf', night: '#131313' },
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Helvetica Neue', Arial, sans-serif"
};
