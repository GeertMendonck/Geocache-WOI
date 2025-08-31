// /js/app.js — Safe Mode v2 (bindt knoppen ALTIJD; data/kaart zijn optioneel)
(function(){
  'use strict';

  // ---------- Mini helpers ----------
  const $ = (sel) => document.querySelector(sel.startsWith('#') ? sel : '#'+sel);
  const showDiag = (msg) => { const d=$('#diag'); if(!d) return; d.style.display='block'; d.textContent=String(msg).slice(0,500); };
  const toast = (msg) => { const t=$('#toast'); if(!t) return; t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>{t.style.display='none'}, 2000); };
  const store = { get(){ try{return JSON.parse(localStorage.getItem('woi_state')||'{}')}catch{return{}} },
                  set(v){ localStorage.setItem('woi_state', JSON.stringify(v)); } };
  const distanceMeters=(a,b)=>{ const R=6371e3,φ1=a.lat*Math.PI/180,φ2=b.lat*Math.PI/180,dφ=(b.lat-a.lat)*Math.PI/180,dλ=(b.lng-a.lng)*Math.PI/180; const s=Math.sin(dφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2; return 2*R*Math.asin(Math.sqrt(s)); };

  // ---------- Globale (module) state ----------
  let DATA = { meta:{}, stops:[], personages:[] };
  let LMAP=null, liveMarker=null, accCircle=null, followMe=false;
  let watchId=null; window.__insideStart=false;

  // ---------- DEBUG: bewijs dat dit script draait ----------
  (function markLoaded(){
    const d = $('#diag'); if (d) { d.style.display='block'; d.textContent='app.js geladen ✓'; }
    console.log('[WOI] app.js geladen');
  })();

  // ---------- Core listeners: ALTIJD binden ----------
  function bindCoreListeners(){
    $('#startBtn')?.addEventListener('click', startWatch);
    $('#stopBtn')?.addEventListener('click', stopWatch);
    $('#resetBtn')?.addEventListener('click', ()=>{ localStorage.removeItem('woi_state'); location.reload(); });
    $('#recenterBtn')?.addEventListener('click', ()=>{ followMe = true; });
    let deferredPrompt=null;
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=$('#installHint'); if(b){b.textContent='📲 Installeer app'; b.classList.add('primary');}});
    $('#installHint')?.addEventListener('click', async ()=>{
      if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; }
      else { alert('Installeer via browser-menu (Toevoegen aan startscherm).'); }
    });
  }

  // ---------- Data-lader (fouttolerant) ----------
  async function fetchJSON(url){
    const res = await fetch(url + (url.includes('?')?'&':'?') + 'v=20250902', { cache:'no-store' });
    if(!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
    const txt = await res.text();
    try { return JSON.parse(txt); }
    catch(e){ throw new Error(`${url} → JSON parse error: ${e.message}`); }
  }
  async function loadScenario(){
    const [meta, stops, personages] = await Promise.all([
      fetchJSON('./data/meta.json'),
      fetchJSON('./data/stops.json'),
      fetchJSON('./data/personages.json')
    ]);
    return { meta, stops, personages };
  }

  // ---------- UI renders ----------
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  function ensureCharacter(){
    const st=store.get();
    if(st.pcId && DATA.personages.some(p=>p.id===st.pcId)){ st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return st.pcId; }
    const pc=pick(DATA.personages||[{id:'demo',naam:'Demo',leeftijd:'—',herkomst:'—',rol:'—',bio:'—',verhalen:{}}]);
    st.pcId=pc.id; st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return pc.id;
  }
  const currentPc=()=>DATA.personages.find(p=>p.id===store.get().pcId);

  function renderProfile(){
    const pc=currentPc(); if(!pc) { $('#pcInfo').textContent='(Geen personages geladen)'; return; }
    $('#pcInfo').innerHTML = `<div class="row">
      <div class="pill">🧑 <b>${pc.naam}</b></div>
      <div class="pill">🎂 ${pc.leeftijd} jaar</div>
      <div class="pill">🌍 ${pc.herkomst}</div>
      <div class="pill">🎖️ ${pc.rol}</div>
    </div><p class="muted">${pc.bio}</p>`;
    renderCharacterChooser();
  }
  function renderCharacterChooser(){
    const st=store.get(); const el=$('#pcChooser'); if(!el) return;
    const opts = (DATA.personages||[]).map(p=>`<option value="${p.id}" ${p.id===st.pcId?'selected':''}>${p.naam} (${p.leeftijd}) — ${p.rol}</option>`).join('') || `<option>Demo</option>`;
    const inside = window.__insideStart===true; const locked = !!st.lockedPc;
    el.innerHTML = `<select id="pcSelect" ${locked?'disabled':''} ${!inside&&!locked?'disabled':''}>${opts}</select>
      <span class="pill ${locked?'ok':''}">${locked?'🔒 Keuze vergrendeld': (inside? '🟢 Je kan hier je personage kiezen' : '🔐 Kiesbaar enkel aan de start')}</span>`;
  }
  function renderStops(){
    const cont=$('#stopsList'); if(!cont) return;
    const st=store.get(); const unlocked=new Set(st.unlocked||[]);
    cont.innerHTML = (DATA.stops||[]).map(s=>{
      const ok = unlocked.has(s.id); const isEnd = s.id===DATA.meta.endStopId;
      const icon = ok ? '✅' : (isEnd ? '🔒' : '⏳');
      return `<span class="pill">${icon} ${s.naam}</span>`;
    }).join('') || '<span class="muted">(Geen stops geladen)</span>';
  }
  function renderUnlocked(){
    const st=store.get(); const pc=currentPc(); const cont=$('#unlockList'); if(!cont) return;
    if(!st.unlocked||!st.unlocked.length){cont.innerHTML='<div class="muted">Nog niets ontgrendeld.</div>';return;}
    cont.innerHTML = st.unlocked.map(id=>{
      const stop = (DATA.stops||[]).find(s=>s.id===id);
      const txt = pc?.verhalen?.[id];
      const qs = (stop?.vragen||[]);
      const qHtml = qs.length? `<div class="small" style="margin-top:6px"><b>Reflectie:</b><ul class="qs">${qs.map(q=>`<li>${q}</li>`).join('')}</ul></div>` : '';
      return `<details open>
        <summary>📘 ${stop?.naam||id} <button class="readBtn" data-read="${id}" title="Lees voor">🔊</button></summary>
        <div style="margin-top:6px">${txt||'<span class="muted">(Geen tekst)</span>'}</div>
        ${qHtml}
      </details>`;
    }).join('');
    renderProgress();
  }
  function renderProgress(){
    const st = store.get(); const req = DATA.meta?.requiredStops||[];
    const done = (st.unlocked||[]).filter(id=>req.includes(id)).length;
    const total=req.length; const deg = total?(done/total)*360:0;
    const ring=$('#progressRing'), txt=$('#progressText');
    if(ring) ring.style.background = `conic-gradient(var(--accent) ${deg}deg, rgba(255,255,255,.15) 0 360deg)`;
    if(txt) txt.textContent = `${done}/${total}`;
  }

  // ---------- TTS ----------
  let selectedVoice=null;
  function pickVoice(){ try{ const vs=speechSynthesis.getVoices(); selectedVoice = vs.find(v=>v.lang?.toLowerCase().startsWith('nl')) || vs.find(v=>v.lang?.toLowerCase().startsWith('en')) || vs[0]||null; }catch{} }
  function speakText(t){ if(!('speechSynthesis'in window)) return alert('Voorlezen niet ondersteund.'); speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); if(selectedVoice) u.voice=selectedVoice; u.lang=(selectedVoice&&selectedVoice.lang)||'nl-NL'; speechSynthesis.speak(u); }

  // ---------- Kaart (GPX preferred; KML guarded) ----------
  function initLeafletMap(){
    try{
      const div = $('#oneMap'); if(!div || !window.L) return;
      const icon = (cls)=> L.divIcon({ className: 'pin '+cls, iconSize:[16,16], iconAnchor:[8,8] });
      const iconStart = icon('start'), iconStop = icon('stop'), iconEnd = icon('end');
      const iconUser  = L.divIcon({ className:'user-dot', iconSize:[14,14], iconAnchor:[7,7] });

      const start = (DATA.stops||[])[0] || {lat:50.85,lng:2.89};
      LMAP = L.map(div, { zoomControl:true }).setView([start.lat, start.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(LMAP);

      const bounds=[];
      (DATA.stops||[]).forEach(s=>{
        const p=[s.lat,s.lng]; bounds.push(p);
        let ic = iconStop;
        if (s.id===DATA.meta?.startStopId) ic = iconStart;
        if (s.id===DATA.meta?.endStopId)   ic = iconEnd;
        L.marker(p, {icon:ic}).addTo(LMAP).bindPopup(s.naam);
        L.circle(p,{radius:s.radius||DATA.meta?.radiusDefaultMeters||200,color:'#3dd1c0',weight:1,fillOpacity:.05}).addTo(LMAP);
      });
      if(bounds.length) LMAP.fitBounds(bounds,{padding:[20,20]});

      // Route tekenen (GPX → Leaflet.GPX; KML → toGeoJSON)
      (async ()=>{
        const routePath = (DATA.meta?.routePath || DATA.meta?.kmlPath);
        if(!routePath) return;

        if (routePath.toLowerCase().endsWith('.gpx') && window.L.GPX){
          new L.GPX(routePath, { async:true, polyline_options:{ weight:4, opacity:.95 } })
            .on('loaded', e => { try { LMAP.fitBounds(e.target.getBounds(), { padding:[20,20] }); } catch{} })
            .addTo(LMAP);
          return;
        }
        if (routePath.toLowerCase().endsWith('.kml')){
          if (!window.toGeoJSON){ console.warn('toGeoJSON ontbreekt; sla KML over.'); return; }
          const txt = await fetch(routePath, { cache:'no-store' }).then(r=>r.text());
          const xml = new DOMParser().parseFromString(txt, 'text/xml');
          const gj  = toGeoJSON.kml(xml);
          const layer = L.geoJSON(gj, {
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius:3, weight:1, opacity:.9, fillOpacity:.6 }),
            style: (f) => /LineString|MultiLineString/i.test(f.geometry?.type||'')
              ? { weight: 4, opacity: 0.95 }
              : { weight: 1, opacity: 0.6 }
          }).addTo(LMAP);
          try { LMAP.fitBounds(layer.getBounds(), { padding:[20,20] }); } catch {}
        }
      })();

      // Live positie
      liveMarker = L.marker([0,0], { icon:iconUser, opacity:0 }).addTo(LMAP);
      accCircle  = L.circle([0,0], { radius:0, color:'#3dd1c0', fillOpacity:.1 }).addTo(LMAP);
    }catch(e){ console.error(e); showDiag('Kaart error: '+e.message); }
  }
  function updateLeafletLive(lat,lng,acc){
    try{
      if(!LMAP || !liveMarker || !accCircle) return;
      liveMarker.setLatLng([lat,lng]).setOpacity(1);
      accCircle.setLatLng([lat,lng]).setRadius(acc||0);
      if (followMe) LMAP.setView([lat,lng]);
      const a=$('#openInMaps'); if(a) a.href=`https://maps.google.com/?q=${lat},${lng}`;
    }catch(e){ console.error(e); }
  }

  // ---------- Geoloc ----------
  function tryUnlock(best, acc){
    const effective = Math.max(0, best.d - (acc||0));
    if(effective <= best.radius){
      const st=store.get(); st.unlocked=st.unlocked||[];
      if(best.id===DATA.meta?.endStopId){
        const req = new Set(DATA.meta?.requiredStops||[]);
        const haveAll = [...req].every(id=>st.unlocked.includes(id));
        if(!haveAll) return;
      }
      if(!st.unlocked.includes(best.id)){
        st.unlocked.push(best.id); store.set(st);
        renderUnlocked(); renderStops(); toast(`✅ Ontgrendeld: ${best.name}`);
      }
    }
  }
  function startWatch(){
    const gs=$('#geoState'); if(gs) gs.textContent='Actief';
    if(!('geolocation' in navigator)){ $('#permNote')?.append(' • Geen geolocatie'); return; }
    watchId = navigator.geolocation.watchPosition(pos=>{
      const {latitude,longitude,accuracy}=pos.coords;
      $('#coords').textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      $('#acc').textContent = Math.round(accuracy);

      const here={lat:latitude,lng:longitude};
      let best=null; let insideStart=false;
      (DATA.stops||[]).forEach(s=>{
        const d = Math.round(distanceMeters(here,{lat:s.lat,lng:s.lng}));
        if(!best||d<best.d) best={id:s.id,name:s.naam,d,radius:(s.radius||DATA.meta?.radiusDefaultMeters||200)};
        if(s.id===DATA.meta?.startStopId){ insideStart = d <= (s.radius||DATA.meta?.radiusDefaultMeters||200); }
      });
      window.__insideStart = insideStart; renderCharacterChooser();

      const st=store.get(); st.flags=st.flags||{};
      if(insideStart){ st.flags.seenStart = true; store.set(st); }
      if(!insideStart && st.flags.seenStart && !st.lockedPc){ st.lockedPc=true; store.set(st); renderCharacterChooser(); toast('🔒 Personage vergrendeld'); }

      if(best){
        $('#closest').textContent=best.name; $('#dist').textContent=`${best.d}`; $('#radius').textContent=`${best.radius}`;
        tryUnlock(best, accuracy); renderProgress(); renderStops();
        updateLeafletLive(latitude, longitude, accuracy);
      }
      if(!LMAP && window.L && navigator.onLine) initLeafletMap(); // kaart laadt lui
    }, err=>{
      $('#permNote').innerHTML='<span class="warn">Locatie geweigerd</span>';
      const gs=$('#geoState'); if(gs) gs.textContent='Uit';
    }, {enableHighAccuracy:true,maximumAge:10000,timeout:15000});
  }
  function stopWatch(){ if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; const gs=$('#geoState'); if(gs) gs.textContent='Inactief'; } }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    bindCoreListeners();                                  // ← knoppen werken sowieso
    try{
      // Data laden (mag falen zonder de app te “breken”)
      DATA = await loadScenario();
      // UI
      const st=store.get(); if(!st.pcId) { ensureCharacter(); store.set(st); }
      renderProfile(); renderStops(); renderUnlocked(); renderProgress();
      // Kaart (online)
      if (navigator.onLine) initLeafletMap();
      window.addEventListener('online', ()=>{ if(!LMAP) initLeafletMap(); });
      // TTS voices
      if('speechSynthesis' in window){ try{pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice);}catch{} }

      // Data-afhankelijke listeners
      $('#regenBtn')?.addEventListener('click',()=>{ const st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Buiten startzone kan je niet wisselen.'); return; } delete st.pcId; store.set(st); ensureCharacter(); renderProfile(); renderUnlocked(); toast('🎲 Nieuw personage gekozen'); });
      $('#savePcBtn')?.addEventListener('click',()=>{ const st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Wijzigen kan enkel aan de start.'); return; } if(!window.__insideStart){ toast('🔐 Ga naar de startlocatie om te kiezen.'); return; } const sel=$('#pcSelect'); if(sel){ st.pcId=sel.value; store.set(st); renderProfile(); toast('✅ Personage bevestigd'); }});
      $('#exportBtn')?.addEventListener('click',()=>{ const st=store.get(); const pc=currentPc()||{}; const lines=[]; lines.push(`# ${DATA.meta?.title||'WOI – Mijn Personage'}`); lines.push(`Personage: ${pc.naam||'—'} (${pc.herkomst||'—'}) – ${pc.rol||'—'}`); lines.push(''); for(const id of (st.unlocked||[])){ const stop=(DATA.stops||[]).find(s=>s.id===id); lines.push(`## ${stop?.naam||id}`); lines.push((pc.verhalen||{})[id]||'(geen tekst)'); lines.push(''); } const blob=new Blob([lines.join('\n')],{type:'text/markdown'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='woi-voortgang.md'; a.click(); URL.revokeObjectURL(url); });

      // SW status
      if('serviceWorker' in navigator){
        navigator.serviceWorker.register('./sw.js?v=2025-09-02-safe',{scope:'./'})
          .then(()=>{ $('#cacheState')?.textContent='Geïnstalleerd'; })
          .catch(()=>{ $('#cacheState')?.textContent='Niet geïnstalleerd'; });
      }
      console.log('[WOI] boot klaar');
      $('#diag').style.display='none'; // verberg “app.js geladen ✓”
    }catch(e){
      showDiag('Data laden mislukte: ' + (e?.message || e));
      console.error(e);
    }
  });

  // Errors globaal tonen
  window.addEventListener('error', e=>showDiag('JS error: '+e.message));
  window.addEventListener('unhandledrejection', e=>showDiag('Promise error: '+(e.reason?.message||e.reason)));
})();
