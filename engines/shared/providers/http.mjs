export async function postJson(url, { headers = {}, body, timeoutMs = 45000 }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    // Never echo request headers (keys); only status and provider message.
    const msg = data?.error?.message || data?.message || text.slice(0, 120);
    const err = new Error(`HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
