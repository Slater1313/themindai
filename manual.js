/* Import/export, backend connect, AI connection test, manual-details path */
/* ---------- import / export: lets a report generated elsewhere run in this app ---------- */
function exportDNA(){
  if(!dna){toast('No report to export yet');return;}
  const clean={};for(const k in dna)if(k[0]!=='_')clean[k]=dna[k];
  const payload=JSON.stringify({url:brandUrl,evidence:dna._evidence||null,report:clean},null,1);
  const done=()=>toast('Report JSON copied — keep it safe or share it');
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(payload).then(done).catch(()=>window.prompt('Copy your report JSON:',payload));}
  else window.prompt('Copy your report JSON:',payload);
}

function importDNA(){
  const errEl=document.getElementById('importErr');
  errEl.textContent='';
  let parsed;
  try{parsed=JSON.parse(document.getElementById('importJson').value);}
  catch(_){errEl.textContent='That doesn\u2019t look like valid JSON \u2014 paste the whole block, including the outer { }.';return;}
  const report=parsed.report||parsed;
  if(!report||typeof report!=='object'||!(report.positioning||report.brandName)){
    errEl.textContent='Valid JSON, but not a Brand DNA report \u2014 it needs at least brandName and positioning.';return;
  }
  const d=normalizeDNA(report);
  if(!completeDNA(d)){errEl.textContent='This report is incomplete \u2014 some sections are missing.';return;}
  if(parsed.url)brandUrl=cleanUrl(parsed.url)||brandUrl;
  d._evidence=parsed.evidence||null;
  d._source='imported';
  dna=d;
  finishAnalysis();
  toast('Report loaded \u2014 every field is still editable');
}

/* connect a self-hosted backend at runtime — no code editing needed */
async function connectBackend(){
  const st=document.getElementById('backendStatus');
  let u=(document.getElementById('backendUrl').value||'').trim().replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9.-]+/i.test(u)){st.textContent='Please paste the full https:// URL from your deployment.';return;}
  st.textContent='Testing '+u+' \u2026';
  BACKEND=u;__apiDown=false;
  try{
    const t=await callClaude('Reply with exactly: OK',false);
    if(/OK/i.test(t)){
      st.textContent='\u2713 Connected. AI analysis and site fetching now run through your backend. Tip: bookmark this page as ?backend='+u+' so it connects automatically.';
      toast('Backend connected \u2014 try the analysis again');
    }else{st.textContent='Backend responded, but unexpectedly \u2014 check ANTHROPIC_API_KEY is set in its environment variables.';}
  }catch(e){
    BACKEND='';
    st.textContent='\u2715 Could not reach '+u+'/api/claude ('+(e&&e.message||'network error')+'). Check the URL and that the deployment succeeded.';
  }
}

/* one-click connectivity check, surfaced on the manual page */
async function testAI(){
  const out=document.getElementById('diagDetail');
  toast('Testing AI connection\u2026');
  __apiDown=false;
  try{
    const t=await callClaude('Reply with exactly: OK',false);
    if(/OK/i.test(t)){toast('\u2713 AI connection works \u2014 try the analysis again');out.textContent='AI connection: working. The site itself could not be analysed \u2014 try a different URL or fill in the details below.';}
    else{toast('AI responded unexpectedly');out.textContent='AI connection: responded, but unexpectedly.';}
  }catch(e){
    toast('\u2715 AI unreachable here');
    out.textContent='AI connection: failed ('+(e&&e.message||'network error')+'). This environment cannot reach the Anthropic API \u2014 the engine will use on-device analysis where the site can be fetched.';
  }
}

