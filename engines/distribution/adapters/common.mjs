export class AdapterError extends Error {
  constructor(message, { retryable = false, status } = {}) { super(message); this.retryable = retryable; this.status = status; }
}

/** fetch wrapper: classifies failures as retryable (network, 429, 5xx) or not. Never logs secrets. */
export async function call(url, init = {}, timeoutMs = 30000) {
  let res;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (err) { throw new AdapterError(`network error: ${err.message}`, { retryable: true }); }
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = data?.error?.message || data?.detail || data?.title || text.slice(0, 160);
    throw new AdapterError(`HTTP ${res.status}: ${msg}`, { retryable: res.status === 429 || res.status >= 500, status: res.status });
  }
  return { data, headers: res.headers };
}

export const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
