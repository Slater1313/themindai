/* UI shell: router, nav, reveals, onboarding flow, panels, toast */
/* ---------- view router ---------- */
function go(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  window.scrollTo({top:0,behavior:'instant'});
  if(name==='landing'){requestAnimationFrame(observeReveals);}
}

/* ---------- nav ---------- */
const nav=document.getElementById('nav');
addEventListener('scroll',()=>{ if(nav) nav.classList.toggle('scrolled',scrollY>24); },{passive:true});
function toggleMenu(){
  document.getElementById('burger').classList.toggle('open');
  document.getElementById('mobileMenu').classList.toggle('open');
}

/* ---------- scroll reveals ---------- */
let io;
function observeReveals(){
  if(io) io.disconnect();
  io=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}
  }),{threshold:.12});
  document.querySelectorAll('#view-landing .reveal').forEach(el=>io.observe(el));
}
observeReveals();

/* ---------- onboarding ---------- */
let brandUrl='yourwebsite.com';
let dnaPromise=null, dna=null;
function cleanUrl(v){return v.trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'');}
function validUrl(v){return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v);}

function startFromHero(e){
  e.preventDefault();
  const v=cleanUrl(document.getElementById('heroUrl').value);
  go('url');
  if(v) document.getElementById('onboardUrl').value=v;
  setTimeout(()=>document.getElementById('onboardUrl').focus(),350);
}
function toggleChip(btn){btn.setAttribute('aria-pressed',btn.getAttribute('aria-pressed')!=='true');}

function startAnalysis(e){
  e.preventDefault();
  const raw=document.getElementById('onboardUrl').value;
  const v=cleanUrl(raw);
  const err=document.getElementById('urlError');
  if(!validUrl(v)){err.textContent='That doesn\u2019t look like a website address yet — try something like yourstudio.com';return;}
  err.textContent='';
  brandUrl=v;
  dnaPromise=generateDNA(v);
  document.getElementById('analysisUrl').textContent=v;
  go('analysis');
  runAnalysis();
}

function runAnalysis(){
  const steps=[...document.querySelectorAll('#analysisSteps .a-step')];
  steps.forEach(s=>s.classList.remove('doing','done'));
  document.getElementById('evPreview').hidden=true;
  const bar=document.getElementById('progressBar');
  const label=document.getElementById('progressLabel');
  bar.style.width='6%';
  steps[0].classList.add('doing');
  label.textContent='Reaching '+brandUrl+'\u2026';
  let evShown=false;
  const tick=setInterval(()=>{
    const w=parseFloat(bar.style.width)||6;
    if(w<88)bar.style.width=(w+(evShown?1.6:0.7))+'%';
  },600);
  window.__onEvidence=(ev)=>{
    evShown=true;
    steps[0].classList.remove('doing');steps[0].classList.add('done');
    steps[1].classList.add('done');
    steps[2].classList.add('doing');
    label.textContent='Evidence scan complete \u2014 reading the clues\u2026';
    const bits=[];
    if(ev.headline)bits.push('\u201C'+ev.headline+'\u201D');
    if(ev.industry)bits.push(ev.industry);
    if(ev.services&&ev.services.length)bits.push(ev.services.slice(0,3).join(' \u00B7 '));
    document.getElementById('evPreviewText').textContent=bits.join('  \u2014  ')||'Evidence gathered from '+brandUrl;
    document.getElementById('evPreview').hidden=false;
    setTimeout(()=>{
      steps[2].classList.remove('doing');steps[2].classList.add('done');
      steps[3].classList.add('doing');
      label.textContent='Composing your Brand DNA from evidence\u2026';
    },1500);
  };
  waitForDNA(bar,label,steps,tick);
}

async function waitForDNA(bar,label,steps,tick){
  try{
    dna=await Promise.race([dnaPromise,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),90000))]);
    clearInterval(tick);
    steps.forEach(s=>{s.classList.remove('doing');s.classList.add('done');});
    bar.style.width='100%';
    label.textContent='Your Brand DNA report is ready.';
    setTimeout(finishAnalysis,900);
  }catch(e){
    clearInterval(tick);
    const d=document.getElementById('diagDetail');
    if(d)d.textContent='What happened \u2014 Site fetch: '+__diag.fetch+'  \u00B7  AI analysis: '+__diag.ai;
    go('manual');
  }
}

function finishAnalysis(){
  const name=(dna&&dna.brandName)||brandUrl.split('.')[0].replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  document.getElementById('brandPillName').textContent=name;
  document.getElementById('brandPillUrl').textContent=brandUrl;
  document.getElementById('brandNameInline').textContent=name;
  document.getElementById('bName').value=name;
  document.getElementById('bUrl').value=brandUrl;
  if(dna){
    if(dna.tone&&dna.tone.description) document.getElementById('bVoice').value=dna.tone.description;
    if(dna.industry&&dna.industry.value){/* reflected in report */}
    renderDNA(dna);
  }
  go('app');
  showPanel('dna',document.querySelector('.side-link[data-panel=dna]'));
}

/* ---------- app shell ---------- */
function showPanel(name,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  document.querySelectorAll('.side-link[data-panel],.mobile-tabbar button').forEach(b=>{
    b.classList.toggle('active',b.dataset.panel===name);
  });
  document.getElementById('crumbPanel').textContent=name==='brand'?'Brand settings':(name==='dna'?'Brand DNA report':'Overview');
  window.scrollTo({top:0,behavior:'instant'});
}

/* keywords */
function addKw(e){
  if(e.key!=='Enter')return;
  e.preventDefault();
  const input=e.target,v=input.value.trim();
  if(!v)return;
  const span=document.createElement('span');
  span.className='kw';
  span.innerHTML=v.replace(/[<>&]/g,'')+' <button onclick="removeKw(this)" aria-label="Remove keyword">\u2715</button>';
  input.before(span);
  input.value='';
}
function removeKw(btn){btn.parentElement.remove();}

/* toast */
let toastTimer;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2600);
}
