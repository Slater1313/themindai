/* Brand DNA report renderer — cards, confidence badges, evidence lines, palette editing */
/* ---------- renderer ---------- */
function esc(s){return String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
function ed(s){return `<span contenteditable="true" spellcheck="false">${esc(s)}</span>`;}
function conf(c){const m={high:["high","High confidence"],medium:["med","Medium confidence"],low:["low","Low confidence"]};const x=m[c]||m.low;return `<span class="conf ${x[0]}">${x[1]}</span>`;}
function evLine(e){return e?`<div class="ev"><b>Evidence used</b> ${ed(e)}</div>`:"";}
function kick(t,c){return `<div class="dna-kicker"><span>${t}</span>${conf(c)}</div>`;}

function renderDNA(d){
  const ev=d._evidence||{};
  document.getElementById('dnaSource').textContent=
    d._source==='live'?`Built from the Website Analysis of ${brandUrl}${(d._evidence&&d._evidence._method==='fetched')?' (page fetched directly)':''}`
    :d._source==='imported'?`Imported report for ${brandUrl} \u2014 generated outside this app, fully editable`
    :d._source==='local'?`Built on-device from the actual content of ${brandUrl} \u2014 no AI used, every insight is extracted or measured`
    :`Built only from the details you provided for ${esc(d.brandName)}`;
  const s=d.tone.sliders;
  const sliderRow=(l,r,key)=>`<div class="tone-row"><span>${l}</span><input type="range" min="0" max="100" value="${Math.max(0,Math.min(100,s[key]||50))}" aria-label="${l} to ${r}"><span>${r}</span></div>`;
  const list=a=>(a&&a.length?a:[]);
  const scanItem=(label,v)=>{
    const t=Array.isArray(v)?v.filter(Boolean).join(" · "):v;
    return `<div class="scan-item"><span>${label}</span><p>${t?ed(t):'<i class="none">none found</i>'}</p></div>`;
  };
  const palItems=d.palette.items;

  document.getElementById('dnaReport').innerHTML=`
  <div class="dna-grid">

    <div class="dna-card w12"><div class="card scan-card">
      ${kick('Website Analysis','high')}
      <p class="dna-body" style="margin-top:0">Everything below is built only from this evidence${ev._manual?' — provided by you':' — extracted from '+esc(ev._url||brandUrl)}.</p>
      <div class="scan-grid">
        ${scanItem('Website name',ev.siteName)}
        ${scanItem('Homepage headline',ev.headline)}
        ${scanItem('Subheading',ev.subheading)}
        ${scanItem('Services / products',ev.services)}
        ${scanItem('Key phrases',ev.keyPhrases)}
        ${scanItem('Audience clues',ev.audienceClues)}
        ${scanItem('Tone of voice examples',ev.toneExamples)}
        ${scanItem('Colour clues',ev.colorClues)}
        ${scanItem('Visual style clues',ev.visualClues)}
        ${scanItem('Calls to action',ev.ctas)}
        ${scanItem('Industry / category',ev.industry)}
        ${scanItem('Repeated words & promises',ev.repeatedThemes)}
      </div>
      ${(ev.sources&&ev.sources.length)?`<p class="scan-src">Sources read: ${ev.sources.map(s=>esc(s)).join(' · ')}</p>`:''}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Brand archetype',d.archetype.confidence)}
      <div class="arch-hero">
        <div class="arch-orb" aria-hidden="true">${esc((d.archetype.primary||'?').replace(/^The /i,'').charAt(0))}</div>
        <div>
          <div class="arch-name">${ed(d.archetype.primary)}</div>
          ${d.archetype.secondary?`<div class="arch-sub">with a secondary note of <b>${ed(d.archetype.secondary)}</b></div>`:''}
        </div>
      </div>
      <p class="dna-body">${ed(d.archetype.description)}</p>
      <div class="pill-row"><span>Industry · ${ed(d.industry.value)}</span></div>
      ${evLine(d.archetype.evidence||d.industry.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Target audience',d.audience.confidence)}
      ${list(d.audience.items).map(a=>`<div class="aud-item"><h4>${ed(a.name)}</h4><p>${ed(a.desc)}</p></div>`).join('')||'<p class="dna-body">No audience evidence found — add who you serve.</p>'}
      ${evLine(d.audience.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Tone of voice',d.tone.confidence)}
      <p class="dna-body lg" style="margin-top:0">${ed(d.tone.description)}</p>
      <div style="margin-top:1.4rem">
        ${sliderRow('Gentle','Bold','gentle_bold')}
        ${sliderRow('Poetic','Practical','poetic_practical')}
        ${sliderRow('Personal','Professional','personal_professional')}
        ${sliderRow('Playful','Serious','playful_serious')}
      </div>
      ${evLine(d.tone.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Brand personality',d.personality.confidence)}
      ${list(d.personality.items).map(p=>`
        <div class="trait"><div class="row"><b>${ed(p.trait)}</b><span>${esc(p.score)}%</span></div>
        <div class="bar"><i data-w="${p.score}"></i></div></div>`).join('')||'<p class="dna-body">Add traits that describe your brand.</p>'}
      ${evLine(d.personality.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Colour palette',d.palette.confidence)}
      ${palItems.length?`
      <div class="dna-pal" id="dnaPalBand">
        ${palItems.map((p,i)=>`<button style="background:${esc(p.hex)}" data-hex="${esc(p.hex)}" data-i="${i}" aria-label="${esc(p.name)} ${esc(p.hex)}"></button>`).join('')}
      </div>
      <div class="pal-list">
        ${palItems.map((p,i)=>`<div class="pl">
          <input type="color" value="${esc(p.hex)}" data-i="${i}" onchange="updateSwatch(this)" aria-label="Edit ${esc(p.name)}">
          <code data-code="${i}">${esc(p.hex)}</code><b>${ed(p.name)}</b></div>`).join('')}
      </div>`:'<p class="dna-body">No colour evidence found — pick your palette in Brand settings.</p>'}
      ${evLine(d.palette.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Typography direction',d.typography.confidence)}
      <div class="type-duo">
        <div class="d-sample">${esc(ev.headline||'A brand that feels like you')}</div>
        <div class="b-sample">Body copy stays calm, legible, and generous with space.</div>
        ${(d.typography.display||d.typography.body)?`<div class="t-meta">
          <div><b>${ed(d.typography.display)}</b>Display</div>
          <div><b>${ed(d.typography.body)}</b>Body</div>
        </div>`:''}
      </div>
      <p class="dna-body">${ed(d.typography.notes)}</p>
      ${evLine(d.typography.evidence)}
    </div></div>

    <div class="dna-card w12"><div class="card">
      ${kick('Visual language',d.visual.confidence)}
      <div class="pill-row" style="margin-top:0;padding-top:0">
        ${list(d.visual.items).map(v=>`<span>${ed(v)}</span>`).join('')||'<span>No visual evidence found</span>'}
      </div>
      ${evLine(d.visual.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Brand strengths',d.strengths.confidence)}
      <ul class="check-list">${list(d.strengths.items).map(x=>`<li>${ed(x)}</li>`).join('')}</ul>
      ${evLine(d.strengths.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Content opportunities',d.opportunities.confidence)}
      <ul class="check-list opp">${list(d.opportunities.items).map(x=>`<li>${ed(x)}</li>`).join('')}</ul>
      ${evLine(d.opportunities.evidence)}
    </div></div>

    <div class="dna-card w6"><div class="card">
      ${kick('Content themes',d.themes.confidence)}
      <div class="theme-grid">
        ${list(d.themes.items).map((t,i)=>`<div class="theme"><span class="t-num">theme ${i+1}</span><h4>${ed(t.title)}</h4><p>${ed(t.desc)}</p></div>`).join('')}
      </div>
      ${evLine(d.themes.evidence)}
    </div></div>

    <div class="dna-card w6">
      <div class="card pos-card">
        <div class="orb" aria-hidden="true"></div>
        ${kick('Positioning',d.positioning.confidence)}
        <blockquote>\u201C${ed(d.positioning.value)}\u201D</blockquote>
        ${evLine(d.positioning.evidence)}
      </div>
      <div class="card creative-flow" style="margin-top:1.2rem">
        ${kick('Suggested creative direction',d.creative.confidence)}
        <p>${ed(d.creative.value)}</p>
        ${evLine(d.creative.evidence)}
        <div class="sig">
          <span class="avatar"></span>
          <div><b>The Mindful AI</b><span>Creative direction \u00B7 drafted for ${esc(d.brandName)}</span></div>
        </div>
      </div>
    </div>

    <div class="dna-card w12"><div class="card">
      ${kick('Evidence used','high')}
      <p class="dna-body" style="margin-top:0">Every conclusion above, traced back to its clue.</p>
      <div class="ev-table">
        ${[["Industry",d.industry],["Archetype",d.archetype],["Audience",d.audience],["Tone of voice",d.tone],["Personality",d.personality],["Colour palette",d.palette],["Typography",d.typography],["Visual language",d.visual],["Strengths",d.strengths],["Opportunities",d.opportunities],["Content themes",d.themes],["Positioning",d.positioning],["Creative direction",d.creative]]
          .filter(r=>r[1]&&r[1].evidence)
          .map(r=>`<div class="ev-row"><b>${r[0]}</b><span>${esc(r[1].evidence)}</span>${conf(r[1].confidence)}</div>`).join('')||'<p class="dna-body">No evidence recorded.</p>'}
      </div>
    </div></div>

  </div>`;

  requestAnimationFrame(()=>{
    document.querySelectorAll('#dnaReport .trait .bar i').forEach(i=>{i.style.width=i.dataset.w+'%';});
  });
}

function updateSwatch(input){
  const i=input.dataset.i;
  const band=document.querySelector(`#dnaPalBand button[data-i="${i}"]`);
  if(band){band.style.background=input.value;band.dataset.hex=input.value.toUpperCase();}
  const code=document.querySelector(`[data-code="${i}"]`);
  if(code)code.textContent=input.value.toUpperCase();
  if(dna&&dna.palette&&dna.palette.items[i])dna.palette.items[i].hex=input.value.toUpperCase();
}

function regenerateDNA(){
  if(!brandUrl||brandUrl==='yourwebsite.com'){go('url');return;}
  document.getElementById('onboardUrl').value=brandUrl;
  dnaPromise=generateDNA(brandUrl);
  document.getElementById('analysisUrl').textContent=brandUrl;
  go('analysis');
  runAnalysis();
}


