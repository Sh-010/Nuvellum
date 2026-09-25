import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://nuvellum.news',
  output: 'static',
  trailingSlash: 'never',
});
