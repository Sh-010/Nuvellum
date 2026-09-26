import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sourcePublicDir, buildPublicDir } from './lib/paths.mjs';

rmSync(buildPublicDir, { recursive: true, force: true });
mkdirSync(dirname(buildPublicDir), { recursive: true });
cpSync(sourcePublicDir, buildPublicDir, { recursive: true });
console.log('Prepared build-only public directory (.build/public); tracked public/ is left untouched.');
