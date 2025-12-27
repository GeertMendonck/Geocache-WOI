// /js/app.js — Clean Safe Mode (ES5, geen dubbele code)
(function(){
    'use strict';
  
    // ---- Panic-flag
    try {
      if (typeof window !== 'undefined' && typeof window.__APP_BOUND__ === 'undefined') {
        window.__APP_BOUND__ = false;
      }
    } catch(e){}
  
    // ---------- Config ----------
    var DEBUG = false;
  
    // ---------- Mini helpers ----------
    var __stopsRenderTimer = null;

function scheduleStopsRender(reason){
  if(__stopsRenderTimer) clearTimeout(__stopsRenderTimer);

  // we plannen render op een moment dat layout/panel/DOM al bestaat
  __stopsRenderTimer = setTimeout(function(){
    var tries = 0;

    function attempt(){
      tries++;

      var st = store.get();
      var focus = st.focus || 'story';

      var cont = document.getElementById('stopsList');
      var host = document.getElementById('stopsListHost');

      // cont moet bestaan
      if(!cont){
        if(tries < 10) return requestAnimationFrame(attempt);
        return;
      }

      // Als focus=map verwachten we dat host bestaat, en dat cont in host zit (of kan zitten)
      if(focus === 'map'){
        if(!host){
          if(tries < 10) return requestAnimationFrame(attempt);
          return;
        }
        if(cont.parentElement !== host){
          host.appendChild(cont);
        }

        // belangrijk: host/panel moet zichtbaar zijn, anders render je in "display:none"
        if(host.offsetParent === null){
          if(tries < 10) return requestAnimationFrame(attempt);
          return;
        }
      }

      // ✅ Hier is het “veilig”
      try { renderStops(); } catch(e){}

    }

    requestAnimationFrame(attempt);
  }, 0);
}

    function slotIsRequired(slotId){
        for (var i=0;i<(DATA.slots||[]).length;i++){
          if (DATA.slots[i].id === slotId) return !!DATA.slots[i].required;
        }
        return true;
      }
      
      function slotOrderArray(){
        return DATA.slotOrder || (DATA.slots||[]).map(function(s){ return s.id; });
      }
      
      // label in bolletje: S / E / 1..n (en 🧩 voor optioneel)
      function slotBadgeLabel(slotId){
        if (slotId === 'start') return 'S';
        if (slotId === 'end')   return 'E';
      
        if (!slotIsRequired(slotId)) return '🧩';
      
        var order = slotOrderArray();
        var n = 0;
        for (var i=0;i<order.length;i++){
          var sid = order[i];
          if (sid === 'start' || sid === 'end') continue;
          if (!slotIsRequired(sid)) continue;
          n++;
          if (sid === slotId) return String(n);
        }
        return '?';
      }
      
      function makeSlotIcon(slotId, required, variants){
        var lab = slotBadgeLabel(slotId);
      
        var cls = 'slotMarker'
                + (slotId==='start' ? ' start' : '')
                + (slotId==='end' ? ' end' : '')
                + (required===false ? ' opt' : '')
                + (variants && variants>1 ? ' split' : '');
      
        var splitHtml = (variants && variants>1) ? '<span class="splitBadge">🔀</span>' : '';
      
        return L.divIcon({
          className: cls,
          html: '<div class="bubble"><span class="n">'+lab+'</span>'+splitHtml+'</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
      }
      
    function qs(id){ return document.getElementById(id); }
    function ensureArr(a){ return Array.isArray(a) ? a : []; }
    function addUnique(arr, val){
      if(arr.indexOf(val) === -1) arr.push(val);
      return arr;
    }
    function escapeHtml(s){
      return (s||'').replace(/[&<>"']/g,function(m){
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
      });
    }
  
    function showDiag(msg){
      var d=qs('diag'); if(!d) return;
      d.style.display='block';
      d.textContent=String(msg).slice(0,500);
    }
    function toast(msg){
      var t=qs('toast'); if(!t) return;
      t.textContent=msg; t.style.display='block';
      clearTimeout(t._h); t._h=setTimeout(function(){ t.style.display='none'; }, 2000);
    }
  
    function panelHtml(id, title, body, isOpen){
      return ''
        + '<section class="panel '+(isOpen ? 'is-open' : 'is-collapsed')+'" data-panel="'+id+'">'
        + '  <div class="panelHead">'
        + '    <span>'+title+'</span>'
        + '    <span class="hint">'+(isOpen ? '—' : 'tik om te openen')+'</span>'
        + '  </div>'
        + '  <div class="panelBody">'+body+'</div>'
        + '</section>';
    }
  
    function dataReadyForStops(){
      var locs = DATA.locaties || DATA.stops || [];
      return (locs.length > 0) && (DATA.slots && DATA.slots.length > 0);
    }
  
    function refreshStopsUI(){
      try { renderStops(); } catch(e){}
      if(window.LMAP && window.L){
        try { addStopMarkers(); } catch(e){}
        try { addStopCircles(); } catch(e){}
      }
    }
  
    // ---------- Storage ----------
    var store = {
      get: function(){
        try{ return JSON.parse(localStorage.getItem('woi_state')||'{}'); }
        catch(e){ return {}; }
      },
      set: function(v){
        localStorage.setItem('woi_state', JSON.stringify(v));
      }
    };
  
    // ---------- Math ----------
    function distanceMeters(a,b){
      var R=6371e3, φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180, dφ=(b.lat-a.lat)*Math.PI/180, dλ=(b.lng-a.lng)*Math.PI/180;
      var s=Math.sin(dφ/2)*Math.sin(dφ/2)+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)*Math.sin(dλ/2);
      return 2*R*Math.asin(Math.sqrt(s));
    }
    function pick(arr){
      return arr[Math.floor(Math.random()*arr.length)];
    }
  
    // ---------- Answers ----------
    function getAns(stopId, qi){
      var st=store.get();
      return (((st.answers||{})[stopId]||{})[qi])||'';
    }
    function setAns(stopId, qi, val){
      var st=store.get();
      st.answers=st.answers||{};
      st.answers[stopId]=st.answers[stopId]||{};
      st.answers[stopId][qi]=val;
      store.set(st);
  
      var tag=document.querySelector('.saveBadge[data-stop="'+stopId+'"][data-q="'+qi+'"]');
      if(tag){
        tag.textContent='✔ opgeslagen';
        setTimeout(function(){ tag.textContent=''; }, 1200);
      }
    }
  
    // ---------- MIC ----------
    var MIC_OK = false;
    function detectMic(){
      MIC_OK = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      if (MIC_OK && !navigator.onLine) MIC_OK = false;
    }
  
    // ---------- Audio ding ----------
    var audioCtx = null;
    function initAudio(){
      try { audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); } catch(e){}
    }
    function playDing(){
      if(!audioCtx) return;
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      o.connect(g); g.connect(audioCtx.destination);
      var t = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t+0.01);
      o.start(t);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.20);
      o.stop(t+0.21);
    }
  
    // ---------- Globale state ----------
    var DATA = { meta:{}, stops:[], personages:[] };
    var liveMarker = null, accCircle = null;
    var watchId = null;
    window.__insideStart = false;
  
    var followMe = true;
    var followResumeTimer = null;
    var lastInsideStart = null;
    var pcSelectBusyUntil = 0;
  
    // ---------- Story helper (enkel 1x) ----------
    function getStoryFor(pc, slotId, locId){
      if(!pc || !pc.verhalen) return null;
  
      // backward compat: verhaal rechtstreeks op locId
      if(locId && typeof pc.verhalen[locId] === 'string') return pc.verhalen[locId];
  
      // normaal: per slot
      var s = pc.verhalen[slotId];
      if(!s) return null;
  
      if(typeof s === 'string') return s;
  
      // split-slot: object per locatie-id
      if(locId && typeof s === 'object' && typeof s[locId] === 'string') return s[locId];
  
      // fallback: eerste string
      if(typeof s === 'object'){
        for(var k in s){
          if(Object.prototype.hasOwnProperty.call(s,k) && typeof s[k] === 'string') return s[k];
        }
      }
      return null;
    }
  
    // ---------- Boot proof ----------
    (function(){
      var d=qs('diag');
      if (d){ d.style.display='block'; d.textContent='app.js geladen ✓ (clean)'; }
      if (window.console) console.log('[WOI] app.js clean geladen');
    })();
  
    // ---------- Core listeners ----------
    function bindCoreListeners(){
      var b;
      document.addEventListener('click', function(e){
        var ex = e.target && e.target.closest ? e.target.closest('#exportBtn') : null;
        if(!ex) return;
        exportProgress();
      });
      
      document.addEventListener('pointerdown', initAudio, { once:true });
  
      b=qs('startBtn'); if(b) b.addEventListener('click', function(){ initAudio(); startWatch(); });
      b=qs('resetBtn'); if(b) b.addEventListener('click', function(){ localStorage.removeItem('woi_state'); location.reload(); });
      b=qs('recenterBtn'); if(b) b.addEventListener('click', function(){ followMe = true; });
  
      // Install prompt
      var deferredPrompt=null;
      window.addEventListener('beforeinstallprompt', function(e){
        e.preventDefault(); deferredPrompt=e;
        var hint=qs('installHint');
        if(hint){ hint.textContent='📲 Installeer app'; hint.classList.add('primary'); }
      });
      b=qs('installHint'); if(b) b.addEventListener('click', function(){
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(){ deferredPrompt=null; });
        } else {
          alert('Installeer via browser-menu (Toevoegen aan startscherm).');
        }
      });
  
      // Uitleg toggle (delegation)
      document.addEventListener('click', function(e){
        var btn = e.target && e.target.closest ? e.target.closest('.uitlegToggleIcon') : null;
        if(!btn) return;
        var id = btn.getAttribute('data-toggle');
        var el = document.getElementById(id);
        if(!el) return;
  
        var isHidden = el.classList.contains('hidden');
        if(isHidden){ el.classList.remove('hidden'); btn.textContent='-'; }
        else { el.classList.add('hidden'); btn.textContent='+'; }
      });
  
      // Debug click probe (optioneel)
      if(DEBUG){
        document.addEventListener('click', function(e){
          var bt = e.target && (e.target.closest ? e.target.closest('button') : null);
          if(!bt) return;
          var id = bt.id || (bt.textContent||'').trim();
          toast('CLICK → '+id);
          if (window.console) console.log('CLICK', id);
        });
      }
    }
  // 1x: delegation voor Willekeurig + Bevestig