function normalizeDNA(d){
  const sect=(o,defVal)=>{
    if(o==null)return{value:defVal,confidence:"low",evidence:""};
    if(typeof o!=="object")return{value:o,confidence:"low",evidence:""};
    o.confidence=/^(high|medium|low)$/.test(o.confidence)?o.confidence:"low";
    o.evidence=o.evidence||"";
    return o;
  };
  ["industry","positioning","creative"].forEach(k=>d[k]=sect(d[k],""));
  ["audience","personality","palette","visual","strengths","opportunities","themes"].forEach(k=>{
    d[k]=sect(d[k]);d[k].items=Array.isArray(d[k].items)?d[k].items:[];
  });
  d.archetype=sect(d.archetype);d.tone=sect(d.tone);
  d.tone.sliders=Object.assign({gentle_bold:50,poetic_practical:50,personal_professional:50,playful_serious:50},d.tone.sliders||{});
  d.palette.items=d.palette.items.filter(p=>p&&/^#[0-9a-f]{3,8}$/i.test(p.hex||"")).slice(0,6);
  d.personality.items=d.personality.items.slice(0,6).map(p=>({trait:p.trait||"",score:Math.max(0,Math.min(100,+p.score||0))}));
  return d;
}

/* ---------- manual path (insufficient evidence) ---------- */
function startManual(e){
  e.preventDefault();
  const ev={
    reachable:true,_manual:true,_url:brandUrl,
    siteName:val('mName'),headline:val('mOffer'),subheading:"",
    services:[val('mOffer')],keyPhrases:[val('mOffer'),val('mTone')].filter(Boolean),
    audienceClues:[val('mAud')].filter(Boolean),
    toneExamples:[val('mTone')].filter(Boolean),
    colorClues:[val('mLook')].filter(Boolean),visualClues:[val('mLook')].filter(Boolean),
    ctas:[],industry:"",repeatedThemes:[]
  };
  dnaPromise=(async()=>{
    let d;
    try{d=normalizeDNA(await evidenceToDNA(ev));}
    catch(_){d=manualDNA(ev);}
    d._evidence=ev;d._source="manual";
    return d;
  })();
  document.getElementById('analysisUrl').textContent=ev.siteName||brandUrl;
  go('analysis');
  runAnalysis();
  if(window.__onEvidence)window.__onEvidence(ev);
}
function val(id){return (document.getElementById(id).value||"").trim();}

/* built ONLY from the user's own words — no invention */
function manualDNA(ev){
  const you=t=>'You told us: "'+t+'"';
  const name=ev.siteName||"Your brand";
  const tone=ev.toneExamples[0]||"";
  const aud=ev.audienceClues[0]||"";
  const offer=ev.services[0]||"";
  const look=ev.colorClues[0]||"";
  const W=s=>s?s.split(/[,;.]/).map(x=>x.trim()).filter(Boolean):[];
  return normalizeDNA({
    brandName:name,
    industry:{value:offer?offer.split(/[,;.]/)[0]:"",confidence:"medium",evidence:offer?you(offer):""},
    archetype:{primary:"To be refined",secondary:"",description:"Not enough evidence to assign an archetype confidently — edit this once you've reviewed the report.",confidence:"low",evidence:"Insufficient website evidence; details provided manually"},
    audience:{items:aud?[{name:"Your audience",desc:aud}]:[],confidence:aud?"medium":"low",evidence:aud?you(aud):""},
    tone:{description:tone||"Describe how you want to sound and we'll hold you to it.",sliders:{gentle_bold:50,poetic_practical:50,personal_professional:50,playful_serious:50},confidence:tone?"medium":"low",evidence:tone?you(tone):""},
    personality:{items:W(tone).slice(0,5).map(t=>({trait:t.replace(/\b\w/,c=>c.toUpperCase()),score:75})),confidence:tone?"medium":"low",evidence:tone?you(tone):""},
    palette:{items:[],confidence:"low",evidence:look?you(look):"No colour clues available"},
    typography:{display:"",body:"",notes:"No typography evidence available — set your preferred direction here.",confidence:"low",evidence:""},
    visual:{items:W(look).slice(0,6),confidence:look?"medium":"low",evidence:look?you(look):""},
    strengths:{items:offer?["Clear offer: "+offer]:[],confidence:"low",evidence:offer?you(offer):""},
    opportunities:{items:["Add your website content so the engine can scan real evidence","Define 3-4 recurring content themes from your actual work"],confidence:"low",evidence:"General guidance — no site evidence"},
    themes:{items:offer?[{title:"Your offer, up close",desc:offer}]:[],confidence:"low",evidence:offer?you(offer):""},
    positioning:{value:(name&&offer&&aud)?`${name} offers ${offer.toLowerCase()} for ${aud.toLowerCase()}.`:"",confidence:"low",evidence:"Assembled from your own words only"},
    creative:{value:look?`Build the look around what you described: ${look}.`:"Define a look and feel here once you've gathered references.",confidence:look?"medium":"low",evidence:look?you(look):""}
  });
}

