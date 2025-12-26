// /js/app.js — Safe Mode v3 (compatibel, geen optional chaining)
(function(){
  'use strict';

  // ---- Panic-flag: index.html zet deze op false vóór het laden
  try { if (typeof window !== 'undefined' && typeof window.__APP_BOUND__ === 'undefined') window.__APP_BOUND__ = false; } catch(e){}

  // ---------- Mini helpers ----------
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
  
  function qs(id){ return document.getElementById(id); }
  (function bindPcChooserOnce(){
    var el = qs('pcChooser');
    if(!el) return;
    if(el.__boundPcChooser) return;
    el.__boundPcChooser = true;
  
    el.addEventListener('change', function(e){
      var t = e.target;
      if(!t || t.id !== 'pcSelect') return;
  
      var st = store.get();
      if(st.lockedPc){
        toast('🔒 Personage is vergrendeld');
        t.value = st.pcId || t.value; // spring terug
        return;
      }
      if(window.__insideStart !== true){
        toast('🔐 Kies je personage aan de start');
        t.value = st.pcId || t.value;
        return;
      }
  
      st.pcId = t.value;
      store.set(st);
  
      toast('✅ Personage gekozen');
      renderUnlocked();
    });
  })();
  function ensureArr(a){ return Array.isArray(a) ? a : []; }

  function addUnique(arr, val){
    if(arr.indexOf(val) === -1) arr.push(val);
    return arr;
  }
  
  function markLocationUnlocked(loc){
    var st = store.get();
  
    st.unlockedLocs = ensureArr(st.unlockedLocs);
    st.unlockedSlots = ensureArr(st.unlockedSlots);
  
    addUnique(st.unlockedLocs, loc.id);
    addUnique(st.unlockedSlots, loc.slot);
  
    // optioneel: timestamp
    st.visitedAt = st.visitedAt || {};
    if(!st.visitedAt[loc.id]) st.visitedAt[loc.id] = new Date().toISOString();
  
    store.set(st);
  }
  
  function getStoryFor(pc, slotId, locId){
    if(!pc || !pc.verhalen) return null;
  
    // backward compat: ooit verhaal per locId
    if(locId && typeof pc.verhalen[locId] === 'string') return pc.verhalen[locId];
  
    var s = pc.verhalen[slotId];
    if(!s) return null;
  
    if(typeof s === 'string') return s;
  
    // variant map per locatie-id (bv stop01)
    if(locId && typeof s === 'object' && typeof s[locId] === 'string') return s[locId];
  
    // fallback: eerste string
    if(typeof s === 'object'){
      for(var k in s){
        if(Object.prototype.hasOwnProperty.call(s,k) && typeof s[k] === 'string') return s[k];
      }
    }
    return null;
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
  var store = {
    get: function(){ try{ return JSON.parse(localStorage.getItem('woi_state')||'{}'); }catch(e){ return {}; } },
    set: function(v){ localStorage.setItem('woi_state', JSON.stringify(v)); }
  };
  function distanceMeters(a,b){
    var R=6371e3, φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180, dφ=(b.lat-a.lat)*Math.PI/180, dλ=(b.lng-a.lng)*Math.PI/180;
    var s=Math.sin(dφ/2)*Math.sin(dφ/2)+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)*Math.sin(dλ/2);
    return 2*R*Math.asin(Math.sqrt(s));
  }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // Antwoorden opslaan/halen
  function escapeHtml(s){return (s||'').replace(/[&<>"']/g,function(m){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);});}
  function getAns(stopId, qi){
    var st=store.get(); return (((st.answers||{})[stopId]||{})[qi])||'';
  }
  function setAns(stopId, qi, val){
    var st=store.get(); st.answers=st.answers||{}; st.answers[stopId]=st.answers[stopId]||{};
    st.answers[stopId][qi]=val; store.set(st);
    var tag=document.querySelector('.saveBadge[data-stop="'+stopId+'"][data-q="'+qi+'"]');
    if(tag){ tag.textContent='✔ opgeslagen'; setTimeout(function(){ tag.textContent=''; }, 1200); }
  }
  function locationIdForSlot(slotId){
    var st = store.get();
    var map = st.lastUnlockedLocationBySlot || st.unlockedBySlot || {};
    if(map && map[slotId]) return map[slotId];
  
    // fallback: eerste locatie die dit slot gebruikt
    for (var i=0; i<(DATA.stops||[]).length; i++){
      if(DATA.stops[i] && DATA.stops[i].slot === slotId) return DATA.stops[i].id;
    }
    return null;
  }
  function getStoryFor(pc, slotId, locId){
    if(!pc || !pc.verhalen) return null;
  
    // 1) backward compat: soms stond het verhaal rechtstreeks op locId
    if(locId && typeof pc.verhalen[locId] === 'string') return pc.verhalen[locId];
  
    // 2) normaal: verhalen per slot
    var s = pc.verhalen[slotId];
    if(!s) return null;
  
    // s is een string: gewoon tonen
    if(typeof s === 'string') return s;
  
    // s is een object: variant per locatie-id (bv stop01)
    if(locId && typeof s === 'object' && typeof s[locId] === 'string') return s[locId];
  
    // 3) fallback: als er varianten zijn maar we kennen locId niet (of mismatch),
    // pak de eerste string die je vindt zodat je nooit leeg eindigt
    if(typeof s === 'object'){
      for(var k in s){
        if(Object.prototype.hasOwnProperty.call(s,k) && typeof s[k] === 'string'){
          return s[k];
        }
      }
    }
  
    return null;
  }
  

  // MIC detectie (aan/uit bij online/offline)
  var MIC_OK = false;
  function detectMic(){
    MIC_OK = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (MIC_OK && !navigator.onLine) MIC_OK = false; // Chrome ASR is online
  }

  // Web Audio "ding"
  var audioCtx = null;
  function initAudio(){ try { audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} }
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

  // ---------- Globale (module) state ----------
  var DATA = { meta:{}, stops:[], personages:[] };
  var LMAP = null, liveMarker = null, accCircle = null;
  var watchId = null; window.__insideStart = false;

  // Follow-me
  var followMe = true;          // standaard aan
  var followResumeTimer = null; // auto hervatten na user-pan/zoom
  // Keuzelijst behouden
  var lastInsideStart = null;
  var pcSelectBusyUntil = 0;


  // ---------- Bewijs dat script draait ----------
  (function(){
    var d=qs('diag'); if (d){ d.style.display='block'; d.textContent='app.js geladen ✓ (v3)'; }
    if (window.console) console.log('[WOI] app.js v3 geladen');
  })();

  // ---------- Core listeners: ALTIJD binden ----------
  
  function bindCoreListeners(){
    var b;

    // Audio primen + start geoloc
    document.addEventListener('pointerdown', initAudio, { once:true });
    b=qs('startBtn'); if(b) b.addEventListener('click', function(){ initAudio(); startWatch(); });

    b=qs('stopBtn');  if(b) b.addEventListener('click', stopWatch);
    b=qs('resetBtn'); if(b) b.addEventListener('click', function(){ localStorage.removeItem('woi_state'); location.reload(); });
    b=qs('recenterBtn'); if(b) b.addEventListener('click', function(){ followMe = true; });

    // Install prompt
    var deferredPrompt=null;
    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault(); deferredPrompt=e;
      var hint=qs('installHint'); if(hint){ hint.textContent='📲 Installeer app'; hint.classList.add('primary'); }
    });
    b=qs('installHint'); if(b) b.addEventListener('click', function(){
      if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.then(function(){ deferredPrompt=null; }); }
      else { alert('Installeer via browser-menu (Toevoegen aan startscherm).'); }
    });

    // PROBE: toon elke button-click (zichtbaar + console)
    document.addEventListener('click', function(e){
      var bt = e.target && (e.target.closest ? e.target.closest('button') : null);
      if(!bt) return;
      var id = bt.id || (bt.textContent||'').trim();
      var t=qs('toast'); if(t){ t.style.display='block'; t.textContent='CLICK → '+id; setTimeout(function(){ t.style.display='none'; }, 800); }
      if (window.console) console.log('CLICK', id);
    });
    //Uitleg
    document.addEventListener('click', function(e){
      var btn = e.target.closest('.uitlegToggleIcon');
      if(!btn) return;
    
      var id = btn.getAttribute('data-toggle');
      var el = document.getElementById(id);
      if(!el) return;
    
      var isHidden = el.classList.contains('hidden');
      if(isHidden){
        el.classList.remove('hidden');
        btn.textContent = '-';
      } else {
        el.classList.add('hidden');
        btn.textContent = '+';
      }
    });
    
  }

  // ---------- Data-lader ----------
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
    var name = p.get('stops') || 'stops'; // 'stops', 'stops_school', 'stops_thuis'
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
  
      // ---- Nieuw model: { slots:[], locaties:[] } ----
      var slots = null;
      var locaties = null;
  
      if (stopsRaw && typeof stopsRaw === 'object' && !Array.isArray(stopsRaw) && stopsRaw.locaties && stopsRaw.slots) {
        slots = stopsRaw.slots || [];
        locaties = stopsRaw.locaties || [];
      } else {
        // ---- Oud model: [ {id, naam, lat, lng, ...}, ... ] ----
        locaties = Array.isArray(stopsRaw) ? stopsRaw : [];
        slots = []; // best-effort afgeleid
  
        // Unieke slotnamen afleiden als ze bestaan, anders alles als stopNN
        var seen = {};
        locaties.forEach(function(l){
          var s = l && l.slot ? l.slot : null;
          if (s && !seen[s]) { seen[s] = true; slots.push({ id:s, label:s, required:true }); }
        });
  
        // Als er geen slots in de data zitten, dan vallen we terug op meta of op "start/stop01.."
        if (!slots.length) {
          // (je kan dit later nog verfijnen, maar voor compat is dit voldoende)
          slots = [
            { id:'start', label:'Start', required:true },
            { id:'end', label:'Einde', required:true }
          ];
        }
      }
  
      var startSlot = meta.startSlot || 'start';
      var endSlot   = meta.endSlot   || 'end';
  
      // Volgorde = volgorde in slots-array (jouw nieuwe regel)
      var slotOrder = (slots || []).map(function(s){ return s.id; });
  
      // Required slots = required:true
      var requiredSlots = (slots || [])
        .filter(function(s){ return !!s.required; })
        .map(function(s){ return s.id; });
  
      return {
        meta: meta,
        // compat: blijf DATA.stops gebruiken als "locaties"
        stops: locaties,
        // nieuw: expliciet
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
  (function bindPcSelectOnce(){
    if(document.__pcSelectBound) return;
    document.__pcSelectBound = true;
  
    document.addEventListener('change', function(e){
      var t = e.target;
      if(!t || t.id !== 'pcSelect') return;
  
      var st = store.get();
  
      // respecteer je regels
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
    });
  })();
  

  // ---------- UI renders ----------
  function ensureCharacter(){
    var st = store.get();
    if(st.pcId && DATA.personages.some(p => p.id === st.pcId)) return st.pcId;
  
    var pc = pick(DATA.personages || []);
    st.pcId = pc ? pc.id : null;
    store.set(st);
    return st.pcId;
  }
  
  function currentPc(){
    var st=store.get();
    for (var i=0;i<(DATA.personages||[]).length;i++){ if (DATA.personages[i].id===st.pcId) return DATA.personages[i]; }
    return null;
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
  
    // Titel
    var title=qs('pcTitle');
    if(title) title.textContent = pc.naam;
  
    // Pills (mooie volgorde)
    var pillsEl=qs('pcPills');
    if(pillsEl){
      pillsEl.innerHTML =
        '<span class="pill">🎂 <b>'+pc.leeftijd+' jaar</b></span>' +
        '<span class="pill">🌍 <b>'+pc.herkomst+'</b></span>' +
        '<span class="pill">🎖️ <b>'+pc.rol+'</b></span>';
    }
  
    // Bio
    var bioEl=qs('pcBio');
    if(bioEl) bioEl.textContent = pc.bio || '';
  
    // Afbeelding
    if(img){
      img.style.display = 'block';
      img.alt = 'Portret van ' + (pc.naam || 'personage');
      img.src = './data/Personages/' + pc.id + '.png';
      img.onerror = function(){
        img.onerror = null;
        img.style.display = 'none';
      };
    }
  
    renderCharacterChooser();
  }
  function setPcId(newId){
    var st = store.get();
    st.pcId = newId;
    store.set(st);
  
    // alles dat van pc afhangt opnieuw tekenen
    renderProfile();     // <- jouw Ernesto-kaart
    renderUnlocked();    // verhalen + vragen
    renderStops();       // overzicht
  }
  
  
  function renderCharacterChooser(){
    var st=store.get(); var el=qs('pcChooser'); if(!el) return;
  
    var opts='';
    (DATA.personages||[]).forEach(function(p){
      opts += '<option value="'+p.id+'" '+(p.id===st.pcId?'selected':'')+'>'
           +  p.naam+' ('+p.leeftijd+') — '+p.rol
           + '</option>';
    });
    if(!opts) opts = '<option>Demo</option>';
  
    var inside = window.__insideStart===true;
    var locked = !!st.lockedPc;
    var canChoose = inside && !locked;
  
    el.innerHTML =
        '<select id="pcSelect" '+(canChoose?'':'disabled')+'>'+opts+'</select>'
      + '<span class="pill '+(locked?'ok':'')+'">'
      + (locked ? '🔒 Keuze vergrendeld'
                : (inside ? '🟢 Je kan hier je personage kiezen'
                          : '🔐 Kiesbaar enkel aan de start'))
      + '</span>';
  }
  
  
  function renderStops(){
    var cont = qs('stopsList'); if(!cont) return;
    var st = store.get();
  
    var unlockedSlots = st.unlockedSlots || [];
    var unlockedMap = {};
    unlockedSlots.forEach(function(sid){ unlockedMap[sid]=true; });
  
    var endSlot   = DATA.endSlot  || (DATA.meta && DATA.meta.endSlot)  || 'end';
    var slotOrder = DATA.slotOrder || (DATA.slots||[]).map(function(s){ return s.id; });
  
    function findSlotObj(sid){
      for (var i=0;i<(DATA.slots||[]).length;i++){
        if (DATA.slots[i].id===sid) return DATA.slots[i];
      }
      return null;
    }
    function slotLabel(sid){
      var o = findSlotObj(sid);
      var label = (o && o.label) ? o.label : sid;
      if(o && o.required === false) label += ' (opt.)';
      return label;
    }
    function slotObj(sid){
      for (var i=0;i<(DATA.slots||[]).length;i++){
        if (DATA.slots[i].id===sid) return DATA.slots[i];
      }
      return null;
    }
    function isOptionalSlot(sid){
      var o = slotObj(sid);
      return o ? (o.required === false) : false;
    }
    
  
    function stripPrefix(name){
      if(!name) return '';
      return name.replace(/^(Stop\s*\d+\s*:\s*|Start\s*:\s*|Einde\s*:\s*)/i, '').trim();
    }
  
    function allLocsForSlot(sid){
      return (typeof allLocationsForSlot === 'function') ? (allLocationsForSlot(sid) || []) : [];
    }
  
    function findLocById(locId){
      var arr = DATA.locaties || DATA.stops || [];
      for (var i=0;i<arr.length;i++){
        if(arr[i] && arr[i].id === locId) return arr[i];
      }
      return null;
    }
  
    function displayPlaceForSlot(sid){
      var locs = allLocsForSlot(sid);
      if(!locs.length) return '';
  
      // ✅ Belangrijk: split-slot zichtbaar houden vóór unlock
      if(locs.length > 1 && !unlockedMap[sid]){
        return '🔀 (' + locs.length + ' opties)';
      }
  
      // Als unlocked: toon de effectief gekozen locatie (via lastUnlockedLocationBySlot)
      var chosenId = null;
      if(st.lastUnlockedLocationBySlot && st.lastUnlockedLocationBySlot[sid]){
        chosenId = st.lastUnlockedLocationBySlot[sid];
      } else if(locs.length === 1){
        chosenId = locs[0].id;
      } else {
        // unlocked maar geen gekozen id? (edge case) -> eerste tonen
        chosenId = locs[0].id;
      }
  
      var loc = findLocById(chosenId);
      return loc && loc.naam ? stripPrefix(loc.naam) : '';
    }
  
    var html = '';
    (slotOrder||[]).forEach(function(sid){
      var ok = !!unlockedMap[sid];
      var optional = isOptionalSlot(sid);
        // iconen:
        // ✅ unlocked
        // 🔒 end locked
        // ⏳ required nog niet
        // 🟦 optional nog niet (kies gerust een andere: 🧩 / ⭐ / ➕ / 🟡)
        var icon = ok ? '✅'
        : (sid===endSlot ? '🔒'
        : (optional ? '🧩' : '⏳'));
        
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
 
  
  
  function renderUnlocked(){
    applyRouteModeUI();
    // verbergen van de oude kaart
    var oldMapSec = document.getElementById('mapSection');
    if(oldMapSec) oldMapSec.style.display = 'none';

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
  
    // Bezochte locaties (beste) of fallback slots
    var unlockedLocs = st.unlockedLocs || [];
    var unlockedSlots = st.unlockedSlots || [];
  
    // Huidige locatie bepalen
    var currentLoc = st.currentLocId ? findLocById(st.currentLocId) : null;
  
    // Fallback: als currentLocId ontbreekt, pak laatste bezochte locatie
    if(!currentLoc && unlockedLocs.length){
      currentLoc = findLocById(unlockedLocs[unlockedLocs.length-1]);
    }
  
    // NOG steeds niks? Dan niks tonen
    if(!currentLoc){
      cont.innerHTML = '<div class="muted">Nog geen huidige stop. Wandel eens binnen een cirkel 🙂</div>';
      renderProgress();
      return;
    }
  
    // --------- Current stop block ----------
    var loc = currentLoc;
    var locId = loc.id;
    var slotId = loc.slot;
    var title = loc.naam || locId;
  
    var verhaal = getStoryFor(pc, slotId, locId);
  
    // Uitleg HTML (kort + +/-)
    var uitleg = loc.uitleg || null;
    var uitlegKort = '';
    var uitlegLang = '';
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
        + (uitlegLang
            ? ' <button class="uitlegToggleIcon" type="button" data-toggle="'+moreId+'" title="Meer uitleg">+</button>'
            : '')
        + '  </div>'
        + (uitlegKort ? ('  <div class="uitlegKort">'+escapeHtml(uitlegKort)+'</div>') : '')
        + (uitlegLang ? ('  <div id="'+moreId+'" class="uitlegLang hidden">'+escapeHtml(uitlegLang)+'</div>') : '')
        + '</div>';
    }
  
    // Vragen HTML
    var qsArr = loc.vragen || [];
    var qaHtml = '';
    if(qsArr.length){
      qaHtml = qsArr.map(function(q,qi){
        var val = getAns(locId, qi);
        return '<div class="qa">'
          + '<div class="q"><b>Vraag '+(qi+1)+':</b> '+escapeHtml(q)+'</div>'
          + '<div class="controls">'
          + '  <textarea class="ans" data-stop="'+locId+'" data-q="'+qi+'" placeholder="Jouw antwoord...">'+escapeHtml(val)+'</textarea>'
          + (MIC_OK ? '  <button class="micBtn" data-stop="'+locId+'" data-q="'+qi+'" title="Spreek je antwoord in">🎙️</button>' : '')
          + '  <button class="clearAns" data-stop="'+locId+'" data-q="'+qi+'" title="Wis">✖</button>'
          + '  <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+qi+'"></span>'
          + '</div>'
          + '</div>';
      }).join('');
    } else {
      qaHtml = '<div class="muted">Geen vragen bij deze stop.</div>';
    }
  
    // Personage kaart
    var pcCard =
        '<div class="pcMini">'
        + ' <img class="pcMiniImg" src="'+escapeHtml((pc && pc.img) ? pc.img : (qs("pcImg") ? qs("pcImg").src : ""))+'" alt=""/>'
        + ' <div class="pcMiniMeta">'
        + '   <div class="pcMiniName">'+escapeHtml(pc && pc.naam ? pc.naam : '—')+'</div>'
        + '   <div class="pcMiniSub muted">'+escapeHtml(pc && pc.herkomst ? pc.herkomst : '—')+' — '+escapeHtml(pc && pc.rol ? pc.rol : '—')+'</div>'
        + (pc && pc.bio ? ('<div class="pcMiniBio">'+escapeHtml(pc.bio)+'</div>') : '')
        + ' </div>'
        + '</div>';

    // var pcCard =
    //   '<div class="card">'
    //   + ' <div class="cardHead">🧑 Personage</div>'
    //   + ' <div class="cardBody">'
    //   +   '<div><b>'+escapeHtml(pc && pc.naam ? pc.naam : '—')+'</b></div>'
    //   +   '<div class="muted">'+escapeHtml(pc && pc.herkomst ? pc.herkomst : '—')+' — '+escapeHtml(pc && pc.rol ? pc.rol : '—')+'</div>'
    //   + ' </div>'
    //   + '</div>';
  
    // // Accordion cards (slechts één open)
    // var currentHtml =
    //   '<div class="currentWrap">'
    //   + '<div class="currentTitle">📍 Huidige stop</div>'
    //   + '<div class="currentName">'+escapeHtml(title)+'</div>'
  
    //   + '<div class="acc" data-acc="current">'
    //     + '<details class="accItem" open>'
    //       + '<summary class="accSum">📘 Verhaal <button class="readBtn" data-slot="'+slotId+'" data-loc="'+locId+'" title="Lees voor">🔊</button></summary>'
    //       + '<div class="accBody">'+(verhaal ? escapeHtml(verhaal) : '<span class="muted">(Geen tekst)</span>')+'</div>'
    //     + '</details>'
  
    //     + '<details class="accItem">'
    //       + '<summary class="accSum">ℹ️ Uitleg</summary>'
    //       + '<div class="accBody">'+(uitlegHtml || '<span class="muted">(Geen uitleg)</span>')+'</div>'
    //     + '</details>'
  
    //     + '<details class="accItem">'
    //       + '<summary class="accSum">✍️ Vragen</summary>'
    //       + '<div class="accBody">'+qaHtml+'</div>'
    //     + '</details>'
  
    //   + '</div>'
    //   + '</div>';
  
    // // --------- History block ----------
    // var hist = '';
  
    // // Geschiedenis: alle bezochte locaties behalve current
    // var visited = unlockedLocs.slice();
    // // fallback als unlockedLocs leeg is: maak pseudo-history op basis van slots
    // if(!visited.length && unlockedSlots.length){
    //   // toon dan enkel slots als geschiedenis
    //   visited = unlockedSlots.slice();
    // }
  
    // if(visited.length){
    //   hist += '<details class="history">'
    //     + '<summary class="historySum">🕘 Geschiedenis ('+visited.length+')</summary>'
    //     + '<div class="historyBody">';
  
    //   for(var v=0; v<visited.length; v++){
    //     var vid = visited[v];
    //     if(vid === locId) continue;
  
    //     var vloc = findLocById(vid);
    //     if(vloc){
    //       var vTitle = vloc.naam || vloc.id;
    //       hist += '<details class="histItem">'
    //         + '<summary>'+escapeHtml(vTitle)+'</summary>'
    //         + '<div class="muted">Slot: '+escapeHtml(vloc.slot||'—')+'</div>'
    //         + '</details>';
    //     } else {
    //       // slot fallback
    //       hist += '<div class="muted">'+escapeHtml(String(vid))+'</div>';
    //     }
    //   }
  
    //   hist += '</div></details>';
    // }
  
    // Render
    var focus = (st.focus || 'story'); // story | qa | map

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
      + '<div id="stopsWrapMap" style="margin-top:10px"></div>';
    
    
    var html = ''
      + '<div class="stack">'
      + panelHtml('story','Personage + Verhaal', storyBody, focus==='story')
      + panelHtml('qa','Uitleg en vragen', qaBody, focus==='qa')
      + panelHtml('map','Kaart', mapBody, focus==='map')
      + '</div>';
    
    cont.innerHTML = html;
    
      var statusCard = document.getElementById('statusCard');
      var wQa = document.getElementById('statusWrapQa');
      var wMap = document.getElementById('statusWrapMap');

      // We willen de status *maar op 1 plek tegelijk* (afhankelijk van focus)
      if(statusCard){
        if(focus === 'qa' && wQa) wQa.appendChild(statusCard);
        else if(focus === 'map' && wMap) wMap.appendChild(statusCard);
        // bij story kan hij weg (of naar qa als default)
      }
   // --- bestaande kaartcontainer (#oneMap) naar het kaartpaneel verhuizen ---
      var wrap = document.getElementById('mapPanelWrap');
      var oneMap = document.getElementById('oneMap');
      if(wrap && oneMap && oneMap.parentElement !== wrap){
        wrap.appendChild(oneMap);
      }

      // Geef de kaartcontainer hoogte (Leaflet heeft hoogte nodig)
      if(oneMap){
        oneMap.style.height = '100%';
        oneMap.style.minHeight = '260px';
      }
      // --- verplaats kaart-controls (bestaande knoppen) naar het kaartpaneel ---
      var ctrl = document.getElementById('mapControlsWrap');
      if(ctrl){
        var btn = document.getElementById('recenterBtn');
        var link = document.getElementById('openInMaps');
        if(btn) ctrl.appendChild(btn);
        if(link) ctrl.appendChild(link);
}

      // Leaflet: opnieuw tekenen als kaartpaneel actief is
      if(focus === 'map'){
        // ✅ init maar 1 keer
        if(!window._map){
          window._map = L.map('oneMap').setView([51.219, 4.441], 15);
      
          // TODO: zet hier ook je tilelayer/markers als je die normaal bij init zet
          // L.tileLayer(...).addTo(window._map);
        }
      
        // ✅ altijd hertekenen (mag vaak)
        setTimeout(function(){
          var el = document.getElementById('oneMap');
          var h = el ? el.getBoundingClientRect().height : 0;
      
          window._map.invalidateSize(true);
      
          if(h === 0){
            setTimeout(function(){
              window._map.invalidateSize(true);
            }, 200);
          }
        }, 120);
      }
      

      // --- verplaats Stops-lijst naar het kaartpaneel ---
      var stopsWrap = document.getElementById('stopsWrapMap');
      var stopsList = document.getElementById('stopsList');
      if(stopsWrap && stopsList){
        stopsWrap.appendChild(stopsList);
      }

    renderProgress();
    
  }
  
  
  
  function renderProgress(){
    var st=store.get();
    var req = DATA.requiredSlots || [];
    var unlockedSlots = st.unlockedSlots || [];
  
    var done = 0;
    for (var i=0;i<req.length;i++){
      if (unlockedSlots.indexOf(req[i]) > -1) done++;
    }
  
    // Vaak wil je end niet meetellen in required (kan, hoeft niet). Dit is safe:
    // als je end in requiredSlots hebt zitten, telt hij pas als je end effectief unlocked.
    var total = req.length;
  
    var deg= total ? (done/total)*360 : 0;
    var ring=qs('progressRing'), txt=qs('progressText');
    if(ring) ring.style.background = 'conic-gradient(var(--accent) '+deg+'deg, rgba(255,255,255,.15) 0 360deg)';
    if(txt) txt.textContent = done+'/'+total;
  }
  
  function firstLocationForSlot(slotId){
    // zoekt de eerste locatie in DATA.stops/locaties met dit slot (volgorde van JSON!)
    var arr = DATA.locaties || DATA.stops || [];
    for(var i=0;i<arr.length;i++){
      if(arr[i] && arr[i].slot === slotId) return arr[i];
    }
    return null;
  }
  
  function allLocationsForSlot(slotId){
    var arr = DATA.locaties || DATA.stops || [];
    var out = [];
    for(var i=0;i<arr.length;i++){
      if(arr[i] && arr[i].slot === slotId) out.push(arr[i]);
    }
    return out;
  }
  
  function pickVariantLocationIdForSlot(slotId){
    var st = store.get();
  
    // ✅ NIEUW: primair = de locatie die dit slot effectief ontgrendelde
    if(st.unlockedBySlot && st.unlockedBySlot[slotId]) {
      return st.unlockedBySlot[slotId];
    }
  
    // ♻️ BACKWARD COMPAT: oude key (als er nog data in localStorage zit)
    if(st.lastUnlockedLocationBySlot && st.lastUnlockedLocationBySlot[slotId]) {
      return st.lastUnlockedLocationBySlot[slotId];
    }
  
    // ♻️ BACKWARD COMPAT: als je nog per-locatie unlocked IDs had
    if(st.unlocked && st.unlocked.length){
      var locs = allLocationsForSlot(slotId);
      for(var i=0;i<locs.length;i++){
        if(st.unlocked.indexOf(locs[i].id) !== -1) return locs[i].id;
      }
    }
  
    // ultieme fallback: eerste locatie in JSON
    var first = firstLocationForSlot(slotId);
    return first ? first.id : null;
  }
  
  
  function storyForSlot(pc, slotId){
    if(!pc || !pc.verhalen) return null;
  
    var v = pc.verhalen[slotId];
  
    // normale slot-tekst (string)
    if(typeof v === 'string') return v;
  
    // split-slot (object met locatie-ids)
    if(v && typeof v === 'object'){
      var locId = pickVariantLocationIdForSlot(slotId);
      return locId && v[locId] ? v[locId] : null;
    }
  
    return null;
  }
  

  // ---------- TTS ----------
  var selectedVoice=null;
  function pickVoice(){
    try{
      var vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      selectedVoice = (vs||[]).find(function(v){ return (v.lang||'').toLowerCase().indexOf('nl')===0; })
                     || (vs||[]).find(function(v){ return (v.lang||'').toLowerCase().indexOf('en')===0; })
                     || (vs||[])[0] || null;
    }catch(e){}
  }
  function speakText(t){
    if(!('speechSynthesis' in window)) return alert('Voorlezen niet ondersteund.');
    speechSynthesis.cancel();
    var u=new SpeechSynthesisUtterance(t);
    if(selectedVoice) u.voice=selectedVoice;
    u.lang=(selectedVoice && selectedVoice.lang) || 'nl-NL';
    speechSynthesis.speak(u);
  }

  // ---------- Kaart ----------
  function drawGeoJSONOnMap(gj, note){
    var hasLine = false;
    (gj.features||[]).forEach(function(f){
      if (/LineString|MultiLineString/i.test((f.geometry && f.geometry.type) || '')) hasLine = true;
    });
    var layer = L.geoJSON(gj, {
      pointToLayer: function(_f, latlng){ return L.circleMarker(latlng, { radius:3, weight:1, opacity:.9, fillOpacity:.6 }); },
      style: function(f){ return /LineString|MultiLineString/i.test((f.geometry&&f.geometry.type)||'') ? { weight:4, opacity:.95 } : { weight:1, opacity:.6 }; }
    }).addTo(LMAP);
    try { 
      if (LMAP) {
        try { LMAP.fitBounds(poly.getBounds(), { padding:[20,20] }); } catch(_e){}
      }
    
    } catch(_e){}
    showDiag((note||'Route') + ' → ' + (hasLine ? 'lijn getekend ✓' : 'GEEN lijn (alleen punten)'));
  }
  function slotShortLabel(slotId){
    if(slotId === 'start') return 'S';
    if(slotId === 'end') return 'E';
    var m = /^stop(\d+)$/.exec(slotId||'');
    if(m) return m[1]; // "01", "02", ...
    return '?';
  }
  function makeSlotIcon(slotId, required, variants){
    var lab = slotBadgeLabel(slotId);
  
    var cls = 'slotMarker'
            + (slotId==='start' ? ' start' : '')
            + (slotId==='end' ? ' end' : '')
            + (required===false ? ' opt' : '')
            + (variants && variants>1 ? ' split' : '');
  
    // klein “split” hoekje (alleen als variants>1)
    var splitHtml = (variants && variants>1) ? '<span class="splitBadge">🔀</span>' : '';
  
    return L.divIcon({
      className: cls,
      html: '<div class="bubble"><span class="n">'+lab+'</span>'+splitHtml+'</div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }
  
  function slotIsRequired(slotId){
    for (var i=0;i<(DATA.slots||[]).length;i++){
      if (DATA.slots[i].id === slotId) return !!DATA.slots[i].required;
    }
    return true; // default
  }
  
  function slotOrderArray(){
    return DATA.slotOrder || (DATA.slots||[]).map(function(s){ return s.id; });
  }
  
  // geeft label terug voor in het bolletje
  function slotBadgeLabel(slotId){
    if (slotId === 'start') return 'S';
    if (slotId === 'end')   return 'E';
  
    var req = slotIsRequired(slotId);
    if (!req) return '🧩';   // optioneel symbool (kies gerust iets anders)
  
    // required: volgnummer op basis van slotOrder, enkel tellen voor required stops (excl start/end)
    var order = slotOrderArray();
    var n = 0;
    for (var i=0;i<order.length;i++){
      var sid = order[i];
      if (sid === 'start' || sid === 'end') continue;
      if (!slotIsRequired(sid)) continue; // optionele tellen niet mee
      n++;
      if (sid === slotId) return String(n);
    }
    return '?';
  }
  
  function addStopMarkers(){
    if(!LMAP || !window.L) return;
  
    // oude markers opruimen
    if(window.__stopMarkerLayer){
      try { LMAP.removeLayer(window.__stopMarkerLayer); } catch(e){}
    }
    window.__stopMarkerLayer = L.layerGroup().addTo(LMAP);
  
    var locs = DATA.locaties || DATA.stops || [];
  
    // tel hoeveel locaties per slot (voor split-stops)
    var perSlotCount = {};
    for (var k=0; k<locs.length; k++){
      var a = locs[k];
      if(!a || !a.slot) continue;
      perSlotCount[a.slot] = (perSlotCount[a.slot]||0) + 1;
    }
  
    for(var i=0;i<locs.length;i++){
      var s = locs[i];
      if(!s || s.lat==null || s.lng==null) continue;
  
      // required van slot halen
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
  
  
  function initLeafletMap(){
    try{
      var div = qs('oneMap'); 
      if(!div || !window.L) return;
  
      // --- Icons (BESTAAND MAKEN) ---
      function icon(cls){
        return L.divIcon({ className:'pin '+cls, iconSize:[16,16], iconAnchor:[8,8] });
      }
      var iconUser  = L.divIcon({ className:'user-dot', iconSize:[14,14], iconAnchor:[7,7] });
  
      // --- Map initialiseren (DIT ONTBRAK) ---
      var locs = DATA.locaties || DATA.stops || [];
      var first = locs && locs.length ? locs[0] : { lat:50.85, lng:2.89 };
  
      LMAP = L.map(div, { zoomControl:true }).setView([first.lat, first.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:19,
        attribution:'&copy; OpenStreetMap'
      }).addTo(LMAP);
  
      // Pauzeer follow-me bij user-interactie, hervat na 15s
      function pauseFollowThenResume(){
        followMe = false;
        if (followResumeTimer) clearTimeout(followResumeTimer);
        followResumeTimer = setTimeout(function(){ followMe = true; }, 15000);
      }
      LMAP.on('movestart', pauseFollowThenResume);
      LMAP.on('zoomstart',  pauseFollowThenResume);
      LMAP.on('dragstart',  pauseFollowThenResume);
  
      // --- markers + cirkels (jouw functies) ---
      addStopMarkers();
      addStopCircles();
  
      // --- bounds pas NA map init ---
      var bounds = [];
      for (var i=0;i<locs.length;i++){
        if(!locs[i] || locs[i].lat==null || locs[i].lng==null) continue;
        bounds.push([locs[i].lat, locs[i].lng]);
      }
      if (bounds.length) {
        try { LMAP.fitBounds(bounds, { padding:[20,20] }); } catch(_e){}
      }
  
      // ==== ROUTE-LOADER unified (met handmatige fallback) ====
      (function(){
        var routePath = (DATA.meta && (DATA.meta.routePath || DATA.meta.kmlPath)) 
          ? (DATA.meta.routePath || DATA.meta.kmlPath) 
          : null;
        if(!routePath){ showDiag('Route: geen routePath/kmlPath in meta.json'); return; }
        loadRouteUnified(routePath);
      })();
  
      function loadRouteUnified(routePath){
        var low = routePath.toLowerCase();
        var ext = low.endsWith('.gpx') ? 'gpx' : (low.endsWith('.kml') ? 'kml' : 'unknown');
        if (ext==='unknown'){ showDiag('Route: onbekende extensie voor '+routePath); return; }
  
        fetch(routePath, { cache:'no-store' })
          .then(function(r){ if(!r.ok) throw new Error(routePath+' → HTTP '+r.status); return r.text(); })
          .then(function(txt){
            // 1) toGeoJSON indien aanwezig
            try{
              if (window.toGeoJSON){
                var xml1 = new DOMParser().parseFromString(txt, 'text/xml');
                var gj1  = (ext==='gpx') ? toGeoJSON.gpx(xml1) : toGeoJSON.kml(xml1);
                if (gj1 && gj1.features && gj1.features.length){
                  drawGeoJSONOnMap(gj1, 'Route '+ext.toUpperCase()+' (toGeoJSON)');
                  return;
                }
              }
            }catch(e){}
  
            // 2) Manual GPX
            if (ext==='gpx'){
              try{
                var xml2 = new DOMParser().parseFromString(txt, 'text/xml');
                var pts  = Array.prototype.slice.call(xml2.getElementsByTagNameNS('*','trkpt'));
                var latlngs = pts.map(function(n){
                  return [parseFloat(n.getAttribute('lat')), parseFloat(n.getAttribute('lon'))];
                }).filter(function(p){ return isFinite(p[0]) && isFinite(p[1]); });
  
                if (latlngs.length>1){
                  var poly = L.polyline(latlngs, { weight:4, opacity:.95 }).addTo(LMAP);
                  try { LMAP.fitBounds(poly.getBounds(), { padding:[20,20] }); } catch(_e){}
                  showDiag('Route GPX: '+latlngs.length+' punten getekend ✓ (manual)');
                  return;
                }
              }catch(e){}
              showDiag('Route GPX: geen <trkpt>-punten gevonden.');
              return;
            }
  
            // 3) Manual KML
            if (ext==='kml'){
              try{
                var xml3 = new DOMParser().parseFromString(txt, 'text/xml');
                var coordsTags = Array.prototype.slice.call(xml3.getElementsByTagNameNS('*','coordinates'));
                var latlngs2=[];
                coordsTags.forEach(function(tag){
                  var pairs = (tag.textContent||'').trim().split(/\s+/);
                  pairs.forEach(function(p){
                    var parts = p.split(',');
                    var lon = parseFloat(parts[0]), lat = parseFloat(parts[1]);
                    if (isFinite(lat) && isFinite(lon)) latlngs2.push([lat,lon]);
                  });
                });
                if (latlngs2.length>1){
                  var poly2 = L.polyline(latlngs2, { weight:4, opacity:.95 }).addTo(LMAP);
                  try { LMAP.fitBounds(poly2.getBounds(), { padding:[20,20] }); } catch(_e){}
                  showDiag('Route KML: '+latlngs2.length+' punten getekend ✓ (manual)');
                  return;
                }
              }catch(e){}
              showDiag('Route KML: geen LineString/coordinates gevonden.');
              return;
            }
          })
          .catch(function(err){
            showDiag('Route laden faalde: '+(err && err.message ? err.message : err));
          });
      }
  
      // Live positie (NU werkt iconUser)
      liveMarker = L.marker([0,0], { icon:iconUser, opacity:0 }).addTo(LMAP);
      accCircle  = L.circle([0,0], { radius:0, color:'#3dd1c0', fillOpacity:.1 }).addTo(LMAP);
  
      // Leaflet heeft soms een schopje nodig na layout changes
      setTimeout(function(){
        if (LMAP) { try { LMAP.invalidateSize(true); } catch(_e){} }
      }, 120);
  
    }catch(e){
      if (window.console) console.error(e);
      showDiag('Kaart error: '+e.message);
    }
  }
  
  function addStopCircles(){
    if(!LMAP || !window.L) return;
  
    // cirkels samen met markers groeperen
    if(!window.__stopMarkerLayer){
      window.__stopMarkerLayer = L.layerGroup().addTo(LMAP);
    }
  
    var locs = DATA.locaties || DATA.stops || [];
    for(var i=0;i<locs.length;i++){
      var s = locs[i];
      if(!s || s.lat==null || s.lng==null) continue;
  
      var rad = s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200);
  
      L.circle([s.lat, s.lng], {
        radius: rad,
        color: '#3dd1c0',
        weight: 1,
        fillOpacity: .05
      }).addTo(window.__stopMarkerLayer);
    }
  }
  
  function updateLeafletLive(lat,lng,acc){
    try{
      if(!LMAP || !liveMarker || !accCircle) return;
      liveMarker.setLatLng([lat,lng]).setOpacity(1);
      accCircle.setLatLng([lat,lng]).setRadius(acc||0);
      if (followMe) LMAP.setView([lat,lng]);
      var a=qs('openInMaps'); if(a) a.href='https://maps.google.com/?q='+lat+','+lng;
    }catch(e){ if (window.console) console.error(e); }
  }
  function applyRouteModeUI(){
    var stops = document.getElementById('stopsSection');
    if(stops) stops.style.display = routeMode ? 'none' : '';
    var st = store.get();
  
    // Route-modus als: geo draait OF personage is gelocked OF er is al iets unlocked
    var routeMode = (st.geoOn === true) || (st.lockedPc === true) ||
                    ((st.unlockedSlots||[]).length > 0) || (st.currentLocId);
  
    var setup = document.getElementById('setupGrid');
    if(setup) setup.style.display = routeMode ? 'none' : '';
  
    var stops = document.getElementById('stopsSection');
    if(stops) stops.style.display = routeMode ? 'none' : '';
  }
  
  // ---------- Geoloc ----------
  function tryUnlock(best, acc){
    var effective = Math.max(0, best.d - (acc||0));
    if(effective > best.radius) return;
  
    var st = store.get();

    st.unlockedSlots = st.unlockedSlots || [];
    st.unlockedBySlot = st.unlockedBySlot || {}; // ✅ nodig als je hieronder toewijst
    st.unlockedLocs = st.unlockedLocs || [];

    var startSlot = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
    var endSlot   = DATA.endSlot   || (DATA.meta && DATA.meta.endSlot)   || 'end';
  
    // best-effort: slot bepalen
    var bestSlot = best.slot;
    if(!bestSlot){
      for (var i=0;i<(DATA.stops||[]).length;i++){
        if (DATA.stops[i] && DATA.stops[i].id === best.id){
          bestSlot = DATA.stops[i].slot;
          break;
        }
      }
    }
    if(!bestSlot){
      showDiag('tryUnlock: geen slot gevonden voor '+best.id);
      return;
    }
  
    // eind-check verplichte slots
    var isEnd = (bestSlot === endSlot);
    if(isEnd){
      var reqSlots = DATA.requiredSlots || [];
      var missing = [];
      for (var r=0; r<reqSlots.length; r++){
        var sid = reqSlots[r];
        if(sid === endSlot) continue;
        if(st.unlockedSlots.indexOf(sid) === -1) missing.push(sid);
      }
      if(missing.length){
        var names = missing.map(function(sid){
          var slotObj = null;
          for (var j=0;j<(DATA.slots||[]).length;j++){
            if(DATA.slots[j].id===sid){ slotObj=DATA.slots[j]; break; }
          }
          return (slotObj && slotObj.label) ? slotObj.label : sid;
        }).join(', ');
        toast('🔒 Eindlocatie pas na: ' + names);
        showDiag('Einde niet ontgrendeld; ontbreekt nog: ' + names);
        return;
      }
    }
     // 🔓 locatie onthouden (ook bij split-slots)
    if(st.unlockedLocs.indexOf(best.id) === -1){
     st.unlockedLocs.push(best.id);
    }

      // slot unlocken (slechts één keer)
      if(st.unlockedSlots.indexOf(bestSlot) === -1){
        st.unlockedSlots.push(bestSlot);

        // eerste locatie die dit slot ontgrendelde (UI-hulp)
        st.unlockedBySlot[bestSlot] = best.id;
        st.currentLocId = best.id;
        st.currentSlotId = bestSlot;
        store.set(st);
        renderUnlocked();
        renderStops();
        toast('✅ Ontgrendeld: ' + (best.name || bestSlot));
        playDing();
      } else {
        // 🔁 slot was al unlocked, maar nieuwe locatie binnen hetzelfde slot
        store.set(st);
        renderUnlocked();
      }

  }
  
  
  
  function startWatch(){
    followMe = true; // bij start weer volgen
    var gs=qs('geoState'); if(gs) gs.textContent='Actief';
    if(!('geolocation' in navigator)){ var pn=qs('permNote'); if(pn) pn.textContent=(pn.textContent||'')+' • Geen geolocatie'; return; }
  
    // start/end slots uit DATA (komen nu uit loadScenario)
    var startSlot = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
  
    watchId = navigator.geolocation.watchPosition(function(pos){
      var c=pos.coords, latitude=c.latitude, longitude=c.longitude, accuracy=c.accuracy;
      var cc=qs('coords'); if(cc) cc.textContent = latitude.toFixed(5)+', '+longitude.toFixed(5);
      var ac=qs('acc'); if(ac) ac.textContent = Math.round(accuracy);
  
      var here={lat:latitude,lng:longitude};
      var best=null; var insideStart=false;
  
      (DATA.stops||[]).forEach(function(s){
        var d = Math.round(distanceMeters(here,{lat:s.lat,lng:s.lng}));
  
        // ✅ best bevat nu ook slot
        if(!best || d < best.d){
          best = {
            id: s.id,
            slot: s.slot,            // <— nieuw
            name: s.naam,
            d: d,
            radius: (s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200))
          };
        }
  
        // ✅ insideStart op basis van slot, niet meer op id/meta
        if(s.slot === startSlot){
          if (d <= (s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200))) insideStart = true;
        }
      });
  
      window.__insideStart = insideStart;
  
      // Render enkel wanneer status wijzigt én de gebruiker niet net de picker open heeft
      if (Date.now() >= pcSelectBusyUntil && insideStart !== lastInsideStart) {
        lastInsideStart = insideStart;
        renderCharacterChooser();
      }
  
      var st=store.get(); st.flags=st.flags||{};
      if(insideStart){ st.flags.seenStart = true; store.set(st); }
      if(!insideStart && st.flags.seenStart && !st.lockedPc){
        st.lockedPc=true; store.set(st); renderCharacterChooser(); toast('🔒 Personage vergrendeld');
      }
  
      if(best){
        var cl=qs('closest'); if(cl) cl.textContent=best.name;
        var di=qs('dist'); if(di) di.textContent=String(best.d);
        var ra=qs('radius'); if(ra) ra.textContent=String(best.radius);
  
        tryUnlock(best, accuracy);
  
        // renderProgress/renderStops gaan we straks slot-native maken
        renderProgress();
        renderStops();
  
        updateLeafletLive(latitude, longitude, accuracy);
      }
  
      if(!LMAP && window.L && navigator.onLine) initLeafletMap(); // kaart laadt lui
    }, function(err){
      var pn=qs('permNote'); if(pn) pn.innerHTML='<span class="warn">Locatie geweigerd</span>';
      var gs=qs('geoState'); if(gs) gs.textContent='Uit';
    }, {enableHighAccuracy:true,maximumAge:10000,timeout:15000});
  }
  
  function stopWatch(){ if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; var gs=qs('geoState'); if(gs) gs.textContent='Inactief'; } }

  // ---------- Boot ----------
  document.addEventListener('click', function(e){
    var head = e.target.closest('.panelHead');
    if(!head) return;
  
    var panel = head.closest('.panel');
    if(!panel) return;
  
    var focus = panel.getAttribute('data-panel');
    if(!focus) return;
  
    var st = store.get();
    st.focus = focus;
    store.set(st);
  
    renderUnlocked(); // of renderCurrentStop() als je die apart maakt
    // ✅ Cruciaal: na render + layout, Leaflet opnieuw laten meten
  if(focus === 'map'){
    setTimeout(function(){
      if(window._map){
        window._map.invalidateSize(true);
        // optioneel: force re-center op huidige view
        try { window._map.panBy([0,0]); } catch(ex) {}
      }
    }, 200);
  }
  });
  

  document.addEventListener('toggle', function(e){
    var d = e.target;
    if(!d || d.tagName !== 'DETAILS') return;
    if(!d.open) return;
  
    var wrap = d.closest('.acc');
    if(!wrap) return;
  
    var items = wrap.querySelectorAll('details.accItem');
    for(var i=0;i<items.length;i++){
      if(items[i] !== d) items[i].open = false;
    }
  }, true);
  
  
  document.addEventListener('DOMContentLoaded', function(){
    bindCoreListeners(); // knoppen werken sowieso
    try{
      loadScenario().then(function(data){
        DATA = data;

        var st=store.get(); if(!st.pcId){ ensureCharacter(); }
        renderProfile(); renderStops(); renderUnlocked(); renderProgress();

        var chooser = document.getElementById('pcChooser');
        if (chooser) {
          chooser.addEventListener('focusin', function(e){
            if (e.target && e.target.id === 'pcSelect') {
              pcSelectBusyUntil = Date.now() + 4000; // 4s rust terwijl de picker open is
            }
          });
          chooser.addEventListener('touchstart', function(e){
            if (e.target && (e.target.id === 'pcSelect' || e.target.closest && e.target.closest('#pcSelect'))) {
              pcSelectBusyUntil = Date.now() + 4000;
            }
          }, {passive:true});
        }


        if (navigator.onLine) initLeafletMap();
        window.addEventListener('online', function(){ if(!LMAP) initLeafletMap(); });

        if('speechSynthesis' in window){ try{ pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }catch(e){} }

        // Mic detecteren en UI bijwerken
        detectMic();
        window.addEventListener('online',  function(){ detectMic(); renderUnlocked(); });
        window.addEventListener('offline', function(){ detectMic(); renderUnlocked(); });

        // Data-afhankelijke listeners
        var b;
        b = qs('regenBtn');
        if(b){
          b.addEventListener('click', function(){
            var st = store.get();
        
            if(st.lockedPc && !window.__insideStart){
              toast('🔒 Buiten startzone kan je niet wisselen.');
              return;
            }
        
            // kies willekeurig, maar centraal
            var pc = pick(DATA.personages);
            setPcId(pc.id);
        
            toast('🎲 Nieuw personage gekozen');
          });
        }
        
        b=qs('savePcBtn'); if(b) b.addEventListener('click', function(){ var st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Wijzigen kan enkel aan de start.'); return; } if(!window.__insideStart){ toast('🔐 Ga naar de startlocatie om te kiezen.'); return; } var sel=qs('pcSelect'); if(sel){ st.pcId=sel.value; store.set(st); renderProfile(); toast('✅ Personage bevestigd'); }});


        b = qs('exportBtn');
        if(b) b.addEventListener('click', function(){
          var st = store.get();
          var pc = currentPc() || {};
          var lines = [];
        
          var title = (DATA.meta && DATA.meta.title) ? DATA.meta.title : 'WOI – Mijn Personage';
          lines.push('# ' + title);
          lines.push('Personage: ' + (pc.naam||'—') + ' (' + (pc.herkomst||'—') + ') – ' + (pc.rol||'—'));
          lines.push('');
        
          // Pak locaties-array (nieuwe structuur) of fallback
          var arr = DATA.locaties || DATA.stops || [];
        
          function findLocById(id){
            for(var i=0;i<arr.length;i++){
              if(arr[i] && arr[i].id === id) return arr[i];
            }
            return null;
          }
        
          // ✅ Helper die één locatie exporteert (jouw grote blok, netjes ingepakt)
          function exportOneLocation(loc){
            var locId = loc.id;
            var slotId = loc.slot;
        
            var header = loc.naam || (locId || slotId);
            lines.push('## ' + header);
        
            // Verhaal (slotId + variant locId)
            var verhaal = getStoryFor(pc, slotId, locId);
            lines.push(verhaal || '(geen tekst)');
            lines.push('');
        
            // Uitleg (kort/uitgebreid)
            if(loc.uitleg){
              var uk = '';
              var ul = '';
        
              if(typeof loc.uitleg === 'string'){
                uk = loc.uitleg;
              } else {
                uk = loc.uitleg.kort || '';
                ul = loc.uitleg.uitgebreid || '';
              }
        
              if(uk || ul){
                lines.push('**Uitleg**');
                if(uk) lines.push('- Kort: ' + uk.replace(/\r?\n/g,' '));
                if(ul) lines.push('- Uitgebreid: ' + ul.replace(/\r?\n/g,' '));
                lines.push('');
              }
            }
        
            // Vragen + antwoorden (key = locId!)
            var qsArr = loc.vragen || [];
            if(qsArr.length){
              lines.push('**Reflectie**');
              for(var qi=0; qi<qsArr.length; qi++){
                var q = qsArr[qi];
                var ans = getAns(locId, qi);
                lines.push('- _' + q + '_');
                lines.push('  - Antwoord: ' + (ans && ans.trim && ans.trim() ? ans.replace(/\r?\n/g,' ') : '(—)'));
              }
              lines.push('');
            }
          }
        
          // Wat exporteren we?
          // 1) als je later unlockedLocs hebt: gebruik die (beste)
          // 2) anders: val terug op unlockedSlots/unlocked (slotIds)
          var ids = st.unlockedLocs || st.unlockedSlots || st.unlocked || [];
        
          for(var u=0; u<ids.length; u++){
            var id = ids[u];
            var loc = findLocById(id);
        
            if(loc){
              // ids zijn locIds
              exportOneLocation(loc);
            } else {
              // ids zijn slotIds -> exporteer alle locaties die bij dit slot horen
              var slot = id;
              var any = false;
        
              for(var j=0;j<arr.length;j++){
                if(arr[j] && arr[j].slot === slot){
                  exportOneLocation(arr[j]);
                  any = true;
                }
              }
        
              // fallback als er geen locaties gevonden worden voor dat slot
              if(!any){
                lines.push('## ' + slot);
                lines.push(getStoryFor(pc, slot, null) || '(geen tekst)');
                lines.push('');
              }
            }
          }
        
          // UTF-8 + BOM (fix voor oudere Notepad)
          var content = '\ufeff' + lines.join('\n');
          var blob = new Blob([content], {type:'text/markdown;charset=utf-8'});
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'woi-voortgang.md';
          a.click();
          URL.revokeObjectURL(url);
        });
        

        // Voorlezen + antwoorden (delegation op unlockList)
        var ul=qs('unlockList');
        if(ul){
          ul.addEventListener('click', function(e){
            var readBtn = e.target && (e.target.closest ? e.target.closest('button.readBtn') : null);
            if(readBtn){
              var id = readBtn.getAttribute('data-read');
              var pc = currentPc();
              
              // id kan locId zijn (best) of slotId (fallback)
              var locId = id;
              if (locId && locId.indexOf('stop') === 0) { // heel simpele heuristic
                locId = pickVariantLocationIdForSlot(locId) || locId;
              }
              
              var txt = (pc && pc.verhalen && locId) ? pc.verhalen[locId] : '';
              
              if(txt){ if('speechSynthesis' in window && speechSynthesis.speaking){ speechSynthesis.cancel(); } else { speakText(txt); } }
              return;
            }
            var clr = e.target && (e.target.closest ? e.target.closest('button.clearAns') : null);
            if (clr){
              var sid = clr.getAttribute('data-stop'), qi = parseInt(clr.getAttribute('data-q'),10);
              setAns(sid, qi, '');
              var ta = ul.querySelector('textarea.ans[data-stop="'+sid+'"][data-q="'+qi+'"]');
              if(ta){ ta.value=''; ta.focus(); }
              return;
            }
            var mic = e.target && (e.target.closest ? e.target.closest('button.micBtn') : null);
            if (mic){
              if(!MIC_OK){ toast('Spraakherkenning niet beschikbaar (probeer online in Chrome).'); return; }
              var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
              var r = new Recognition(); r.lang='nl-NL'; r.interimResults=false; r.maxAlternatives=1;
              var sid2 = mic.getAttribute('data-stop'), qi2 = parseInt(mic.getAttribute('data-q'),10);
              r.onresult = function(ev){
                var txt2 = ev.results[0][0].transcript || '';
                var ta2 = ul.querySelector('textarea.ans[data-stop="'+sid2+'"][data-q="'+qi2+'"]');
                if(ta2){ ta2.value = (ta2.value ? ta2.value+' ' : '') + txt2; setAns(sid2, qi2, ta2.value); }
              };
              r.onerror = function(ev){
                var msg = (ev && ev.error) ? ev.error : 'mislukt';
                if (msg==='not-allowed') msg = 'toegang geweigerd (controleer microfoonrechten)';
                if (msg==='network') msg = 'offline? (internet vereist in Chrome)';
                toast('🎙️ '+msg);
              };
              try { r.start(); toast('🎙️ Spreek maar…'); } catch(_e){ toast('🎙️ kon niet starten'); }
              return;
            }
          });
 function handleSave(e){
  var t = e.target;
  // Zoek het dichtstbijzijnde <textarea class="ans"> (werkt ook bij blur van binnenin)
  var ta = t && (t.matches && t.matches('textarea.ans') ? t
            : (t.closest ? t.closest('textarea.ans') : null));
  if(!ta || !ta.getAttribute) return; // extra safety

  var stopId = ta.getAttribute('data-stop');
  var qi     = parseInt(ta.getAttribute('data-q'), 10);
  setAns(stopId, qi, ta.value);
}

          ul.addEventListener('input', handleSave);
          ul.addEventListener('change', handleSave);
          ul.addEventListener('blur', handleSave, true);
        }

        var cs=qs('cacheState'); if(cs) cs.textContent='Geïnstalleerd';
        var d=qs('diag'); if(d){ d.style.display='block'; d.textContent='app.js geladen ✓ — listeners gebonden, klaar.'; }

        window.__APP_BOUND__ = true;

        // (optioneel) SW-registratie
        if('serviceWorker' in navigator){
          navigator.serviceWorker.register('./sw.js?v=2025-09-02-v3',{scope:'./'})
            .then(function(){ var cs=qs('cacheState'); if(cs) cs.textContent='Geïnstalleerd'; })
            .catch(function(){ var cs=qs('cacheState'); if(cs) cs.textContent='Niet geïnstalleerd'; });
        }
      }).catch(function(e){
        showDiag('Data laden mislukte: ' + (e && e.message ? e.message : e));
        if (window.console) console.error(e);
      });
    } catch(e){
      showDiag('Boot error: ' + (e && e.message ? e.message : e));
      if (window.console) console.error(e);
    }
  });
  function reqIsDone(req, unlocked){
    // req = "id" of ["id1","id2",...]
    if (Array.isArray(req)){
      for (var i=0;i<req.length;i++){
        if (unlocked.indexOf(req[i])>-1) return true;
      }
      return false;
    }
    return unlocked.indexOf(req)>-1;
  }
  
  function reqDisplayName(req){
    // Voor de toast bij ontbrekende stops
    if (Array.isArray(req)){
      var names = req.map(function(id){
        var s=(DATA.stops||[]).find(function(x){ return x.id===id; });
        return s ? s.naam : id;
      });
      return names.join(' of ');
    } else {
      var s2=(DATA.stops||[]).find(function(x){ return x.id===req; });
      return s2 ? s2.naam : req;
    }
  }
  

  // Errors globaal tonen
  window.addEventListener('error', function(e){ showDiag('JS error: '+e.message); });
  window.addEventListener('unhandledrejection', function(e){ showDiag('Promise error: '+(e.reason && e.reason.message ? e.reason.message : e.reason)); });

})();
