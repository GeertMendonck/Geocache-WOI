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
    var __lastFix = null;
    window.__geoWatchId = null;
    window.__lastGeoAt  = 0;
    window.__lastFix    = null; 
    window.__pendingRecenter = false; // alleen als je dat gebruikt

  
    // ---------- Mini helpers ----------
    //slotconfig
    function getSlotConfig(slotId){
        var slots = DATA.slots || [];
        for(var i=0;i<slots.length;i++){
          if(slots[i] && slots[i].id === slotId) return slots[i];
        }
        return null;
      }
      
      function getCompleteMode(slotId){
        var so = getSlotConfig(slotId);
        var m = (so && so.completeMode) ? String(so.completeMode).toLowerCase() : 'all';
        // default: all (veilig, strikt)
        return m;
      }
      
      function isSlotCompleted(slotId){
        var mode = getCompleteMode(slotId); // 'any' | 'all' | 'nearest' | 'random' ...
        var unlocked = getUnlockedLocIds();
        var locs = DATA.locaties || DATA.stops || [];
      
        var idsInSlot = [];
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(s && s.slot === slotId) idsInSlot.push(s.id);
        }
      
        // geen locaties? beschouw als completed (of false, maar dit voorkomt vastlopers)
        if(!idsInSlot.length) return true;
      
        if(mode === 'any' || mode === 'nearest' || mode === 'random'){
          // any: zodra 1 locatie uit dit slot unlocked is -> slot completed
          for(var j=0;j<idsInSlot.length;j++){
            if(unlocked.indexOf(idsInSlot[j]) >= 0) return true;
          }
          return false;
        }
      
        // default / 'all'
        for(var k=0;k<idsInSlot.length;k++){
          if(unlocked.indexOf(idsInSlot[k]) < 0) return false;
        }
        return true;
      }
      function pickTargetLocForSlot(slotId, myLat, myLng){
        var mode = getCompleteMode(slotId);
        var unlocked = getUnlockedLocIds();
        var locs = DATA.locaties || DATA.stops || [];
      
        // verzamel kandidaten in dit slot die nog niet unlocked zijn
        var cand = [];
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(!s || s.slot !== slotId) continue;
          if(s.lat==null || s.lng==null) continue;
          if(unlocked.indexOf(s.id) >= 0) continue;
          cand.push(s);
        }
        if(!cand.length) return null;
      
        // nearest: kies dichtste (dit is ook fijn als default)
        if(mode === 'nearest' || mode === 'any' || mode === 'all'){
          var best = cand[0], bestD = Infinity;
          for(var j=0;j<cand.length;j++){
            var d = haversineMeters(myLat,myLng, cand[j].lat, cand[j].lng);
            if(d < bestD){ bestD = d; best = cand[j]; }
          }
          return best;
        }
      
        // random: kies 1 willekeurige (maar liefst stabiel per sessie)
        if(mode === 'random'){
          // TIP: voor echte stabiliteit: bewaar keuze in store per slotId.
          //var r = Math.floor(Math.random() * cand.length);
          //return cand[r];
          return getRandomPickForSlot(slotId, cand);
        }
      
        // fallback
        return cand[0];
      }
      
      function getNextRequiredLoc(myLat,myLng){
        var slots = DATA.slots || [];
      
        // 1) volgende required slot dat niet completed is
        var nextSlotId = null;
        for(var i=0;i<slots.length;i++){
          var sl = slots[i];
          if(!sl || !sl.required) continue;
          if(!isSlotCompleted(sl.id)){
            nextSlotId = sl.id;
            break;
          }
        }
        if(!nextSlotId) return null;
      
        // 2) target locatie binnen slot volgens completeMode
        return pickTargetLocForSlot(nextSlotId, myLat, myLng);
      }
      function getRandomPickForSlot(slotId, candidates){
        var st = store.get();
        if(!st.slotPick) st.slotPick = {};
      
        // als er al een pick is en die zit nog in candidates -> behouden
        var pickedId = st.slotPick[slotId];
        if(pickedId){
          for(var i=0;i<candidates.length;i++){
            if(candidates[i].id === pickedId) return candidates[i];
          }
        }
      
        // anders: nieuw lotje trekken
        var r = Math.floor(Math.random() * candidates.length);
        var chosen = candidates[r];
        st.slotPick[slotId] = chosen.id;
        store.set(st);
        return chosen;
      }
      


    //-----------------
    //kaart draaien, volgende locatie ligt boven huidige locatie
    function haversineMeters(lat1,lng1,lat2,lng2){
        var R = 6371000;
        var φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
        var dφ = (lat2-lat1) * Math.PI/180;
        var dλ = (lng2-lng1) * Math.PI/180;
        var a = Math.sin(dφ/2)*Math.sin(dφ/2) +
                Math.cos(φ1)*Math.cos(φ2) *
                Math.sin(dλ/2)*Math.sin(dλ/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      }
      
      function getUnlockedLocIds(){
        var st = store.get();
        return st.unlockedLocs || [];
      }
      
      function isSlotCompleted(slotId){
        // slot is "completed" als ALLE locaties binnen die slot unlocked zijn.
        // (werkt mooi met split-stops)
        var unlocked = getUnlockedLocIds();
        var locs = DATA.locaties || DATA.stops || [];
        var anyInSlot = false;
      
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(!s || s.slot !== slotId) continue;
          anyInSlot = true;
          if(unlocked.indexOf(s.id) < 0) return false; // er is nog eentje niet gehaald
        }
        // als er geen locaties zijn voor dit slot: behandel als completed (of false, naar keuze)
        return anyInSlot ? true : true;
      }
      
      function getNextRequiredLoc(myLat,myLng){
        var slots = DATA.slots || [];
        var locs  = DATA.locaties || DATA.stops || [];
        var unlocked = getUnlockedLocIds();
      
        // 1) vind eerst de volgende required slot die nog niet completed is (volgorde = slots[] volgorde)
        var nextSlotId = null;
        for(var i=0;i<slots.length;i++){
          var sl = slots[i];
          if(!sl || !sl.required) continue;
          if(!isSlotCompleted(sl.id)){
            nextSlotId = sl.id;
            break;
          }
        }
        if(!nextSlotId) return null;
      
        // 2) kies binnen die slot de dichtstbijzijnde *nog niet unlocked* locatie
        var best = null, bestD = Infinity;
        for(var j=0;j<locs.length;j++){
          var s = locs[j];
          if(!s || s.slot !== nextSlotId) continue;
          if(s.lat==null || s.lng==null) continue;
          if(unlocked.indexOf(s.id) >= 0) continue; // al gehaald
      
          var d = haversineMeters(myLat,myLng, s.lat, s.lng);
          if(d < bestD){
            bestD = d;
            best = s;
          }
        }
      
        // fallback: als alles in die slot al unlocked is (zou niet mogen), neem eender welke
        if(!best){
          for(var k=0;k<locs.length;k++){
            var t = locs[k];
            if(t && t.slot === nextSlotId && t.lat!=null && t.lng!=null){
              best = t; break;
            }
          }
        }
      
        return best;
      }
      function panSoNextIsAboveMe(myLat,myLng){
        if(!window.LMAP || !followMe) return;
      
        var next = getNextRequiredLoc(myLat,myLng);
        if(!next) return;
      
        // 1) Zorg dat zowel jij als next in beeld kunnen passen (smooth)
        try{
          var bounds = L.latLngBounds([[myLat,myLng],[next.lat,next.lng]]);
          // padding zodat het niet "tegen de rand" plakt
          window.LMAP.fitBounds(bounds, { padding: [30, 60], animate: true });
        }catch(e){
          // als fitBounds faalt, fallback op panTo
          window.LMAP.panTo([myLat,myLng], { animate:true });
        }
      
        // 2) Duw het beeld wat naar beneden zodat "boven" meer ruimte krijgt
        // (positieve y = kaart naar beneden => jij komt lager in beeld)
        setTimeout(function(){
          try{
            var h = window.LMAP.getSize().y;
            window.LMAP.panBy([0, Math.round(h*0.20)], { animate:true });
          }catch(e){}
        }, 120);
      }
      
      

    //-------------------------
    // GPS aanhouden 
    window.__geoWatchId = null;   // id van watchPosition
    window.__lastGeoAt  = 0;      // timestamp van laatste GPS update (ms)
    function startGpsWatch(force){
        // als er al een watch loopt en we forceren niet: niets doen
        if(!force && window.__geoWatchId != null) return;
      
        if(force && window.__geoWatchId != null){
          try { navigator.geolocation.clearWatch(window.__geoWatchId); } catch(e){}
          window.__geoWatchId = null;
        }
      
        var watchId = navigator.geolocation.watchPosition(
          function(pos){
            window.__lastGeoAt = Date.now();
            var c = pos.coords;
      
            // handig: bewaar last fix voor 'centreer'
            window.__lastFix = { lat: c.latitude, lng: c.longitude, acc: c.accuracy };
      
            updateLeafletLive(c.latitude, c.longitude, c.accuracy);
            // ... unlocks/refresh ...
          },
          function(err){
            console.log('GPS error', err && err.code, err && err.message);
            window.__geoWatchId = null;
          },
          { enableHighAccuracy:true, maximumAge:2000, timeout:15000 }
        );
      
        window.__geoWatchId = watchId;
      }
      
      window.__ensureGpsBusyUntil = 0;
    function ensureGpsAwake(){
  var STALE_MS = 20000; // 20s (pas gerust aan)

  var now  = Date.now();
  if(now < (window.__ensureGpsBusyUntil||0)) return;
  window.__ensureGpsBusyUntil = now + 1000;
  var last = window.__lastGeoAt || 0;

  // 1) watch bestaat niet (weggevallen) -> herstart
  if(window.__geoWatchId == null){
    startGpsWatch(false); // <-- jouw bestaande startfunctie
    return;
  }

  // 2) nooit een update gehad of te lang stil -> herstart
  if(!last || (now - last > STALE_MS)){
    startGpsWatch(true);  // <-- force herstart (zie stap 4)
    return;
  }

  // anders: alles ok, niets doen
}

      

    //----------------
    function refreshRouteUI(){
        // 1) visibility herberekenen (kaart + lijst)
        rebuildVisibleSlotMaps();
      
        // 2) lijst onderaan
        renderStops();
      
        // 3) kaart overlays
        addStopMarkers();
        addStopCircles();
      }
      
 
    function slotById(id){
        var arr = (DATA && DATA.slots) ? DATA.slots : [];
        for (var i=0;i<arr.length;i++){
          if (arr[i] && arr[i].id === id) return arr[i];
        }
        return null;
      }
      function computeVisibleSlotIds(){
        var st = store.get();
        var unlockedSlots = st.unlockedSlots || [];
        var unlockedMap = {};
        for (var i=0;i<unlockedSlots.length;i++) unlockedMap[unlockedSlots[i]] = true;
      
        var settings = (DATA && DATA.settings) ? DATA.settings : {};
        var mode = settings.visibilityMode || 'all';
        var showOptional = !!settings.showOptionalSlots;
      
        var slots = DATA.slots || [];
        var slotOrder = DATA.slotOrder || slots.map(function(s){ return s.id; });
      
        function slotObj(id){
          for (var j=0;j<slots.length;j++){
            if (slots[j] && slots[j].id === id) return slots[j];
          }
          return null;
        }
        function isOptional(id){
          var o = slotObj(id);
          return o ? (o.required === false) : false;
        }
      
        // optional slots eventueel eruit
        function allowedByOptional(id){
          return showOptional || !isOptional(id);
        }
      
        // default: alles zichtbaar (behalve optional als uit)
        if (mode !== 'nextOnly') {
          var all = [];
          for (var k=0;k<slotOrder.length;k++){
            var sid = slotOrder[k];
            if (sid && allowedByOptional(sid)) all.push(sid);
          }
          return all;
        }
      
        // nextOnly:
        // 1) toon alle unlocked slots
        var visible = [];
        for (var a=0;a<slotOrder.length;a++){
          var sid1 = slotOrder[a];
          if (!sid1) continue;
          if (!allowedByOptional(sid1)) continue;
          if (unlockedMap[sid1]) visible.push(sid1);
        }
      
        // 2) bepaal 1 "volgende" slot
        var startSid = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
        var nextSid = null;
      
        for (var b=0;b<slotOrder.length;b++){
          var sid2 = slotOrder[b];
          if (!sid2) continue;
          if (!allowedByOptional(sid2)) continue;
          if (unlockedMap[sid2]) continue;
      
          var o2 = slotObj(sid2);
          var prereq = o2 && o2.unlockAfterSlot ? o2.unlockAfterSlot : null;
      
          var prereqOk = (!prereq) || !!unlockedMap[prereq] || (prereq === startSid && !!unlockedMap[startSid]);
      
          if (prereqOk) { nextSid = sid2; break; }
        }
      
        // start altijd zichtbaar
        if (visible.indexOf(startSid) < 0 && allowedByOptional(startSid)) visible.unshift(startSid);
      
        if (nextSid && visible.indexOf(nextSid) < 0) visible.push(nextSid);
      
        return visible;
      }
      
      function renderStops(){
        var host = document.getElementById('stopsListHost');
        var cont = host || document.getElementById('stopsList');
        if(!cont) return;
      
        if(!window.DATA || !(DATA.slots||[]).length){
          cont.innerHTML = '<span class="muted">(DATA/slots nog niet geladen)</span>';
          return;
        }
      
        rebuildVisibleSlotMaps();
      
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
      
          // als meerdere opties en nog niet unlocked: toon enkel aantal opties (geen spoilers)
          if(locs.length > 1 && !unlockedMap[sid]){
            return '🔀 (' + locs.length + ' opties)';
          }
      
          // gekozen locatie (als je dat bewaart), anders 1e
          var chosenId = null;
          if(st.unlockedBySlot && st.unlockedBySlot[sid]) chosenId = st.unlockedBySlot[sid];
          else if(locs.length === 1) chosenId = locs[0].id;
          else chosenId = locs[0].id;
      
          var loc = findLocById(chosenId);
          return loc && loc.naam ? stripPrefix(loc.naam) : '';
        }
      
        var html = '';
        (slotOrder||[]).forEach(function(sid){
          if(!isSlotVisibleInList(sid)) return;
      
          var ok = !!unlockedMap[sid];
          var optional = isOptionalSlot(sid);
          var icon = ok ? '✅' : (sid===endSlot ? '🔒' : (optional ? '🧩' : '⏳'));
      
          var label = slotLabel(sid);
      
          // ✅ Spoiler-proof: place alleen tonen als slot unlocked is
          var place = ok ? displayPlaceForSlot(sid) : '';
      
          html += '<span class="pill ' + (ok?'ok':'no') + '">'
                + icon + ' '
                + '<span class="pillMain">' + escapeHtml(label) + '</span>'
                + (place ? ' <span class="pillSub">· ' + escapeHtml(place) + '</span>' : '')
                + '</span>';
        });
      
        cont.innerHTML = html || '<span class="muted">(Geen stops geladen)</span>';
      }
      
          
    function getStartLocation(){
        return (DATA.locaties || []).find(function(l){
          return l.slot === 'start';
        }) || null;
      }
      
    function applyMeta(){
        var dbg = document.getElementById('debugMeta');
        if(dbg){
          dbg.textContent = 'applyMeta() RUN ✅';
        }
      
        if(!DATA || !DATA.meta) {
          if(dbg) dbg.textContent += ' | DATA.meta ontbreekt ❌';
          return;
        }
        if(!DATA || !DATA.meta) return;
      
        var title = (DATA.meta.title || '').trim();
        var subtitle = (DATA.meta.subtitle || '').trim();
      
        var h1 = document.getElementById('appTitle');
        if(h1){
          h1.textContent = title || 'Geo-app';
        }
      
        var h2 = document.getElementById('appSubtitle');
        if(h2){
          if(subtitle){
            h2.textContent = subtitle;
            h2.style.display = '';
          }else{
            h2.textContent = '';
            h2.style.display = 'none';
          }
        }
      
        // optioneel maar netjes: browser-titel syncen
        if(title){
          document.title = title;
        }
      }
      
    function processFix(latitude, longitude, accuracy){
        var startSlot = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
      
        var here = { lat: latitude, lng: longitude };
        var best = null;
        var insideStart = false;
      
        (DATA.stops||[]).forEach(function(s){
          var d = Math.round(distanceMeters(here,{lat:s.lat,lng:s.lng}));
          if(!best || d < best.d){
            best = { id:s.id, slot:s.slot, name:s.naam, d:d,
                     radius:(s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200)) };
          }
          if(s.slot === startSlot){
            if(d <= (s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200))) insideStart = true;
          }
        });
      
        if (window.__insideStart !== insideStart) {
            window.__insideStart = insideStart;
            renderCharacterChooser(); // 👈 dit is de essentie
          }
      
        var st = store.get();
        var msg = qs('prestartMsg');        
        var msgRow = qs('prestartMsgRow');
        var startLoc = getStartLocation();
        var startNaam = startLoc ? (startLoc.naam || 'Start') : 'Start';
        var routeHint = startLoc ? (startLoc.routeHint || '') : '';
        
        // UI: naam startpunt
        var cl = qs('closest');
        if (cl) cl.textContent = startNaam;
        
        // UI: afstand & straal (zoals het was)
        if (best) {
          var di = qs('dist');   if (di) di.textContent = String(best.d);
          var ra = qs('radius'); if (ra) ra.textContent = String(best.radius);
        }
        
        // UI: boodschap
        var msgRow = qs('prestartMsgRow');
        var msgEl  = qs('prestartMsg');
        
        if (msgRow && msgEl) {
          var teVerMsg = (DATA && DATA.prestart && DATA.prestart.message) ? DATA.prestart.message : '';
        
          // we bepalen "te ver" op basis van afstand vs straal (zoals jij het wou laten)
          var inside = best ? (Number(best.d) <= Number(best.radius)) : true;
        
          var text = inside  ? '🚶 ' + routeHint    : '🧭 ' + teVerMsg;
        
          msgEl.textContent = text || '';
          msgRow.style.display = text ? '' : 'none';
        }
  
      
        // ✅ unlock pas als “route echt gestart” is
        if(best && st.geoOn === true){
          tryUnlock(best, accuracy);
          renderProgress();
          scheduleStopsRender('unlock');
        } else {
          renderProgress();
        }
      
        ensureLeafletMap();
        // als jij nu met __lastFix + applyLiveFixToMap werkt:
        __lastFix = { lat: latitude, lng: longitude, acc: accuracy };
        applyLiveFixToMap();
      }
      
      function buildStoryTimelineHtml(pc, hasRealLoc){
        if(!pc || !pc.verhalen) {
          return '<div class="muted">(Geen verhaal beschikbaar)</div>';
        }
      
        var st = store.get();
        var unlockedLocs = st.unlockedLocs || [];
        if(!unlockedLocs.length){
          return '<span class="muted">Nog geen verhaal. Wandel eens binnen een cirkel 🙂</span>';
        }
      
        var arr = DATA.locaties || DATA.stops || [];
      
        function findLocById(id){
          for(var i=0;i<arr.length;i++){
            if(arr[i] && arr[i].id === id) return arr[i];
          }
          return null;
        }
      
        var html = '';
        var lastLocId = unlockedLocs[unlockedLocs.length - 1];
      
        for(var i=0;i<unlockedLocs.length;i++){
          var locId = unlockedLocs[i];
          var loc = findLocById(locId);
          if(!loc) continue;
      
          var slotId = (loc.slot || '').toString().trim().toLowerCase();
      
          // start / end normaliseren
          var startSlot = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
          if(slotId === startSlot) slotId = 'start';
          var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
          if(slotId === endSlot) slotId = 'end';
      
          var verhaal = getStoryFor(pc, slotId, locId);
          if(!verhaal) continue;
      
          var isLatest = (locId === lastLocId);
      
          html += ''
            + '<div class="storyChunk'+(isLatest ? ' is-latest' : '')+'" id="storyChunk_'+escapeHtml(locId)+'">'
            +   '<div class="storyChunkHead">'
            +     '<span>'+escapeHtml(loc.naam || slotId)+'</span>'
            +     (isLatest ? '<span class="pill tiny">nieuw</span>' : '')
            +   '</div>'
            +   '<div class="storyChunkBody">'+escapeHtml(verhaal)+'</div>'
            + '</div>';
        }
      
        return html || '<span class="muted">(Nog geen verhaal)</span>';
      }
      
      
    function autoFocusNewStory(){
        var st = store.get();
        if(!st.lastUnlockedLocId) return;
      
        // als focus niet op story staat, spring er naartoe
        if(st.focus !== 'story'){
          st.focus = 'story';
          store.set(st);
          renderUnlocked(); // re-render met story open
          return;
        }
      
        // scroll naar het nieuw stuk (als het al bestaat)
        var el = document.getElementById('storyChunk_' + st.lastUnlockedLocId);
        if(el && el.scrollIntoView){
          setTimeout(function(){
            el.scrollIntoView({ behavior:'smooth', block:'start' });
          }, 50);
        }
      
        // only-once gedrag
        st.lastUnlockedLocId = null;
        store.set(st);
      }
      
    function applyLiveFixToMap(){
        if(!__lastFix) return;
        if(!window.LMAP || !window.L) return;
      
        // zorg dat marker bestaat
        if(!liveMarker){
          liveMarker = L.marker([__lastFix.lat, __lastFix.lng], {
            icon: L.divIcon({ className:'user-dot', iconSize:[14,14], iconAnchor:[7,7] })
          }).addTo(window.LMAP);
        }
      
        // zorg dat hij op de map staat (na parkeren/verhuizen kan dit soms raar doen)
        if(!window.LMAP.hasLayer(liveMarker)) liveMarker.addTo(window.LMAP);
      
        liveMarker.setLatLng([__lastFix.lat, __lastFix.lng]);
        liveMarker.setOpacity(1);
      
        if(accCircle){
          if(!window.LMAP.hasLayer(accCircle)) accCircle.addTo(window.LMAP);
          accCircle.setLatLng([__lastFix.lat, __lastFix.lng]);
          accCircle.setRadius(Math.max(5, __lastFix.acc||0));
        }
      
        // breng boven andere lagen
        try { liveMarker.setZIndexOffset(1000); } catch(e){}
      
        __liveReady = true;
        if(followMe) window.LMAP.setView([__lastFix.lat, __lastFix.lng]);

      }
      
      var __stopsRenderTimer = null;

      function scheduleStopsRender(reason){
        if(__stopsRenderTimer) clearTimeout(__stopsRenderTimer);
      
        __stopsRenderTimer = setTimeout(function(){
          var tries = 0;
      
          function attempt(){
            tries++;
      
            var host = document.getElementById('stopsListHost');
            if(host){
              // host bestaat, maar is hij al zichtbaar?
              if(host.offsetParent === null){
                if(tries < 20) return requestAnimationFrame(attempt);
                return;
              }
            } else {
              // nog geen host, dan kan renderStops nergens terecht (in map UI)
              if(tries < 20) return requestAnimationFrame(attempt);
              return;
            }
      
            try { refreshRouteUI();  } catch(e){}
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
      try { refreshRouteUI();  } catch(e){}
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
    var __lastFix = null;     // {lat,lng,acc}
    var __liveReady = false;  // marker bestaat en staat op de map
    
    var followMe = true;
    var followResumeTimer = null;
    var lastInsideStart = null;
    var pcSelectBusyUntil = 0;
  
    // ---------- Story helper ----------
    function getStoryFor(pc, slotId, locId){
        if(!pc || !pc.verhalen) return null;
      
        function norm(s){ return String(s||'').toLowerCase().trim(); }
      
        // helper: haal waarde op via exact key of via genormaliseerde key
        function getByKey(obj, key){
          if(!obj || key == null) return undefined;
          if(Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
      
          var nk = norm(key);
          for(var k in obj){
            if(Object.prototype.hasOwnProperty.call(obj, k) && norm(k) === nk){
              return obj[k];
            }
          }
          return undefined;
        }
      
        // 1) backward compat: verhaal rechtstreeks op locId
        if(locId){
          var direct = getByKey(pc.verhalen, locId);
          if(typeof direct === 'string') return direct;
        }
      
        // 2) normaal: per slot
        var s = getByKey(pc.verhalen, slotId);
        if(!s) return null;
      
        if(typeof s === 'string') return s;
      
        // 3) split-slot: object per locatie-id
        if(locId && typeof s === 'object'){
          var byLoc = getByKey(s, locId);
          if(typeof byLoc === 'string') return byLoc;
        }
      
        // 4) fallback: eerste string in object
        if(typeof s === 'object'){
          for(var k2 in s){
            if(Object.prototype.hasOwnProperty.call(s,k2) && typeof s[k2] === 'string'){
              return s[k2];
            }
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
        document.addEventListener('visibilitychange', function(){
            if(!document.hidden) ensureGpsAwake();
          });
          window.addEventListener('focus', function(){
            ensureGpsAwake();
          });

          document.addEventListener('click', function(e){
            var r = e.target && e.target.closest ? e.target.closest('#recenterBtn') : null;
            if(r){
              followMe = true;
              ensureGpsAwake();
        
              if(window.__lastFix && window.LMAP){
                window.LMAP.setView([window.__lastFix.lat, window.__lastFix.lng], window.LMAP.getZoom());
              } else {
                // optioneel: center zodra de volgende GPS-fix binnenkomt
                window.__pendingRecenter = true;
              }
              return;
            }
          });
          
      var b;
      document.addEventListener('click', function(e){
        var ex = e.target && e.target.closest ? e.target.closest('#exportBtn') : null;
        if(!ex) return;
        exportProgress();
      });
      
      document.addEventListener('pointerdown', initAudio, { once:true });
  
      b=qs('startBtn'); if(b) b.addEventListener('click', function(){ initAudio(); startWatch(); });
      b=qs('resetBtn'); if(b) b.addEventListener('click', function(){ localStorage.removeItem('woi_state'); location.reload(); });
     // b=qs('recenterBtn'); if(b) b.addEventListener('click', function(){ followMe = true; });
  
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
      st2.focus = 'map';
      // 🔁 verwerk laatste GPS-fix meteen

  
      store.set(st2);
      if(__lastFix){
        processFix(__lastFix.lat, __lastFix.lng, __lastFix.acc);
      }
  
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
          fetchJSON('./data/meta.json'),          // defaults (kan leeg zijn)
          fetchJSON(stopsFileFromQuery()),        // scenario (stops.json of stops_thuis.json)
          fetchJSON('./data/personages.json')
        ]).then(function(arr){
          var metaDefaults = arr[0] || {};
          var stopsRaw = arr[1];
          var personages = arr[2] || [];
      
          // ---------------------------
          // 1) Extract scenario-structuur
          // ---------------------------
          var isScenarioObject =
            stopsRaw &&
            typeof stopsRaw === 'object' &&
            !Array.isArray(stopsRaw) &&
            stopsRaw.locaties &&
            stopsRaw.slots;
      
          var slots = null, locaties = null;
          var scenarioMeta = {};
          var scenarioSettings = {};
          var scenarioPrestart = {};
      
          if (isScenarioObject) {
            slots = stopsRaw.slots || [];
            locaties = stopsRaw.locaties || [];
      
            scenarioMeta = stopsRaw.meta || {};
            scenarioSettings = stopsRaw.settings || {};
            scenarioPrestart = stopsRaw.prestart || {};
          } else {
            // Backward compat: stopsRaw is array of locaties
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
      
          // ---------------------------
          // 2) Merge: defaults + scenario override
          //    (scenario wint)
          // ---------------------------
          var meta = Object.assign({}, metaDefaults, scenarioMeta);
      
          // settings/prestart bestaan enkel in scenario (of later ook defaults, maar nu ok)
          var settings = Object.assign({}, scenarioSettings);
          var prestart = Object.assign({}, scenarioPrestart);
      
          // ---------------------------
          // 3) start/end slots bepalen
          //    (ook scenario-override mogelijk)
          // ---------------------------
          var startSlot = meta.startSlot || 'start';
          var endSlot   = meta.endSlot   || 'end';
      
          // ---------------------------
          // 4) afgeleide data
          // ---------------------------
          var slotOrder = (slots || []).map(function(s){ return s.id; });
          var requiredSlots = (slots || [])
            .filter(function(s){ return !!s.required; })
            .map(function(s){ return s.id; });
      
          return {
            meta: meta,
            settings: settings,
            prestart: prestart,
      
            // compat: je gebruikt nu soms "stops", soms "locaties"
            stops: locaties,
            locaties: locaties,
      
            slots: slots,
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
      refreshRouteUI();
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
    function isSlotVisible(slotId){
        // als er geen visibility-map is, toon alles
        if(!window.visibleSlotMap) return true;
        // undefined betekent: geen expliciete regel → toon
        return window.visibleSlotMap[slotId] !== false;
      }
      
    function renderStops(){
        var host = document.getElementById('stopsListHost');
        var cont = host || document.getElementById('stopsList');
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
            if(!isSlotVisible(sid)) return;
          var ok = !!unlockedMap[sid];
          var optional = isOptionalSlot(sid);
          var icon = ok ? '✅' : (sid===endSlot ? '🔒' : (optional ? '🧩' : '⏳'));
      
          var label = slotLabel(sid);
          var place = displayPlaceForSlot(sid);
      
         html += '<span class="pill ' + (ok ? 'ok' : 'no') + '">'
                + icon + ' '
                + '<span class="pillMain">' + escapeHtml(label) + '</span>'
                + (place ? ' <span class="pillSub">· ' + escapeHtml(place) + '</span>' : '')
                + '</span>';
        });
      
        cont.innerHTML = html || '<span class="muted">(Geen stops geladen)</span>';
      }
      
  
   
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
      setTimeout(function(){
        if(window.LMAP) window.LMAP.invalidateSize(true);
        applyLiveFixToMap();
      }, 0);
      
   
    }
    function computeVisibleSlotMap(context){
        var st = store.get();
        var unlockedSlots = st.unlockedSlots || [];
        var unlockedMap = {};
        for (var i=0;i<unlockedSlots.length;i++) unlockedMap[unlockedSlots[i]] = true;
      
        var settings = (DATA && DATA.settings) ? DATA.settings : {};
        console.log('[computeVisibleSlotMap]', context,
            'listShowFutureSlots=', settings.listShowFutureSlots, 'type=', typeof settings.listShowFutureSlots,
            'mode=', settings.visibilityMode);
        var mode = settings.visibilityMode || 'allAfterStart';
        var showOptional = !!settings.showOptionalSlots;
      
        var listShowFuture = !!settings.listShowFutureSlots;
        var mapShowFuture  = !!settings.mapShowFutureLocations;
      
        var slots = DATA.slots || [];
        var slotOrder = DATA.slotOrder || slots.map(function(s){ return s.id; });
      
        function slotObj(id){
          for (var j=0;j<slots.length;j++){
            if (slots[j] && slots[j].id === id) return slots[j];
          }
          return null;
        }
        function isOptional(id){
          var o = slotObj(id);
          return o ? (o.required === false) : false;
        }
        function allowByOptional(id){
          return showOptional || !isOptional(id);
        }
      
        var visible = {};
        var startSid = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
      
        // -------- CONTEXT OVERRIDES --------
        // Lijst: als we future slots willen tonen, tonen we ALLE slots (behalve optional indien uit)
        if (context === 'list' && listShowFuture) {
          for (var a=0;a<slotOrder.length;a++){
            var sidA = slotOrder[a];
            if (sidA && allowByOptional(sidA)) visible[sidA] = true;
          }
          return visible;
        }
      
        // Kaart: als future locations mogen, toon alle slots
        if (context === 'map' && mapShowFuture) {
          for (var b0=0;b0<slotOrder.length;b0++){
            var sidB0 = slotOrder[b0];
            if (sidB0 && allowByOptional(sidB0)) visible[sidB0] = true;
          }
          return visible;
        }
      
        // -------- DEFAULT BY MODE --------
        // Niet-nextOnly: toon alles
        if (mode !== 'nextOnly') {
          for (var b=0;b<slotOrder.length;b++){
            var sidB = slotOrder[b];
            if (sidB && allowByOptional(sidB)) visible[sidB] = true;
          }
          return visible;
        }
      
       // nextOnly:
 // nextOnly:
        // 1) toon unlocked slots
        //    - op MAP: ja
        //    - in LIST: alleen als listShowFutureSlots true is
        if (context === 'map' || listShowFuture) {
            for (var c=0;c<slotOrder.length;c++){
            var sidC = slotOrder[c];
            if (sidC && allowByOptional(sidC) && unlockedMap[sidC]) {
                visible[sidC] = true;
            }
            }
        }
  

  // 2) toon start altijd
  if (allowByOptional(startSid)) visible[startSid] = true;

  function prereqOkFor(slotId){
    var o = slotObj(slotId);
    var prereq = o && o.unlockAfterSlot ? o.unlockAfterSlot : null;
    return (!prereq) || !!unlockedMap[prereq] || (prereq === startSid && !!unlockedMap[startSid]);
  }

  // 3) bepaal NEXT REQUIRED (optionals mogen deze niet kapen)
  var nextRequired = null;
  for (var d=0;d<slotOrder.length;d++){
    var cand = slotOrder[d];
    if(!cand) continue;
    if(!allowByOptional(cand)) continue;
    if(unlockedMap[cand]) continue;

    var o2 = slotObj(cand);
    var isOpt = o2 ? (o2.required === false) : false;

    if(isOpt) continue;              // ✅ skip optionals voor "next"
    if(!prereqOkFor(cand)) continue;

    nextRequired = cand;
    break;
  }
  if(nextRequired) visible[nextRequired] = true;

  // 4) toon ook beschikbare OPTIONALS (als extra keuzes) wanneer showOptionalSlots=true
  if (showOptional) {
    for (var e=0;e<slotOrder.length;e++){
      var cand2 = slotOrder[e];
      if(!cand2) continue;
      if(unlockedMap[cand2]) continue;

      var o3 = slotObj(cand2);
      var isOpt2 = o3 ? (o3.required === false) : false;
      if(!isOpt2) continue;

      if(prereqOkFor(cand2)) visible[cand2] = true;
    }
  }

  return visible;

      }
      function rebuildVisibleSlotMap(){
        window.visibleSlotMap = computeVisibleSlotMap() || {};
        return window.visibleSlotMap;
      }
        
      function rebuildVisibleSlotMaps(){
        window.visibleSlotMapMap  = computeVisibleSlotMap('map')  || {};
        window.visibleSlotMapList = computeVisibleSlotMap('list') || {};
      }
      
      function isSlotVisibleOnMap(slotId){
        if(!window.visibleSlotMapMap) return true;   // fallback als map nog niet bestaat
        return window.visibleSlotMapMap[slotId] === true;
      }
      
      function isSlotVisibleInList(slotId){
        if(!window.visibleSlotMapList) return true;  // fallback
        return window.visibleSlotMapList[slotId] === true;
      }
      
      
      
      
      function addStopMarkers(){
        if(!window.LMAP || !window.L) return;
      
        if(window.__stopMarkerLayer){
          try { window.LMAP.removeLayer(window.__stopMarkerLayer); } catch(e){}
        }
        window.__stopMarkerLayer = L.layerGroup().addTo(window.LMAP);
      
        rebuildVisibleSlotMaps();
      
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
      
          if(!isSlotVisibleOnMap(s.slot)) continue;
      
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
      
        rebuildVisibleSlotMaps();
      
        var locs = DATA.locaties || DATA.stops || [];
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(!s || s.lat==null || s.lng==null) continue;
      
          if(!isSlotVisibleOnMap(s.slot)) continue;
      
          var rad = s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200);
      
          L.circle([s.lat, s.lng], { radius: rad, weight:1, fillOpacity:.05 })
            .addTo(window.__stopMarkerLayer);
        }
      }
      
      var __lastNextPanAt = 0;

      function updateLeafletLive(lat,lng,acc){
        try{
          if(!window.LMAP || !liveMarker || !accCircle) return;
          liveMarker.setLatLng([lat,lng]).setOpacity(1);
          accCircle.setLatLng([lat,lng]).setRadius(acc||0);
      
          if (followMe){
            window.LMAP.setView([lat,lng]);
      
            var now = Date.now();
            if(now - __lastNextPanAt > 2500){
              __lastNextPanAt = now;
              panSoNextIsAboveMe(lat,lng);
            }
          }
      
          var a=qs('openInMaps'); 
          if(a) a.href='https://maps.google.com/?q='+lat+','+lng;
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
  
      //if(st.unlockedLocs.indexOf(best.id) === -1) st.unlockedLocs.push(best.id);
  
      if(st.unlockedSlots.indexOf(bestSlot) === -1){
        st.lastUnlockedLocId = best.id;     // ✅ voor auto-focus
        st.lastUnlockedAt = Date.now(); 
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
        window.__lastGeoAt = Date.now();
        var c = pos.coords;
        var latitude  = c.latitude;
        var longitude = c.longitude;
        var accuracy  = c.accuracy;
      
        // UI-status
        var cc = qs('coords');
        if(cc) cc.textContent = latitude.toFixed(5)+', '+longitude.toFixed(5);
        var ac = qs('acc');
        if(ac) ac.textContent = Math.round(accuracy);
      
        // ⬇️ alles gebeurt hier
        processFix(latitude, longitude, accuracy);
      
      }, function(err){
        var pn2=qs('permNote');
        if(pn2) pn2.innerHTML='<span class="warn">Locatie geweigerd</span>';
        var gs2=qs('geoState');
        if(gs2) gs2.textContent='Uit';
      }, {
        enableHighAccuracy:true,
        maximumAge:10000,
        timeout:15000
      });
      
    }
  
    function stopWatch(){
      if(watchId!==null){
        navigator.geolocation.clearWatch(watchId);
        watchId=null;
        var gs=qs('geoState'); if(gs) gs.textContent='Inactief';
      }
    }
  
    // ---------- renderUnlocked ----------
    function renderUnlocked(){
        var old = document.getElementById('mapSection');
        if(old) old.style.display = 'none';

        applyRouteModeUI();
        var downloadHtml = '';
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
        var hasRealLoc = !!currentLoc;
        var loc = currentLoc || {};     // ← voorkomt crashes
        var locId = hasRealLoc ? loc.id  : '';
        var slotId= hasRealLoc ? loc.slot: '';
        

        var hasLoc = !!currentLoc;

        if(!hasLoc){
        // geen return meer: we bouwen toch de panel-layout
        // placeholder values zodat de rest niet "undefined" wordt
        currentLoc = { id:'', slot:'', naam:'Nog geen stop', vragen:[], uitleg:null };
        }

      
        var loc = currentLoc;
        var locId = loc.id;
        var slotId = loc.slot;
      
        // ✅ bepaal END + downloadHtml VOOR je qaBody bouwt
        var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
        var isEnd = (loc && loc.slot === endSlot);
        
        downloadHtml =
          '<div class="card mt-10">'
        + '  <div class="cardHead">📄 Verslag</div>'
        + '  <div class="cardBody">'
        + (isEnd
            ? '<div class="muted" style="margin-bottom:10px">Je bent aan het eindpunt. Download nu je verslag.</div>'
            : '<div class="muted" style="margin-bottom:10px">Je kan tussendoor al downloaden. (Handig voor tips onderweg.)</div>'
          )
        + '    <button id="exportBtn" type="button" class="primary">⬇️ Download verslag</button>'
        + '  </div>'
        + '</div>';
        
//       //test, mag verwijderd worden
//       if(window.console){
//         console.log('DEBUG verhaal', {
//           pcId: (store.get()||{}).pcId,
//           pcFound: !!pc,
//           slotId: slotId,
//           locId: locId,
//           verhaalType: pc && pc.verhalen ? typeof pc.verhalen[slotId] : '(no pc/verhalen)',
//           verhaalKeys: pc && pc.verhalen ? Object.keys(pc.verhalen) : []
//         });
//       }
// //--------------      


        var verhaal = hasRealLoc ? getStoryFor(pc, slotId, locId) : null;
        var verhaalText = (verhaal == null) ? '' : String(verhaal);

        var hasRealLoc = hasLoc && locId && slotId;

        if(!hasRealLoc){
          verhaal = null;            // geen readBtn tonen
          uitlegHtml = '';           // of laat je uitlegHtml zoals je wil
          qaHtml = '<div class="muted">Nog geen vragen: wandel eerst een cirkel binnen 🙂</div>';
        }
        
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
      
        var qsArr   = hasRealLoc ? (loc.vragen || []) : [];
        var qaHtml = '';
        if(qsArr.length){
          qaHtml = qsArr.map(function(q,qi){
            var val = getAns(locId, qi);
            return ''
              + '<div class="qa">'
              + '  <div class="q"><b>Vraag '+(qi+1)+':</b> '+escapeHtml(q)+'</div>'
              + '  <div class="controls">'
              + '    <textarea class="ans" data-stop="'+locId+'" data-q="'+qi+'" placeholder="Jouw antwoord...">'+escapeHtml(val)+'</textarea>'
              + '    <div class="btnRow">'
              + (MIC_OK ? '      <button class="micBtn" data-stop="'+locId+'" data-q="'+qi+'">🎙️</button>' : '')
              + '      <button class="clearAns" data-stop="'+locId+'" data-q="'+qi+'">✖</button>'
              + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+qi+'"></span>'
              + '    </div>'
              + '  </div>'
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
        +     (hasRealLoc ? '<button class="readBtn" data-slot="'+slotId+'" data-loc="'+locId+'" title="Lees voor">🔊</button>' : '')
        +   '</div>'
        +   '<div style="margin-top:6px">'
        +     (hasRealLoc ? (verhaalText.trim() ? escapeHtml(verhaalText) : '<span class="muted">(Nog geen verhaal)</span>') : '<span class="muted">Nog geen huidige stop. Wandel eens binnen een cirkel 🙂</span>')
        +   '</div>'
        + '</div>';
        
      
            // --- Exportblok (altijd klaarzetten) ---
            var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
            var isEnd = (loc && loc.slot === endSlot);

            downloadHtml =
            '<div class="card mt-10">'
            + '  <div class="cardHead">📄 Verslag</div>'
            + '  <div class="cardBody">'
            + (isEnd
                ? '    <div class="muted small" style="margin-bottom:8px">Je bent aan het eindpunt — je kan nu je definitieve verslag downloaden.</div>'
                : '    <div class="muted small" style="margin-bottom:8px">Je kan onderweg al exporteren (handig voor tips). Definitieve export op het eindpunt.</div>')
            + '    <button id="exportBtn" type="button" class="primary">⬇️ Download verslag</button>'
            + '  </div>'
            + '</div>';

      
        var qaBody = ''
          + '<div id="statusWrapQa"></div>'
          + (uitlegHtml || '<div class="muted">(Geen uitleg)</div>')
          + '<div style="margin-top:10px">' + qaHtml + '</div>'
          + downloadHtml;
      
          var mapBody =
          '<div id="statusWrapMap"></div>'
        + '<div id="mapPanelWrap" style="height:68vh; min-height:320px; border-radius:12px; overflow:hidden;"></div>'
        + '<div id="mapControlsWrap" class="row small mt-8">'
        + '  <button id="recenterBtn" type="button" class="primary">🎯 Centreer</button>'
        + '  <a id="openInMaps" class="btn" target="_blank" rel="noopener">🗺️ Open in Maps</a>'
        + '</div>'
        + '<div class="mt-10">'
        + '  <div class="muted small" style="margin-bottom:6px">Stops</div>'
        + '  <div id="stopsListHost" class="stopsPills"></div>'
        + '</div>';
        
      
        var html =
          '<div class="stack">'
          + panelHtml('story','Personage + Verhaal', storyBody, focus==='story')
          + panelHtml('qa','Uitleg en vragen', qaBody, focus==='qa')
          + panelHtml('map','Kaart', mapBody, focus==='map')
          + '</div>';
      
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
        autoFocusNewStory();
        // stops render plannen (host bestaat nu)
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
        applyMeta();
        var st=store.get();
        if(!st.pcId) ensureCharacter();
  
        detectMic();
  
        renderProfile();
        renderUnlocked();
        renderProgress();
        // renderStops pas plannen na renderUnlocked (want die maakt stopsListHost aan)
        scheduleStopsRender('after initial renderUnlocked');
        refreshStopsUI();
        // ✅ GPS pas starten als DATA/UI klaar is
        startGpsWatch(false);

        // ✅ en meteen één keer "wakker maken" (kan dezelfde zijn)
        ensureGpsAwake();
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
      
        // ✅ optioneel: algemene notities/tips onderweg
        // (als je dit nog niet hebt: st.notes of st.tips)
        if(st.notes && String(st.notes).trim()){
          lines.push('## Notities');
          lines.push(String(st.notes).trim());
          lines.push('');
        }
      
        var arr = DATA.locaties || DATA.stops || [];
      
        function findLocById(id){
          for(var i=0;i<arr.length;i++){
            if(arr[i] && arr[i].id === id) return arr[i];
          }
          return null;
        }
      
        // ✅ bepaal “gekozen locatie per slot”
        // - voorkeur: unlockedBySlot (beste bij split-stops)
        // - anders: laatste unlockedLoc per slot
        var bySlot = {};
        var unlockedLocs = st.unlockedLocs || [];
      
        // 1) begin met unlockedBySlot (indien aanwezig)
        if(st.unlockedBySlot){
          for(var sid in st.unlockedBySlot){
            if(Object.prototype.hasOwnProperty.call(st.unlockedBySlot, sid)){
              bySlot[sid] = st.unlockedBySlot[sid];
            }
          }
        }
      
        // 2) vul aan met unlockedLocs (laatste wins)
        for(var u=0; u<unlockedLocs.length; u++){
          var loc = findLocById(unlockedLocs[u]);
          if(loc && loc.slot){
            bySlot[loc.slot] = loc.id;
          }
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
      
              // compact, 1 lijn antwoord
              var ansLine = '(—)';
              if(ans && ans.trim){
                ansLine = ans.trim().replace(/\r?\n/g,' ');
                if(!ansLine) ansLine = '(—)';
              }
      
              lines.push('- ' + q);
              lines.push('  - Antwoord: ' + ansLine);
            }
            lines.push('');
          }
        }
      
        // ✅ export in vaste slot-volgorde (en zo voorkom je “start opnieuw” rare volgorde)
        var slotOrder = DATA.slotOrder || (DATA.slots||[]).map(function(s){ return s.id; });
      
        for(var i=0; i<slotOrder.length; i++){
          var sid2 = slotOrder[i];
          var chosenLocId = bySlot[sid2];
          if(!chosenLocId) continue;
      
          var loc2 = findLocById(chosenLocId);
          if(loc2) exportOneLocation(loc2);
        }
      
        // fallback: als slotOrder leeg is, exporteer gewoon unlockedLocs zoals jij al deed
        if(!slotOrder || !slotOrder.length){
          for(var u2=0; u2<unlockedLocs.length; u2++){
            var loc3 = findLocById(unlockedLocs[u2]);
            if(loc3) exportOneLocation(loc3);
          }
        }
      
        var content = '\ufeff' + lines.join('\n');
        var blob = new Blob([content], {type:'text/markdown;charset=utf-8'});
        var url = URL.createObjectURL(blob);
      
        var a = document.createElement('a');
        a.href = url;
        a.download = 'woi-verslag.md';
        document.body.appendChild(a);
        a.click();
        a.parentNode.removeChild(a);
      
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      }
 
    // Globale errors
    window.addEventListener('error', function(e){ showDiag('JS error: '+e.message); });
    window.addEventListener('unhandledrejection', function(e){
      showDiag('Promise error: '+(e.reason && e.reason.message ? e.reason.message : e.reason));
    });
  
  })();
  