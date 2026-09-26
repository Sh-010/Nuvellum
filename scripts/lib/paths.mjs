import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build steps never write into tracked source folders. The tracked `public/`
// directory is copied into `.build/public/` (gitignored) and every build-time
// transformation — v5.1 restore, generated art, homepage injection — happens
// on that copy. Astro serves `.build/public/` via `publicDir`.
export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const sourcePublicDir = join(root, 'public');
export const buildPublicDir = join(root, '.build', 'public');
export const articlesDir = join(root, 'src', 'content', 'articles');
