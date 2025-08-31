// /js/app.js
(function(){
  'use strict';

  // ---------- Helpers ----------
  const $=sel=>document.querySelector(sel);
  const showDiag = (msg) => { const d=$('#diag'); if(!d) return; d.style.display='block'; d.textContent=String(msg).slice(0,500); };
  window.addEventListener('error', e=>showDiag('JS error: '+e.message));
  window.addEventListener('unhandledrejection', e=>showDiag('Promise error: '+(e.reason?.message||e.reason)));

  const store={get(){ try{return JSON.parse(localStorage.getItem('woi_state')||'{}')}catch{return{}}}, set(v){ localStorage.setItem('woi_state', JSON.stringify(v)); }};
  const distanceMeters=(a,b)=>{ const R=6371e3,φ1=a.lat*Math.PI/180,φ2=b.lat*Math.PI/180,dφ=(b.lat-a.lat)*Math.PI/180,dλ=(b.lng-a.lng)*Math.PI/180; const s=Math.sin(dφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2; return 2*R*Math.asin(Math.sqrt(s)); };
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const on=(id,ev,fn)=>{ const el=$(id.startsWith('#')?id:'#'+id); if(el) el.addEventListener(ev,fn); };

  function toast(msg){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>{t.style.display='none'},2000); }

  // ---------- Data loader ----------
  async function fetchJSON(url){
    const res = await fetch(url + (url.includes('?')?'&':'?') + 'v=20250901', { cache:'no-store' });
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

  // ---------- App state / render ----------
  let DATA = { meta:{}, stops:[], personages:[] };
  function ensureCharacter(){
    const st=store.get(); const forced=new URLSearchParams(location.search).get('pc');
    if(forced && DATA.personages.some(p=>p.id===forced)){ st.pcId=forced; st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return st.pcId; }
    if(st.pcId && DATA.personages.some(p=>p.id===st.pcId)){ st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return st.pcId; }
    const pc=pick(DATA.personages); st.pcId=pc.id; st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return pc.id;
  }
  const currentPc=()=>DATA.personages.find(p=>p.id===store.get().pcId);

  function renderProfile(){
    const pc=currentPc(); if(!pc) return;
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
    const options = DATA.personages.map(p=>`<option value="${p.id}" ${p.id===st.pcId?'selected':''}>${p.naam} (${p.leeftijd}) — ${p.rol}</option>`).join('');
    const inside = window.__insideStart===true; const locked = !!st.lockedPc;
    el.innerHTML = `<select id="pcSelect" ${locked?'disabled':''} ${!inside&&!locked?'disabled':''}>${options}</select>
      <span class="pill ${locked?'ok':''}">${locked?'🔒 Keuze vergrendeld': (inside? '🟢 Je kan hier je personage kiezen' : '🔐 Kiesbaar enkel aan de start')}</span>`;
  }
  function renderStops(){
    const cont=$('#stopsList'); if(!cont) return;
    const st=store.get(); const unlocked=new Set(st.unlocked||[]);
    cont.innerHTML = DATA.stops.map(s=>{
      const ok = unlocked.has(s.id); const isEnd = s.id===DATA.meta.endStopId;
      const icon = ok ? '✅' : (isEnd ? '🔒' : '⏳');
      return `<span class="pill">${icon} ${s.naam}</span>`;
    }).join('');
  }
  function renderUnlocked(){
    const st=store.get(); const pc=currentPc(); const cont=$('#unlockList'); if(!cont) return;
    if(!st.unlocked||!st.unlocked.length){cont.innerHTML='<div class="muted">Nog niets ontgrendeld.</div>';return;}
    cont.innerHTML = st.unlocked.map(id=>{
      const stop = DATA.stops.find(s=>s.id===id);
      const txt = pc.verhalen?.[id];
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
    const st = store.get(); const req = DATA.meta.requiredStops||[];
    const done = (st.unlocked||[]).filter(id=>req.includes(id)).length;
    const total=req.length; const deg = total?(done/total)*360:0;
    const ring=$('#progressRing'), txt=$('#progressText');
    if(ring) ring.style.background = `conic-gradient(var(--accent) ${deg}deg, rgba(255,255,255,.15) 0 360deg)`;
    if(txt) txt.textContent = `${done}/${total}`;
  }

  // ---------- Speech ----------
  let selectedVoice=null;
  function pickVoice(){ try{ const vs=speechSynthesis.getVoices(); selectedVoice = vs.find(v=>v.lang?.toLowerCase().startsWith('nl')) || vs.find(v=>v.lang?.toLowerCase().startsWith('en')) || vs[0]||null; }catch{} }
  function speakText(t){ if(!('speechSynthesis'in window)) return alert('Voorlezen niet ondersteund.'); speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); if(selectedVoice) u.voice=selectedVoice; u.lang=(selectedVoice&&selectedVoice.lang)||'nl-NL'; speechSynthesis.speak(u); }

  // ---------- Leaflet kaart ----------
  let LMAP, liveMarker, accCircle, followMe=false;

  async function drawOsrmRouteLatLngs(latlngs){
    const coords = latlngs.map(([lat,lng]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/cycling/${coords}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(()=> ({}));
    if (data?.routes?.[0]) {
      return L.geoJSON(data.routes[0].geometry, { style: { weight: 4, opacity: 0.9 } }).addTo(LMAP);
    } else {
      console.warn('OSRM gaf geen route terug:', data);
    }
  }

  function initLeafletMap(){
    try{
      if (!window.L) return;
      const div = $('#oneMap'); if(!div) return;

      const icon = (cls)=> L.divIcon({ className: 'pin '+cls, iconSize:[16,16], iconAnchor:[8,8] });
      const iconStart = icon('start'), iconStop = icon('stop'), iconEnd = icon('end');
      const iconUser  = L.divIcon({ className:'user-dot', iconSize:[14,14], iconAnchor:[7,7] });

      const start = DATA.stops.find(s=>s.id===DATA.meta.startStopId) || DATA.stops[0];
      LMAP = L.map(div, { zoomControl:true }).setView([start.lat, start.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(LMAP);

      const bounds = [];
      DATA.stops.forEach(s=>{
        const p=[s.lat,s.lng]; bounds.push(p);
        let ic = iconStop;
        if (s.id===DATA.meta.startStopId) ic = iconStart;
        if (s.id===DATA.meta.endStopId)   ic = iconEnd;
        L.marker(p, {icon:ic}).addTo(LMAP).bindPopup(s.naam);
        L.circle(p,{radius:s.radius||DATA.meta.radiusDefaultMeters,color:'#3dd1c0',weight:1,fillOpacity:.05}).addTo(LMAP);
      });
      if(bounds.length) LMAP.fitBounds(bounds,{padding:[20,20]});

      (async ()=>{
        const routePath = (DATA.meta.routePath || DATA.meta.kmlPath);
        let hadLine=false;
        if (routePath){
          try{
            const txt = await fetch(routePath, { cache:'no-store' }).then(r=>r.text());
            const xml = new DOMParser().parseFromString(txt, 'text/xml');
            const gj  = routePath.toLowerCase().endsWith('.gpx') ? toGeoJSON.gpx(xml) : toGeoJSON.kml(xml);
            hadLine = (gj.features||[]).some(f => /LineString|MultiLineString/i.test(f.geometry?.type||''));
            L.geoJSON(gj, {
              pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius:3, weight:1, opacity:.9, fillOpacity:.6 }),
              style: (f) => /LineString|MultiLineString/i.test(f.geometry?.type||'')
                ? { weight: 4, opacity: 0.9 }
                : { weight: 1, opacity: 0.6 }
            }).addTo(LMAP);
          }catch(err){ console.warn('Routebestand laden faalde:', err); }
        }
        if (!hadLine) {
          const routePoints = DATA.stops.map(s => [s.lat, s.lng]);
          drawOsrmRouteLatLngs(routePoints);
        }
      })();

      liveMarker = L.marker([0,0], { icon:iconUser, opacity:0 }).addTo(LMAP);
      accCircle  = L.circle([0,0], { radius:0, color:'#3dd1c0', fillOpacity:.1 }).addTo(LMAP);

      const btn = $('#recenterBtn'); if(btn) btn.addEventListener('click', ()=>{ followMe = true; });
    }catch(e){ console.error(e); }
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
  let watchId=null; window.__insideStart=false;
  function tryUnlock(best, acc){
    const effective = Math.max(0, best.d - (acc||0));
    if(effective <= best.radius){
      const st=store.get(); st.unlocked=st.unlocked||[];
      if(best.id===DATA.meta.endStopId){
        const req = new Set(DATA.meta.requiredStops);
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
    if(!('geolocation'in navigator)){ const pn=$('#permNote'); if(pn) pn.textContent='Geen geolocatie'; return; }
    const gs=$('#geoState'); if(gs) gs.textContent='Actief';
    watchId = navigator.geolocation.watchPosition(pos=>{
      const {latitude,longitude,accuracy}=pos.coords;
      const cc=$('#coords'); if(cc) cc.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      const ac=$('#acc'); if(ac) ac.textContent = Math.round(accuracy);
      const here={lat:latitude,lng:longitude};
      let best=null; let insideStart=false;
      for(const s of DATA.stops){
        const d = Math.round(distanceMeters(here,{lat:s.lat,lng:s.lng}));
        if(!best||d<best.d) best={id:s.id,name:s.naam,d,radius:(s.radius||DATA.meta.radiusDefaultMeters)};
        if(s.id===DATA.meta.startStopId){ insideStart = d <= (s.radius||DATA.meta.radiusDefaultMeters); }
      }
      window.__insideStart = insideStart; renderCharacterChooser();

      const st=store.get(); st.flags=st.flags||{};
      if(insideStart){ st.flags.seenStart = true; store.set(st); }
      if(!insideStart && st.flags.seenStart && !st.lockedPc){ st.lockedPc=true; store.set(st); renderCharacterChooser(); toast('🔒 Personage vergrendeld'); }

      if(best){
        const cl=$('#closest'); if(cl) cl.textContent=best.name;
        const di=$('#dist'); if(di) di.textContent=`${best.d}`;
        const ra=$('#radius'); if(ra) ra.textContent=`${best.radius}`;
        tryUnlock(best, accuracy); renderProgress(); renderStops();
        updateLeafletLive(latitude, longitude, accuracy);
      }
    }, err=>{ const pn=$('#permNote'); if(pn) pn.innerHTML='<span class="warn">Locatie geweigerd</span>'; const gs=$('#geoState'); if(gs) gs.textContent='Uit'; }, {enableHighAccuracy:true,maximumAge:10000,timeout:15000});
  }
  function stopWatch(){ if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; const gs=$('#geoState'); if(gs) gs.textContent='Inactief'; } }

  // ---------- Boot ----------
  async function boot(){
    try{
      // Data
      DATA = await loadScenario();

      // Kaart
      if (navigator.onLine) initLeafletMap();
      window.addEventListener('online', ()=>{ if(!LMAP) initLeafletMap(); });

      // TTS
      if('speechSynthesis' in window){ try{pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice);}catch{} }

      // App-state
      ensureCharacter(); renderProfile(); renderStops(); renderUnlocked(); renderProgress();

      // Listeners
      on('regenBtn','click',()=>{ const st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Buiten startzone kan je niet wisselen.'); return; } delete st.pcId; store.set(st); ensureCharacter(); renderProfile(); renderUnlocked(); toast('🎲 Nieuw personage gekozen'); });
      on('savePcBtn','click',()=>{ const st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Wijzigen kan enkel na terugkeer naar de start.'); return; } if(!window.__insideStart){ toast('🔐 Ga naar de startlocatie om te kiezen.'); return; } const sel=$('#pcSelect'); if(sel){ st.pcId=sel.value; store.set(st); renderProfile(); toast('✅ Personage bevestigd'); }});
      on('exportBtn','click',()=>{ const st=store.get(); const pc=currentPc(); const lines=[]; lines.push(`# ${DATA.meta.title}`); lines.push(`Personage: ${pc.naam} (${pc.herkomst}) – ${pc.rol}`); lines.push(''); for(const id of (st.unlocked||[])){ const stop=DATA.stops.find(s=>s.id===id); lines.push(`## ${stop?.naam||id}`); lines.push(pc.verhalen[id]||'(geen tekst)'); lines.push(''); } const blob=new Blob([lines.join('\n')],{type:'text/markdown'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='woi-voortgang.md'; a.click(); URL.revokeObjectURL(url); });
      on('unlockList','click',(e)=>{ const b=e.target.closest && e.target.closest('button.readBtn'); if(!b) return; const id=b.getAttribute('data-read'); const pc=currentPc(); const txt=pc?.verhalen?.[id]; if(txt){ if('speechSynthesis'in window && speechSynthesis.speaking){ speechSynthesis.cancel(); } else { speakText(txt); } }});
      on('startBtn','click',startWatch);
      on('stopBtn','click',stopWatch);
      on('demoBtn','click',()=>{ const s=DATA.stops.find(x=>x.id===DATA.meta.requiredStops[0])||DATA.stops[0]; tryUnlock({id:s.id,name:s.naam,d:0,radius:(s.radius||DATA.meta.radiusDefaultMeters)}); });
      on('resetBtn','click',()=>{ localStorage.removeItem('woi_state'); location.reload(); });
      on('recenterBtn','click',()=>{ followMe = true; });

      // Install prompt
      let deferredPrompt=null;
      window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=$('#installHint'); if(b){b.textContent='📲 Installeer app'; b.classList.add('primary');}});
      on('installHint','click',async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; } else { alert('Installeer via browser-menu: Chrome: ⋮ → Toevoegen aan startscherm. Safari: Deel-icoon → Zet op beginscherm.'); }});

      // Service worker
      if('serviceWorker' in navigator){
        navigator.serviceWorker.register('./sw.js?v=2025-09-01-js1',{scope:'./'})
          .then(()=>{ const el=$('#cacheState'); if(el) el.textContent='Geïnstalleerd'; })
          .catch(()=>{ const el=$('#cacheState'); if(el) el.textContent='Niet geïnstalleerd'; });
      }
    }catch(e){
      showDiag('Data laden mislukte: ' + (e?.message || e));
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
