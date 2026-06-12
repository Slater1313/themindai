/* Brand DNA Engine: API client, Website Analysis (search + scraper), evidence rules,
   AI synthesis, rule-based synthesis, orchestrator, diagnostics */
let __apiDown=false;                                       /* stop retrying a dead API this session */
async function callClaude(prompt, useSearch){
  if(__apiDown)throw new Error('api unavailable');
  const body={model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]};
  if(useSearch)body.tools=[{type:"web_search_20250305",name:"web_search"}];
  let res;
  const endpoint=BACKEND?BACKEND.replace(/\/$/,'')+"/api/claude":"https://api.anthropic.com/v1/messages";
  try{
    res=await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    });
  }catch(e){__apiDown=true;throw e;}                       /* network-level failure → don't retry */
  if(!res.ok)throw new Error("api "+res.status);
  const data=await res.json();
  return (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
}

function parseJSON(text){
  const cleaned=text.replace(/```json|```/g,"");
  const m=cleaned.match(/\{[\s\S]*\}/);
  if(!m)throw new Error("no json");
  try{return JSON.parse(m[0]);}
  catch(e){
    // repair common truncation: cut to last complete brace pair
    let s=m[0];
    for(let cut=s.length;cut>s.length-400&&cut>0;cut--){
      const t=s.slice(0,cut);
      const open=(t.match(/\{/g)||[]).length, close=(t.match(/\}/g)||[]).length;
      if(open===close){try{return JSON.parse(t);}catch(_){}}
    }
    throw e;
  }
}

/* ---------- Stage 1: Website Evidence Scan ---------- */
async function extractEvidence(url){
  const prompt=`You are a meticulous research analyst running a "Website Analysis" on https://${url}. Use web search — search for "${url}", then for the site/brand name you find, then for "${url} reviews" if needed. Record ONLY what you actually observe in the search results — quote real wording. NEVER invent, embellish, or fill gaps with plausible guesses: a wrong scan is worse than an empty one.

Return JSON only — no markdown, no preamble — in exactly this shape:
{"reachable":true,"sources":["url or domain of each result you actually used"],"siteName":"","headline":"","subheading":"","services":[""],"keyPhrases":[""],"audienceClues":[""],"toneExamples":[""],"colorClues":[""],"visualClues":[""],"ctas":[""],"industry":"","repeatedThemes":[""]}

Rules:
- CRITICAL: if none of your search results are from ${url} itself or clearly about this exact business, set "reachable":false, sources:[], and every field empty. Do not substitute a similarly-named business.
- sources: list the actual result URLs/domains your evidence came from (max 4).
- headline / subheading: the site's actual homepage wording if visible in results, else "".
- services: real products/services offered (max 5).
- keyPhrases: 4-6 short VERBATIM phrases from the site or its pages.
- audienceClues: phrases revealing who they serve, verbatim where possible.
- toneExamples: 2-3 verbatim sentences showing how the brand speaks.
- colorClues / visualClues: only what you can genuinely tell; [] if unknown.
- ctas: actual button/link wording (e.g. "Book a table").
- repeatedThemes: words/promises that recur across what you found.
Keep it terse. Total under 550 tokens.`;
  const ev=parseJSON(await callClaude(prompt,true));
  ev._url=url;
  return ev;
}

/* the scan must cite the site itself (or a profile clearly about it) — otherwise treat as unverified */
function sourcesMatch(ev){
  const dom=(ev._url||"").toLowerCase().replace(/^www\./,"");
  const root=dom.split(".")[0];
  const srcs=(Array.isArray(ev.sources)?ev.sources:[]).map(s=>String(s).toLowerCase());
  if(!srcs.length)return false;
  return srcs.some(s=>s.includes(dom)||(root.length>3&&s.includes(root)));
}

function evidenceScore(ev){
  let n=0;
  if(ev.headline)n+=2;
  if(ev.subheading)n++;
  ["services","keyPhrases","audienceClues","toneExamples","ctas","repeatedThemes"].forEach(k=>{
    if(Array.isArray(ev[k])&&ev[k].filter(Boolean).length)n++;
  });
  if(ev.industry)n++;
  return n;
}

