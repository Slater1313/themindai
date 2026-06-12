# The Mindful AI — backend (5-minute deploy)

Two tiny serverless functions that make the Brand DNA Engine work on any hosting:
- `/api/fetch?url=...` fetches website HTML server-side (no browser CORS limits)
- `/api/claude` forwards AI requests with your Anthropic API key attached

## Deploy on Vercel
1. Create a free account at vercel.com and install the CLI: `npm i -g vercel`
2. In this folder, run: `vercel` (accept the defaults)
3. Add your key: `vercel env add ANTHROPIC_API_KEY` (get a key at console.anthropic.com)
4. Deploy to production: `vercel --prod` — note the URL it gives you, e.g. `https://mindful-ai-backend.vercel.app`
5. Open `the-mindful-ai.html`, find `const BACKEND=''` near the top of the engine script,
   and set it to your URL: `const BACKEND='https://mindful-ai-backend.vercel.app';`

That's it. Host the HTML anywhere (or open it locally) — analysis now works everywhere.

## Production hardening (when you launch publicly)
- Restrict `Access-Control-Allow-Origin` from `*` to your own domain
- Add rate limiting (e.g. Vercel WAF or Upstash) so strangers can't spend your API credit
- The fetcher includes a basic private-IP block; keep it
