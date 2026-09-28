export const BRAND = {
  name: 'NUVELLUM',
  tagline: 'Beyond the headline.',
  siteUrl: (process.env.SITE_URL || 'https://nuvellum.vercel.app').replace(/\/$/, ''),
  colors: {
    paper: '#FAF7F2',
    ivory: '#F2EDE3',
    ink: '#0F0F0F',
    wine: '#681F2D',
    stone: '#8D8A84',
    line: '#D8D0C4',
    night: '#131313'
  },
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Arial, Helvetica, sans-serif"
};
