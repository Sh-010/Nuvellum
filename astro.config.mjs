import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://nuvellum.vercel.app',
  output: 'static',
  // Build steps assemble the served public files here (gitignored) so the
  // tracked public/ folder is never modified by a build. See scripts/prepare-public.mjs.
  publicDir: './.build/public',
  trailingSlash: 'never',
});
