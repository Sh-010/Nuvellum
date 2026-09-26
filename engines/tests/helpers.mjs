import { createServer } from 'node:http';
/** Local HTTP server; handler(req, body) -> { status, json }. Records calls. */
export async function server(handler) {
  const calls = [];
  const s = createServer((req, res) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', async () => {
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      calls.push({ method: req.method, url: req.url, headers: req.headers, body });
      const r = await handler(req, body, calls.length);
      res.writeHead(r.status || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.json ?? {}));
    });
  });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${s.address().port}`, calls, close: () => new Promise(r => s.close(r)) };
}