/* ---------- Stage 1b: direct on-device Website Analysis (works outside Claude) ---------- */
async function fetchWithTimeout(u,ms){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(u,{signal:c.signal});clearTimeout(t);return r;}
  catch(e){clearTimeout(t);throw e;}
}
async function scrapeSite(url){
  const target='https://'+url;
  const attempts=[
    ...(BACKEND?[BACKEND.replace(/\/$/,'')+'/api/fetch?url='+encodeURIComponent(target)]:[]),
    target,
    'https://api.allorigins.win/raw?url='+encodeURIComponent(target),
    'https://corsproxy.io/?url='+encodeURIComponent(target)
  ];
  for(const u of attempts){
    try{
      const r=await fetchWithTimeout(u,9000);
      if(!r.ok)continue;
      const t=await r.text();
      if(t&&t.length>600&&/<(html|body|head|div|h1)[\s>]/i.test(t)){
        const ev=parseSiteHTML(t,url);
        ev._method='fetched';ev.sources=[u.includes(url)&&!u.includes('proxy')&&!u.includes('allorigins')?target:target+' (via proxy)'];
        ev.reachable=true;ev._url=url;
        return ev;
      }
    }catch(_){/* try next */}
  }
  return null;
}

function parseSiteHTML(htmlText,url){
  const doc=new DOMParser().parseFromString(htmlText,'text/html');
  const cssText=[...doc.querySelectorAll('style')].map(s=>s.textContent).join('\n')
    +' '+[...doc.querySelectorAll('[style]')].map(e=>e.getAttribute('style')).join(';');
  doc.querySelectorAll('script,noscript,svg,iframe').forEach(e=>e.remove());
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const txt=e=>clean(e&&e.textContent);
  const meta=n=>{const m=doc.querySelector('meta[name="'+n+'"],meta[property="'+n+'"]');return clean(m&&m.getAttribute('content'));};

  const title=clean(doc.title).split(/\s*[|\u2013\u2014-]\s*/)[0];
  const siteName=meta('og:site_name')||title||url.split('.')[0];
  const h1=doc.querySelector('h1');
  const headline=txt(h1)||meta('og:title')||title;
  const desc=meta('description')||meta('og:description');
  let subheading='';
  if(h1){let n=h1.nextElementSibling;for(let i=0;i<3&&n;i++,n=n.nextElementSibling){const t=txt(n);if(t.length>20&&t.length<220){subheading=t;break;}}}
  if(!subheading)subheading=desc;

  /* services: nav links + section headings, minus boilerplate */
  const skip=/^(home|about|about us|contact|contact us|blog|news|faq|faqs|login|log in|sign in|sign up|menu|search|privacy|terms|cookies?|careers)$/i;
  const navTexts=[...doc.querySelectorAll('nav a, header a')].map(txt).filter(t=>t.length>2&&t.length<40&&!skip.test(t));
  const heads=[...doc.querySelectorAll('h2,h3')].map(txt).filter(t=>t.length>3&&t.length<60);
  const services=[...new Set([...navTexts,...heads])].slice(0,5);

  /* key phrases: headings + strong/blockquote, verbatim */
  const keyPhrases=[...new Set([...doc.querySelectorAll('h2,h3,strong,em,blockquote')].map(txt)
    .filter(t=>t.length>8&&t.length<90))].slice(0,6);

  /* paragraphs for tone + audience */
  const paras=[...doc.querySelectorAll('p,li')].map(txt).filter(t=>t.length>25&&t.length<400);
  const bodyText=paras.join(' ');
  const toneExamples=paras.filter(t=>t.length<180).slice(0,3);
  const audienceClues=[];
  const audRe=/(?:\bfor|\bhelping|we help|designed for|made for|built for|perfect for|whether you(?:'|\u2019)re)\s+([^.!?,]{6,70})/gi;
  let m;while((m=audRe.exec(bodyText))&&audienceClues.length<3){const c=clean(m[0]);if(!audienceClues.includes(c))audienceClues.push(c);}

  /* CTAs: buttons + button-like links, verbatim */
  const ctas=[...new Set([...doc.querySelectorAll('button,a[class*="btn" i],a[class*="button" i],a[class*="cta" i],input[type="submit"]')]
    .map(e=>clean(e.value||e.textContent)).filter(t=>t.length>2&&t.length<40))].slice(0,4);

  /* colours: actual hex codes from the site CSS, ranked by use */
  const colorCount={};
  const hexRe=/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  let hm;while((hm=hexRe.exec(cssText))){
    let h=hm[0].toLowerCase();
    if(h.length===4)h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    colorCount[h]=(colorCount[h]||0)+1;
  }
  const themeColor=meta('theme-color');if(themeColor&&/^#/.test(themeColor))colorCount[themeColor.toLowerCase()]=(colorCount[themeColor.toLowerCase()]||0)+5;
  const boring=/^#(ffffff|000000|fefefe|fff\w{3})$/;
  const rankedHex=Object.entries(colorCount).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  const colorClues=rankedHex.filter(h=>!boring.test(h)).slice(0,5);
  if(colorClues.length<3)rankedHex.forEach(h=>{if(colorClues.length<3&&!colorClues.includes(h))colorClues.push(h);});

  /* fonts: actual font-family declarations */
  const fonts=[...new Set((cssText.match(/font-family:\s*([^;}{]+)/gi)||[])
    .map(f=>f.replace(/font-family:\s*/i,'').split(',')[0].replace(/["']/g,'').trim())
    .filter(f=>f&&!/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(f)))].slice(0,3);

  const imgs=doc.querySelectorAll('img').length;
  const visualClues=[];
  if(fonts.length)visualClues.push('Site fonts: '+fonts.join(', '));
  if(imgs>8)visualClues.push('image-led layout ('+imgs+' images on the homepage)');
  else if(imgs>0)visualClues.push(imgs+' homepage images \u2014 type-led layout');
  if(doc.querySelector('video'))visualClues.push('uses video on the homepage');

  /* repeated words & themes: frequency over real body text */
  const stop=new Set('the and for with you your our are this that from have has was were will can all not but they them their its it\u2019s about more most into out when what who how why where than then also been being only just over under very much many some on in to of a an we us i is be do as at by or if so'.split(' '));
  const freq={};
  bodyText.toLowerCase().replace(/[^a-z\u00C0-\u017F\s'-]/g,' ').split(/\s+/).forEach(w=>{
    if(w.length>3&&!stop.has(w))freq[w]=(freq[w]||0)+1;
  });
  const repeatedThemes=Object.entries(freq).filter(e=>e[1]>=3).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]+' (\u00D7'+e[1]+')');

  /* industry: keyword detection over title+desc+headline+nav, with the matched word as evidence */
  const hay=(title+' '+desc+' '+headline+' '+navTexts.join(' ')).toLowerCase();
  const indMap=[
    [/pizz|restaurant|menu|dine|kitchen|bistro|trattoria|cafe|coffee|bakery|food/, 'Restaurant / food & drink'],
    [/web design|website|webflow|wordpress|ux|ui design|digital agency|branding|design studio|creative studio/, 'Design / creative services'],
    [/fitness|coach|training|workout|strength|gym|nutrition|personal train/, 'Fitness & coaching'],
    [/yoga|wellness|therapy|massage|mindful|meditat|holistic|spa/, 'Wellness services'],
    [/software|app|platform|api|saas|cloud|data|ai\b/, 'Software / technology'],
    [/shop|store|cart|buy now|collection|product/, 'Retail / e-commerce'],
    [/law|legal|solicitor|attorney/, 'Legal services'],
    [/estate|property|lettings|realty/, 'Property / real estate'],
    [/photograph|photo studio|wedding/, 'Photography'],
    [/accounting|bookkeep|tax|finance|financial/, 'Finance & accounting'],
    [/school|course|academy|learn|education|tutor/, 'Education & training'],
    [/consult|advisory|strategy/, 'Consulting']
  ];
  let industry='',industryEv='';
  for(const[re,label]of indMap){const mm=hay.match(re);if(mm){industry=label;industryEv=mm[0];break;}}

  return {siteName,headline,subheading,services,keyPhrases,audienceClues,toneExamples,
    colorClues,visualClues,ctas,industry,_industryEv:industryEv,repeatedThemes,
    _fonts:fonts,_bodyText:bodyText};
}

/* ---------- rule-based synthesis: report assembled ONLY from extracted evidence (no AI needed) ---------- */
function ruleDNA(ev){
  const name=ev.siteName||'';
  const q=s=>'"'+String(s).slice(0,60)+'"';
  const text=ev._bodyText||[ev.headline,ev.subheading,...(ev.toneExamples||[])].join(' ');
  const words=text.split(/\s+/).filter(Boolean);
  const sentences=text.split(/[.!?]+/).map(s=>s.trim()).filter(s=>s.length>3);
  const avgLen=sentences.length?Math.round(words.length/sentences.length):14;
  const exclaims=(text.match(/!/g)||[]).length;
  const youRate=words.length?(text.match(/\byou(r)?\b/gi)||[]).length/words.length*100:0;
  const contractions=(text.match(/\b\w+['\u2019](re|ll|ve|s|t|d)\b/g)||[]).length;

  /* measurable tone, every claim tied to a number or quote */
  const toneBits=[];
  toneBits.push(avgLen<=11?'Short, direct sentences (avg '+avgLen+' words)':avgLen<=18?'Measured, mid-length sentences (avg '+avgLen+' words)':'Long, explanatory sentences (avg '+avgLen+' words)');
  if(youRate>2)toneBits.push('speaks straight to the reader \u2014 "you/your" appears often');
  if(exclaims>2)toneBits.push('energetic ('+exclaims+' exclamation marks found)');
  if(contractions>3)toneBits.push('conversational \u2014 uses contractions naturally');
  else if(contractions===0&&sentences.length>4)toneBits.push('formal \u2014 avoids contractions');
  const toneDesc=((ev.repeatedThemes||[]).length
    ?'Speaks in the language of '+ev.repeatedThemes.slice(0,2).map(t=>'"'+t.split(' ')[0]+'"').join(' and ')+': '
    :'')+toneBits.join('; ')+'.';
  const clamp=v=>Math.max(5,Math.min(95,Math.round(v)));
  const sliders={
    gentle_bold:clamp(45+exclaims*6+(avgLen<11?14:-6)),
    poetic_practical:clamp(55+(ev.ctas&&ev.ctas.length?10:0)+(avgLen>18?-15:8)),
    personal_professional:clamp(60-youRate*9-contractions*2),
    playful_serious:clamp(58-exclaims*7+(contractions>3?-8:6))
  };

  /* archetype from verbatim signals in their own text */
  const hay=text.toLowerCase()+' '+(ev.keyPhrases||[]).join(' ').toLowerCase();
  const archMap=[
    [/handmade|craft|made by hand|recipe|original|we make|created/, 'The Creator','makes and crafts its own work'],
    [/results|grow|win|performance|stronger|achieve|goals|transform/, 'The Hero','promises results and achievement'],
    [/care|support|help you|we help|family|community|welcome/, 'The Caregiver','leads with help, care and welcome'],
    [/expert|guide|learn|knowledge|advice|insight|how to|years of experience/, 'The Sage','positions on expertise and guidance'],
    [/luxury|finest|exclusive|award/, 'The Ruler','signals status and excellence'],
    [/fun|play|enjoy|love|delicious|happy/, 'The Lover','leads with pleasure and enjoyment'],
    [/simple|honest|no nonsense|straightforward|fair/, 'The Everyperson','keeps it plain, honest and accessible']
  ];
  let arch=null;
  for(const[re,label,why]of archMap){const mm=hay.match(re);if(mm){arch={label,why,ev:mm[0]};break;}}

  const themes=(ev.services||[]).slice(0,4).map(s=>({title:s,desc:'A recurring content series built around '+q(s)+'.'}));
  while(themes.length<4&&(ev.repeatedThemes||[]).length>themes.length){
    const w=ev.repeatedThemes[themes.length].split(' ')[0];
    themes.push({title:w.charAt(0).toUpperCase()+w.slice(1),desc:'One of the site\u2019s most repeated words \u2014 own it as a theme.'});
  }

  const strengths=[];
  if(ev.headline)strengths.push('A headline that states the offer: '+q(ev.headline));
  if((ev.ctas||[]).length)strengths.push('Clear calls to action already in place: '+ev.ctas.slice(0,2).map(q).join(', '));
  if((ev.repeatedThemes||[]).length)strengths.push('A consistent message \u2014 '+q(ev.repeatedThemes[0].split(' ')[0])+' recurs across the page');
  if((ev.colorClues||[]).length>=3&&strengths.length<3)strengths.push('An established colour identity ('+ev.colorClues.slice(0,3).join(', ')+')');

  const opps=[];
  if((ev.services||[]).length)opps.push('Give '+q(ev.services[0])+' its own recurring weekly format');
  if((ev.repeatedThemes||[]).length)opps.push('Turn '+q(ev.repeatedThemes[0].split(' ')[0])+' \u2014 your most repeated word \u2014 into a named series');
  if((ev.ctas||[]).length)opps.push('Every post should land on an existing CTA like '+q(ev.ctas[0]));
  if(opps.length<3)opps.push('Publish the story behind '+q(ev.headline||name));

  const aud=(ev.audienceClues||[]).map((a,i)=>({name:'Audience signal '+(i+1),desc:a}));
  const pal=(ev.colorClues||[]).filter(c=>/^#/.test(c)).slice(0,5).map((hex,i)=>({hex,name:['Primary','Secondary','Accent','Support','Detail'][i]||'Colour'}));
  const fonts=ev._fonts||[];

  return {
    brandName:name,
    industry:{value:ev.industry||'',confidence:ev.industry?'high':'low',evidence:ev._industryEv?('Site text contains '+q(ev._industryEv)):'No clear industry signal found'},
    archetype:arch?{primary:arch.label,secondary:'',description:name+' '+arch.why+'.',confidence:'medium',evidence:'Site text contains '+q(arch.ev)}
      :{primary:'To be refined',secondary:'',description:'No strong archetype signal in the page text \u2014 set this yourself.',confidence:'low',evidence:'No matching language found on the page'},
    audience:{items:aud.length?aud:[{name:'Not stated',desc:'The homepage doesn\u2019t say who it\u2019s for \u2014 add this.'}],confidence:aud.length?'high':'low',evidence:aud.length?('Page text: '+q(ev.audienceClues[0])):'No audience wording found'},
    tone:{description:toneDesc,sliders,confidence:sentences.length>4?'high':'low',evidence:'Measured from '+sentences.length+' sentences of real page copy'},
    personality:{items:(ev.repeatedThemes||[]).slice(0,5).map(t=>{const[w,c]=t.split(' (\u00D7');return{trait:w.charAt(0).toUpperCase()+w.slice(1),score:Math.min(95,55+(parseInt(c)||3)*7)};}),confidence:(ev.repeatedThemes||[]).length?'medium':'low',evidence:(ev.repeatedThemes||[]).length?('Word frequency: '+ev.repeatedThemes.slice(0,3).join(', ')):'Not enough repeated language'},
    palette:{items:pal,confidence:pal.length>=3?'high':'low',evidence:pal.length?('Hex values extracted from the site\u2019s own CSS'):'No colour values found in the page'},
    typography:{display:fonts[0]||'',body:fonts[1]||fonts[0]||'',notes:fonts.length?('The site already uses '+fonts.join(' and ')+' \u2014 carry these into social.'):'No font declarations found \u2014 choose a pairing in Brand settings.',confidence:fonts.length?'high':'low',evidence:fonts.length?('font-family declarations: '+fonts.join(', ')):'None found in page CSS'},
    visual:{items:(ev.visualClues||[]).concat((ev.keyPhrases||[]).slice(0,2)).slice(0,6),confidence:(ev.visualClues||[]).length?'medium':'low',evidence:(ev.visualClues||[])[0]||'Limited visual information in HTML'},
    strengths:{items:strengths.slice(0,3),confidence:'high',evidence:'Each strength quotes the page directly'},
    opportunities:{items:opps.slice(0,3),confidence:'medium',evidence:'Built from the site\u2019s own services, CTAs and repeated words'},
    themes:{items:themes,confidence:themes.length>=3?'medium':'low',evidence:(ev.services||[]).length?('Services found: '+ev.services.slice(0,3).join(', ')):'Derived from repeated words'},
    positioning:{value:ev.headline?(name+' \u2014 '+ev.headline):(name&&ev.services&&ev.services.length?name+' offers '+ev.services.slice(0,2).join(' and ')+'.':''),confidence:ev.headline?'high':'low',evidence:ev.headline?('Homepage headline: '+q(ev.headline)):'Composed from extracted services'},
    creative:{value:[pal.length?('Build visuals on the site\u2019s own colours ('+pal.slice(0,3).map(p=>p.hex).join(', ')+')'):'',fonts.length?('set in '+fonts[0]):'',(ev.visualClues||[])[0]?('leaning into its '+ev.visualClues[0].toLowerCase()):''].filter(Boolean).join(', ')+'. Keep the voice exactly as measured: '+toneBits[0].toLowerCase()+'.',confidence:'medium',evidence:'Assembled only from extracted colours, fonts and copy'}
  };
}

/* ---------- Stage 2: Brand DNA from evidence ONLY (two small calls so JSON never truncates) ---------- */
function dnaRules(){
  return `Build Brand DNA strictly from the Website Analysis evidence below. Accuracy over creativity: no generic agency language, no assumptions the evidence does not support.
BANNED unless verbatim in the evidence: "mindful", "soulful", "intentional", "holistic", "elevate", "elevated", "authentic", "passionate", "premium", "bespoke", "curated", "empower", "journey".
Each section needs: confidence — "high" (directly quoted evidence), "medium" (sound inference), "low" (educated guess); evidence — the SPECIFIC clue used, max 14 words, quoting site text where possible, e.g. Headline: "Wood-fired pizza since 1998".
Echo the brand's own vocabulary from keyPhrases/toneExamples. A reader should know what this exact business sells.
Return JSON only — no markdown, no preamble. Terse strings. Total under 600 tokens.`;
}

async function dnaCore(ev){
  const prompt=`You are a senior brand strategist. ${dnaRules()}

EVIDENCE:
${JSON.stringify(ev)}

Return exactly this shape (PART A):
{"brandName":"","industry":{"value":"","confidence":"high","evidence":""},"archetype":{"primary":"","secondary":"","description":"","confidence":"medium","evidence":""},"audience":{"items":[{"name":"","desc":""}],"confidence":"medium","evidence":""},"tone":{"description":"","sliders":{"gentle_bold":50,"poetic_practical":50,"personal_professional":50,"playful_serious":50},"confidence":"high","evidence":""},"personality":{"items":[{"trait":"","score":80}],"confidence":"medium","evidence":""},"palette":{"items":[{"hex":"#000000","name":""}],"confidence":"low","evidence":""}}

audience 2-3 items; personality exactly 5 traits scored 0-100; palette exactly 5 hex colours (from colorClues where given, else plausible for THIS business and marked low); sliders 0-100 (0=first word, 100=second); tone description must reflect the actual toneExamples.`;
  return parseJSON(await callClaude(prompt,false));
}

async function dnaCreative(ev){
  const prompt=`You are a creative director. ${dnaRules()}

EVIDENCE:
${JSON.stringify(ev)}

Return exactly this shape (PART B):
{"typography":{"display":"","body":"","notes":"","confidence":"low","evidence":""},"visual":{"items":[""],"confidence":"medium","evidence":""},"strengths":{"items":[""],"confidence":"medium","evidence":""},"opportunities":{"items":[""],"confidence":"medium","evidence":""},"themes":{"items":[{"title":"","desc":""}],"confidence":"medium","evidence":""},"positioning":{"value":"","confidence":"medium","evidence":""},"creative":{"value":"","confidence":"medium","evidence":""}}

visual exactly 6 keywords; strengths 3; opportunities 3 (each a concrete content move for THIS business); themes exactly 4 named content themes with one-line descriptions; positioning one sharp sentence naming this business and what the evidence shows it does; creative 2-3 sentences of art direction grounded in the visual/tone evidence.`;
  return parseJSON(await callClaude(prompt,false));
}

async function evidenceToDNA(ev){
  const [a,b]=await Promise.all([dnaCore(ev).catch(()=>null),dnaCreative(ev).catch(()=>null)]);
  return Object.assign({},a||{},b||{});
}

/* a report is only shown if every section actually arrived */
function completeDNA(d){
  try{
    return !!(d&&d.industry&&d.archetype&&d.audience&&d.tone&&d.personality&&d.palette
      &&d.typography&&d.visual&&d.strengths&&d.opportunities&&d.themes&&d.positioning&&d.creative
      &&(d.audience.items||[]).length>=1
      &&(d.themes.items||[]).length>=3
      &&String(d.positioning.value||"").length>5
      &&String(d.creative.value||"").length>5
      &&String(d.tone.description||"").length>5);
  }catch(_){return false;}
}

/* ---------- orchestrator: try both evidence paths, record what happened ---------- */
let __diag={fetch:'not attempted',ai:'not attempted',synthesis:'not attempted'};

async function gatherEvidence(url){
  const tryScrape=async()=>{
    try{
      __diag.fetch='trying\u2026';
      const e=await scrapeSite(url);
      if(!e){__diag.fetch='no readable HTML returned';return null;}
      if(evidenceScore(e)<4){__diag.fetch='page fetched but too little content ('+evidenceScore(e)+'/12 signals)';return null;}
      __diag.fetch='ok \u2014 page parsed directly';return e;
    }catch(err){__diag.fetch='blocked: '+(err&&err.message||'network error');return null;}
  };
  const trySearch=async()=>{
    try{
      __diag.ai='trying\u2026';
      let s=await extractEvidence(url);
      if(s.reachable===false||!sourcesMatch(s)){
        try{const s2=await extractEvidence(url);s2._retry=true;if(s2.reachable!==false&&sourcesMatch(s2))s=s2;}catch(_){}
      }
      if(s&&s.reachable!==false&&sourcesMatch(s)&&evidenceScore(s)>=4){__diag.ai='ok \u2014 found via web search';s._method='searched';return s;}
      __diag.ai=(s&&s.reachable===false)?'AI reached, but the site was not found in web search':'AI reached, but evidence could not be verified against '+url;
      return null;
    }catch(err){__diag.ai='failed: '+(err&&err.message||'unknown error');return null;}
  };
  const order=IN_CLAUDE?[trySearch,tryScrape]:[tryScrape,trySearch];
  for(const fn of order){const ev=await fn();if(ev)return ev;}
  return null;
}

async function generateDNA(url){
  __diag={fetch:'not attempted',ai:'not attempted',synthesis:'not attempted'};
  const ev=await gatherEvidence(url);
  if(!ev){
    const e=new Error("insufficient");e.code="insufficient";throw e;
  }
  if(window.__onEvidence)try{window.__onEvidence(ev);}catch(_){}

  let raw=null,source='live';
  try{
    raw=await evidenceToDNA(ev);
    if(!completeDNA(raw)){
      const needsA=!(raw&&raw.industry&&raw.tone&&raw.palette);
      const needsB=!(raw&&raw.themes&&raw.positioning&&raw.creative);
      const fixes=await Promise.all([needsA?dnaCore(ev).catch(()=>null):null,needsB?dnaCreative(ev).catch(()=>null):null]);
      raw=Object.assign({},raw||{},fixes[0]||{},fixes[1]||{});
    }
  }catch(_){raw=null;}
  if(completeDNA(raw)){__diag.synthesis='ok \u2014 AI synthesis';}
  else{
    raw=ruleDNA(ev);source='local';
    __diag.synthesis=completeDNA(raw)?'ok \u2014 rule-based (AI unavailable)':'failed';
  }
  if(!completeDNA(raw)){
    const e=new Error("insufficient");e.code="insufficient";throw e;
  }
  const d=normalizeDNA(raw);
  d._evidence=ev;
  d._source=source;
  return d;
}

