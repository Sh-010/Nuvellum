// Usage: node scripts/sanitize-n8n-export.mjs <raw-export.json> [output.json]
// Default output: n8n/workflows/<same file name>.
//
// Removes credential ids, pinned execution data, static data and the n8n
// instance id, and redacts anything that looks like a secret. Credential
// *names* are kept so the workflow can be re-bound after import.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { root } from './lib/paths.mjs';
import { sanitizeExport, findSecrets } from './lib/n8n-safety.mjs';

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/sanitize-n8n-export.mjs <raw-export.json> [output.json]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, 'utf8'));
const { sanitized, redactions } = sanitizeExport(raw);
const leftovers = findSecrets(sanitized);
if (leftovers.length) {
  console.error('Refusing to write: secret-like content survived sanitization:');
  for (const f of leftovers) console.error(' - ' + f);
  process.exit(2);
}

const output = outputArg || join(root, 'n8n', 'workflows', basename(input).replace(/\.raw(?=\.json$)/, ''));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(sanitized, null, 2) + '\n');
console.log(`Wrote sanitized workflow to ${output}`);
if (redactions.length) {
  console.log(`\nRemoved/redacted ${redactions.length} item(s). Rotate any real secret that was present in the raw export:`);
  for (const r of redactions) console.log(' - ' + r);
}
