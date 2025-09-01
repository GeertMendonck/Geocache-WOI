// /js/app.js — Safe Mode v3 (compatibel, geen optional chaining)
(function(){
  'use strict';

  // ---- Panic-flag: index.html zet deze op false vóór het laden
  try { if (typeof window !== 'undefined' && typeof window.__APP_BOUND__ === 'undefined') window.__APP_BOUND__ = false; } catch(e){}

  // ---------- Mini helpers ----------
  function drawGeoJSONOnMap(gj, note){
    var hasLine = false;
    (gj.features||[]).forEach(function(f){
      if (/LineString|MultiLineString/i.test((f.geometry && f.geometry.type) || '')) hasLine = true;
    });
    var layer = L.geoJSON(gj, {
      pointToLayer: function(_f, latlng){ return L.circleMarker(latlng, { radius:3, weight:1, opacity:.9, fillOpacity:.6 }); },
      style: function(f){ return /LineString|MultiLineString/i.test((f.geometry&&f.geometry.type)||'') ? { weight:4, opacity:.95 } : { weight:1, opacity:.6 }; }
    }).addTo(LMAP);
    try { LMAP.fitBounds(layer.getBounds(), { padding:[20,20] }); } catch(_e){}
    showDiag((note||'Route') + ' → ' + (hasLine ? 'lijn getekend ✓' : 'GEEN lijn (alleen punten)'));
  }

  function qs(id){ return document.getElementById(id); }
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

  // Antwoorden opslaan/halen
  function escapeHtml(s){return (s||'').replace(/[&<>"']/g,function(m){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);});}
  function getAns(stopId, qi){
    var st=store.get(); return (((st.answers||{})[stopId]||{})[qi])||'';
  }
  function setAns(stopId, qi, val){
    var st=store.get(); st.answers=st.answers||{}; st.answers[stopId]=st.answers[stopId]||{};
    st.answers[stopId][qi]=val; store.set(st);
    // kleine “opgeslagen”-badge
    var tag=document.querySelector('.saveBadge[data-stop="'+stopId+'"][data-q="'+qi+'"]');
    if(tag){ tag.textContent='✔ opgeslagen'; setTimeout(function(){ tag.textContent=''; }, 1200); }
  }

  function distanceMeters(a,b){
    var R=6371e3, φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180, dφ=(b.lat-a.lat)*Math.PI/180, dλ=(b.lng-a.lng)*Math.PI/180;
    var s=Math.sin(dφ/2)*Math.sin(dφ/2)+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)*Math.sin(dλ/2);
    return 2*R*Math.asin(Math.sqrt(s));
  }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---------- Globale state ----------
  var DATA = { meta:{}, stops:[], personages:[] };
  var LMAP=null, liveMarker=null, accCircle=null, followMe=false;
  var watchId=null; window.__insideStart=false;

  // ---------- Bewijs dat script draait ----------
  (function(){
    var d=qs('diag'); if (d){ d.style.display='block'; d.textContent='app.js geladen ✓ (v3)'; }
    if (window.console) console.log('[WOI] app.js v3 geladen');
  })();

  // ---------- Core listeners: ALTIJD binden ----------
  function bindCoreListeners(){
    var b;
    b=qs('startBtn'); if(b) b.addEventListener('click', startWatch);
    b=qs('stopBtn'); if(b) b.addEventListener('click', stopWatch);
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
  function loadScenario(){
    return Promise.all([
      fetchJSON('./data/meta.json'),
      fetchJSON('./data/stops.json'),
      fetchJSON('./data/personages.json')
    ]).then(function(arr){
      return { meta:arr[0], stops:arr[1], personages:arr[2] };
    });
  }

  // ---------- UI renders ----------
  function ensureCharacter(){
    var st = store.get();
    if(st.pcId && DATA.personages.some(function(p){ return p.id===st.pcId; })){
      st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return st.pcId;
    }
    var pc = pick(DATA.personages && DATA.personages.length ? DATA.personages : [{id:'demo',naam:'Demo',leeftijd:'—',herkomst:'—',rol:'—',bio:'—',verhalen:{}}]);
    st.pcId=pc.id; st.unlocked=st.unlocked||[]; st.flags=st.flags||{}; store.set(st); return pc.id;
  }
  function currentPc(){
    var st=store.get();
    for (var i=0;i<(DATA.personages||[]).length;i++){ if (DATA.personages[i].id===st.pcId) return DATA.personages[i]; }
    return null;
  }
  function renderProfile(){
    var pc=currentPc(); if(!pc){ var pci=qs('pcInfo'); if(pci) pci.textContent='(Geen personages geladen)'; return; }
    var el=qs('pcInfo');
    if(el) el.innerHTML = '<div class="row">'
      + '<div class="pill">🧑 <b>'+pc.naam+'</b></div>'
      + '<div class="pill">🎂 '+pc.leeftijd+' jaar</div>'
      + '<div class="pill">🌍 '+pc.herkomst+'</div>'
      + '<div class="pill">🎖️ '+pc.rol+'</div>'
      + '</div><p class="muted">'+pc.bio+'</p>';
    renderCharacterChooser();
  }
  function renderCharacterChooser(){
    var st=store.get(); var el=qs('pcChooser'); if(!el) return;
    var opts='';
    (DATA.personages||[]).forEach(function(p){
      opts += '<option value="'+p.id+'" '+(p.id===st.pcId?'selected':'')+'>'+p.naam+' ('+p.leeftijd+') — '+p.rol+'</option>';
    });
    if(!opts) opts = '<option>Demo</option>';
    var inside = window.__insideStart===true; var locked = !!st.lockedPc;
    el.innerHTML = '<select id="pcSelect" '+(locked?'disabled':'')+' '+((!inside && !locked)?'disabled':'')+'>'+opts+'</select>'
      + '<span class="pill '+(locked?'ok':'')+'">'+(locked?'🔒 Keuze vergrendeld': (inside? '🟢 Je kan hier je personage kiezen' : '🔐 Kiesbaar enkel aan de start'))+'</span>';
  }
  function renderStops(){
    var cont=qs('stopsList'); if(!cont) return;
    var st=store.get(); var unlocked={}; (st.unlocked||[]).forEach(function(id){ unlocked[id]=true; });
    var html='';
    (DATA.stops||[]).forEach(function(s){
      var ok = !!unlocked[s.id]; var isEnd = s.id===(DATA.meta?DATA.meta.endStopId:null);
      var icon = ok ? '✅' : (isEnd ? '🔒' : '⏳');
      html += '<span class="pill">'+icon+' '+s.naam+'</span>';
    });
    cont.innerHTML = html || '<span class="muted">(Geen stops geladen)</span>';
  }
  function renderUnlocked(){
    var st=store.get(); var pc=currentPc(); var cont=qs('unlockList'); if(!cont) return;
    if(!st.unlocked || !st.unlocked.length){ cont.innerHTML='<div class="muted">Nog niets ontgrendeld.</div>'; return; }
    var html='';
    st.unlocked.forEach(function(id){
      var stop=null; for (var i=0;i<(DATA.stops||[]).length;i++){ if (DATA.stops[i].id===id){ stop=DATA.stops[i]; break; } }
      var txt = pc && pc.verhalen ? pc.verhalen[id] : null;

      // Reflectievragen met invulvelden
      var qsArr = stop && stop.vragen ? stop.vragen : [];
      var qaHtml = '';
      if (qsArr.length){
        qaHtml = qsArr.map(function(q,qi){
          var val = getAns(stop.id, qi);
          return '<div class="qa">'
            + '<div class="q"><b>Vraag '+(qi+1)+':</b> '+q+'</div>'
            + '<div class="controls">'
            + '  <textarea class="ans" data-stop="'+stop.id+'" data-q="'+qi+'" placeholder="Jouw antwoord...">'+escapeHtml(val)+'</textarea>'
            + '  <button class="micBtn" data-stop="'+stop.id+'" data-q="'+qi+'" title="Spreek je antwoord in">🎙️</button>'
            + '  <button class="clearAns" data-stop="'+stop.id+'" data-q="'+qi+'" title="Wis">✖</button>'
            + '  <span class="saveBadge small muted" data-stop="'+stop.id+'" data-q="'+qi+'"></span>'
            + '</div>'
            + '</div>';
        }).join('');
      }

      html += '<details open>'
        + '<summary>📘 '+((stop&&stop.naam)||id)+' <button class="readBtn" data-read="'+id+'" title="Lees voor">🔊</button></summary>'
        + '<div style="margin-top:6px">'+(txt || '<span class="muted">(Geen tekst)</span>')+'</div>'
        + qaHtml
        + '</details>';
    });
    cont.innerHTML=html;
    renderProgress();
  }
  function renderProgress(){
    var st=store.get(); var req=(DATA.meta && DATA.meta.requiredStops) ? DATA.meta.requiredStops : [];
    var done=(st.unlocked||[]).filter(function(id){ return req.indexOf(id)>-1; }).length;
    var total=req.length; var deg= total ? (done/total)*360 : 0;
    var ring=qs('progressRing'), txt=qs('progressText');
    if(ring) ring.style.background = 'conic-gradient(var(--accent) '+deg+'deg, rgba(255,255,255,.15) 0 360deg)';
    if(txt) txt.textContent = done+'/'+total;
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
  function initLeafletMap(){
    try{
      var div = qs('oneMap'); if(!div || !window.L) return;
      var icon = function(cls){ return L.divIcon({ className:'pin '+cls, iconSize:[16,16], iconAnchor:[8,8] }); };
      var iconStart = icon('start'), iconStop = icon('stop'), iconEnd = icon('end');
      var iconUser  = L.divIcon({ className:'user-dot', iconSize:[14,14], iconAnchor:[7,7] });

      var start = (DATA.stops&&DATA.stops[0]) ? DATA.stops[0] : {lat:50.85,lng:2.89};
      LMAP = L.map(div, { zoomControl:true }).setView([start.lat, start.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(LMAP);

      var bounds=[];
      (DATA.stops||[]).forEach(function(s){
        var p=[s.lat,s.lng]; bounds.push(p);
        var ic = iconStop;
        if (s.id=== (DATA.meta?DATA.meta.startStopId:null)) ic = iconStart;
        if (s.id=== (DATA.meta?DATA.meta.endStopId:null))   ic = iconEnd;
        L.marker(p, {icon:ic}).addTo(LMAP).bindPopup(s.naam);
        L.circle(p,{radius:s.radius||(DATA.meta?DATA.meta.radiusDefaultMeters:200),color:'#3dd1c0',weight:1,fillOpacity:.05}).addTo(LMAP);
      });
      if(bounds.length) LMAP.fitBounds(bounds,{padding:[20,20]});

      // ==== ROUTE-LOADER unified (met handmatige fallback) ====
      (function(){
        var routePath = (DATA.meta && (DATA.meta.routePath || DATA.meta.kmlPath)) ? (DATA.meta.routePath || DATA.meta.kmlPath) : null;
        if(!routePath){ showDiag('Route: geen routePath/kmlPath in meta.json'); return; }
        loadRouteUnified(routePath);
      })();
      function loadRouteUnified(routePath){
        var ext = routePath.toLowerCase().endsWith('.gpx') ? 'gpx'
                : routePath.toLowerCase().endsWith('.kml') ? 'kml' : 'unknown';
        if (ext==='unknown'){ showDiag('Route: onbekende extensie voor '+routePath); return; }

        fetch(routePath, { cache:'no-store' })
          .then(function(r){ if(!r.ok) throw new Error(routePath+' → HTTP '+r.status); return r.text(); })
          .then(function(txt){
            // 1) Probeer toGeoJSON (als beschikbaar)
            try{
              if (window.toGeoJSON){
                var xml1 = new DOMParser().parseFromString(txt, 'text/xml');
                var gj1  = (ext==='gpx') ? toGeoJSON.gpx(xml1) : toGeoJSON.kml(xml1);
                if (gj1 && gj1.features && gj1.features.length){ drawGeoJSONOnMap(gj1, 'Route '+ext.toUpperCase()+' (toGeoJSON)'); return; }
              }
            }catch(e){ /* ga door naar fallback */ }

            // 2) Handmatige fallback — GPX: <trkpt lat=… lon=…>
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

            // 3) Handmatige fallback — KML: <LineString><coordinates>lon,lat[,ele] ...</coordinates>
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

      // Live positie
      liveMarker = L.marker([0,0], { icon:iconUser, opacity:0 }).addTo(LMAP);
      accCircle  = L.circle([0,0], { radius:0, color:'#3dd1c0', fillOpacity:.1 }).addTo(LMAP);
    }catch(e){ if (window.console) console.error(e); showDiag('Kaart error: '+e.message); }
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

  // ---------- Geoloc ----------
  function tryUnlock(best, acc){
    var effective = Math.max(0, best.d - (acc||0));
    if(effective <= best.radius){
      var st=store.get(); st.unlocked=st.unlocked||[];
      if(best.id=== (DATA.meta?DATA.meta.endStopId:null)){
        var req = (DATA.meta && DATA.meta.requiredStops) ? DATA.meta.requiredStops : [];
        var haveAll = req.every(function(id){ return st.unlocked.indexOf(id)>-1; });
        if(!haveAll) return;
      }
      if(st.unlocked.indexOf(best.id)===-1){
        st.unlocked.push(best.id); store.set(st);
        renderUnlocked(); renderStops(); toast('✅ Ontgrendeld: '+best.name);
      }
    }
  }
  function startWatch(){
    var gs=qs('geoState'); if(gs) gs.textContent='Actief';
    if(!('geolocation' in navigator)){ var pn=qs('permNote'); if(pn) pn.textContent=(pn.textContent||'')+' • Geen geolocatie'; return; }
    watchId = navigator.geolocation.watchPosition(function(pos){
      var c=pos.coords, latitude=c.latitude, longitude=c.longitude, accuracy=c.accuracy;
      var cc=qs('coords'); if(cc) cc.textContent = latitude.toFixed(5)+', '+longitude.toFixed(5);
      var ac=qs('acc'); if(ac) ac.textContent = Math.round(accuracy);

      var here={lat:latitude,lng:longitude};
      var best=null; var insideStart=false;
      (DATA.stops||[]).forEach(function(s){
        var d = Math.round(distanceMeters(here,{lat:s.lat,lng:s.lng}));
        if(!best||d<best.d) best={id:s.id,name:s.naam,d:d,radius:(s.radius||(DATA.meta?DATA.meta.radiusDefaultMeters:200))};
        if(s.id=== (DATA.meta?DATA.meta.startStopId:null)){ insideStart = d <= (s.radius||(DATA.meta?DATA.meta.radiusDefaultMeters:200)); }
      });
      window.__insideStart = insideStart; renderCharacterChooser();

      var st=store.get(); st.flags=st.flags||{};
      if(insideStart){ st.flags.seenStart = true; store.set(st); }
      if(!insideStart && st.flags.seenStart && !st.lockedPc){ st.lockedPc=true; store.set(st); renderCharacterChooser(); toast('🔒 Personage vergrendeld'); }

      if(best){
        var cl=qs('closest'); if(cl) cl.textContent=best.name;
        var di=qs('dist'); if(di) di.textContent=String(best.d);
        var ra=qs('radius'); if(ra) ra.textContent=String(best.radius);
        tryUnlock(best, accuracy); renderProgress(); renderStops();
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
  document.addEventListener('DOMContentLoaded', function(){
    bindCoreListeners(); // knoppen werken sowieso
    try{
      loadScenario().then(function(data){
        DATA = data;
        var st=store.get(); if(!st.pcId){ ensureCharacter(); }
        renderProfile(); renderStops(); renderUnlocked(); renderProgress();
        if (navigator.onLine) initLeafletMap();
        window.addEventListener('online', function(){ if(!LMAP) initLeafletMap(); });
        if('speechSynthesis' in window){ try{ pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }catch(e){} }

        // Data-afhankelijke listeners
        var b;
        b=qs('regenBtn'); if(b) b.addEventListener('click', function(){ var st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Buiten startzone kan je niet wisselen.'); return; } st.pcId=null; store.set(st); ensureCharacter(); renderProfile(); renderUnlocked(); toast('🎲 Nieuw personage gekozen'); });
        b=qs('savePcBtn'); if(b) b.addEventListener('click', function(){ var st=store.get(); if(st.lockedPc && !window.__insideStart){ toast('🔒 Wijzigen kan enkel aan de start.'); return; } if(!window.__insideStart){ toast('🔐 Ga naar de startlocatie om te kiezen.'); return; } var sel=qs('pcSelect'); if(sel){ st.pcId=sel.value; store.set(st); renderProfile(); toast('✅ Personage bevestigd'); }});
        b=qs('exportBtn'); if(b) b.addEventListener('click', function(){
          var st=store.get(); var pc=currentPc()||{}; var lines=[];
          lines.push('# '+((DATA.meta&&DATA.meta.title)||'WOI – Mijn Personage'));
          lines.push('Personage: '+(pc.naam||'—')+' ('+(pc.herkomst||'—')+') – '+(pc.rol||'—'));
          lines.push('');
          (st.unlocked||[]).forEach(function(id){
            var stop=null; for (var i=0;i<(DATA.stops||[]).length;i++){ if (DATA.stops[i].id===id){ stop=DATA.stops[i]; break; } }
            lines.push('## '+((stop&&stop.naam)||id));
            lines.push(((pc.verhalen||{})[id])||'(geen tekst)');
            // Reflectie met antwoorden
            if (stop && stop.vragen && stop.vragen.length){
              lines.push('');
              lines.push('**Reflectie**');
              stop.vragen.forEach(function(q, qi){
                var ans = getAns(stop.id, qi);
                lines.push('- _'+q+'_');
                if (ans && ans.trim()) lines.push('  - Antwoord: ' + ans.replace(/\r?\n/g,' '));
              });
            }
            lines.push('');
          });
          var blob=new Blob([lines.join('\n')],{type:'text/markdown'});
          var url=URL.createObjectURL(blob); var a=document.createElement('a');
          a.href=url; a.download='woi-voortgang.md'; a.click(); URL.revokeObjectURL(url);
        });

        // Voorlezen + antwoorden (delegation op unlockList)
        var ul=qs('unlockList');
        if(ul){
          // Voorleesknop
          ul.addEventListener('click', function(e){
            var readBtn = e.target && (e.target.closest ? e.target.closest('button.readBtn') : null);
            if(readBtn){
              var id = readBtn.getAttribute('data-read');
              var pc=currentPc(); var txt = pc && pc.verhalen ? pc.verhalen[id] : '';
              if(txt){ if('speechSynthesis' in window && speechSynthesis.speaking){ speechSynthesis.cancel(); } else { speakText(txt); } }
              return;
            }
            // Wissen
            var clr = e.target && (e.target.closest ? e.target.closest('button.clearAns') : null);
            if (clr){
              var sid = clr.getAttribute('data-stop'), qi = parseInt(clr.getAttribute('data-q'),10);
              setAns(sid, qi, '');
              var ta = ul.querySelector('textarea.ans[data-stop="'+sid+'"][data-q="'+qi+'"]');
              if(ta){ ta.value=''; ta.focus(); }
              return;
            }
            // Microfoon (optioneel)
            var mic = e.target && (e.target.closest ? e.target.closest('button.micBtn') : null);
            if (mic){
              if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){ toast('Spraakherkenning niet ondersteund.'); return; }
              var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
              var r = new Recognition(); r.lang='nl-NL'; r.interimResults=false; r.maxAlternatives=1;
              var sid2 = mic.getAttribute('data-stop'), qi2 = parseInt(mic.getAttribute('data-q'),10);
              r.onresult = function(ev){
                var txt2 = ev.results[0][0].transcript || '';
                var ta2 = ul.querySelector('textarea.ans[data-stop="'+sid2+'"][data-q="'+qi2+'"]');
                if(ta2){ ta2.value = (ta2.value ? ta2.value+' ' : '') + txt2; setAns(sid2, qi2, ta2.value); }
              };
              r.onerror = function(){ toast('🎙️ Mislukt'); };
              r.start(); toast('🎙️ Spreek maar…');
              return;
            }
          });
          // Autosave bij typen
          ul.addEventListener('input', function(e){
            var ta = e.target && e.target.matches && e.target.matches('textarea.ans');
            if(!ta) return;
            setAns(ta.getAttribute('data-stop'), parseInt(ta.getAttribute('data-q'),10), ta.value);
          });
        }

        var cs=qs('cacheState'); if(cs) cs.textContent='Geïnstalleerd';
        var d=qs('diag'); if(d){ d.style.display='block'; d.textContent='app.js geladen ✓ — listeners gebonden, klaar.'; }

        // Belangrijk voor panic-fallback:
        window.__APP_BOUND__ = true;
      }).catch(function(e){
        showDiag('Data laden mislukte: '+(e && e.message ? e.message : e));
        if (window.console) console.error(e);
      });

      // SW-registratie
      if('serviceWorker' in navigator){
        navigator.serviceWorker.register('./sw.js?v=2025-09-02-v3',{scope:'./'})
          .then(function(){ var cs=qs('cacheState'); if(cs) cs.textContent='Geïnstalleerd'; })
          .catch(function(){ var cs=qs('cacheState'); if(cs) cs.textContent='Niet geïnstalleerd'; });
      }
    }catch(e){
      showDiag('Boot error: '+(e && e.message ? e.message : e));
      if (window.console) console.error(e);
    }
  });

  // Errors globaal tonen
  window.addEventListener('error', function(e){ showDiag('JS error: '+e.message); });
  window.addEventListener('unhandledrejection', function(e){ showDiag('Promise error: '+(e.reason && e.reason.message ? e.reason.message : e.reason)); });
})();
