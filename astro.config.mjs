import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://nuvellum.vercel.app',
  output: 'static',
  trailingSlash: 'never',
});
