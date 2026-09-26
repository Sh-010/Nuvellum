// Append-only distribution ledger (JSON Lines). Gives idempotency (a story is
// never posted twice to the same platform), retry bookkeeping and an audit log.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class Ledger {
  constructor(file) { this.file = file; mkdirSync(dirname(file), { recursive: true }); }
  entries() {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  /** Latest state per slug:platform. */
  state() {
    const m = new Map();
    for (const e of this.entries()) {
      const k = `${e.slug}:${e.platform}`;
      const prev = m.get(k) || { attempts: 0 };
      m.set(k, { ...prev, ...e, attempts: prev.attempts + (e.status === 'failed' || e.status === 'posted' ? 1 : 0) });
    }
    return m;
  }
  record(entry) { appendFileSync(this.file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); }
}