document.addEventListener('click', function(e){

    // 🎲 Willekeurig
    var regenBtn = e.target && e.target.closest ? e.target.closest('#regenBtn') : null;
    if(regenBtn){
      var st = store.get();
  
      if(window.__insideStart !== true){
        toast('🔐 Willekeurig kan enkel aan de start.');
        return;
      }
      if(st.lockedPc || st.pcConfirmed){
        toast('🔒 Na bevestigen kan je niet meer wisselen.');
        return;
      }
  
      var pc = pick(DATA.personages || []);
      if(!pc){
        toast('⚠️ Geen personages geladen.');
        return;
      }
  
      st.pcId = pc.id;
      store.set(st);
  
      renderProfile();
      renderCharacterChooser();
      toast('🎲 Willekeurig gekozen: ' + (pc.naam || pc.id));
      return;
    }
  
    // ✅ Bevestig keuze
    var saveBtn = e.target && e.target.closest ? e.target.closest('#savePcBtn') : null;
    if(saveBtn){
      var st2 = store.get();
  
      if(window.__insideStart !== true){
        toast('🔐 Ga naar de startlocatie om je personage te bevestigen.');
        return;
      }
      if(st2.lockedPc){
        toast('🔒 Keuze is al vergrendeld.');
        return;
      }
  
      var sel = document.getElementById('pcSelect');
      if(!sel || !sel.value){
        toast('⚠️ Kies eerst een personage.');
        return;
      }
  
      st2.pcId = sel.value;
      st2.pcConfirmed = true;
      st2.geoOn = true;
      st2.routeStarted = true;       // ✅ meteen UI omschakelen
      store.set(st2);
  
      toast('✅ Personage bevestigd. Je kan vertrekken.');
  
      renderProfile();
      renderCharacterChooser();
      applyRouteModeUI();
      renderUnlocked();
  
      if(watchId == null) startWatch();
      return;
    }
  
  });
  
    // ---------- Data loader ----------
    function fetchJSON(url){
      return fetch(url + (url.indexOf('?')>-1?'&':'?') + 'v=20250902', { cache:'no-store' })
        .then(function(res){
          if(!res.ok) throw new Error(url+' → '+res.status+' '+res.statusText);
          return res.text();
        })
        .then(function(txt){
          try { return JSON.parse(txt); }
          catch(e){ throw new Error(url+' → JSON parse error: '+e.message); }
        });
    }
  
    function stopsFileFromQuery(){
      var p = new URLSearchParams(location.search);
      var name = p.get('stops') || 'stops';
      return './data/' + name + '.json';
    }
  
    function loadScenario(){
      return Promise.all([
        fetchJSON('./data/meta.json'),
        fetchJSON(stopsFileFromQuery()),
        fetchJSON('./data/personages.json')
      ]).then(function(arr){
        var meta = arr[0] || {};
        var stopsRaw = arr[1];
        var personages = arr[2] || [];
  
        var slots = null, locaties = null;
  
        if (stopsRaw && typeof stopsRaw === 'object' && !Array.isArray(stopsRaw) && stopsRaw.locaties && stopsRaw.slots) {
          slots = stopsRaw.slots || [];
          locaties = stopsRaw.locaties || [];
        } else {
          locaties = Array.isArray(stopsRaw) ? stopsRaw : [];
          slots = [];
  
          var seen = {};
          locaties.forEach(function(l){
            var s = l && l.slot ? l.slot : null;
            if (s && !seen[s]) { seen[s] = true; slots.push({ id:s, label:s, required:true }); }
          });
  
          if (!slots.length) {
            slots = [
              { id:'start', label:'Start', required:true },
              { id:'end', label:'Einde', required:true }
            ];
          }
        }
  
        var startSlot = meta.startSlot || 'start';
        var endSlot   = meta.endSlot   || 'end';
  
        var slotOrder = (slots || []).map(function(s){ return s.id; });
        var requiredSlots = (slots || []).filter(function(s){ return !!s.required; }).map(function(s){ return s.id; });
  
        return {
          meta: meta,
          stops: locaties,
          slots: slots,
          locaties: locaties,
          startSlot: startSlot,
          endSlot: endSlot,
          slotOrder: slotOrder,
          requiredSlots: requiredSlots,
          personages: personages
        };
      });
    }
  
    // ---------- Personage ----------
    function ensureCharacter(){
      var st = store.get();
      if(st.pcId){
        for(var i=0;i<(DATA.personages||[]).length;i++){
          if(DATA.personages[i].id === st.pcId) return st.pcId;
        }
      }
      var pc = pick(DATA.personages || []);
      st.pcId = pc ? pc.id : null;
      store.set(st);
      return st.pcId;
    }
  
    function currentPc(){
      var st=store.get();
      for (var i=0;i<(DATA.personages||[]).length;i++){
        if (DATA.personages[i].id===st.pcId) return DATA.personages[i];
      }
      return null;
    }
  
    function setPcId(newId){
      var st = store.get();
      st.pcId = newId;
      store.set(st);
      renderProfile();
      renderUnlocked();
      renderStops();
    }
  
    function renderCharacterChooser(){
      var st=store.get();
      var el=qs('pcChooser'); if(!el) return;
  
      var opts='';
      (DATA.personages||[]).forEach(function(p){
        opts += '<option value="'+p.id+'" '+(p.id===st.pcId?'selected':'')+'>'+p.naam+' ('+p.leeftijd+') — '+p.rol+'</option>';
      });
      if(!opts) opts = '<option>Demo</option>';
  
        var inside = window.__insideStart===true;
        var locked = !!st.lockedPc;
        var confirmed = !!st.pcConfirmed;
        var canChoose = inside && !locked && !confirmed;

  
        el.innerHTML =
        '<select id="pcSelect" '+(canChoose?'':'disabled')+'>'+opts+'</select>'
      + '<span class="pill '+(locked?'ok':'')+'">'
      + (locked ? '🔒 Keuze vergrendeld'
                : (confirmed ? '✅ Keuze bevestigd'
                             : (inside ? '🟢 Je kan hier je personage kiezen'
                                       : '🔐 Kiesbaar enkel aan de start')))
      + '</span>';
      
    }
  
    function renderProfile(){
      var pc=currentPc();
      var img=qs('pcImg');
  
      if(!pc){
        var t=qs('pcTitle'); if(t) t.textContent='(Geen personages geladen)';
        var pills=qs('pcPills'); if(pills) pills.innerHTML='';
        var bio=qs('pcBio'); if(bio) bio.textContent='';
        if(img) img.style.display='none';
        renderCharacterChooser();
        return;
      }
  
      var title=qs('pcTitle');
      if(title) title.textContent = pc.naam;
  
      var pillsEl=qs('pcPills');
      if(pillsEl){
        pillsEl.innerHTML =
          '<span class="pill">🎂 <b>'+pc.leeftijd+' jaar</b></span>' +
          '<span class="pill">🌍 <b>'+pc.herkomst+'</b></span>' +
          '<span class="pill">🎖️ <b>'+pc.rol+'</b></span>';
      }
  
      var bioEl=qs('pcBio');
      if(bioEl) bioEl.textContent = pc.bio || '';
  
      if(img){
        img.style.display = 'block';
        img.alt = 'Portret van ' + (pc.naam || 'personage');
        img.src = './data/Personages/' + pc.id + '.png';
        img.onerror = function(){ img.onerror=null; img.style.display='none'; };
      }
  
      renderCharacterChooser();
    }
  
    // Bind pcSelect (slechts 1x, document delegation)
    (function bindPcSelectOnce(){
      if(document.__pcSelectBound) return;
      document.__pcSelectBound = true;
  
      document.addEventListener('change', function(e){
        var t = e.target;
        if(!t || t.id !== 'pcSelect') return;
  
        var st = store.get();
        if(st.lockedPc){
          toast('🔒 Keuze vergrendeld');
          t.value = st.pcId || t.value;
          return;
        }
        if(window.__insideStart !== true){
          toast('🔐 Kiesbaar enkel aan de start');
          t.value = st.pcId || t.value;
          return;
        }
        setPcId(t.value);
        toast('✅ Personage gekozen');
      });
    })();
  
    // ---------- UI: Stops ----------
    function renderStops(){
     // ✅ render altijd naar de host in het kaartpaneel als die er is
        var cont = document.getElementById('stopsListHost') || document.getElementById('stopsList');
        if(!cont) return;

  
      var st = store.get();
      var unlockedSlots = st.unlockedSlots || [];
      var unlockedMap = {};
      unlockedSlots.forEach(function(sid){ unlockedMap[sid]=true; });
  
      var endSlot   = DATA.endSlot  || (DATA.meta && DATA.meta.endSlot)  || 'end';
      var slotOrder = DATA.slotOrder || (DATA.slots||[]).map(function(s){ return s.id; });
  
      function slotObj(sid){
        for (var i=0;i<(DATA.slots||[]).length;i++){
          if (DATA.slots[i].id===sid) return DATA.slots[i];
        }
        return null;
      }
      function slotLabel(sid){
        var o = slotObj(sid);
        var label = (o && o.label) ? o.label : sid;
        if(o && o.required === false) label += ' (opt.)';
        return label;
      }
      function isOptionalSlot(sid){
        var o = slotObj(sid);
        return o ? (o.required === false) : false;
      }
  
      function stripPrefix(name){
        if(!name) return '';
        return name.replace(/^(Stop\s*\d+\s*:\s*|Start\s*:\s*|Einde\s*:\s*)/i, '').trim();
      }
  
      function allLocationsForSlot(slotId){
        var arr = DATA.locaties || DATA.stops || [];
        var out = [];
        for(var i=0;i<arr.length;i++){
          if(arr[i] && arr[i].slot === slotId) out.push(arr[i]);
        }
        return out;
      }
  
      function findLocById(locId){
        var arr = DATA.locaties || DATA.stops || [];
        for (var i=0;i<arr.length;i++){
          if(arr[i] && arr[i].id === locId) return arr[i];
        }
        return null;
      }
  
      function displayPlaceForSlot(sid){
        var locs = allLocationsForSlot(sid);
        if(!locs.length) return '';
  
        if(locs.length > 1 && !unlockedMap[sid]){
          return '🔀 (' + locs.length + ' opties)';
        }
  
        var chosenId = null;
        if(st.unlockedBySlot && st.unlockedBySlot[sid]) chosenId = st.unlockedBySlot[sid];
        else if(locs.length === 1) chosenId = locs[0].id;
        else chosenId = locs[0].id;
  
        var loc = findLocById(chosenId);
        return loc && loc.naam ? stripPrefix(loc.naam) : '';
      }
  
      var html = '';
      (slotOrder||[]).forEach(function(sid){
        var ok = !!unlockedMap[sid];
        var optional = isOptionalSlot(sid);
        var icon = ok ? '✅' : (sid===endSlot ? '🔒' : (optional ? '🧩' : '⏳'));
  
        var label = slotLabel(sid);
        var place = displayPlaceForSlot(sid);
  
        html += '<span class="pill">'
              + icon + ' '
              + '<span class="pillMain">' + escapeHtml(label) + '</span>'
              + (place ? ' <span class="pillSub">· ' + escapeHtml(place) + '</span>' : '')
              + '</span>';
      });
  
      cont.innerHTML = html || '<span class="muted">(Geen stops geladen)</span>';
    }
  
    // ---------- Route/setup UI (FIX) ----------
   // ---------- Route/setup UI (FIX) ----------
   function applyRouteModeUI(){
    var st = store.get();
  
    // ✅ meteen switchen na bevestigen
    var routeMode =
        (st.routeStarted === true) ||
        (st.lockedPc === true) ||
        ((st.unlockedSlots||[]).length > 0) ||
        !!st.currentLocId;
  
    var setup = document.getElementById('setupGrid');
    if(setup) setup.style.display = routeMode ? 'none' : '';
  
    var stops = document.getElementById('stopsSection');
    if(stops) stops.style.display = routeMode ? 'none' : '';
  }
  
  
  
    // ---------- Map (Leaflet) ----------
    function ensureLeafletMap(){
      if(window.LMAP) return;
  
      var el = document.getElementById('oneMap');
      if(!el || !window.L) return;
  
      if(el.getBoundingClientRect().height === 0){
        requestAnimationFrame(ensureLeafletMap);
        return;
      }
  
      var locs = DATA.locaties || DATA.stops || [];
      var first = locs && locs.length ? locs[0] : { lat:50.85, lng:2.89 };
  
      window.LMAP = L.map(el, { zoomControl:true }).setView([first.lat, first.lng], 13);
  
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:19,
        attribution:'&copy; OpenStreetMap'
      }).addTo(window.LMAP);
  
      function pauseFollowThenResume(){
        followMe = false;
        if (followResumeTimer) clearTimeout(followResumeTimer);
        followResumeTimer = setTimeout(function(){ followMe = true; }, 15000);
      }
      window.LMAP.on('movestart', pauseFollowThenResume);
      window.LMAP.on('zoomstart',  pauseFollowThenResume);
      window.LMAP.on('dragstart',  pauseFollowThenResume);
  
      addStopMarkers();
      addStopCircles();
  
      liveMarker = L.marker([0,0], { icon: L.divIcon({ className:'user-dot', iconSize:[14,14], iconAnchor:[7,7] }), opacity:0 }).addTo(window.LMAP);
      accCircle  = L.circle([0,0], { radius:0, color:'#3dd1c0', fillOpacity:.1 }).addTo(window.LMAP);
    }
  
    function addStopMarkers(){
        if(!window.LMAP || !window.L) return;
      
        if(window.__stopMarkerLayer){
          try { window.LMAP.removeLayer(window.__stopMarkerLayer); } catch(e){}
        }
        window.__stopMarkerLayer = L.layerGroup().addTo(window.LMAP);
      
        var locs = DATA.locaties || DATA.stops || [];
      
        // tel hoeveel locaties per slot (split-stops)
        var perSlotCount = {};
        for (var k=0; k<locs.length; k++){
          var a = locs[k];
          if(!a || !a.slot) continue;
          perSlotCount[a.slot] = (perSlotCount[a.slot]||0) + 1;
        }
      
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(!s || s.lat==null || s.lng==null) continue;
      
          // required uit DATA.slots halen
          var so = null;
          for (var j=0;j<(DATA.slots||[]).length;j++){
            if(DATA.slots[j].id === s.slot){ so = DATA.slots[j]; break; }
          }
          var req = so ? !!so.required : true;
      
          var variants = perSlotCount[s.slot] || 1;
          var icon = makeSlotIcon(s.slot, req, variants);
      
          L.marker([s.lat, s.lng], { icon: icon })
            .bindPopup('<b>'+escapeHtml(s.naam||s.id)+'</b>')
            .addTo(window.__stopMarkerLayer);
        }
      }
      
  
    function addStopCircles(){
      if(!window.LMAP || !window.L) return;
      if(!window.__stopMarkerLayer){
        window.__stopMarkerLayer = L.layerGroup().addTo(window.LMAP);
      }
  
      var locs = DATA.locaties || DATA.stops || [];
      for(var i=0;i<locs.length;i++){
        var s = locs[i];
        if(!s || s.lat==null || s.lng==null) continue;
  
        var rad = s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200);
  
        L.circle([s.lat, s.lng], { radius: rad, weight:1, fillOpacity:.05 })
          .addTo(window.__stopMarkerLayer);
      }
    }
  
    function updateLeafletLive(lat,lng,acc){
      try{
        if(!window.LMAP || !liveMarker || !accCircle) return;
        liveMarker.setLatLng([lat,lng]).setOpacity(1);
        accCircle.setLatLng([lat,lng]).setRadius(acc||0);
        if (followMe) window.LMAP.setView([lat,lng]);
        var a=qs('openInMaps'); if(a) a.href='https://maps.google.com/?q='+lat+','+lng;
      }catch(e){ if (window.console) console.error(e); }
    }
  
    // ---------- Progress ----------
    function renderProgress(){
      var st=store.get();
      var req = DATA.requiredSlots || [];
      var unlockedSlots = st.unlockedSlots || [];
  
      var done = 0;
      for (var i=0;i<req.length;i++){
        if (unlockedSlots.indexOf(req[i]) > -1) done++;
      }
  
      var total = req.length;
      var deg= total ? (done/total)*360 : 0;
      var ring=qs('progressRing'), txt=qs('progressText');
      if(ring) ring.style.background = 'conic-gradient(var(--accent) '+deg+'deg, rgba(255,255,255,.15) 0 360deg)';
      if(txt) txt.textContent = done+'/'+total;
    }
  
    // ---------- Unlock + Geo ----------
    function tryUnlock(best, acc){
      var effective = Math.max(0, best.d - (acc||0));
      if(effective > best.radius) return;
  
      var st = store.get();
      st.unlockedSlots = ensureArr(st.unlockedSlots);
      st.unlockedBySlot = st.unlockedBySlot || {};
      st.unlockedLocs = ensureArr(st.unlockedLocs);
  
      var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
      var bestSlot = best.slot;
  
      if(!bestSlot){
        showDiag('tryUnlock: geen slot voor '+best.id);
        return;
      }
  
      // end-check required slots
      if(bestSlot === endSlot){
        var reqSlots = DATA.requiredSlots || [];
        var missing = [];
        st.finished = true;
        for (var r=0; r<reqSlots.length; r++){
          var sid = reqSlots[r];
          if(sid === endSlot) continue;
          if(st.unlockedSlots.indexOf(sid) === -1) missing.push(sid);
        }
        if(missing.length){
          toast('🔒 Eindlocatie pas na: ' + missing.join(', '));
          return;
        }
      }
  
      if(st.unlockedLocs.indexOf(best.id) === -1) st.unlockedLocs.push(best.id);
  
      if(st.unlockedSlots.indexOf(bestSlot) === -1){
        st.unlockedSlots.push(bestSlot);
        st.unlockedBySlot[bestSlot] = best.id;
        st.currentLocId = best.id;
        st.currentSlotId = bestSlot;
        store.set(st);
  
        renderUnlocked();
        scheduleStopsRender('unlock');
        toast('✅ Ontgrendeld: ' + (best.name || bestSlot));
        playDing();
      } else {
        // slot al unlocked: alleen currentLoc updaten indien je dat wil
        st.currentLocId = best.id;
        st.currentSlotId = bestSlot;
        store.set(st);
        renderUnlocked();
      }
    }
  
    function startWatch(){
       if(watchId != null) return; // voorkom dubbele watches
      followMe = true;
      var gs=qs('geoState'); if(gs) gs.textContent='Actief';
  
      if(!('geolocation' in navigator)){
        var pn=qs('permNote'); if(pn) pn.textContent=(pn.textContent||'')+' • Geen geolocatie';
        return;
      }
  
      var startSlot = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
  
      watchId = navigator.geolocation.watchPosition(function(pos){
        var c=pos.coords, latitude=c.latitude, longitude=c.longitude, accuracy=c.accuracy;
        var cc=qs('coords'); if(cc) cc.textContent = latitude.toFixed(5)+', '+longitude.toFixed(5);
        var ac=qs('acc'); if(ac) ac.textContent = Math.round(accuracy);
  
        var here={lat:latitude,lng:longitude};
        var best=null; var insideStart=false;
  
        (DATA.stops||[]).forEach(function(s){
          var d = Math.round(distanceMeters(here,{lat:s.lat,lng:s.lng}));
          if(!best || d < best.d){
            best = { id:s.id, slot:s.slot, name:s.naam, d:d, radius:(s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200)) };
          }
          if(s.slot === startSlot){
            if (d <= (s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200))) insideStart = true;
          }
        });
  
        window.__insideStart = insideStart;
        if (Date.now() >= pcSelectBusyUntil && insideStart !== lastInsideStart) {
          lastInsideStart = insideStart;
          renderCharacterChooser();
        }
  
        var st=store.get(); st.flags=st.flags||{};
        if(insideStart){ st.flags.seenStart = true; store.set(st); }
        // ✅ pas locken nadat leerling bevestigd heeft (geoOn=true)
        if(st.geoOn === true && !insideStart && st.flags.seenStart && !st.lockedPc){
        st.lockedPc = true;
        store.set(st);
        renderCharacterChooser();
        toast('🔒 Personage vergrendeld');
        applyRouteModeUI(); // optioneel: meteen UI omschakelen
         }
  
        if(best){
          var cl=qs('closest'); if(cl) cl.textContent=best.name;
          var di=qs('dist'); if(di) di.textContent=String(best.d);
          var ra=qs('radius'); if(ra) ra.textContent=String(best.radius);
  
          // ✅ pas unlocken nadat leerling bevestigd heeft
        if(st.geoOn === true){
        tryUnlock(best, accuracy);
        renderProgress();
        scheduleStopsRender('unlock');
         } else {
            // pre-start: toon wel progress/stops als je wil, maar zonder unlock-logica
            renderProgress();
  }
  
  
          ensureLeafletMap();
          updateLeafletLive(latitude, longitude, accuracy);
        }
      }, function(err){
        var pn2=qs('permNote'); if(pn2) pn2.innerHTML='<span class="warn">Locatie geweigerd</span>';
        var gs2=qs('geoState'); if(gs2) gs2.textContent='Uit';
      }, {enableHighAccuracy:true,maximumAge:10000,timeout:15000});
    }
  
    function stopWatch(){
      if(watchId!==null){
        navigator.geolocation.clearWatch(watchId);
        watchId=null;
        var gs=qs('geoState'); if(gs) gs.textContent='Inactief';
      }
    }
  
    // ---------- renderUnlocked (ingekort: park map 1x, restore 1x) ----------
    function renderUnlocked(){
      applyRouteModeUI();
  
      var st = store.get();
      var pc = currentPc();
      var cont = qs('unlockList'); if(!cont) return;
  
      var arr = DATA.locaties || DATA.stops || [];
  
      function findLocById(id){
        for(var i=0;i<arr.length;i++){
          if(arr[i] && arr[i].id === id) return arr[i];
        }
        return null;
      }
  
      var currentLoc = st.currentLocId ? findLocById(st.currentLocId) : null;
      if(!currentLoc && (st.unlockedLocs||[]).length){
        currentLoc = findLocById(st.unlockedLocs[st.unlockedLocs.length-1]);
      }
      if(!currentLoc){
        cont.innerHTML = '<div class="muted">Nog geen huidige stop. Wandel eens binnen een cirkel 🙂</div>';
        renderProgress();
        return;
      }
  
      var loc = currentLoc;
      var locId = loc.id;
      var slotId = loc.slot;
      var title = loc.naam || locId;
  
      var verhaal = getStoryFor(pc, slotId, locId);
  
      var uitleg = loc.uitleg || null;
      var uitlegKort = '', uitlegLang = '';
      if(uitleg){
        if(typeof uitleg === 'string') uitlegKort = uitleg;
        else { uitlegKort = uitleg.kort || ''; uitlegLang = uitleg.uitgebreid || ''; }
      }
  
      var uitlegHtml = '';
      if(uitlegKort || uitlegLang){
        var moreId = 'more_' + locId;
        uitlegHtml =
          '<div class="uitlegBox">'
          + '  <div class="uitlegTitle">'
          + '    <span class="uitlegTitleText">ℹ️ Uitleg</span>'
          + (uitlegLang ? ' <button class="uitlegToggleIcon" type="button" data-toggle="'+moreId+'">+</button>' : '')
          + '  </div>'
          + (uitlegKort ? ('<div class="uitlegKort">'+escapeHtml(uitlegKort)+'</div>') : '')
          + (uitlegLang ? ('<div id="'+moreId+'" class="uitlegLang hidden">'+escapeHtml(uitlegLang)+'</div>') : '')
          + '</div>';
      }
  
      var qsArr = loc.vragen || [];
      var qaHtml = '';
      if(qsArr.length){
        qaHtml = qsArr.map(function(q,qi){
          var val = getAns(locId, qi);
          return '<div class="qa">'
          + '<div class="q"><b>Vraag '+(qi+1)+':</b> '+escapeHtml(q)+'</div>'
          + '<div class="controls">'
          + '  <textarea class="ans" data-stop="'+locId+'" data-q="'+qi+'" placeholder="Jouw antwoord...">'+escapeHtml(val)+'</textarea>'
          + '  <div class="btnRow">'
          + (MIC_OK ? '    <button class="micBtn" data-stop="'+locId+'" data-q="'+qi+'">🎙️</button>' : '')
          + '    <button class="clearAns" data-stop="'+locId+'" data-q="'+qi+'">✖</button>'
          + '    <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+qi+'"></span>'
          + '  </div>'
          + '</div>'
          + '</div>';
          }).join('');
      } else {
        qaHtml = '<div class="muted">Geen vragen bij deze stop.</div>';
      }
  
      var pcCard =
        '<div class="pcMini">'
        + ' <img class="pcMiniImg" src="'+escapeHtml(qs("pcImg") ? qs("pcImg").src : "")+'" alt=""/>'
        + ' <div class="pcMiniMeta">'
        + '   <div class="pcMiniName">'+escapeHtml(pc && pc.naam ? pc.naam : '—')+'</div>'
        + '   <div class="pcMiniSub muted">'+escapeHtml(pc && pc.herkomst ? pc.herkomst : '—')+' — '+escapeHtml(pc && pc.rol ? pc.rol : '—')+'</div>'
        + (pc && pc.bio ? ('<div class="pcMiniBio">'+escapeHtml(pc.bio)+'</div>') : '')
        + ' </div>'
        + '</div>';
  
      var focus = (st.focus || 'story');
      if(!st.focus){
        var routeMode = (st.geoOn === true) || (st.lockedPc === true) ||
                        ((st.unlockedSlots||[]).length > 0) || (st.currentLocId);
        if(routeMode){
          focus = 'map';
          st.focus = 'map';
          store.set(st);
        }
      }
      var storyBody = ''
        + pcCard
        + '<div style="margin-top:10px">'
        +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
        +     '<div style="font-weight:800">📘 Verhaal</div>'
        +     '<button class="readBtn" data-slot="'+slotId+'" data-loc="'+locId+'" title="Lees voor">🔊</button>'
        +   '</div>'
        +   '<div style="margin-top:6px">' + (verhaal ? escapeHtml(verhaal) : '<span class="muted">(Geen tekst)</span>') + '</div>'
        + '</div>';
  
      var qaBody =
        '<div id="statusWrapQa"></div>'
        + (uitlegHtml || '<div class="muted">(Geen uitleg)</div>')
        + '<div style="margin-top:10px">' + qaHtml + '</div>';
  
      var mapBody =
        '<div id="statusWrapMap"></div>'
        + '<div id="mapPanelWrap" style="height:68vh; min-height:320px; border-radius:12px; overflow:hidden;"></div>'
        + '<div id="mapControlsWrap" class="row small mt-8"></div>'
        + '<div class="mt-10">'
        + '  <div class="muted small" style="margin-bottom:6px">Stops</div>'
        + '  <div id="stopsListHost" class="stopsPills"></div>'
        + '</div>';


        var qaBody =
        '<div id="statusWrapQa"></div>'
        + (uitlegHtml || '<div class="muted">(Geen uitleg)</div>')
        + '<div style="margin-top:10px">' + qaHtml + '</div>'
        + downloadHtml;
      
      var html =
        '<div class="stack">'
        + panelHtml('story','Personage + Verhaal', storyBody, focus==='story')
        + panelHtml('qa','Uitleg en vragen', qaBody, focus==='qa')
        + panelHtml('map','Kaart', mapBody, focus==='map')
        + '</div>';
        var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
        var isEnd = (loc && loc.slot === endSlot);
        
        var downloadHtml = '';
        if(isEnd){
          downloadHtml =
            '<div class="card mt-10">'
          + '  <div class="cardHead">📄 Je bent aan het eindpunt</div>'
          + '  <div class="cardBody">'
          + '    <button id="exportBtn" type="button" class="primary">⬇️ Download verslag</button>'
          + '  </div>'
          + '</div>';
        }
        
      // Park oneMap vóór innerHTML
      var oneMap = document.getElementById('oneMap');
      var park = document.getElementById('mapPark');
      if(!park){
        park = document.createElement('div');
        park.id = 'mapPark';
        park.style.display = 'none';
        document.body.appendChild(park);
      }
      if(oneMap && oneMap.parentElement !== park) park.appendChild(oneMap);
  
      cont.innerHTML = html;
  
      // Stops lijst naar host
    //   var host = document.getElementById('stopsListHost');
    //   var stopsList = document.getElementById('stopsList');
    //   if(host && stopsList && stopsList.parentElement !== host) host.appendChild(stopsList);
      scheduleStopsRender('after renderUnlocked move');
      // oneMap terug naar wrap
      var wrap = document.getElementById('mapPanelWrap');
      oneMap = document.getElementById('oneMap');
      if(wrap && oneMap && oneMap.parentElement !== wrap) wrap.appendChild(oneMap);
      if(oneMap){
        oneMap.style.height = '100%';
        oneMap.style.minHeight = '260px';
      }
  
      // controls verhuizen
      var ctrl = document.getElementById('mapControlsWrap');
      if(ctrl){
        var btn = document.getElementById('recenterBtn');
        var link = document.getElementById('openInMaps');
        if(btn) ctrl.appendChild(btn);
        if(link) ctrl.appendChild(link);
      }
  
      // Leaflet init + invalidate als map focus
      if(focus === 'map'){
        ensureLeafletMap();
      
        setTimeout(function(){
          if(window.LMAP) window.LMAP.invalidateSize(true);
          scheduleStopsRender('panel map opened');
        }, 200);
      }
      
  
      renderProgress();
    }
  
    // ---------- Panel click: focus opslaan ----------
    document.addEventListener('click', function(e){
      var head = e.target && e.target.closest ? e.target.closest('.panelHead') : null;
      if(!head) return;
  
      var panel = head.closest('.panel');
      if(!panel) return;
  
      var focus = panel.getAttribute('data-panel');
      if(!focus) return;
  
      var st = store.get();
      st.focus = focus;
      store.set(st);
  
      renderUnlocked();
  
      if(focus === 'map'){
        setTimeout(function(){
          if(window.LMAP) window.LMAP.invalidateSize(true);
        }, 200);
      }
    });
  
    // ---------- DOM Ready ----------
    document.addEventListener('DOMContentLoaded', function(){
      bindCoreListeners();
      
    

  
      loadScenario().then(function(data){
        DATA = data;
  
        var st=store.get();
        if(!st.pcId) ensureCharacter();
  
        detectMic();
  
        renderProfile();
        renderUnlocked();
        renderProgress();
        // renderStops pas plannen na renderUnlocked (want die maakt stopsListHost aan)
        scheduleStopsRender('after initial renderUnlocked');
        refreshStopsUI();
  
        // pcSelect “busy” (picker open)
        var chooser = document.getElementById('pcChooser');
        if (chooser) {
          chooser.addEventListener('focusin', function(e){
            if (e.target && e.target.id === 'pcSelect') pcSelectBusyUntil = Date.now() + 4000;
          });
          chooser.addEventListener('touchstart', function(e){
            if (e.target && (e.target.id === 'pcSelect' || (e.target.closest && e.target.closest('#pcSelect')))) {
              pcSelectBusyUntil = Date.now() + 4000;
            }
          }, {passive:true});
        }
  
        window.addEventListener('online',  function(){ detectMic(); renderUnlocked(); ensureLeafletMap(); });
        window.addEventListener('offline', function(){ detectMic(); renderUnlocked(); });
  
        // Answer save delegation op unlockList
        var ul=qs('unlockList');
        if(ul){
          function handleSave(e){
            var t = e.target;
            var ta = t && t.matches && t.matches('textarea.ans') ? t : (t && t.closest ? t.closest('textarea.ans') : null);
            if(!ta) return;
            var stopId = ta.getAttribute('data-stop');
            var qi     = parseInt(ta.getAttribute('data-q'), 10);
            setAns(stopId, qi, ta.value);
          }
          ul.addEventListener('input', handleSave);
          ul.addEventListener('change', handleSave);
          ul.addEventListener('blur', handleSave, true);
  
          ul.addEventListener('click', function(e){
            var clr = e.target && e.target.closest ? e.target.closest('button.clearAns') : null;
            if(clr){
              var sid = clr.getAttribute('data-stop');
              var qi = parseInt(clr.getAttribute('data-q'),10);
              setAns(sid, qi, '');
              var ta = ul.querySelector('textarea.ans[data-stop="'+sid+'"][data-q="'+qi+'"]');
              if(ta){ ta.value=''; ta.focus(); }
              return;
            }
  
            var mic = e.target && e.target.closest ? e.target.closest('button.micBtn') : null;
            if(mic){
              if(!MIC_OK){ toast('Spraakherkenning niet beschikbaar (probeer online in Chrome).'); return; }
              var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
              var r = new Recognition(); r.lang='nl-NL'; r.interimResults=false; r.maxAlternatives=1;
              var sid2 = mic.getAttribute('data-stop'), qi2 = parseInt(mic.getAttribute('data-q'),10);
              r.onresult = function(ev){
                var txt2 = ev.results[0][0].transcript || '';
                var ta2 = ul.querySelector('textarea.ans[data-stop="'+sid2+'"][data-q="'+qi2+'"]');
                if(ta2){
                  ta2.value = (ta2.value ? ta2.value+' ' : '') + txt2;
                  setAns(sid2, qi2, ta2.value);
                }
              };
              r.onerror = function(ev){
                var msg = (ev && ev.error) ? ev.error : 'mislukt';
                if (msg==='not-allowed') msg = 'toegang geweigerd (controleer microfoonrechten)';
                if (msg==='network') msg = 'offline? (internet vereist in Chrome)';
                toast('🎙️ '+msg);
              };
              try { r.start(); toast('🎙️ Spreek maar…'); } catch(_e){ toast('🎙️ kon niet starten'); }
            }
          });
        }
  
        window.__APP_BOUND__ = true;
  
        // SW
        if('serviceWorker' in navigator){
          navigator.serviceWorker.register('./sw.js?v=2025-09-02-v3',{scope:'./'})
            .catch(function(){});
        }
  
        var d=qs('diag');
        if(d){ d.style.display='block'; d.textContent='app.js geladen ✓ — clean build klaar.'; }
  
      }).catch(function(e){
        showDiag('Data laden mislukte: ' + (e && e.message ? e.message : e));
        if (window.console) console.error(e);
      });
    });
    // EXPORT
    function exportProgress(){
        var st = store.get();
        var pc = currentPc() || {};
        var lines = [];
      
        var title = (DATA.meta && DATA.meta.title) ? DATA.meta.title : 'WOI – Voortgang';
        lines.push('# ' + title);
        lines.push('Personage: ' + (pc.naam||'—') + ' (' + (pc.herkomst||'—') + ') – ' + (pc.rol||'—'));
        lines.push('');
      
        var arr = DATA.locaties || DATA.stops || [];
      
        function findLocById(id){
          for(var i=0;i<arr.length;i++){
            if(arr[i] && arr[i].id === id) return arr[i];
          }
          return null;
        }
      
        function exportOneLocation(loc){
          var locId = loc.id;
          var slotId = loc.slot;
      
          lines.push('## ' + (loc.naam || locId || slotId));
      
          var verhaal = getStoryFor(pc, slotId, locId);
          lines.push(verhaal || '(geen tekst)');
          lines.push('');
      
          var qsArr = loc.vragen || [];
          if(qsArr.length){
            lines.push('**Reflectie**');
            for(var qi=0; qi<qsArr.length; qi++){
              var q = qsArr[qi];
              var ans = getAns(locId, qi);
              lines.push('- ' + q);
              lines.push('  - Antwoord: ' + (ans && ans.trim ? ans.trim().replace(/\r?\n/g,' ') : '(—)'));
            }
            lines.push('');
          }
        }
      
        var ids = st.unlockedLocs || [];
        for(var u=0; u<ids.length; u++){
          var loc = findLocById(ids[u]);
          if(loc) exportOneLocation(loc);
        }
      
        var content = '\ufeff' + lines.join('\n');
        var blob = new Blob([content], {type:'text/markdown;charset=utf-8'});
        var url = URL.createObjectURL(blob);
      
        var a = document.createElement('a');
        a.href = url;
        a.download = 'woi-verslag.md';
        a.click();
      
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      }
      




    // Globale errors
    window.addEventListener('error', function(e){ showDiag('JS error: '+e.message); });
    window.addEventListener('unhandledrejection', function(e){
      showDiag('Promise error: '+(e.reason && e.reason.message ? e.reason.message : e.reason));
    });
  
  })();
  