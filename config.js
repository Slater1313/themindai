/* Configuration — environment detection and backend endpoint */
/* Backend resolution order:
   1. ?backend=https://...  in the page URL
   2. same-origin /api      (automatic when site + api/ are deployed together, e.g. on Vercel)
   3. none                  (engine falls back to public CORS proxies + rule-based synthesis) */
/* ════════════ BRAND DNA ENGINE v2 — evidence-first ════════════ */

/* where are we running? inside Claude's sandbox, direct site fetches are blocked (and trigger its
   connection banner) — so we use the AI path there, and the scraper everywhere else */
const IN_CLAUDE=(()=>{try{
  if(location.protocol==='file:')return false;            /* opened locally → scrape */
  const h=location.hostname||'';
  if(/claude|anthropic/i.test(h))return true;             /* claude.ai / claudeusercontent */
  if(h==='')return true;                                   /* sandboxed srcdoc/blob frame */
  return false;                                            /* user's own hosting → scrape */
}catch(_){return true;}})();

/* ════════ PRODUCTION BACKEND ════════
   To run The Mindful AI on your own hosting, deploy the included backend
   (see mindful-backend folder) and paste its URL here, e.g.:
   const BACKEND='https://mindful-api.vercel.app';
   With a backend set, both website fetching and AI synthesis work anywhere. */
let BACKEND=(()=>{try{
  const q=(new URLSearchParams(location.search).get('backend')||'').trim().replace(/\/$/,'');
  if(q)return q;
  if(!IN_CLAUDE&&/^https?:$/.test(location.protocol))return location.origin||'';  /* same-origin /api */
  return '';
}catch(_){return '';}})();

