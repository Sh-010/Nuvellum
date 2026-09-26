// Shared rules for keeping n8n workflow exports free of secrets.

export const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/g, 'Google API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, 'GitHub fine-grained token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, 'Anthropic API key'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g, 'OpenAI-style API key'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS access key'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'private key'],
  [/\bBearer\s+(?!\{\{)[A-Za-z0-9._~+/-]{20,}=*/g, 'bearer token'],
  [/\b(?:https?:\/\/)[^\s"'/]+:[^\s"'@/]{6,}@/g, 'credentials in URL']
];

// Parameter names whose literal values must never be stored in an export.
const SENSITIVE_KEY_RE = /^(authorization|x-api-key|x-goog-api-key|api[_-]?key|apikey|access[_-]?token|token|secret|client[_-]?secret|password|passwd|private[_-]?key)$/i;

const isExpression = (v) => typeof v === 'string' && (v.trim().startsWith('=') || v.includes('{{'));
export const REDACTED = '__REDACTED_USE_N8N_CREDENTIAL__';

function scanString(value, path, findings) {
  for (const [re, label] of SECRET_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(value)) findings.push(`${path}: looks like a ${label}`);
  }
}

/** Find secret-looking content anywhere in a parsed export. */
export function findSecrets(node, path = '$', findings = []) {
  if (typeof node === 'string') { scanString(node, path, findings); return findings; }
  if (Array.isArray(node)) { node.forEach((v, i) => findSecrets(v, `${path}[${i}]`, findings)); return findings; }
  if (node && typeof node === 'object') {
    // n8n header/query parameter lists: [{ name: 'Authorization', value: '...' }]
    if (typeof node.name === 'string' && SENSITIVE_KEY_RE.test(node.name) && typeof node.value === 'string' && node.value && node.value !== REDACTED && !isExpression(node.value)) {
      findings.push(`${path}: literal value for sensitive parameter "${node.name}"`);
    }
    for (const [k, v] of Object.entries(node)) {
      if (SENSITIVE_KEY_RE.test(k) && typeof v === 'string' && v && v !== REDACTED && !isExpression(v)) findings.push(`${path}.${k}: literal value for sensitive key`);
      if (k === 'pinData' && v && Object.keys(v).length) findings.push(`${path}.pinData: pinned execution data must not be committed`);
      if (k === 'credentials' && v && typeof v === 'object') {
        for (const [type, cred] of Object.entries(v)) if (cred && typeof cred === 'object' && cred.id) findings.push(`${path}.credentials.${type}.id: credential ids must be stripped`);
      }
      findSecrets(v, `${path}.${k}`, findings);
    }
  }
  return findings;
}

function redactString(value, redactions, path) {
  let out = value;
  for (const [re, label] of SECRET_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(out)) { re.lastIndex = 0; out = out.replace(re, REDACTED); redactions.push(`${path}: ${label}`); }
  }
  return out;
}

/** Return a sanitized deep copy of an n8n workflow export plus a list of what was removed. */
export function sanitizeExport(input) {
  const redactions = [];
  const walk = (node, path) => {
    if (typeof node === 'string') return redactString(node, redactions, path);
    if (Array.isArray(node)) return node.map((v, i) => walk(v, `${path}[${i}]`));
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'pinData') { if (v && Object.keys(v).length) redactions.push(`${path}.pinData removed`); out[k] = {}; continue; }
      if (k === 'staticData') { if (v) redactions.push(`${path}.staticData removed`); out[k] = null; continue; }
      if (k === 'credentials' && v && typeof v === 'object' && !Array.isArray(v)) {
        // Keep only the credential *name* so it can be re-bound after import.
        out[k] = Object.fromEntries(Object.entries(v).map(([type, cred]) => [type, { name: cred?.name || type }]));
        continue;
      }
      if (path === '$.meta' && k === 'instanceId') { out[k] = undefined; continue; }
      if (SENSITIVE_KEY_RE.test(k) && typeof v === 'string' && v && !isExpression(v)) { out[k] = REDACTED; redactions.push(`${path}.${k}: literal sensitive value`); continue; }
      out[k] = walk(v, `${path}.${k}`);
    }
    if (typeof out.name === 'string' && SENSITIVE_KEY_RE.test(out.name) && typeof out.value === 'string' && out.value && out.value !== REDACTED && !isExpression(out.value)) {
      out.value = REDACTED;
      redactions.push(`${path}: literal value for "${out.name}"`);
    }
    return out;
  };
  const sanitized = JSON.parse(JSON.stringify(walk(input, '$')));
  return { sanitized, redactions };
}
