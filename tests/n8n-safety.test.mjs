import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sanitizeExport, findSecrets, REDACTED } from '../scripts/lib/n8n-safety.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Obviously fake values shaped like real secrets.
const FAKE_GOOGLE = 'AIza' + 'X'.repeat(35);
const FAKE_GH = 'ghp_' + 'a'.repeat(36);
const FAKE_ANTHROPIC = 'sk-ant-api03-' + 'b'.repeat(40);

function rawExport() {
  return {
    name: 'Nuvellum Newsroom',
    meta: { instanceId: 'abc123instance' },
    pinData: { 'RSS Read': [{ json: { title: 'cached source text' } }] },
    staticData: { lastRun: 1 },
    nodes: [
      {
        name: 'Gemini Draft Article', type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
        parameters: { modelName: 'models/gemini-flash' },
        credentials: { googlePalmApi: { id: 'cred-123', name: 'Google Gemini' } }
      },
      {
        name: 'Commit Article File', type: 'n8n-nodes-base.httpRequest',
        parameters: {
          url: `https://api.github.com/repos/Sh-010/Nuvellum/contents/x?key=${FAKE_GOOGLE}`,
          headerParameters: { parameters: [
            { name: 'Authorization', value: `Bearer ${FAKE_GH}` },
            { name: 'Accept', value: 'application/vnd.github+json' },
            { name: 'X-Trace', value: '={{ $json.trace }}' }
          ] },
          jsonBody: `{"note":"${FAKE_ANTHROPIC}"}`
        },
        credentials: { httpHeaderAuth: { id: 'cred-456', name: 'GitHub Nuvellum' } }
      },
      { name: 'Code', type: 'n8n-nodes-base.code', parameters: { jsCode: 'const apiKey = "hunter2hunter2";' } }
    ],
    connections: {}
  };
}

test('findSecrets flags raw exports', () => {
  const f = findSecrets(rawExport()).join('\n');
  assert.match(f, /Google API key/);
  assert.match(f, /GitHub token/);
  assert.match(f, /Anthropic API key/);
  assert.match(f, /credential ids/);
  assert.match(f, /pinData/);
  assert.match(f, /sensitive parameter "Authorization"/);
});

test('sanitizeExport removes secrets but keeps structure and credential names', () => {
  const { sanitized, redactions } = sanitizeExport(rawExport());
  const text = JSON.stringify(sanitized);
  for (const secret of [FAKE_GOOGLE, FAKE_GH, FAKE_ANTHROPIC, 'cred-123', 'cred-456', 'abc123instance', 'cached source text']) {
    assert.ok(!text.includes(secret), `still contains ${secret}`);
  }
  assert.deepEqual(sanitized.nodes[0].credentials, { googlePalmApi: { name: 'Google Gemini' } });
  assert.equal(sanitized.nodes[1].parameters.headerParameters.parameters[0].value, REDACTED);
  assert.equal(sanitized.nodes[1].parameters.headerParameters.parameters[1].value, 'application/vnd.github+json');
  assert.equal(sanitized.nodes[1].parameters.headerParameters.parameters[2].value, '={{ $json.trace }}');
  assert.equal(sanitized.nodes.length, 3);
  assert.ok(redactions.length >= 5);
  assert.deepEqual(findSecrets(sanitized), []);
});

test('sanitize CLI writes a clean file; checker accepts it and rejects the raw export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'n8n-'));
  try {
    const rawPath = join(dir, 'newsroom.raw.json');
    const outPath = join(dir, 'newsroom.json');
    writeFileSync(rawPath, JSON.stringify(rawExport()));
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'sanitize-n8n-export.mjs'), rawPath, outPath], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(findSecrets(JSON.parse(readFileSync(outPath, 'utf8'))), []);
    assert.ok(findSecrets(JSON.parse(readFileSync(rawPath, 'utf8'))).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the repository n8n/ folder currently passes the export check', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'check-n8n-exports.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
