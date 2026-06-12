// GET /api/fetch?url=https://example.com — server-side website fetch (no CORS limits).
const BLOCKED = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.query.url;
  let u;
  try {
    u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw 0;
    if (BLOCKED.test(u.hostname)) throw 0;          // basic SSRF guard
  } catch (_) { return res.status(400).send('invalid url'); }
  try {
    const r = await fetch(u.href, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MindfulAI-BrandScan/1.0)' },
      signal: AbortSignal.timeout(12000)
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text.slice(0, 500000));
  } catch (e) { res.status(502).send('fetch failed'); }
}
