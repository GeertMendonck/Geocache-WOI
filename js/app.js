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
    var __lastRenderKey = '';
   
  
    // ---------- Mini helpers ----------
    //inhoud MC en chkbox juist om weg te schrijven (niet object)
 function findVraagById(stopId, qId){
  var locs = DATA.locaties || DATA.stops || [];
  for(var i=0;i<locs.length;i++){
    var loc = locs[i];
    if(!loc || loc.id !== stopId) continue;
    var qs = loc.vragen || [];
    for(var j=0;j<qs.length;j++){
      var q = qs[j];
      if(q && q.id === qId) return q;
    }
  }
  return null;
}

function optionTextById(q, optId){
  if(!q || !q.options) return optId;
  for(var i=0;i<q.options.length;i++){
    var o = q.options[i];
    if(o && o.id === optId){
      return o.label || o.text || o.title || optId;
    }
  }
  return optId;
}

// backward compat: oude waarden (string / json-string / array) → objectvorm
function normalizeStoredAnswer(ans){
  if(ans == null) return null;

  // oude checkbox: JSON string of array
  if(typeof ans === 'string'){
    var s = ans.trim();

    // mogelijk oude checkbox: '["o1","o2"]'
    if(s && (s[0] === '[' || s[0] === '{')){
      try{ return JSON.parse(s); }catch(e){}
    }

    // oude mc: "o_xxx"
    return { choiceId: ans };
  }

  // oude checkbox: array
  if(Array.isArray(ans)){
    return { choiceIds: ans };
  }

  // nieuw: object
  if(typeof ans === 'object'){
    return ans;
  }

  return null;
}



function saveMcAnswer(locId, q, optId){
  var st = store.get();
  st.answers = st.answers || {};
  st.answers[locId] = st.answers[locId] || {};
  st.answers[locId][q.id] = {
    choiceId: optId,
    choiceText: optionTextById(q, optId)
  };
  safeStoreSet(st);
}

function saveCheckboxAnswer(locId, q, optIds){
  var st = store.get();
  st.answers = st.answers || {};
  st.answers[locId] = st.answers[locId] || {};
  st.answers[locId][q.id] = {
    choiceIds: optIds.slice(),
    choiceTexts: optIds.map(function(id){ return optionTextById(q, id); })
  };
  safeStoreSet(st);
}

    //volgorde opties vastzetten
    
function ensureOrder(locId, q){
  var st = store.get();
  st.order = st.order || {};
  st.order[locId] = st.order[locId] || {};

  var qId = q.id;
  if(st.order[locId][qId] && st.order[locId][qId].length){
    return st.order[locId][qId];
  }

  // init
  var ids = (q.options || []).map(function(o){ return o.id; });

  // shuffle (Fisher-Yates)
  for(var i=ids.length-1;i>0;i--){
    var j = Math.floor(Math.random()*(i+1));
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
  }

  st.order[locId][qId] = ids;
  store.set(st);
  return ids;
}

function orderedOptions(locId, q){
  var order = ensureOrder(locId, q);
  var map = Object.create(null);
  (q.options || []).forEach(function(o){ map[o.id]=o; });
  return order.map(function(id){ return map[id]; }).filter(Boolean);
}


    //nieuw systeem voor afbeelingen in andere repos
    function joinUrl(base, path){
  var b = String(base || '').replace(/\/+$/, '') + '/';
  var p = String(path || '').replace(/^\/+/, '');
  return b + p;
}
function isAbsoluteUrl(s){
  return /^https?:\/\//i.test(String(s || ''));
}
function getAssetsBase(data){
  var base = data && data.meta && data.meta.assetsBase;
  if(!base) throw new Error('meta.assetsBase ontbreekt in je route-JSON.');
  return base;
}
function safeArr(a){ return Array.isArray(a) ? a : []; }
function isObj(x){ return x && typeof x === 'object' && !Array.isArray(x); }

function parseJsonArray(s){
  try{
    var v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  }catch(e){
    return [];
  }
}
function findQuestionById(stopId, qid){
  var locs = (window.DATA && (DATA.locaties || DATA.stops)) ? (DATA.locaties || DATA.stops) : [];
  for(var i=0;i<locs.length;i++){
    var loc = locs[i];
    if(loc && loc.id === stopId){
      var vs = loc.vragen || [];
      for(var j=0;j<vs.length;j++){
        var q = vs[j];
        if(q && q.id === qid) return q;
      }
      return null;
    }
  }
  return null;
}


function pickPhotoAndStore(stopId, qid, btn){

  // ✅ enforce maxCount (hard guard)
  var q = findQuestionById(stopId, qid);
  var media = (q && isObj(q.media)) ? q.media : {};
  var maxC = (media.maxCount != null) ? media.maxCount : 1;

  var curArr = parseJsonArray(getAns(stopId, qid));
  if(curArr.length >= maxC){
    toast('📷 Maximaal '+maxC+' foto' + (maxC===1?'':'s') + ' toegestaan.');
    return;
  }

  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  try{ input.setAttribute('capture','environment'); }catch(e){}

  input.onchange = function(){
    var f = input.files && input.files[0];
    if(!f) return;

    // ✅ check opnieuw (voor zekerheid)
    var arr = parseJsonArray(getAns(stopId, qid));
    if(arr.length >= maxC){
      toast('📷 Maximaal '+maxC+' foto' + (maxC===1?'':'s') + ' toegestaan.');
      return;
    }

    var itemId = 'it_' + Date.now();
    var key = mediaKey(stopId, qid, itemId);

    mediaPut(key, f).then(function(){
      arr.push({ id:itemId, kind:'photo', ts:Date.now(), mime:f.type || 'image/*' });
      setAns(stopId, qid, stringifyJson(arr));
      try{ renderUnlocked(); }catch(e){}
    }).catch(function(err){
      console.warn('photo store failed', err);
      toast('📷 Kon foto niet opslaan');
    });
  };

  input.click();
}

function stringifyJson(v){
  try{ return JSON.stringify(v); }catch(e){ return ''; }
}

function isQuestionClosed(q, passedThisLoc, routeEnded, hasRealLoc){
  var pol = isObj(q.policy) ? q.policy : {};
  var closeWhen = (pol.closeWhen || pol.showUntil || 'nextLocation') + '';
  closeWhen = closeWhen.toLowerCase();

  if(closeWhen === 'inrange') return !hasRealLoc;       // buiten de cirkel => dicht
  if(closeWhen === 'nextlocation') return !!passedThisLoc;
  if(closeWhen === 'beforeend') return !!routeEnded;
  if(closeWhen === 'afterend') return !!routeEnded;

  return !!passedThisLoc;
}

function shouldShowQuestion(q, passedThisLoc, routeEnded, hasRealLoc){
  var pol = isObj(q.policy) ? q.policy : {};
  var showUntil = (pol.showUntil || 'nextLocation') + '';
  showUntil = showUntil.toLowerCase();

  if(showUntil === 'inrange') return !!hasRealLoc;
  if(showUntil === 'nextlocation') return !passedThisLoc;
  if(showUntil === 'beforeend') return !routeEnded;
  if(showUntil === 'afterend') return true;

  return !passedThisLoc;
}
function fmtMMSS(sec){
  sec = Math.max(0, sec|0);
  var m = Math.floor(sec/60);
  var s = sec % 60;
  return (m<10?'0':'')+m+':' + (s<10?'0':'')+s;
}

function setRecUi(key, on, sec){
  // key is "stopId|qid"
  var row = document.querySelector('.recRow[data-rec="'+cssAttr(key)+'"]');
  if(!row) return;
  row.style.display = on ? 'flex' : 'none';
  var t = row.querySelector('.recTime');
  if(t) t.textContent = fmtMMSS(sec||0);
}

// kleine helper om quotes veilig te maken in attribute selector
function cssAttr(s){
  return String(s).replace(/"/g, '\\"');
}
// eport to import from Zip
async function importZip(file, opts){
  opts = opts || {};
  var overwrite = (opts.overwrite !== false); // default true
  if(typeof JSZip === 'undefined') throw new Error('JSZip ontbreekt');
  if(!file) throw new Error('Geen file');

  var zip = await JSZip.loadAsync(file);

  var pFile = zip.file('progress.json');
  if(!pFile) throw new Error('progress.json ontbreekt in zip');

  var progress = JSON.parse(await pFile.async('string'));
  if(progress.exportVersion !== 3){
    throw new Error('Onbekende exportVersion: ' + progress.exportVersion);
  }

  var mFile = zip.file('manifest.json');
  var manifest = mFile ? JSON.parse(await mFile.async('string')) : { items: [] };

  // --- restore store (state + answers)
  var st = store.get() || {};
  if(overwrite){
    // behoud eventueel andere velden van je store als je wil (bv settings flags)
    // maar voor restore is dit meestal ok:
    st.unlockedLocs = progress.state.unlockedLocs || [];
    st.unlockedBySlot = progress.state.unlockedBySlot || null;
    st.focus = progress.state.focus || null;
    st.lastUnlockedLocId = progress.state.lastUnlockedLocId || null;
    st.notes = progress.state.notes || '';
    st.answers = progress.state.answers || {};
  } else {
    // merge: combineer antwoorden (simpel)
    st.unlockedLocs = st.unlockedLocs || [];
    (progress.state.unlockedLocs || []).forEach(function(id){
      if(st.unlockedLocs.indexOf(id) < 0) st.unlockedLocs.push(id);
    });

    st.unlockedBySlot = Object.assign({}, st.unlockedBySlot || {}, progress.state.unlockedBySlot || {});
    st.answers = Object.assign({}, st.answers || {}, progress.state.answers || {});
    if(progress.state.notes) st.notes = (st.notes ? (st.notes + '\n') : '') + progress.state.notes;
  }

  store.set(st);

  // --- restore media to IndexedDB
  var db = await idbOpen();

  // (optioneel) bij overwrite: eerst oude media wissen die in manifest zit
  if(overwrite && Array.isArray(manifest.items)){
    for(var d=0; d<manifest.items.length; d++){
      var itDel = manifest.items[d];
      if(itDel && itDel.key) {
        try{ await idbDelete(db, itDel.key); }catch(e){}
      }
    }
  }

  // zet alles terug
  if(Array.isArray(manifest.items)){
    for(var i=0;i<manifest.items.length;i++){
      var it = manifest.items[i];
      if(!it || !it.key || !it.path) continue;

      var zf = zip.file(it.path);
      if(!zf) continue;

      var blob = await zf.async('blob');
      // mime terugzetten is niet altijd nodig, maar kan:
      // blob = blob.slice(0, blob.size, it.mime || blob.type);
      if(it.mime && blob.type !== it.mime){
        blob = blob.slice(0, blob.size, it.mime);
      }

      await idbPut(db, it.key, blob);
    }
  }

  // --- UI refresh
  try{ renderUnlocked(); }catch(e){}
  try{
    // als je hydrateMedia apart doet per container, laat je bestaande flow lopen
    // anders eventueel:
    // hydrateMedia(document);
  }catch(e){}

  return { progress: progress, manifest: manifest };
}


async function exportZip(){
  if(typeof JSZip === 'undefined') throw new Error('JSZip ontbreekt');

  var st = store.get();
  var pc = (typeof currentPc === 'function') ? (currentPc() || {}) : {};

  var zip = new JSZip();

  // --- progress.json (geen media, enkel state + answers)
  var progress = {
    exportVersion: 3,
    exportedAt: new Date().toISOString(),
    scenario: {
      title: (DATA && DATA.meta && DATA.meta.title) ? DATA.meta.title : '',
      version: (DATA && DATA.meta && DATA.meta.version) ? DATA.meta.version : ''
    },
    pc: pc,
    state: {
      // neem alles mee dat je route bepaalt
      unlockedLocs: st.unlockedLocs || [],
      unlockedBySlot: st.unlockedBySlot || null,
      focus: st.focus || null,
      lastUnlockedLocId: st.lastUnlockedLocId || null,
      notes: st.notes || '',
      answers: st.answers || {}
    }
  };

  zip.file('progress.json', JSON.stringify(progress, null, 2));

  // --- media + manifest
  var db = await idbOpen();
  var keys = await idbGetAllKeys(db);

  var manifest = {
    exportVersion: 3,
    exportedAt: new Date().toISOString(),
    db: { name: MEDIA_DB_NAME, store: MEDIA_STORE },
    items: []
  };

  // sequentieel: minder RAM spikes op mobiel
  for(var i=0;i<keys.length;i++){
    var key = String(keys[i] || '');
    if(key.indexOf('m|') !== 0) continue;

    var blob = await idbGet(db, key);
    if(!blob) continue;

    var parts = key.split('|'); // m|loc|q|item
    var locId  = parts[1] || 'unknownLoc';
    var qId    = parts[2] || 'unknownQ';
    var itemId = parts[3] || ('item' + i);

    var ext = mimeToExt(blob.type);
    var path = 'media/' + locId + '/' + qId + '/' + itemId + ext;

    zip.file(path, blob);

    manifest.items.push({
      key: key,
      path: path,
      mime: blob.type || '',
      size: blob.size || 0
    });
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // --- download zip
  var outBlob = await zip.generateAsync({ type:'blob' });
  var url = URL.createObjectURL(outBlob);

  var safeTitle = (progress.scenario.title || 'export').replace(/[^\w\-]+/g,'_').slice(0,40);
  var a = document.createElement('a');
  a.href = url;
  a.download = safeTitle + '_' + Date.now() + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

function mimeToExt(mime){
  mime = String(mime || '').toLowerCase();
  if(mime.includes('webm')) return '.webm';
  if(mime.includes('ogg'))  return '.ogg';
  if(mime.includes('wav'))  return '.wav';
  if(mime.includes('mpeg')) return '.mp3';
  if(mime.includes('mp4'))  return '.mp4';
  if(mime.includes('jpeg')) return '.jpg';
  if(mime.includes('png'))  return '.png';
  if(mime.includes('gif'))  return '.gif';
  return '';
}

// ---------------- Media storage (IndexedDB) ----------------
var MEDIA_DB_NAME = 'geo_media_db_v1';
var MEDIA_STORE  = 'blobs';
async function clearMediaForQuestion(stopId, qId){
  var db = await idbOpen();
  var keys = await idbGetAllKeys(db);

  // m|<scenario>|<stop>|<vraag>|<item>
  var pref = 'm|' + getScenarioKey() + '|' + stopId + '|' + qId + '|';

  for(var i=0;i<keys.length;i++){
    var k = String(keys[i] || '');
    if(k.indexOf(pref) === 0){
      await idbDelete(db, k);
    }
  }
}


function idbOpen(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = function(){
      var db = req.result;
      if(!db.objectStoreNames.contains(MEDIA_STORE)){
        db.createObjectStore(MEDIA_STORE);
      }
    };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror   = function(){ reject(req.error); };
  });
}

function idbGetAllKeys(db){
  return new Promise(function(resolve, reject){
    var tx = db.transaction(MEDIA_STORE, 'readonly');
    var st = tx.objectStore(MEDIA_STORE);
    var r  = st.getAllKeys();
    r.onsuccess = function(){ resolve(r.result || []); };
    r.onerror   = function(){ reject(r.error); };
  });
}

function idbGet(db, key){
  return new Promise(function(resolve, reject){
    var tx = db.transaction(MEDIA_STORE, 'readonly');
    var st = tx.objectStore(MEDIA_STORE);
    var r  = st.get(key);
    r.onsuccess = function(){ resolve(r.result || null); };
    r.onerror   = function(){ reject(r.error); };
  });
}

function idbPut(db, key, blob){
  return new Promise(function(resolve, reject){
    var tx = db.transaction(MEDIA_STORE, 'readwrite');
    var st = tx.objectStore(MEDIA_STORE);
    var r  = st.put(blob, key);
    r.onsuccess = function(){ resolve(true); };
    r.onerror   = function(){ reject(r.error); };
  });
}

function openMediaDb(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = function(){
      var db = req.result;
      if(!db.objectStoreNames.contains(MEDIA_STORE)){
        db.createObjectStore(MEDIA_STORE);
      }
    };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error || new Error('indexedDB open failed')); };
  });
}

function mediaPut(key, blob){
  return openMediaDb().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).put(blob, key);
      tx.oncomplete = function(){ db.close(); resolve(true); };
      tx.onerror = function(){ db.close(); reject(tx.error || new Error('mediaPut failed')); };
    });
  });
}

function mediaGet(key){
  return openMediaDb().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(MEDIA_STORE, 'readonly');
      var rq = tx.objectStore(MEDIA_STORE).get(key);
      rq.onsuccess = function(){ var v = rq.result || null; db.close(); resolve(v); };
      rq.onerror = function(){ db.close(); reject(rq.error || new Error('mediaGet failed')); };
    });
  });
}
// niet in gebruik:
function mediaDel(key){
  return openMediaDb().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).delete(key);
      tx.oncomplete = function(){ db.close(); resolve(true); };
      tx.onerror = function(){ db.close(); reject(tx.error || new Error('mediaDel failed')); };
    });
  });
}

// delete all keys with prefix (simple cursor scan)
function mediaDelPrefix(prefix){
  return openMediaDb().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(MEDIA_STORE, 'readwrite');
      var store = tx.objectStore(MEDIA_STORE);
      var req = store.openCursor();
      req.onsuccess = function(){
        var cur = req.result;
        if(cur){
          var k = String(cur.key);
          if(k.indexOf(prefix) === 0) cur.delete();
          cur.continue();
        }
      };
      tx.oncomplete = function(){ db.close(); resolve(true); };
      tx.onerror = function(){ db.close(); reject(tx.error || new Error('mediaDelPrefix failed')); };
    });
  });
}

function mediaKey(stopId, qid, itemId){
  return 'm|' + String(stopId) + '|' + String(qid) + '|' + String(itemId);
}
function pickPhotoAndStore(stopId, qid, btn){
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  // mobile hint:
  try{ input.setAttribute('capture','environment'); }catch(e){}

  input.onchange = function(){
    var f = input.files && input.files[0];
    if(!f) return;

    // item id
    var itemId = 'it_' + Date.now();
    var key = mediaKey(stopId, qid, itemId);

    // store blob directly (later we can compress if needed)
    mediaPut(key, f).then(function(){
      var arr = parseJsonArray(getAns(stopId, qid));
      arr.push({ id:itemId, kind:'photo', ts:Date.now(), mime:f.type || 'image/*' });
      setAns(stopId, qid, stringifyJson(arr));

      // rerender to show thumbnail
      try{ renderUnlocked(true); }catch(e){}
    }).catch(function(err){
      console.warn('photo store failed', err);
      toast('📷 Kon foto niet opslaan');
    });
  };

  input.click();
}
var __recMap = Object.create(null); // key: stopId|qid -> {rec, chunks, startedAt, timer}

function getAudioCfg(stopId, qid){
  var q = findQuestionById(stopId, qid);
  var media = (q && isObj(q.media)) ? q.media : {};
  return {
    minSeconds: (media.minSeconds != null) ? media.minSeconds : 0,
    maxSeconds: (media.maxSeconds != null) ? media.maxSeconds : 30,
    maxCount:   (media.maxCount != null) ? media.maxCount : 1
  };
}
function setMediaBtnState(btn, isRecording){
  if(!btn) return;
  if(isRecording){
    btn.textContent = '⏹️ Stop opname';
    btn.classList.add('isRecording');
  }else{
    btn.textContent = '🎙️ Neem audio op';
    btn.classList.remove('isRecording');
  }
}
      function flashBtnError(btn){
        if(!btn) return;
        btn.classList.add('isError');
        setTimeout(function(){ btn.classList.remove('isError'); }, 400);
      }

var __recMap = Object.create(null); // key: stopId|qid -> {rec, chunks, startedAt, stream, btn, cfg, timerId}

function toggleAudioRecord(stopId, qid, btn){
  var k = stopId + '|' + qid;
  var cur = __recMap[k];

  // stop als we bezig zijn
  if(cur && cur.rec && cur.rec.state === 'recording'){
    try{ cur.rec.stop(); }catch(e){}
    return;
  }

  // config (min/max + maxCount)
  var cfg = {
  minSeconds: parseInt(btn && btn.getAttribute('data-mins') || '0', 10) || 0,
  maxSeconds: parseInt(btn && btn.getAttribute('data-maxs') || '30', 10) || 30,
  maxCount:   parseInt(btn && btn.getAttribute('data-maxcount') || '1', 10) || 1
};
console.log('AUDIO cfg', cfg, 'minsAttr=', btn && btn.getAttribute('data-mins'), 'maxsAttr=', btn && btn.getAttribute('data-maxs'));


  // ✅ enforce maxCount vóór we mic openen
  var curArr = parseJsonArray(getAns(stopId, qid));
  if(curArr.length >= cfg.maxCount){
    toast('🎙️ Maximaal '+cfg.maxCount+' opname' + (cfg.maxCount===1?'':'s') + ' toegestaan.');
    return;
  }

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast('🎙️ Audio opnemen niet ondersteund in deze browser.');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio:true }).then(function(stream){
    var rec;
    try{
      rec = new MediaRecorder(stream);
    }catch(e){
      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(_e){}
      toast('🎙️ MediaRecorder niet beschikbaar.');
      return;
    }

    var chunks = [];
    var startedAt = Date.now();

    __recMap[k] = { rec:rec, chunks:chunks, startedAt:startedAt, stream:stream, btn:btn, cfg:cfg, timerId:null };

    setMediaBtnState(btn, true);
    setRecUi(k, true, 0);
    toast('🎙️ Opname gestart…');

// timer + auto-stop op maxSeconds
var timerId = setInterval(function(){
  var st = __recMap[k];
  if(!st) return;

  var elapsedMs = Date.now() - st.startedAt;
  var secDisp   = Math.ceil(elapsedMs / 1000);

  var maxS = (st.cfg && typeof st.cfg.maxSeconds === 'number') ? st.cfg.maxSeconds : null;

  // display
  setRecUi(k, true, (maxS != null) ? Math.min(secDisp, maxS) : secDisp);

  // auto-stop
  if(maxS != null && elapsedMs >= maxS * 1000){
    try{ st.rec.stop(); }catch(e){}
  }
}, 250);

    __recMap[k].timerId = timerId;

    rec.ondataavailable = function(ev){
      if(ev.data && ev.data.size) chunks.push(ev.data);
    };

    rec.onerror = function(){
      var st = __recMap[k];
      if(st && st.timerId) try{ clearInterval(st.timerId); }catch(e){}
      delete __recMap[k];

      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
      setMediaBtnState(btn, false);
      setRecUi(k, false, 0);

      toast('🎙️ Opname mislukt.');
    };

    rec.onstop = function(){
      var st = __recMap[k];
      if(st && st.timerId) try{ clearInterval(st.timerId); }catch(e){}
      delete __recMap[k];

      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
      setMediaBtnState(btn, false);
      setRecUi(k, false, 0);

      var ms = Date.now() - startedAt;
      var seconds = Math.round(ms / 1000);

      // maak blob
      var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });

      if(seconds < cfg.minSeconds){
          flashBtnError(btn);
        toast(
          '🎙️ Opname te kort ('+seconds+'s). '
          + 'Minimaal '+cfg.minSeconds+'s vereist.'
        );
        return;
      }

      if(seconds >  cfg.maxSeconds){
          flashBtnError(btn);
        toast(
          '🎙️ Opname te lang ('+seconds+'s). '
          + 'Maximaal '+cfg.maxSeconds+'s toegestaan.'
        );
        return;
      }

      // ✅ enforce maxCount opnieuw (race condition)
      var arr = parseJsonArray(getAns(stopId, qid));
      if(arr.length >= cfg.maxCount){
        toast('🎙️ Maximaal '+cfg.maxCount+' opname' + (cfg.maxCount===1?'':'s') + ' toegestaan.');
        return;
      }

      var itemId = 'it_' + Date.now();
      var key = mediaKey(stopId, qid, itemId);

      mediaPut(key, blob).then(function(){
        arr.push({ id:itemId, kind:'audio', ts:Date.now(), mime: blob.type || 'audio/webm', seconds: seconds });
        setAns(stopId, qid, stringifyJson(arr));
        try{ renderUnlocked(true); }catch(e){}
      }).catch(function(err){
        console.warn('audio store failed', err);
        toast('🎙️ Kon audio niet opslaan');
      });
    };

    try{
      rec.start();
    }catch(e){
      var st2 = __recMap[k];
      if(st2 && st2.timerId) try{ clearInterval(st2.timerId); }catch(_e){}
      delete __recMap[k];

      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(_e){}
      setMediaBtnState(btn, false);
      setRecUi(k, false, 0);

      toast('🎙️ Kon opname niet starten.');
    }

  }).catch(function(err){
    console.warn('mic denied', err);
    setMediaBtnState(btn, false);
    setRecUi(k, false, 0);
    toast('🎙️ Microfoon niet beschikbaar (rechten?).');
  });
}

// ------------- Render per soort vraag -------------------------
function renderVraagOpen(locId, q, closed){
  var val = getAns(locId, q.id);

  return ''
    + '<div class="qa' + (closed ? ' isClosed' : '') + '" data-qwrap="'+escapeHtml(q.id)+'">'
    + '  <div class="q" data-qtype="open">' + escapeHtml(q.vraag || '') + '</div>'
    + '  <div class="controls">'
    + '    <textarea class="ans ansOpen" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"'
    + (closed ? ' readonly' : '')
    + ' placeholder="Jouw antwoord...">'+escapeHtml(val)+'</textarea>'
    + '    <div class="btnRow">'
    +      (MIC_OK && !closed ? '<button class="micBtn" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">🎙️</button>' : '')
    +      (!closed ? '<button class="clearAns" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">✖</button>' : '')
    + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"></span>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

function renderVraagMC(locId, q, closed){
  //var picked = getAns(locId, q.id); // optie.id
  var pickedObj = normalizeStoredAnswer(getAns(locId, q.id));
  var pickedId  = pickedObj && pickedObj.choiceId ? String(pickedObj.choiceId) : '';

  //var opts = safeArr(q.opties);
var opts = (q.randomOrder ? orderedOptions(locId, q) : (q.options||[]));
  // shuffle enkel voor UI, zonder DATA te muteren
  if(q.shuffle && opts.length > 1){
    opts = opts.slice();
    for(var i=opts.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var tmp = opts[i]; opts[i]=opts[j]; opts[j]=tmp;
    }
  }

  // ---- Kies UI: buttons vs radio-list (robust: max + longCount + count) ----
  var maxLen = 0;
  var longCount = 0;
  for(var k=0;k<opts.length;k++){
    var txt = String((opts[k] && opts[k].tekst) ? opts[k].tekst : '');
    if(txt.indexOf('\n') >= 0) longCount += 2; // newline => vrijwel zeker lang
    var len = txt.length;
    if(len > maxLen) maxLen = len;
    if(len >= 45) longCount++;
  }

  var useRadioList = (
    opts.length > 6 ||
    maxLen >= 70 ||
    longCount >= 2
  );

  // ---- RADIO LIST ----
  if(useRadioList){
    var items = opts.map(function(o){
      var oid = (o && o.id) ? String(o.id) : '';
      var txt = (o && o.tekst != null) ? String(o.tekst) : '';
      var rid = 'mc_' + safeDomId(locId) + '_' + safeDomId(q.id) + '_' + safeDomId(oid);
      var on = (pickedId && oid && pickedId === oid);


      return ''
        + '<label class="rbRow' + (closed ? ' isDisabled' : '') + '" for="'+rid+'">'
        + '  <input type="radio" name="mc_'+escapeHtml(q.id)+'" class="rbOpt" id="'+rid+'"'
        + ' data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'" data-oid="'+escapeHtml(oid)+'"'
        + (on ? ' checked' : '')
        + (closed ? ' disabled' : '')
        + '>'
        + '  <span>' + escapeHtml(txt) + '</span>'
        + '</label>';
    }).join('');

    return ''
      + '<div class="qa qaMC' + (closed ? ' isClosed' : '') + '" data-qwrap="'+escapeHtml(q.id)+'">'
      + '  <div class="q" data-qtype="mc-radio">' + escapeHtml(q.vraag || '') + '</div>'
      + '  <div class="controls">'
      + '    <div class="rbList">' + items + '</div>'
      + '    <div class="btnRow">'
      +      (!closed ? '<button class="clearAns" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">✖</button>' : '')
      + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"></span>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  // ---- BUTTON GRID ----
  var buttons = opts.map(function(o){
    var oid = (o && o.id) ? String(o.id) : '';
    var txt = (o && o.tekst != null) ? String(o.tekst) : '';
    var active = (pickedId && oid && pickedId === oid);

    return ''
      + '<button class="optBtn' + (active ? ' isActive' : '') + '"'
      + ' data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'" data-oid="'+escapeHtml(oid)+'"'
      + (closed ? ' disabled' : '')
      + '>'
      + escapeHtml(txt)
      + '</button>';
  }).join('');

  return ''
    + '<div class="qa qaMC' + (closed ? ' isClosed' : '') + '" data-qwrap="'+escapeHtml(q.id)+'">'
    + '  <div class="q" data-qtype="mc-buttons">' + escapeHtml(q.vraag || '') + '</div>'
    + '  <div class="controls">'
    + '    <div class="optGrid">' + buttons + '</div>'
    + '    <div class="btnRow">'
    +      (!closed ? '<button class="clearAns" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">✖</button>' : '')
    + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"></span>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}


function renderVraagCheckbox(locId, q, closed){
  var raw = getAns(locId, q.id);
  var obj = normalizeStoredAnswer(raw) || {};
  var picked = Array.isArray(obj.choiceIds) ? obj.choiceIds : [];

  var map = Object.create(null);
  for(var i=0;i<picked.length;i++) map[picked[i]] = true;

  //var opts = safeArr(q.opties);
  var opts = (q.randomOrder ? orderedOptions(locId, q) : (q.options||[]));

  if(q.shuffle && opts.length > 1){
    opts = opts.slice();
    for(var k=opts.length-1;k>0;k--){
      var j2 = Math.floor(Math.random()*(k+1));
      var tmp2 = opts[k]; opts[k]=opts[j2]; opts[j2]=tmp2;
    }
  }

  var items = opts.map(function(o){
    var oid = (o && o.id != null) ? String(o.id) : '';
    var on = !!map[oid];
    var cid = 'cb_' + safeDomId(locId) + '_' + safeDomId(q.id) + '_' + safeDomId(oid);
    return ''
      + '<label class="cbRow' + (closed?' isDisabled':'') + '" for="'+cid+'">'
      + '  <input type="checkbox" class="cbOpt" id="'+cid+'"'
      + ' data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'" data-oid="'+escapeHtml(oid)+'"'
      + (on ? ' checked' : '')
      + (closed ? ' disabled' : '')
      + '>'
      + '  <span>' + escapeHtml(o.tekst || '') + '</span>'
      + '</label>';
  }).join('');

  return ''
    + '<div class="qa qaCB' + (closed ? ' isClosed' : '') + '" data-qwrap="'+escapeHtml(q.id)+'">'
    + '  <div class="q" data-qtype="checkbox">' + escapeHtml(q.vraag || '') + '</div>'
    + '  <div class="controls">'
    + '    <div class="cbList">' + items + '</div>'
    + '    <div class="btnRow">'
    +      (!closed ? '<button class="clearAns" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">✖</button>' : '')
    + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"></span>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

function renderVraagPhoto(locId, q, closed){
  var media = (q && typeof q.media === 'object') ? q.media : {};
  var minC = media.minCount != null ? media.minCount : 0;
  var maxC = media.maxCount != null ? media.maxCount : 1;

  var arr = parseJsonArray(getAns(locId, q.id)); // list of refs
  var count = arr.length;

  var canAdd = (!closed && count < maxC);

  var thumbs = arr.map(function(it){
    var iid = it && it.id ? String(it.id) : '';
    var key = mediaKey(locId, q.id, iid);
    return ''
      + '<div class="mThumb" data-mkind="photo" data-mkey="'+escapeHtml(key)+'">'
      + '  <div class="mPh">preview…</div>'
      + '</div>';
  }).join('');

  return ''
    + '<div class="qa qaMedia' + (closed ? ' isClosed' : '') + '" data-qwrap="'+escapeHtml(q.id)+'" data-mode="photo">'
    + '  <div class="q" data-qtype="photo">' + escapeHtml(q.vraag || '') + '</div>'
    + '  <div class="controls">'
    + '    <div class="muted small">Min: '+minC+' — Max: '+maxC+' <span class="muted">('+count+'/'+maxC+')</span></div>'
    + (thumbs ? ('    <div class="mGrid">'+thumbs+'</div>') : '')
    + '    <button class="mediaBtn" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'" data-mode="photo"'
    +      (canAdd ? '' : ' disabled')
    + '    >📷 Voeg foto toe</button>'
    + '    <div class="btnRow">'
    +      (!closed ? '<button class="clearAns" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">✖</button>' : '')
    + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"></span>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}


function renderVraagAudio(locId, q, closed){
  var media = (q && typeof q.media === 'object') ? q.media : {};
  var minS = media.minSeconds != null ? media.minSeconds : 2;
  var maxS = media.maxSeconds != null ? media.maxSeconds : 20;
  var maxC  = (media.maxCount   != null) ? media.maxCount   : 1;
  var arr = parseJsonArray(getAns(locId, q.id));
  var count = arr.length;

  var clips = arr.map(function(it){
    var iid = it && it.id ? String(it.id) : '';
    var key = mediaKey(locId, q.id, iid);
    return ''
      + '<div class="mAudio" data-mkind="audio" data-mkey="'+escapeHtml(key)+'">'
      + '  <audio controls preload="none"></audio>'
      + '</div>';
  }).join('');

  return ''
    + '<div class="qa qaMedia' + (closed ? ' isClosed' : '') + '" data-qwrap="'+escapeHtml(q.id)+'" data-mode="audio">'
    + '  <div class="q" data-qtype="audio">' + escapeHtml(q.vraag || '') + '</div>'
    + '  <div class="controls">'
    + '    <div class="muted small">Min: '+minS+'s — Max: '+maxS+'s</div>'
    + (clips ? ('    <div class="mList">'+clips+'</div>') : '')
    + '    <button class="mediaBtn" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'" data-mode="audio"'
    + '      data-mins="'+minS+'" data-maxs="'+maxS+'" data-maxcount="'+maxC+'"'
    +      (closed ? ' disabled' : '')
    + '    >🎙️ Neem audio op</button>'
    + '    <div class="recRow" data-rec="'+escapeHtml(locId)+'|'+escapeHtml(q.id)+'" style="display:none">'
    + '      <span class="recDot">●</span> <span class="recText">Opnemen…</span> <span class="recTime">00:00</span>'
    + '    </div>'
    + '    <div class="btnRow">'
    +      (!closed ? '<button class="clearAns" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'">✖</button>' : '')
    + '      <span class="saveBadge small muted" data-stop="'+locId+'" data-q="'+escapeHtml(q.id)+'"></span>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

function hydrateMedia(root){
  if(!root) return;

  // photos
  var ph = root.querySelectorAll('[data-mkind="photo"][data-mkey]');
  for(var i=0;i<ph.length;i++){
    (function(node){
      var key = node.getAttribute('data-mkey');
      mediaGet(key).then(function(blob){
        if(!blob) return;
        var url = URL.createObjectURL(blob);
        node.innerHTML = '<img src="'+url+'" class="mImg" alt="foto">';
      }).catch(function(){ /* ignore */ });
    })(ph[i]);
  }

  // audios
  var au = root.querySelectorAll('[data-mkind="audio"][data-mkey]');
  for(var j=0;j<au.length;j++){
    (function(node){
      var key = node.getAttribute('data-mkey');
      var audio = node.querySelector('audio');
      if(!audio) return;
      mediaGet(key).then(function(blob){
        if(!blob) return;
        var url = URL.createObjectURL(blob);
        audio.src = url;
      }).catch(function(){ /* ignore */ });
    })(au[j]);
  }
}


// --------------------------------------------------------------

// “Waar sta ik in de route?”
// Ik ga uit van je store met unlocked locs + lastUnlockedLocId.
// Pas eventueel de veldnamen aan als jij andere gebruikt.
function getProgressContext(){
  var st = (window.store && store.get) ? (store.get() || {}) : {};
  var unlocked = st.unlockedLocIds || st.unlockedLocs || st.unlocked || [];
  if(!Array.isArray(unlocked)) unlocked = [];

  var currentId = st.lastUnlockedLocId || st.currentLocId || window.currentLocId || null;

  // “route is voorbij” flag: kies wat jij al hebt
  var ended = !!(st.routeEnded || st.ended || st.finished || st.hasEnded);

  return { st: st, unlocked: unlocked, currentId: currentId, ended: ended };
}

// showUntil: bepaalt of de vraag nog getoond wordt
function shouldShow(pol){
  var showUntil = String((pol && pol.showUntil) ? pol.showUntil : 'nextLocation').toLowerCase();

  if(showUntil === 'inrange') return true;
  if(showUntil === 'nextlocation') return !passedThisLoc;

  if(showUntil === 'beforeend') return !routeEnded;
  if(showUntil === 'afterend')  return true;

  return !passedThisLoc;
}

function shouldClose(pol){
  var closeWhen = String((pol && pol.closeWhen) ? pol.closeWhen : ((pol && pol.showUntil) ? pol.showUntil : 'nextLocation')).toLowerCase();

  if(closeWhen === 'inrange') return false;
  if(closeWhen === 'nextlocation') return passedThisLoc;

  if(closeWhen === 'beforeend') return routeEnded;
  if(closeWhen === 'afterend')  return routeEnded;

  return passedThisLoc;
}


function resolveImageFile(file, data){
  if(!file) return '';
  if(isAbsoluteUrl(file)) return file; // laat externe URLs toe (handig)
  return joinUrl(getAssetsBase(data), 'images/' + String(file).replace(/^\/+/, ''));
}

function resolveCharacterFile(file, data){
  if(!file) return '';
  if(isAbsoluteUrl(file)) return file;
  return joinUrl(getAssetsBase(data), 'personages/' + String(file).replace(/^\/+/, ''));
}

    // Afbeeldingen
    function renderGallery(hostId, images){
        var host = (typeof hostId === 'string') ? document.getElementById(hostId) : hostId;
        if(!host) return;
      
        images = images || [];
      
        // werk met een kopie zodat we originele data niet vervuilen
        var items = [];
        for(var i=0;i<images.length;i++){
          var it = images[i];
          if(it && it.file) items.push({ file:String(it.file), credit: it.credit ? String(it.credit) : '' });
        }
      
        if(!items.length){
          host.innerHTML = '';
          host.className = 'hidden';
          return;
        }
      
        host.className = 'gal';
      
        var idx = 0;
        var startX = null;
      
        // function urlOf(file){
        //   return 'data/images/' + String(file || '');
        // }
     function urlOf(file){
       return resolveImageFile(file, DATA);
      }

      
        function clampIndex(){
          if(!items.length) idx = 0;
          else if(idx < 0) idx = items.length - 1;
          else if(idx >= items.length) idx = 0;
        }
      
        function hideAll(){
          host.innerHTML = '';
          host.className = 'hidden';
        }
      
        function draw(){
          if(!items.length){
            hideAll();
            return;
          }
          clampIndex();
      
          var it = items[idx];
          var credit = it.credit || '';
          var many = items.length > 1;
          var counter = (idx+1) + ' / ' + items.length;
      
          host.innerHTML =
              '<div class="galStage" id="'+host.id+'_stage">'
            + '  <img class="galImg" id="'+host.id+'_img" draggable="false" src="'+escapeHtml(urlOf(it.file))+'" alt="" />'
            + '</div>'
            + (many
                ? '<div class="galNav">'
                  + '  <button type="button" class="galBtn btn" id="'+host.id+'_prev">◀</button>'
                  + '  <div class="galCount muted small">'+escapeHtml(counter)+'</div>'
                  + '  <button type="button" class="galBtn btn" id="'+host.id+'_next">▶</button>'
                  + '</div>'
                : '')
            + (credit ? '<div class="galCredit">'+escapeHtml(credit)+'</div>' : '');
      
          var img  = document.getElementById(host.id + '_img');
          var prev = document.getElementById(host.id + '_prev');
          var next = document.getElementById(host.id + '_next');
          var stage= document.getElementById(host.id + '_stage');
      
          if(prev) prev.onclick = function(){ idx--; clampIndex(); draw(); };
          if(next) next.onclick = function(){ idx++; clampIndex(); draw(); };
      
          // swipe alleen zinvol als er meer dan 1 is
          if(stage && many){
            stage.ontouchstart = function(e){
              if(!e || !e.touches || !e.touches.length) return;
              startX = e.touches[0].clientX;
            };
            stage.ontouchend = function(e){
              if(startX == null) return;
              var endX = (e && e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientX : startX;
              var dx = endX - startX;
              startX = null;
              if(Math.abs(dx) > 40){
                if(dx < 0) idx++;
                else idx--;
                clampIndex();
                draw();
              }
            };
          } else if(stage) {
            // opruimen (voor het geval je van 2->1 gaat door onerror)
            stage.ontouchstart = null;
            stage.ontouchend = null;
          }
      
          // ✅ als image faalt: verwijder uit lijst en probeer opnieuw
          if(img){
            img.onerror = function(){
              items.splice(idx, 1);
      
              if(!items.length){
                hideAll();
                return;
              }
      
              clampIndex();
              draw();
            };
          }
        }
      
        draw();
      }
      
      
      
    //---------------
    function enableGps(){
        var st = store.get();
        st.gpsOn = true;          // optioneel vlaggetje
        store.set(st);
      
        startWatch();             // jouw bestaande watchPosition starter
      }
      function canBeginRouteNow(){
        if(window.__insideStart !== true) return false;
      
        // personages alleen checken als enabled
        if(charactersEnabled()){
          var st = store.get();
          if(!st.pcId) return false;
          if(!(st.pcConfirmed || st.lockedPc)) return false;
        }
        return true;
      }
      function beginRoute(){
        var st = store.get();
        if(st.geoOn === true) return;   // al gestart
      
        st.geoOn = true;
        st.startedAt = Date.now();
          // ✅ force "nieuw" voor de eerste panel-render
                var startLoc = getStartLocation();
                if(startLoc && startLoc.id){
                    st.currentLocId = startLoc.id;          // als je dat gebruikt
                    st.lastUnlockedLocId = startLoc.id;     // 🔥 dit triggert badges 1x
                }
        store.set(st);
        //renderUnlocked();                 // ✅ nodig voor badges
        scheduleStopsRender('beginRoute');
        applyPcUiState();
      }
      
    //speak
    function initVoices(){
        if(!('speechSynthesis' in window)) return;
        try { window.speechSynthesis.getVoices(); } catch(e){}
        window.speechSynthesis.onvoiceschanged = function(){
          try { window.speechSynthesis.getVoices(); } catch(e){}
        };
      }
      
     function handleReadStory(slotId, locId){
        var pc = currentPc();
        if(!pc) return;
      
        var verhaal = getStoryFor(pc, slotId, locId);
        if(!verhaal) return;
      
        //speakText(verhaal);  
        speakToggle(verhaal);
      }
      function speakText(text){
        text = (text == null) ? '' : String(text).trim();
        if(!text) return;
      
        // TTS beschikbaar?
        if(!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined'){
          console.log('[TTS] speechSynthesis niet beschikbaar');
          return;
        }
      
        try{
          // Stop lopende spraak (belangrijk bij herhaald klikken)
          window.speechSynthesis.cancel();
        }catch(e){}
      
        var u = new SpeechSynthesisUtterance(text);
      // 👉 START: visuele status
         document.body.classList.add('reading');
        // Taal: probeer NL-BE, anders NL
        // (Sommige browsers negeren dit als er geen voice matcht)
        u.lang = 'nl-BE';
      
        // (optioneel) tempo/hoogte/volume — mild houden
        u.rate = 1.0;   // 0.1–10 (realistisch: 0.8–1.2)
        u.pitch = 1.0;  // 0–2
        u.volume = 1.0; // 0–1
      
        // (optioneel) kies een Nederlandstalige voice als beschikbaar
        // Voice-lijst kan pas later laden, dus dit is best-effort.
        var voices = [];
        try { voices = window.speechSynthesis.getVoices() || []; } catch(e){ voices = []; }
      
        var v = pickDutchVoice(voices);
        if(v) u.voice = v;
        document.body.classList.add('reading');
       // 👉 EINDE: visuele status opruimen
            u.onend = function(){
                document.body.classList.remove('reading');
            };
            u.onerror = function(ev){
                document.body.classList.remove('reading');
                console.log('[TTS] error', ev && (ev.error || ev.message || ev));
        };
      
        try{
          window.speechSynthesis.speak(u);
        }catch(e){
          console.log('[TTS] speak failed', e);
        }
      }
      
      function pickDutchVoice(voices){
        if(!voices || !voices.length) return null;
      
        // voorkeur: nl-BE, dan nl-NL, dan eender welke nl
        var i, v, lang;
        for(i=0;i<voices.length;i++){
          v = voices[i]; lang = (v.lang || '').toLowerCase();
          if(lang === 'nl-be') return v;
        }
        for(i=0;i<voices.length;i++){
          v = voices[i]; lang = (v.lang || '').toLowerCase();
          if(lang === 'nl-nl') return v;
        }
        for(i=0;i<voices.length;i++){
          v = voices[i]; lang = (v.lang || '').toLowerCase();
          if(lang.indexOf('nl') === 0) return v;
        }
        return null;
      }
      function speakToggle(text, gender){
        if(!('speechSynthesis' in window)) return;
      
        // 1) Als er gesproken wordt
        if(window.speechSynthesis.speaking){
          // a) pauze → hervatten
          if(window.speechSynthesis.paused){
            try{
              window.speechSynthesis.resume();
              document.body.classList.add('reading');
            }catch(e){}
          }
          // b) bezig → pauze
          else{
            try{
              window.speechSynthesis.pause();
              document.body.classList.remove('reading');
            }catch(e){}
          }
          return;
        }
      
        // 2) Niet bezig → nieuw voorlezen
        speakText(text, gender);
      }
      
      
    //----------
    
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
        var m = (so && so.completeMode) ? String(so.completeMode).toLowerCase() : null;
        if(!m && DATA.settings && DATA.settings.multiLocationSlotMode) {
          m = String(DATA.settings.multiLocationSlotMode).toLowerCase();
        }
        // default veilig
        m = m || 'all';
        return m;
      }
      
      function getUnlockedLocIds(){
        var st = store.get();
        return st.unlockedLocs || [];
      }
      
      function isSlotCompleted(slotId){
        var mode = getCompleteMode(slotId);
        var unlocked = getUnlockedLocIds();
        var locs = DATA.locaties || DATA.stops || [];
      
        var idsInSlot = [];
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(s && s.slot === slotId) idsInSlot.push(s.id);
        }
      
        // geen locaties => niet blokkeren
        if(!idsInSlot.length) return true;
      
        if(mode === 'any'){
          for(var j=0;j<idsInSlot.length;j++){
            if(unlocked.indexOf(idsInSlot[j]) >= 0) return true;
          }
          return false;
        }
      
        if(mode === 'random' || mode === 'nearest'){
          // random/nearest: slot is compleet als de gekozen target gehaald is
          var st = store.get();
          var picked = st.slotPick ? st.slotPick[slotId] : null;
          if(!picked){
            // nog geen keuze gemaakt => niet compleet (keuze wordt gemaakt wanneer je hem nodig hebt)
            return false;
          }
          return unlocked.indexOf(picked) >= 0;
        }
      
        // default / all
        for(var k=0;k<idsInSlot.length;k++){
          if(unlocked.indexOf(idsInSlot[k]) < 0) return false;
        }
        return true;
      }
      
      function getRandomPickForSlot(slotId, candidates){
        var st = store.get();
        if(!st.slotPick) st.slotPick = {};
      
        var pickedId = st.slotPick[slotId];
        if(pickedId){
          for(var i=0;i<candidates.length;i++){
            if(candidates[i].id === pickedId) return candidates[i];
          }
        }
      
        var r = Math.floor(Math.random() * candidates.length);
        var chosen = candidates[r];
        st.slotPick[slotId] = chosen.id;
        store.set(st);
        return chosen;
      }
      
      function getNearestPickForSlot(slotId, candidates, myLat, myLng){
        var st = store.get();
        if(!st.slotPick) st.slotPick = {};
      
        var pickedId = st.slotPick[slotId];
        if(pickedId){
          for(var i=0;i<candidates.length;i++){
            if(candidates[i].id === pickedId) return candidates[i];
          }
        }
      
        // zonder GPS kan je geen nearest bepalen
        if(myLat==null || myLng==null) return null;
      
        var best = candidates[0], bestD = Infinity;
        for(var j=0;j<candidates.length;j++){
          var d = haversineMeters(myLat,myLng, candidates[j].lat, candidates[j].lng);
          if(d < bestD){ bestD = d; best = candidates[j]; }
        }
      
        st.slotPick[slotId] = best.id;
        store.set(st);
        return best;
      }
      
      function pickTargetLocForSlot(slotId, myLat, myLng){
        var mode = getCompleteMode(slotId);
        var unlocked = getUnlockedLocIds();
        var locs = DATA.locaties || DATA.stops || [];
      
        // kandidaten = locaties in dit slot die nog niet gehaald zijn
        var cand = [];
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(!s || s.slot !== slotId) continue;
          if(s.lat==null || s.lng==null) continue;
          if(unlocked.indexOf(s.id) >= 0) continue;
          cand.push(s);
        }
        if(!cand.length) return null;
      
        if(mode === 'random'){
          return getRandomPickForSlot(slotId, cand);
        }
      
        if(mode === 'nearest'){
          return getNearestPickForSlot(slotId, cand, myLat, myLng);
        }
      
        // any/all: voor “next”-navigatie kies je best de dichtstbijzijnde nog-niet-gehaalde
        var best = cand[0], bestD = Infinity;
        if(myLat!=null && myLng!=null){
          for(var j=0;j<cand.length;j++){
            var d = haversineMeters(myLat,myLng, cand[j].lat, cand[j].lng);
            if(d < bestD){ bestD = d; best = cand[j]; }
          }
        }
        return best;
      }
      
      function getNextRequiredLoc(myLat, myLng){
        var slots = DATA.slots || [];
      
        // volgende required slot (volgens slots[] volgorde) die nog niet completed is
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
      
        return pickTargetLocForSlot(nextSlotId, myLat, myLng);
      }
      function prelockVisibleSlots(myLat, myLng){
        var slots = DATA.slots || [];
        for(var i=0;i<slots.length;i++){
          var sl = slots[i];
          if(!sl) continue;
      
          // als jij visibleSlotMap gebruikt: respecteer die
          if(typeof visibleSlotMap !== 'undefined' && visibleSlotMap && !visibleSlotMap[sl.id]) continue;
      
          var mode = getCompleteMode(sl.id);
      
          if(mode === 'random'){
            // GPS niet nodig: lock random zodra slot zichtbaar is
            pickTargetLocForSlot(sl.id, null, null);
          } else if(mode === 'nearest'){
            // GPS nodig: lock zodra we lat/lng hebben
            if(myLat != null && myLng != null){
              pickTargetLocForSlot(sl.id, myLat, myLng);
            }
          }
        }
      }
      
      function isLocVisibleUnderMode(loc){
        var mode = getCompleteMode(loc.slot);
        if(mode !== 'random' && mode !== 'nearest') return true;
      
        var st = store.get();
        var picked = st.slotPick ? st.slotPick[loc.slot] : null;
      
        // nearest zonder pick (nog geen GPS/lock): kies gedrag
        // Optie A: tijdelijk alles tonen:
        if(!picked) return true;
      
        // Optie B: toon niks tot lock:
        // if(!picked) return false;
      
        return loc.id === picked;
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
             // 🔑 NIEUW: nearest/random keuzes vastzetten
            prelockVisibleSlots(c.latitude, c.longitude);

            // 🔁 bestaand mechanisme
            refreshRouteUI();
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
        // 4) verbergen personages als er geen zijn
        // ✅ nu DOM/panels zijn aanwezig → personage/story correct verbergen
  try { applyPcUiState(); } catch(e) {}
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
        // var unlockedSlots = st.unlockedSlots || [];
        // var unlockedMap = {};
        // unlockedSlots.forEach(function(sid){ unlockedMap[sid]=true; });
      
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
        function displayPlaceForSlot(sid, ok){
            var locs = allLocationsForSlot(sid);
            if(!locs.length) return '';
          
            var mode = getCompleteMode(sid);
            var st2 = store.get();
            var unlockedLocs = st2.unlockedLocs || [];
            var pickedId = (st2.slotPick && st2.slotPick[sid]) ? st2.slotPick[sid] : null;
          
            // helper: eerste bezochte loc in slot
            function firstVisitedId(){
              for(var i=0;i<locs.length;i++){
                if(unlockedLocs.indexOf(locs[i].id) >= 0) return locs[i].id;
              }
              return null;
            }
          
            // random/nearest: als er al een pick is, is het op kaart al "niet-spoiler"
            if(mode === 'random' || mode === 'nearest'){
              if(pickedId){
                var locP = findLocById(pickedId);
                return (locP && locP.naam) ? stripPrefix(locP.naam) : '';
              }
              // nog geen pick (bv. nearest zonder GPS): toon voorlopig aantal
              return (locs.length > 1) ? '🔀 (' + locs.length + ' opties)' : '';
            }
          
            // any: als al iets bezocht is, toon die plaats; anders toon aantal opties
            if(mode === 'any'){
              var vid = firstVisitedId();
              if(vid){
                var locV = findLocById(vid);
                return (locV && locV.naam) ? stripPrefix(locV.naam) : '';
              }
              return (locs.length > 1) ? '🔀 (' + locs.length + ' opties)' : '';
            }
          
            // all: je kan hier kiezen: of niets tonen tot alles klaar is, of "x/y"
            if(mode === 'all'){
              if(ok){
                // als alles klaar is, toon gerust de (eerste) plaatsnaam of leeg
                // (ik toon hier leeg, want "all" is vaak meerdere plekken)
                return '';
              }
              // toon progress x/y (handig!)
              var done = 0;
              for(var j=0;j<locs.length;j++){
                if(unlockedLocs.indexOf(locs[j].id) >= 0) done++;
              }
              if(locs.length > 1) return '🧩 (' + done + '/' + locs.length + ')';
              return '';
            }
          
            // fallback
            return '';
          }
          
      
        var html = '';
        (slotOrder||[]).forEach(function(sid){
          if(!isSlotVisibleInList(sid)) return;
      
         // var ok = !!unlockedMap[sid];
          var ok = isSlotCompleted(sid);
          var optional = isOptionalSlot(sid);
          var icon = ok ? '✅' : (sid===endSlot ? '🔒' : (optional ? '🧩' : '⏳'));
      
          var label = slotLabel(sid);
      
          // ✅ Spoiler-proof: place alleen tonen als slot unlocked is
          //var place = ok ? displayPlaceForSlot(sid) : '';
          var place = displayPlaceForSlot(sid, ok);
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
      
        // if (window.__insideStart !== insideStart) {
        //     window.__insideStart = insideStart;
        //     //renderCharacterChooser(); // 👈 dit is de essentie
        //     applyPcUiState();
        //   }
        var prev = window.__insideStart === true;
            if(prev !== insideStart){
            maybeLockPcOnStartExit(prev, insideStart);
            window.__insideStart = insideStart;
            // Auto-begin: als GPS aan staat maar route nog niet gestart,
            // en je komt aan startpunt -> start route vanzelf
            var stAuto = store.get();
            if(stAuto && stAuto.gpsOn === true && stAuto.geoOn !== true){
            if(canBeginRouteNow()){
    beginRoute();
    try { applyPcUiState(); } catch(e) {}
  }
}
            applyPcUiState();}

    var st = store.get();

    var arr = DATA.locaties || DATA.stops || [];
    var ps  = (DATA && DATA.prestart) ? DATA.prestart : null;
    
    // 1) locatie zoeken via useLocationId
    var startLoc = null;
    if(ps && ps.useLocationId){
      for(var i=0;i<arr.length;i++){
        if(arr[i] && arr[i].id === ps.useLocationId){
          startLoc = arr[i];
          break;
        }
      }
    }
    
    // 2) meetingPoint + label bepalen
    var mp = (ps && ps.meetingPoint) ? ps.meetingPoint : null;
    
    var startLabel =
      (mp && mp.label) ? mp.label :
      (startLoc && startLoc.naam) ? startLoc.naam :
      'Start';
    
    // UI: naam startpunt
    var cl = qs('closest');
    if(cl) cl.textContent = startLabel;
    
    // UI: afstand & straal (zoals het was)
    if(best){
      var di = qs('dist');   if(di) di.textContent = String(best.d);
      var ra = qs('radius'); if(ra) ra.textContent = String(best.radius);
    }
    //UI Afbeelding
    var ps = (DATA && DATA.prestart) ? DATA.prestart : null;
    var psImages = (ps && ps.images) ? ps.images : [];
    renderGallery('gal_prestart', psImages);

    // UI: boodschap
    var msgRow = qs('prestartMsgRow');
    var msgEl  = qs('prestartMsg');
    
    if(msgRow && msgEl){
      var teVerMsg = (ps && ps.message) ? String(ps.message) : '';
      var inside = best ? (Number(best.d) <= Number(best.radius)) : true;
    
      var text = inside
        ? '🚶 Je bent op de startlocatie'
        : (teVerMsg ? ('🧭 ' + teVerMsg) : '');
    
      msgEl.textContent = text;
      msgRow.style.display = text ? '' : 'none';
    }
    
    // 3) Maps knop label + link
    var mapsBtn = qs('openInMaps');
    if(mapsBtn){
      var mapsLabel = (ps && ps.maps && ps.maps.label) ? String(ps.maps.label) : '';
      if(mapsLabel){
        // we zetten zelf het 🗺️-icoon, dus geen dubbel icoon als het al in de label zit
        mapsBtn.textContent = '🗺️ ' + mapsLabel.replace(/^🗺️\s*/,'');
      }
    
      // bestemming coördinaten: meetingPoint > startLoc
      var dLat = (mp && mp.lat != null) ? mp.lat : (startLoc ? startLoc.lat : null);
      var dLng = (mp && mp.lng != null) ? mp.lng : (startLoc ? startLoc.lng : null);
    
      if(dLat != null && dLng != null){
        mapsBtn.href = 'https://www.google.com/maps/dir/?api=1&destination='
          + encodeURIComponent(dLat + ',' + dLng);
      }else{
        mapsBtn.removeAttribute('href');
      }
    }
    
      
        // ✅ unlock pas als “route echt gestart” is
        if(best && st.geoOn === true){
            // 1) unlock (kan slot/loc status wijzigen)
            tryUnlock(best, accuracy);
          
            // 2) 🔑 lock keuzes (nearest/random) met echte GPS
            //    (random lockt ook, nearest lockt nu we lat/lng hebben)
            try { prelockVisibleSlots(latitude, longitude); } catch(e){}
          
            // 3) progress + UI refresh (via jouw bestaande render-throttle)
            renderProgress();
            scheduleStopsRender('gps/unlock');
          } else {
            // ook als geoOn false is, kan random al zichtbaar zijn (future route)
            // nearest kan niet zonder geoOn/fix — maar random wel
            try { prelockVisibleSlots(null, null); } catch(e){}
            renderProgress();
            scheduleStopsRender('gps/no-unlock'); // als je dit te veel vindt: mag weg
          }
          
      
        ensureLeafletMap();
        // als jij nu met __lastFix + applyLiveFixToMap werkt:
        __lastFix = { lat: latitude, lng: longitude, acc: accuracy };
        applyLiveFixToMap();
      }
      function maybeLockPcOnStartExit(prevInside, nowInside){
        if(prevInside === true && nowInside === false){
          var st = store.get();
          if(st.pcId && !st.pcConfirmed) st.pcConfirmed = true;
          if(st.pcId) st.lockedPc = true;
          store.set(st);
        }
      }
      
      function rememberUnlockedLocInState(st, locId){
        if(!st || !locId) return;
        st.unlockedLocs = st.unlockedLocs || [];
        if(st.unlockedLocs.indexOf(locId) === -1){
          st.unlockedLocs.push(locId);
        }
      }
      
      function buildStoryTimelineHtml(pc, hasRealLoc){
        if(!pc || !pc.verhalen){
          return '<div class="muted">(Geen verhaal beschikbaar)</div>';
        }
      
        var st = store.get();
        var unlockedLocs = st.unlockedLocs || [];
      
        // fallback 1: unlockedSlots → locIds
        if(!unlockedLocs.length && Array.isArray(st.unlockedSlots) && st.unlockedSlots.length){
          var arr2 = DATA.locaties || DATA.stops || [];
          st.unlockedSlots.forEach(function(slot){
            slot = (slot||'').toString().trim().toLowerCase();
            for(var j=0;j<arr2.length;j++){
              var loc = arr2[j];
              if(!loc) continue;
              var s = (loc.slot||'').toString().trim().toLowerCase();
              if(s === slot){
                unlockedLocs.push(loc.id);
                break;
              }
            }
          });
        }
      
        // ✅ fallback 2: minstens currentLoc tonen
        if(!unlockedLocs.length && st.currentLocId){
          unlockedLocs = [st.currentLocId];
        }
      
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
      
          var startSlot = DATA.startSlot || (DATA.meta && DATA.meta.startSlot) || 'start';
          if(slotId === startSlot) slotId = 'start';
          var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
          if(slotId === endSlot) slotId = 'end';
      
          var verhaal = getStoryFor(pc, slotId, locId);
          if(!verhaal) continue;
      
          var isLatest = (locId === lastLocId);
          var domId = safeDomId(locId);
      
          html += ''
            + '<div class="storyChunk'+(isLatest ? ' is-latest' : '')+'" id="storyChunk_'+domId+'">'
            +   '<div class="storyChunkHead">'
            +     '<span>'+escapeHtml(loc.naam || slotId)+'</span>'
            +     '<span style="display:flex;align-items:center;gap:8px">'
            +       (isLatest ? '<span class="pill tiny">nieuw</span>' : '')
            +       (hasRealLoc
                  ? '<button class="readBtn" data-slot="'+slotId+'" data-loc="'+locId+'" title="Lees voor">🔊</button>'
                  : '')
            +     '</span>'
            +   '</div>'
            +   '<div class="storyChunkBody">'+escapeHtml(verhaal)+'</div>'
            + '</div>';
        }
      
        return html || '<span class="muted">(Nog geen verhaal)</span>';
      }
      
      function safeDomId(x){
        return String(x).replace(/[^a-zA-Z0-9_-]/g, '_');
      }
      
    function autoFocusNewStory(){
        var st = store.get();
        if(!st.lastUnlockedLocId) return;
         // ✅ bestaat de story chunk wel?
            var chunkId = 'storyChunk_' + safeDomId(st.lastUnlockedLocId);
            var el = document.getElementById(chunkId);

            // als er geen story is, niets doen (en flag opruimen)
            if(!el){
                st.lastUnlockedLocId = null;
                store.set(st);
                return;
            }
      
        // als focus niet op story staat, spring er naartoe
        if(st.focus !== 'story'){
          st.focus = 'story';
          store.set(st);
          renderUnlocked(); // re-render met story open
          return;
        }
      
        // scroll naar het nieuw stuk (als het al bestaat)
        var el = document.getElementById('storyChunk_' + safeDomId(st.lastUnlockedLocId));
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
            try { prelockVisibleSlots(null, null); } catch(e){}
            try { refreshRouteUI();  } catch(e){}
            try { applyPcUiState(); } catch(e) {}
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
   function ansKey(qid){
  // ondersteunt zowel index (0,1,2) als vraagId ("q_thuis_mc_01")
  return String(qid);
}

function getAns(stopId, qId){
  var st = store.get();
  if(!st || !st.answers || !st.answers[stopId]) return null;

  qId = String(qId || '');

  // nieuw: exact id
  if(st.answers[stopId].hasOwnProperty(qId)) return st.answers[stopId][qId];

  // oud (optioneel): ansKey fallback
  try{
    var k = ansKey(qId);
    if(st.answers[stopId].hasOwnProperty(k)) return st.answers[stopId][k];
  }catch(e){}

  return null;
}



function setAns(stopId, qId, val){
  var st = store.get() || {};
  st.answers = st.answers || {};
  st.answers[stopId] = st.answers[stopId] || {};

  var key = ansKey(qId); // = String(qId)
  st.answers[stopId][key] = val;
  store.set(st);

  var tag = document.querySelector('.saveBadge[data-stop="'+stopId+'"][data-q="'+key+'"]');
  if(tag){
    tag.textContent = '✔';
    setTimeout(function(){ tag.textContent=''; }, 1200);
  }
}

function clearAns(stopId, qi){
  var st = store.get() || {};
  var key = ansKey(qi);

  // 1) wis antwoord in store
  if(st.answers && st.answers[stopId] && st.answers[stopId].hasOwnProperty(key)){
    delete st.answers[stopId][key];
    store.set(st);
  }

  // 2) reset textarea (open vraag)
  var ta = document.querySelector('.ans[data-stop="'+stopId+'"][data-q="'+key+'"]');
  if(ta) ta.value = '';

  // 3) reset radio buttons
  var radios = document.querySelectorAll(
    'input.rbOpt[data-stop="'+stopId+'"][data-q="'+key+'"]'
  );
  for(var i=0;i<radios.length;i++){
    radios[i].checked = false;
  }

  // 4) reset checkboxes
  var checks = document.querySelectorAll(
    'input.cbOpt[data-stop="'+stopId+'"][data-q="'+key+'"]'
  );
  for(var j=0;j<checks.length;j++){
    checks[j].checked = false;
  }

  // 5) reset MC button-grid
  var btns = document.querySelectorAll(
    'button.optBtn[data-stop="'+stopId+'"][data-q="'+key+'"]'
  );
  for(var k=0;k<btns.length;k++){
    btns[k].classList.remove('isActive');
  }

  // 6) wis save badge
  var tag = document.querySelector('.saveBadge[data-stop="'+stopId+'"][data-q="'+key+'"]');
  if(tag) tag.textContent = '';

  // 7) wis media blobs (indien van toepassing)
  try{
    clearMediaForQuestion(stopId, key);
  }catch(e){}
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
function buildRouteOrder(DATA){
  var order = [];

  var slots = DATA && DATA.slotOrder ? DATA.slotOrder : [];
  var locs  = DATA && (DATA.locaties || DATA.stops) ? (DATA.locaties || DATA.stops) : [];

  // groepeer locs per slot in JSON-volgorde
  var bySlot = {};
  for(var i=0;i<locs.length;i++){
    var l = locs[i];
    if(!l || !l.id) continue;
    var s = l.slot || '';
    if(!bySlot[s]) bySlot[s] = [];
    bySlot[s].push(l.id);
  }

  for(var si=0;si<slots.length;si++){
    var sid = slots[si];
    var arr = bySlot[sid] || [];
    for(var j=0;j<arr.length;j++){
      order.push(arr[j]);
    }
  }

  // fallback: als slotOrder leeg is, gewoon alle locs in JSON-volgorde
  if(!order.length){
    for(var k=0;k<locs.length;k++){
      if(locs[k] && locs[k].id) order.push(locs[k].id);
    }
  }

  return order;
}


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
        document.addEventListener('click', function(e){
            var btn = e.target && e.target.closest
                      ? e.target.closest('.readBtn')
                      : null;
            if(!btn) return;
          
            var slotId = btn.getAttribute('data-slot');
            var locId  = btn.getAttribute('data-loc');
          
            if(!slotId || !locId) return;
          
            handleReadStory(slotId, locId);
          });
          
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
  
      b = qs('startBtn');
      if(b) b.addEventListener('click', function(){
        initAudio();
      
        // ✅ fase 1: GPS aanzetten mag altijd
        enableGps();
       
        // ✅ fase 2: als je nu al aan start bent (en evt pc ok) -> begin meteen
        if(canBeginRouteNow()){
           
          beginRoute();
        } else {
          // geen alert; eventueel status tekst zetten
          // bv. "GPS staat aan. Ga naar startpunt om te beginnen."
          var msg = qs('prestartMsg');
          if(msg){
            msg.textContent = (window.__insideStart === true)
              ? '✅ GPS staat aan. Kies eventueel je personage en start gaat vanzelf.'
              : '📍 GPS staat aan. Ga naar het startpunt om te beginnen.';
          }
        }

      });
      

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
    function hasCharacters(){
        if(DATA && DATA.characters) return DATA.characters.enabled !== false;
        return (DATA.personages||[]).length > 0;
      }
      
      
      function isPcActive(){
        var st = store.get();
        return !!st.pcId && (!!st.pcConfirmed || !!st.lockedPc);
      }
      
// ---------- Characters: single source of truth ----------

function charactersEnabled(){
    return !(DATA && DATA.characters && DATA.characters.enabled === false);
  }
  
  
  function getPcState(){
    // disabled = scenario heeft geen personages (of expliciet uitgeschakeld)
    if(!charactersEnabled()) return 'disabled';
  
    var st = store.get();
    var chosen = !!st.pcId;
    var active = chosen && (!!st.pcConfirmed || !!st.lockedPc);
  
    return active ? 'active' : 'choose';
  }
  
  function setPanelVisible(name, visible){
    var el = document.querySelector('section[data-panel="'+name+'"]');
    if(!el) return;
    el.style.display = visible ? '' : 'none';
  }
  
  function setVisibleById(id, visible){
    var el = document.getElementById(id);
    if(!el) return;
    el.style.display = visible ? '' : 'none';
  }
  
  // ---------- UI: apply state everywhere ----------
  
  function applyPcUiState(){
    // charactersEnabled moet META respecteren: enabled:false => false
    var enabled = charactersEnabled();
  
    // jouw elementen
    var pcCardEl = document.getElementById('pcCard');
    var storyPanel = document.querySelector('section[data-panel="story"]');
  
    if(!enabled){
      if(pcCardEl) pcCardEl.style.display = 'none';
      if(storyPanel) storyPanel.style.display = 'none';
  
      var chooser = qs('pcChooser');
      if(chooser) chooser.innerHTML = '';
  
      return;
    }
  
    // enabled=true: klassiek gedrag
    var st = store.get();
    var active = !!st.pcId && (!!st.pcConfirmed || !!st.lockedPc);
  
    // pcCard tonen zolang je nog moet kiezen
    if(pcCardEl) pcCardEl.style.display = active ? 'none' : '';
  
    // story alleen als actief
    if(storyPanel) storyPanel.style.display = active ? '' : 'none';
  
    if(!active) renderCharacterChooser();
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
        var el = qs('pcChooser');
        if(!el) return;
        if(DATA && DATA.characters && DATA.characters.enabled === false){
            el.innerHTML = '';
            return;
          }
        // Als scenario geen personages wil: niets tonen
        if(!charactersEnabled()){
          el.innerHTML = '';
          return;
        }
      
        var pcs = DATA.personages || [];
        if(!pcs.length){
          // duidelijke placeholder, maar geen select/knoppen
          el.innerHTML = '<span class="pill no">ℹ️ Geen personages in dit scenario</span>';
          return;
        }
      
        var st = store.get();
        var opts = '';
        pcs.forEach(function(p){
          opts += '<option value="'+p.id+'" '+(p.id===st.pcId?'selected':'')+'>'
                + escapeHtml(p.naam)+' ('+escapeHtml(String(p.leeftijd))+') — '+escapeHtml(p.rol)
                + '</option>';
        });
      
        var inside = (window.__insideStart === true);
        var locked = !!st.lockedPc;
        var confirmed = !!st.pcConfirmed;
        var canChoose = inside && !locked && !confirmed;
      
        var msg =
          locked ? '🔒 Keuze vergrendeld' :
          (confirmed ? '✅ Keuze bevestigd' :
            (inside ? '🟢 Kies je personage en bevestig'
                    : '🔐 Kiesbaar enkel aan de start'));
      
        el.innerHTML =
            '<select id="pcSelect" '+(canChoose?'':'disabled')+'>'+opts+'</select>'
          + '<span id="pcPill" class="pill '+((locked||confirmed)?'ok':'')+'">'+escapeHtml(msg)+'</span>';
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

        img.src = resolveCharacterFile(pc.id + '.png', DATA);

        img.onerror = function(){
          img.onerror = null;
          img.style.display = 'none';
        };
      }

  
      renderCharacterChooser();
    }
  
      function startRoute(){
        var st = store.get();
      
        st.geoOn = true;          // route is gestart
        st.startedAt = Date.now();
      
        store.set(st);
      
        startWatch();             // GPS watch starten
        scheduleStopsRender('start');
        applyPcUiState();
      }
      
      function canStartRoute(){
        if(window.__insideStart !== true) return false;
        if(!charactersEnabled()) return true;
      
        var st = store.get();
        return !!st.pcId && (!!st.pcConfirmed || !!st.lockedPc);
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
        //var unlockedMap = {};
        // unlockedSlots.forEach(function(sid){ unlockedMap[sid]=true; });
      
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
        function displayPlaceForSlot(sid, ok){
            var locs = allLocationsForSlot(sid);
            if(!locs.length) return '';
          
            var mode = getCompleteMode(sid);
            var st2 = store.get();
            var unlockedLocs = st2.unlockedLocs || [];
            var pickedId = (st2.slotPick && st2.slotPick[sid]) ? st2.slotPick[sid] : null;
          
            function firstVisitedId(){
              for(var i=0;i<locs.length;i++){
                if(unlockedLocs.indexOf(locs[i].id) >= 0) return locs[i].id;
              }
              return null;
            }
          
            // random/nearest: zodra pick bestaat => toon die naam (zoals kaart)
            if(mode === 'random' || mode === 'nearest'){
              if(pickedId){
                var lp = findLocById(pickedId);
                return (lp && lp.naam) ? stripPrefix(lp.naam) : '';
              }
              // nog geen pick (bv. nearest zonder GPS): toon aantal opties
              return (locs.length > 1) ? '🔀 (' + locs.length + ' opties)' : '';
            }
          
            // any: vóór bezoek toon opties; na eerste bezoek toon bezochte plek
            if(mode === 'any'){
              var vid = firstVisitedId();
              if(vid){
                var lv = findLocById(vid);
                return (lv && lv.naam) ? stripPrefix(lv.naam) : '';
              }
              return (locs.length > 1) ? '🔀 (' + locs.length + ' opties)' : '';
            }
          
            // all: toon progress x/y tot compleet
            if(mode === 'all'){
              if(ok) return ''; // of bv. '✅' als je wil
              var done = 0;
              for(var j=0;j<locs.length;j++){
                if(unlockedLocs.indexOf(locs[j].id) >= 0) done++;
              }
              return (locs.length > 1) ? '🧩 (' + done + '/' + locs.length + ')' : '';
            }
          
            // fallback
            return '';
          }
          
      
        var html = '';
        (slotOrder||[]).forEach(function(sid){
            if(!isSlotVisibleInList(sid)) return; 
          
            var ok = isSlotCompleted(sid);
            var optional = isOptionalSlot(sid);
            var icon = ok ? '✅' : (sid===endSlot ? '🔒' : (optional ? '🧩' : '⏳'));
          
            var label = slotLabel(sid);
            var place = displayPlaceForSlot(sid, ok);
          
            html += '<span class="pill ' + (ok?'ok':'no') + '">'
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
    function computeVisibleSlotMap(kind){
        var slots = DATA.slots || [];
        var settings = DATA.settings || {};
      
        var showOptional = (settings.showOptionalSlots !== false);
      
        // "future" betekent: ook slots tonen die nog niet "aan de beurt" zijn
        // voor lijst/kaart apart regelbaar
        var showFuture =
          (kind === 'list') ? !!settings.listShowFutureSlots :
          (kind === 'map')  ? !!settings.mapShowFutureLocations :
          false;
      
        // visibilityMode beïnvloedt vooral "nextOnly" gedrag
        var visibilityMode = settings.visibilityMode || 'nextOnly';
      
        // Helper: is slot optional?
        function isOptional(slotId){
          for(var i=0;i<slots.length;i++){
            if(slots[i] && slots[i].id === slotId) return slots[i].required === false;
          }
          return false;
        }
      
        // Helper: bepaal volgende required slot (eerste required dat niet complete is)
        var nextRequired = null;
        for(var i=0;i<slots.length;i++){
          var sl = slots[i];
          if(!sl || sl.required === false) continue;
          if(!isSlotCompleted(sl.id)){ nextRequired = sl.id; break; }
        }
      
        // Als alles complete is: toon alles wat je wil tonen
        if(!nextRequired){
          var allDone = {};
          for(var z=0;z<slots.length;z++){
            var sid0 = slots[z].id;
            if(!showOptional && isOptional(sid0)) continue;
            allDone[sid0] = true;
          }
          return allDone;
        }
      
        // Bepaal “tot waar” je mag tonen bij nextOnly zonder future
        // We tonen: alle completed required slots + nextRequired.
        // Optionele slots: enkel als showOptional én (showFuture of al complete)
        var map = {};
      
        for(var j=0;j<slots.length;j++){
          var sid = slots[j].id;
          if(!sid) continue;
      
          if(!showOptional && isOptional(sid)) continue;
      
          if(showFuture){
            // future aan: toon alles (behalve optioneel als uit)
            map[sid] = true;
            continue;
          }
      
          // future uit:
          if(visibilityMode === 'all'){
            // all: toon alles unlocked? (maar future=false => nog steeds geen toekomst)
            // hier interpreteer ik: toon tot nextRequired (incl) + completed.
            // (zelfde als nextOnly)
          }
      
          // nextOnly gedrag:
          if(isSlotCompleted(sid) || sid === nextRequired){
            map[sid] = true;
          } else {
            // optioneel: toon optional slots die al compleet zijn (bij any/random kan dat)
            if(isOptional(sid) && isSlotCompleted(sid)) map[sid] = true;
          }
        }
      
        return map;
      }
      
      function rebuildVisibleSlotMap(){
        window.visibleSlotMap = computeVisibleSlotMap() || {};
        return window.visibleSlotMap;
      }
        
      function rebuildVisibleSlotMaps(){
        window.visibleSlotMapMap  = computeVisibleSlotMap('map')  || {};
        window.visibleSlotMapList = computeVisibleSlotMap('list') || {};
      
        // backward compat: als je elders nog visibleSlotMap gebruikt
        window.visibleSlotMap = window.visibleSlotMapMap;
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
      
          // ✅ random/nearest => enkel gekozen loc tonen
          if(typeof isLocVisibleUnderMode === 'function'){
            if(!isLocVisibleUnderMode(s)) continue;
          }
      
          // required uit DATA.slots halen
          var so = null;
          for (var j=0;j<(DATA.slots||[]).length;j++){
            if(DATA.slots[j].id === s.slot){ so = DATA.slots[j]; break; }
          }
          var req = so ? !!so.required : true;
      
          // ⚠️ als random/nearest maar 1 zichtbaar is, wil je ook variants=1 voor icon
          // anders toon je een "split" indicator terwijl je eigenlijk 1 target hebt
          var variants = perSlotCount[s.slot] || 1;
          if(typeof isLocVisibleUnderMode === 'function'){
            var mode = getCompleteMode(s.slot);
            if(mode === 'random' || mode === 'nearest') variants = 1;
          }
      
          var icon = makeSlotIcon(s.slot, req, variants);
      
          L.marker([s.lat, s.lng], { icon: icon })
            .bindPopup('<b>'+escapeHtml(s.naam||s.id)+'</b>')
            .addTo(window.__stopMarkerLayer);
        }
      }
      
      function addStopCircles(){
        if(!window.LMAP || !window.L) return;
      
        // ✅ aparte layer zodat ringen niet opstapelen
        if(window.__stopCircleLayer){
          try { window.LMAP.removeLayer(window.__stopCircleLayer); } catch(e){}
        }
        window.__stopCircleLayer = L.layerGroup().addTo(window.LMAP);
      
        var locs = DATA.locaties || DATA.stops || [];
        for(var i=0;i<locs.length;i++){
          var s = locs[i];
          if(!s || s.lat==null || s.lng==null) continue;
      
          if(!isSlotVisibleOnMap(s.slot)) continue;
      
          // ✅ random/nearest => enkel gekozen loc tonen
          if(typeof isLocVisibleUnderMode === 'function'){
            if(!isLocVisibleUnderMode(s)) continue;
          }
      
          var rad = s.radius || (DATA.meta ? DATA.meta.radiusDefaultMeters : 200);
      
          L.circle([s.lat, s.lng], { radius: rad, weight:1, fillOpacity:.05 })
            .addTo(window.__stopCircleLayer);
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
          //  rotateMapToNext(lat, lng);
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
      
        // ✅ safety: zorg dat unlockedBySlot bestaat
        if(!st.unlockedBySlot) st.unlockedBySlot = {};
        st.unlockedBySlot[bestSlot] = best.id;
      
        st.currentLocId = best.id;
        st.currentSlotId = bestSlot;
      
        // ✅ dit maakt je story timeline persistent
        //rememberUnlockedLoc(best.id);
        rememberUnlockedLocInState(st, best.id);
        // store.set gebeurt al in rememberUnlockedLoc, maar is oké om hier nog eens te doen
        // (als je het netter wil: haal store.set uit rememberUnlockedLoc en laat het hier)
        store.set(st);
      
        renderUnlocked();
        scheduleStopsRender('unlock');
        toast('✅ Ontgrendeld: ' + (best.name || bestSlot));
        playDing();
      } else {
        st.currentLocId = best.id;
        st.currentSlotId = bestSlot;
      
        // (optioneel) als je wil dat story ook “bijwerkt” wanneer je terug naar een oude stop gaat:
        // rememberUnlockedLoc(best.id);
      
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
        if(pn2) pn2.innerHTML='<span class="warn"></span>';//error verschijnt zonder reden na keuze personage?
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
 function bindExportImportUi(){
  var bExp = document.getElementById('exportZipBtn');
  var bImp = document.getElementById('importZipBtn');
  var inp  = document.getElementById('inpZip');

  if(bExp){
    bExp.addEventListener('click', function(){
      exportZip().catch(function(err){
        alert('Export faalde: ' + (err && err.message ? err.message : err));
      });
    });
  }

  if(bImp && inp){
    bImp.addEventListener('click', function(){
      inp.click();
    });

    inp.addEventListener('change', function(){
      var f = inp.files && inp.files[0];
      inp.value = '';
      if(!f) return;

      // restore-mode: overschrijft de huidige voortgang met de zip
      importZip(f, { overwrite:true }).catch(function(err){
        alert('Import faalde: ' + (err && err.message ? err.message : err));
      });
    });
  }
}

    function renderUnlocked(force=false){
        var old = document.getElementById('mapSection');
        if(old) old.style.display = 'none';
      
        applyRouteModeUI();
      
        var st = store.get() || {};
        var renderKey = [
            st.focus,
            st.currentLocId,
            st.lastUnlockedLocId,
            (st.unlockedLocs||[]).length,
            (st.unlockedSlots||[]).length
          ].join('|');

          if(!force && renderKey === __lastRenderKey){
            // hier kan je nog wél status/map updaten als je wil
            return;
          }
          __lastRenderKey = renderKey;
        var pc = currentPc();
        var cont = qs('unlockList');
        if(!cont) return;
      
        var arr = DATA.locaties || DATA.stops || [];
      
        function findLocById(id){
          for(var i=0;i<arr.length;i++){
            if(arr[i] && arr[i].id === id) return arr[i];
          }
          return null;
        }
      
        // ---- huidige locatie bepalen ---------------------------------
        var currentLoc = null;
      
        // 1) expliciet gekozen locatie
        if(st.currentLocId){
          currentLoc = findLocById(st.currentLocId);
        }
      
        // 2) laatste unlocked locatie
        if(!currentLoc){
          var ul = st.unlockedLocs || [];
          if(ul.length){
            currentLoc = findLocById(ul[ul.length - 1]);
          }
        }
      
        // 3) laatste unlocked slot
        if(!currentLoc){
          var us = st.unlockedSlots || [];
          if(us.length){
            var lastSlot = String(us[us.length - 1]).trim().toLowerCase();
            for(var j=0;j<arr.length;j++){
              var L = arr[j];
              if(L && String(L.slot || '').trim().toLowerCase() === lastSlot){
                currentLoc = L;
                break;
              }
            }
          }
        }
      
        // 4) placeholder als er echt niets is (panel-layout blijft werken)
        if(!currentLoc){
          currentLoc = { id:'', slot:'', naam:'Nog geen stop', vragen:[], uitleg:null };
        }
      
        var loc = currentLoc;
        var locId = loc.id || '';
        var slotId = loc.slot || '';
        var hasRealLoc = !!(locId && slotId);
      
        // ✅ routehint voor de net-vrijgekomen locatie
        var huidigeRouteHint = '';
        if(hasRealLoc && loc && loc.routeHint){
          huidigeRouteHint = String(loc.routeHint);
        }
        var routeHintHtml = huidigeRouteHint
          ? ('<div id="routeHintBox" class="routeHintBox">🧭 ' + escapeHtml(huidigeRouteHint) + '</div>')
          : '<div id="routeHintBox" class="routeHintBox hidden"></div>';
      
        // ---- einde check + exportblok --------------------------------
        var endSlot = DATA.endSlot || (DATA.meta && DATA.meta.endSlot) || 'end';
        var isEnd = (hasRealLoc && loc && loc.slot === endSlot);
      
        var downloadHtml =
            '<div class="card mt-10">'
          + '  <div class="cardHead">📦 Export / Import</div>'
          + '  <div class="cardBody">'
          + (isEnd
              ? '<div class="muted small" style="margin-bottom:8px">Je bent aan het eindpunt — download je ZIP (antwoorden + foto\'s/audio) en stuur die door.</div>'
              : '<div class="muted small" style="margin-bottom:8px">Je kan onderweg al exporteren (backup). Op het eindpunt download je je definitieve ZIP.</div>'
            )
          + '    <div style="display:flex;gap:8px;flex-wrap:wrap">'
          + '      <button id="exportZipBtn" type="button" class="primary">⬇️ Download ZIP</button>'
          + '      <button id="importZipBtn" type="button">⬆️ Import ZIP</button>'
          + '    </div>'
          + '    <input id="inpZip" type="file" accept=".zip" style="display:none" />'
          + '    <div class="muted small" style="margin-top:8px">Tip: import is vooral handig om te herstellen als je browserdata weg zijn of je toestel wisselt.</div>'
          + '  </div>'
          + '</div>';

      
        // ---- verhaal --------------------------------------------------
        var verhaal = hasRealLoc ? getStoryFor(pc, slotId, locId) : null;
        var verhaalText = (verhaal == null) ? '' : String(verhaal); // (niet per se nodig, maar safe)
        var hasStory = !!(verhaalText && verhaalText.trim());

        // ---- uitleg ---------------------------------------------------
        var uitleg = loc.uitleg || null;
        var uitlegKort = '', uitlegLang = '';
        if(uitleg){
          if(typeof uitleg === 'string'){
            uitlegKort = uitleg;
          }else{
            uitlegKort = uitleg.kort || '';
            uitlegLang = uitleg.uitgebreid || '';
          }
        }
      
        var uitlegHtml = '';
        var hasImages = !!(loc && loc.images && loc.images.length);
        
        if(uitlegKort || uitlegLang || hasImages){
          var moreId = 'more_' + locId;
        
          uitlegHtml =
              '<div class="uitlegBox">'
            + '  <div class="uitlegTitle">'
            + '    <span class="uitlegTitleText">ℹ️ Informatie</span>'
            + (uitlegLang ? ' <button class="uitlegToggleIcon" type="button" data-toggle="'+moreId+'">+</button>' : '')
            + '  </div>'
            + (hasImages ? '<div id="gal_uitleg" class="hidden"></div>' : '')
            + (uitlegKort ? ('<div class="uitlegKort">'+escapeHtml(uitlegKort)+'</div>') : '')
            + (uitlegLang ? ('<div id="'+moreId+'" class="uitlegLang hidden">'+escapeHtml(uitlegLang)+'</div>') : '')
            + '</div>';
        }
        
      
          // ---- vragen ---------------------------------------------------
          var qsArr = hasRealLoc ? (loc.vragen || []) : [];
          var qaHtml = '';

//          var st = store.get() || {};

          // routeOrder één keer bepalen en bewaren
          var routeOrder = st.routeOrder || buildRouteOrder(DATA);
          if(!st.routeOrder && routeOrder && routeOrder.length){
            st.routeOrder = routeOrder;
            store.set(st);
          }

          // “waar zijn we nu?” => lastUnlockedLocId is jouw “furthest/current”
          var curId = st.lastUnlockedLocId || locId;   // fallback
          var curPos = routeOrder.indexOf(curId);
          var locPos = routeOrder.indexOf(locId);

          // passed = je bent al verder dan deze locatie
          var passedThisLoc = (locPos >= 0 && curPos >= 0 && curPos > locPos);


        // “inRangeThisLoc”: enkel waar je nu effectief in de cirkel zit
        // (jij gebruikt hasRealLoc als “ik sta in de cirkel van deze loc”)
        var inRangeThisLoc = !!hasRealLoc;

        // “routeEnded”: pak je eigen signaal (hier uit store)
       var routeEnded = !!st.routeEnded;


        if(!hasRealLoc){
          qaHtml = '<div class="muted">Nog geen vragen: wandel eerst een cirkel binnen 🙂</div>';
          }else if(qsArr.length){
          //var st = store.get() || {};
          var routeOrder = st.routeOrder || buildRouteOrder(DATA);
          if(!st.routeOrder && routeOrder.length){ st.routeOrder = routeOrder; store.set(st); }

          var curId = st.lastUnlockedLocId || locId;
          var curPos = routeOrder.indexOf(curId);
          var locPos = routeOrder.indexOf(locId);
          var passedThisLoc = (locPos >= 0 && curPos >= 0 && curPos > locPos);

          function shouldShow(pol){
            var showUntil = ((pol && pol.showUntil) ? pol.showUntil : 'nextLocation') + '';
            showUntil = showUntil.toLowerCase();

            if(showUntil === 'inrange') return true;
            if(showUntil === 'nextlocation') return !passedThisLoc;

            // zolang routeEnded niet actief is: gewoon tonen
            if(showUntil === 'beforeend') return !routeEnded; // wordt pas false op het einde
            if(showUntil === 'afterend')  return true;        // blijft zichtbaar

            return !passedThisLoc;
          }

          function shouldClose(pol){
            var closeWhen = ((pol && pol.closeWhen) ? pol.closeWhen : 'nextLocation') + '';
            closeWhen = closeWhen.toLowerCase();

            if(closeWhen === 'inrange') return false;
            if(closeWhen === 'nextlocation') return passedThisLoc;

            if(closeWhen === 'beforeend') return routeEnded; // sluit op het einde
            if(closeWhen === 'afterend')  return routeEnded; // idem (of pas na einde)

            return passedThisLoc;
          }
          
          //per type vraag
          qaHtml = qsArr.map(function(q, qi){
            q = isObj(q) ? q : { id:(locId+'__q'+qi), type:'open', vraag:String(q||'') };
            if(!q.id) q.id = (locId+'__q'+qi);

            // policy
            if(!shouldShowQuestion(q, passedThisLoc, routeEnded, hasRealLoc)) return '';
            var closed = isQuestionClosed(q, passedThisLoc, routeEnded, hasRealLoc);

            // type dispatch
            var t = (q.type || 'open') + '';
            t = t.toLowerCase();

            if(t === 'mc') return renderVraagMC(locId, q, closed);
            if(t === 'checkbox') return renderVraagCheckbox(locId, q, closed);
            if(t === 'photo') return renderVraagPhoto(locId, q, closed);
            if(t === 'audio') return renderVraagAudio(locId, q, closed);
            return renderVraagOpen(locId, q, closed);
          }).join('');


          if(!qaHtml){
            qaHtml = '<div class="muted">Geen vragen (meer) zichtbaar door policy.</div>';
          }
        }
        else {
          qaHtml = '<div class="muted">Geen vragen bij deze stop.</div>';
        }

        // ✅ zijn er nog onbeantwoorde (en niet-gesloten) vragen?
          var hasUnanswered = false;
          if(hasRealLoc && qsArr && qsArr.length){
            for(var i=0;i<qsArr.length;i++){
              var qx = qsArr[i];
              qx = isObj(qx) ? qx : { type:'open', vraag:String(qx||'') };

              var qid2 = qx.id || (locId + '__q' + i);

              var pol2 = isObj(qx.policy) ? qx.policy : {};
              var showUntil2 = String(pol2.showUntil || 'nextLocation');
              var closeWhen2 = String(pol2.closeWhen || showUntil2);

              var ctx2 = { inRangeThisLoc: inRangeThisLoc, passedThisLoc: passedThisLoc, routeEnded: routeEnded };

              if(!shouldShowQuestion(showUntil2, ctx2)) continue;
              if(shouldCloseQuestion(closeWhen2, ctx2)) continue;

              if(!isAnsweredForQuestion(locId, qx, i)){
                hasUnanswered = true;
                break;
              }
            }
          }


             // ---- panel bodies ---------------------------------------------------
              // Info-panel: enkel info/uitleg (met eventueel gallery in uitlegHtml)
              var infoBody = ''
              + '<div id="statusWrapInfo"></div>'
              + (uitlegHtml || '<div class="muted">(Geen extra informatie)</div>');
      
              // Vragen-panel: enkel vragen + exportblok
              var vragenBody = ''
              + '<div id="statusWrapVragen"></div>'
              + '<div style="margin-top:10px">' + qaHtml + '</div>'
              + downloadHtml;
       
        // ---- pc card --------------------------------------------------
        var pcImgEl = qs("pcImg");
       // var pcImgSrc = pcImgEl ? pcImgEl.src : "";
       var pcImgSrc = pc
        ? resolveCharacterFile(pc.id + '.png', DATA)
        : '';
      
        var pcCard =
            '<div class="pcMini">'
          + ' <img class="pcMiniImg" src="'+escapeHtml(pcImgSrc)+'" alt=""/>'
          + ' <div class="pcMiniMeta">'
          + '   <div class="pcMiniName">'+escapeHtml(pc && pc.naam ? pc.naam : '—')+'</div>'
          + '   <div class="pcMiniSub muted">'+escapeHtml(pc && pc.herkomst ? pc.herkomst : '—')+' — '+escapeHtml(pc && pc.rol ? pc.rol : '—')+'</div>'
          + (pc && pc.bio ? ('<div class="pcMiniBio">'+escapeHtml(pc.bio)+'</div>') : '')
          + ' </div>'
          + '</div>';
      
        // ---- focus bepalen -------------------------------------------
        var focus = (st.focus || 'story');
        if(!st.focus){
          var routeMode = (st.geoOn === true) || (st.lockedPc === true) ||
                          ((st.unlockedSlots || []).length > 0) || (st.currentLocId);
          if(routeMode){
            focus = 'map';
            st.focus = 'map';
            store.set(st);
          }
        }
      // focus bepalen; verhaal, vragen, huidig
      var isNewUnlock = !!(st.lastUnlockedLocId && hasRealLoc && st.lastUnlockedLocId === locId);

        if(isNewUnlock){
        if(hasStory){
            focus = 'story';
            st.focus = 'story';
            store.set(st);
        }else if(hasUnanswered){
            focus = 'vragen';
            st.focus = 'vragen';
            store.set(st);
        }
        }
        // symbool voor paneltitel als nieuw:
        var hasInfo = !!(hasImages || (uitlegKort && uitlegKort.trim()) || (uitlegLang && uitlegLang.trim()));

        var badge = ' <span class="tabNew" title="Nieuwe inhoud">✨</span>';

        var storyTitle  = 'Verhaal'     + (isNewUnlock && hasStory      ? badge : '');
        var vragenTitle = 'Vragen'      + (isNewUnlock && hasUnanswered ? badge : '');
        var infoTitle   = 'Informatie'  + (isNewUnlock && hasInfo       ? badge : '');

        // ---- panels bouwen -------------------------------------------
        var storyBody = ''
          + pcCard
          + '<div style="margin-top:10px">'
          +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
          +     '<div style="font-weight:800">📘 Verhaal</div>'
          // +     (hasRealLoc ? '<button class="readBtn" data-slot="'+slotId+'" data-loc="'+locId+'" title="Lees voor">🔊</button>' : '')
          +   '</div>'
          +   '<div style="margin-top:6px">'
          +     buildStoryTimelineHtml(pc, hasRealLoc)
          +   '</div>'
          + '</div>';
       
        var mapBody =
            '<div id="statusWrapMap"></div>'
          + routeHintHtml
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
        + panelHtml('story',  storyTitle,  storyBody,  focus==='story')
        + panelHtml('vragen', vragenTitle, vragenBody, focus==='vragen')
        + panelHtml('info',   infoTitle,   infoBody,   focus==='info')
        + panelHtml('map',    'Kaart',      mapBody,    focus==='map')
        + '</div>';
       
        // ---- Park oneMap vóór innerHTML -------------------------------
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
        bindExportImportUi();
        hydrateMedia(cont);
      // ✅ gallery bij Informatie (uitleg)
        // host div bestaat pas na cont.innerHTML
        if(loc && loc.images && loc.images.length){
            renderGallery('gal_uitleg', loc.images);
        } else {
            renderGallery('gal_uitleg', []); // verbergt panel netjes
        }
  
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
      
        // controls verhuizen (veiligheidshalve opnieuw vastklikken)
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
        try { applyPcUiState(); } catch(e) {}
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
      try { applyPcUiState(); } catch(e) {}
      if(focus === 'map'){
        setTimeout(function(){
          if(window.LMAP) window.LMAP.invalidateSize(true);
        }, 200);
      }
    });
  
    // ---------- DOM Ready ----------
    document.addEventListener('DOMContentLoaded', function(){
         bindCoreListeners();
         initVoices();
      loadScenario().then(function(data){
        DATA = data;
        applyPcUiState();
        //TEST
        console.log('characters cfg:', DATA && DATA.characters);

        if(DATA && DATA.characters && DATA.characters.enabled === false){
          console.log('HIDING character UI (enabled=false)');
        
          var pcCard = document.getElementById('pcCard');
          if(pcCard) pcCard.style.display = 'none';
        
          var story = document.querySelector('section[data-panel="story"]');
          if(story) story.style.display = 'none';
        
          var chooser = qs('pcChooser');
          if(chooser) chooser.innerHTML = '';
        }
        
        //-------------
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
// ---------------- Eventhandlers ----------------
if(ul){

  function readQKey(el){
    var k = el.getAttribute('data-q');
    return (k == null) ? '' : String(k);
  }

  function handleSave(e){
    var t = e.target;
    var ta = t && t.matches && t.matches('textarea.ans') ? t : (t && t.closest ? t.closest('textarea.ans') : null);
    if(!ta) return;

    var stopId = ta.getAttribute('data-stop');
    var qKey   = readQKey(ta);              // ✅ string key
    setAns(stopId, qKey, ta.value);
  }

  // tekst (open vragen)
  ul.addEventListener('input', handleSave);
  ul.addEventListener('blur', handleSave, true);

  // discrete changes (checkbox + radio + textarea fallback)
 ul.addEventListener('change', function(e){
  var t = e.target;
  if(!t || !t.matches) return;

  // textarea fallback (voor browsers die change afvuren bij blur)
  if(t.matches('textarea.ans')){
    handleSave(e);
    return;
  }

  // checkbox
  if(t.matches('input.cbOpt')){
    var sid = t.getAttribute('data-stop');
    var qid = String(t.getAttribute('data-q')||'');
    var oid = String(t.getAttribute('data-oid')||'');
    if(!sid || !qid || !oid) return;

    var q = findVraagById(sid, qid);
    if(!q) return; // vraag niet gevonden -> niets doen

    // haal bestaand antwoord op (kan oud of nieuw formaat zijn)
    var curRaw = getAns(sid, qid);
    var curObj = normalizeStoredAnswer(curRaw) || {};
    var curIds = Array.isArray(curObj.choiceIds) ? curObj.choiceIds.slice() : [];

    // toggle oid
    var map = Object.create(null);
    for(var i=0;i<curIds.length;i++) map[curIds[i]] = true;
    if(t.checked) map[oid] = true;
    else delete map[oid];

    var nextIds = [];
    for(var k in map) if(Object.prototype.hasOwnProperty.call(map,k)) nextIds.push(k);

    // ✅ nieuw: bewaar ids + teksten
    var nextObj = {
      choiceIds: nextIds,
      choiceTexts: nextIds.map(function(id){ return optionTextById(q, id); })
    };

    setAns(sid, qid, nextObj);
    return;
  }

  // radio (MC list)
  if(t.matches('input.rbOpt')){
    var sid2 = t.getAttribute('data-stop');
    var qid2 = String(t.getAttribute('data-q')||'');
    var oid2 = String(t.getAttribute('data-oid')||'');
    if(!sid2 || !qid2 || !oid2) return;

    var q2 = findVraagById(sid2, qid2);
    if(!q2) return;

    // ✅ nieuw: bewaar id + tekst
    setAns(sid2, qid2, {
      choiceId: oid2,
      choiceText: optionTextById(q2, oid2)
    });
    return;
  }
});


  // clicks (mc buttons + clear + mic + media placeholder)
  ul.addEventListener('click', function(e){

    // MC optieknop (buttons)
    var ob = e.target && e.target.closest ? e.target.closest('button.optBtn') : null;
    if(ob){
      var sid = ob.getAttribute('data-stop');
      var qid = String(ob.getAttribute('data-q')||'');
      var oid = String(ob.getAttribute('data-oid')||'');
    if(sid && qid && oid){
      var q = findVraagById(sid, qid);
      var txt = q ? optionTextById(q, oid) : (ob.textContent || '').trim() || oid;

      setAns(sid, qid, {
        choiceId: oid,
        choiceText: txt
      });

      // UI: active state
      var wrap = ob.closest('.qaMC');
      if(wrap){
        var all = wrap.querySelectorAll('button.optBtn');
        for(var i=0;i<all.length;i++) all[i].classList.remove('isActive');
      }
      ob.classList.add('isActive');
    }
      return;
    }

    // clear


   var clr = e.target && e.target.closest ? e.target.closest('button.clearAns') : null;
if(clr){
  var sid2 = clr.getAttribute('data-stop');
  var qid2 = String(clr.getAttribute('data-q')||'');
  if(!sid2 || !qid2) return;

  // ✅ media blobs weg
  var raw = getAns(sid2, qid2);
  var arr = parseJsonArray(raw);
  var looksLikeMedia = !!(arr && arr.length && typeof arr[0] === 'object' && arr[0] && arr[0].kind);

  if(looksLikeMedia){
    var prefix = 'm|' + sid2 + '|' + qid2 + '|';
    mediaDelPrefix(prefix).catch(function(){});
  }

  if(typeof clearAns === 'function') clearAns(sid2, qid2);
  else setAns(sid2, qid2, '');

  // ✅ als media: rerender zodat thumbs/audio verdwijnen
  if(looksLikeMedia){
    try{ renderUnlocked(); }catch(e){}
    return;
  }

  // open: textarea leegmaken
  var ta = ul.querySelector('textarea.ans[data-stop="'+sid2+'"][data-q="'+qid2+'"]');
  if(ta){ ta.value=''; ta.focus(); }

  // mc buttons: active states weg
  var w1 = ul.querySelector('.qaMC[data-qwrap="'+qid2+'"]');
  if(w1){
    var btns = w1.querySelectorAll('button.optBtn');
    for(var j=0;j<btns.length;j++) btns[j].classList.remove('isActive');
  }

  // checkbox: uncheck
  var w2 = ul.querySelector('.qaCB[data-qwrap="'+qid2+'"]');
  if(w2){
    var cbs = w2.querySelectorAll('input.cbOpt');
    for(var k=0;k<cbs.length;k++) cbs[k].checked = false;
  }

  return;
}


    // mic (open textarea)
    var mic = e.target && e.target.closest ? e.target.closest('button.micBtn') : null;
    if(mic){
      if(!MIC_OK){ toast('Spraakherkenning niet beschikbaar (probeer online in Chrome).'); return; }

      var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      var r = new Recognition(); r.lang='nl-NL'; r.interimResults=false; r.maxAlternatives=1;

      var sid3 = mic.getAttribute('data-stop');
      var qid3 = String(mic.getAttribute('data-q')||'');

      r.onresult = function(ev){
        var txt = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) ? ev.results[0][0].transcript : '';
        var ta3 = ul.querySelector('textarea.ans[data-stop="'+sid3+'"][data-q="'+qid3+'"]');
        if(ta3){
          ta3.value = (ta3.value ? ta3.value+' ' : '') + txt;
          setAns(sid3, qid3, ta3.value);
        }
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

    // ---- MEDIA ----
    var mb = e.target && e.target.closest ? e.target.closest('button.mediaBtn') : null;
    if(mb){
      var sid = mb.getAttribute('data-stop');
      var qid = String(mb.getAttribute('data-q')||'');
      var mode = String(mb.getAttribute('data-mode')||'');

      if(mode === 'photo'){
        pickPhotoAndStore(sid, qid, mb);
      }else if(mode === 'audio'){
        toggleAudioRecord(sid, qid, mb);
      }
      return;
    }

  });
}


        //---------------------------------------------------------------------------------------
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
        a.download = 'verslag.md';
        document.body.appendChild(a);
        a.click();
        a.parentNode.removeChild(a);
      
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      }
 function loadScenario(){
  function safeFetchJSON(url, fallback){
    if(!url) return Promise.resolve(fallback);
    return fetchJSON(url).catch(function(err){
      console.warn('safeFetchJSON fallback for', url, err);
      return fallback;
    });
  }

  function resolveRelative(baseFile, relPath){
    if(!relPath) return null;
    if(/^https?:\/\//i.test(relPath)) return relPath;

    relPath = String(relPath).replace(/\\/g, '/');
    if(relPath.charAt(0) === '/') return relPath;

    baseFile = String(baseFile || '').replace(/\\/g, '/');
    var baseDir = baseFile.split('/').slice(0, -1).join('/');
    if(!baseDir) return relPath;

    return baseDir + '/' + relPath;
  }

  function getCharacterConfig(meta){
    var m = meta || {};
    var ch = m.characters;

    // Nieuw beleid: niet vermeld => geen personages
    if(!ch){
      return { enabled:false, implicit:true }; // implicit: niet geconfigureerd
    }

    // Expliciet aanzetten vereist
    if(ch.enabled !== true){
      return { enabled:false, implicit:false }; // wél characters-object, maar niet enabled:true
    }

    // Enabled:true => volledig config toepassen
    return {
      enabled: true,
      source: ch.source || 'personages.json',
      required: (ch.required === true),
      lockAtStartExit: (ch.lockAtStartExit !== false)
    };
  }

  // ---------------- Vragen normalisatie ----------------

  // function safeArr(a){ return Array.isArray(a) ? a : []; }

  // function isObj(x){
  //   return x && typeof x === 'object' && !Array.isArray(x);
  // }

  function safeDomId(s){
    // simpel & stabiel: genoeg voor ids
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  }

  function genVraagId(locId, type, n){
    var lid = safeDomId(locId || 'loc');
    var t = safeDomId(type || 'open') || 'open';
    var nn = String(n);
    if(nn.length < 2) nn = '0' + nn;
    return 'q_' + lid + '_' + t + '_' + nn;
  }

  function genOptId(vraagId, n){
    var nn = String(n);
    if(nn.length < 2) nn = '0' + nn;
    return 'o_' + safeDomId(vraagId) + '_' + nn;
  }

  function normalizePolicy(p){
    p = isObj(p) ? p : {};
    // jouw policy-keys: showUntil / closeWhen
    return {
      showUntil: p.showUntil || 'nextLocation',
      closeWhen: p.closeWhen || 'nextLocation'
    };
  }

  function normalizeMedia(m, qType){
    m = isObj(m) ? m : {};

    // voor niet-media types willen we gewoon een object (jij gebruikt vaak {})
    if(qType !== 'photo' && qType !== 'audio'){
      return m;
    }

    // media types: zet defaults slim
    if(qType === 'photo'){
      return {
        mode: 'photo',
        minCount: (m.minCount != null ? m.minCount : 0),
        maxCount: (m.maxCount != null ? m.maxCount : 1)
      };
    }

    // audio
    return {
      mode: 'audio',
      minSeconds: (m.minSeconds != null ? m.minSeconds : 0),
      maxSeconds: (m.maxSeconds != null ? m.maxSeconds : 30)
    };
  }

  function normalizeOpties(opties, vraagId){
    var arr = safeArr(opties);
    var used = Object.create(null);

    return arr.map(function(o, idx){
      // opties kunnen ook per ongeluk string zijn => maak object
      var opt = isObj(o) ? Object.assign({}, o) : { tekst: String(o) };

      if(!opt.tekst) opt.tekst = '';
      if(opt.correct !== true) opt.correct = false;

      if(!opt.id){
        opt.id = genOptId(vraagId, idx+1);
      }

      // vermijd dubbele ids
      if(used[opt.id]){
        opt.id = genOptId(vraagId, idx+1) + '_' + (idx+1);
      }
      used[opt.id] = true;

      return opt;
    });
  }

  function normalizeVragen(vragenArr, locId){
    var arr = safeArr(vragenArr);
    var out = [];
    var usedQ = Object.create(null);

    for(var i=0;i<arr.length;i++){
      var raw = arr[i];
      var q;

      // oude stijl: string => open vraag
      if(typeof raw === 'string'){
        q = {
          id: '',
          type: 'open',
          vraag: raw
        };
      } else if(isObj(raw)){
        q = Object.assign({}, raw);
      } else {
        // rommel negeren
        continue;
      }

      // type normaliseren
     // type normaliseren (+ synoniemen)
      var t = String(q.type || 'open').trim().toLowerCase();
      if(t === 'multiplechoice') t = 'mc';
      if(t === 'dropdown' || t === 'select') t = 'combobox';

      var allowed = { mc:1, checkbox:1, combobox:1, open:1, photo:1, audio:1 };
      if(!allowed[t]) t = 'open';
      q.type = t;

      // opties normaliseren voor mc/checkbox/combobox
      if(q.type === 'mc' || q.type === 'checkbox' || q.type === 'combobox'){
        // support ook "options" als bronveld
        if(q.opties == null && q.options != null) q.opties = q.options;

        q.opties = normalizeOpties(q.opties, q.id);

        // ✅ alias zodat renderers die options verwachten ook werken
        q.options = q.opties;

        // shuffle: enkel zinvol voor mc/checkbox (niet voor combobox)
        q.shuffle = (q.type !== 'combobox') && (q.shuffle === true);
      } else {
        // geen opties nodig
        if(q.opties != null) q.opties = safeArr(q.opties);
        if(q.options != null) q.options = safeArr(q.options);
        q.shuffle = false;
      }

      // vraagtekst
      if(q.vraag == null) q.vraag = '';
      q.vraag = String(q.vraag);

      // id
      if(!q.id){
        q.id = genVraagId(locId, q.type, out.length+1);
      }
      if(usedQ[q.id]){
        // maak hem uniek
        q.id = q.id + '_' + (out.length+1);
      }
      usedQ[q.id] = true;

      // opties / shuffle enkel zinvol voor mc/checkbox
      if(q.type === 'mc' || q.type === 'checkbox'){
        q.opties = normalizeOpties(q.opties, q.id);
        q.shuffle = (q.shuffle === true); // default false
      } else {
        // hou het consistent: geen opties nodig
        if(q.opties != null) q.opties = safeArr(q.opties); // laat bestaan, maar proper
        q.shuffle = false;
      }

      // policy + media defaults
      q.policy = normalizePolicy(q.policy);
      q.media = normalizeMedia(q.media, q.type);

      out.push(q);
    }

    return out;
  }

  // ---------------- Load scenario ----------------

  var scenarioUrl = stopsFileFromQuery();

  return Promise.all([
    safeFetchJSON('./data/meta.json', {}),
    fetchJSON(scenarioUrl)
  ]).then(function(arr){
    var metaDefaults = arr[0] || {};
    var stopsRaw = arr[1];

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

    if(isScenarioObject){
      slots = stopsRaw.slots || [];
      locaties = stopsRaw.locaties || [];
      scenarioMeta = stopsRaw.meta || {};
      scenarioSettings = stopsRaw.settings || {};
      scenarioPrestart = stopsRaw.prestart || {};
    } else {
      locaties = Array.isArray(stopsRaw) ? stopsRaw : [];
      slots = [];

      var seen = {};
      locaties.forEach(function(l){
        var s = l && l.slot ? l.slot : null;
        if(s && !seen[s]){ seen[s] = true; slots.push({ id:s, label:s, required:true }); }
      });

      if(!slots.length){
        slots = [
          { id:'start', label:'Start', required:true },
          { id:'end', label:'Einde', required:true }
        ];
      }
    }

    // meta + settings
    var meta = Object.assign({}, metaDefaults, scenarioMeta);

    var settingsDefaults = {
      visibilityMode: 'nextOnly',
      multiLocationSlotMode: 'all',
      showOptionalSlots: true,
      listShowFutureSlots: true,
      mapShowFutureLocations: false
    };
    var settings = Object.assign({}, settingsDefaults, scenarioSettings);
    var prestart = Object.assign({}, scenarioPrestart);

    // start/end
    var startSlot = meta.startSlot || 'start';
    var endSlot   = meta.endSlot   || 'end';

    // slots: completeMode normaliseren
    var allowedModes = { any:1, all:1, nearest:1, random:1 };
    slots = (slots || []).map(function(s){
      var slot = Object.assign({ required:true }, s || {});
      var cm = slot.completeMode || settings.multiLocationSlotMode || 'all';
      cm = (cm + '').toLowerCase();
      if(!allowedModes[cm]) cm = 'all';
      slot.completeMode = cm;
      return slot;
    });

    // locaties normaliseren + ✅ vragen normaliseren
    var defaultRadius = (meta && meta.radiusDefaultMeters != null) ? meta.radiusDefaultMeters : 200;
    locaties = (locaties || []).map(function(l, idx){
      var loc = Object.assign({}, l || {});
      if(!loc.id)   loc.id = 'loc_' + (idx+1);
      if(!loc.slot) loc.slot = startSlot;
      if(loc.radius == null) loc.radius = defaultRadius;

      // ✅ NIEUW: vragen altijd als objecten met defaults
      loc.vragen = normalizeVragen(loc.vragen, loc.id);

      return loc;
    });

    // personages config + laden
    var pcCfg = getCharacterConfig(meta);
    var pcUrl = pcCfg.enabled ? resolveRelative(scenarioUrl, pcCfg.source) : null;

    return safeFetchJSON(pcUrl, []).then(function(personages){
      // ✅ hard safety
      if(pcCfg && pcCfg.enabled === false) personages = [];

      var slotOrder = (slots || []).map(function(s){ return s.id; });
      var requiredSlots = (slots || []).filter(function(s){ return !!s.required; }).map(function(s){ return s.id; });

      return {
        meta: meta,
        settings: settings,
        prestart: prestart,

        stops: locaties,
        locaties: locaties,

        slots: slots,
        startSlot: startSlot,
        endSlot: endSlot,
        slotOrder: slotOrder,
        requiredSlots: requiredSlots,

        personages: Array.isArray(personages) ? personages : [],
        characters: pcCfg
      };
    });
  });
}


      // function loadScenario(){
      //   function safeFetchJSON(url, fallback){
      //     if(!url) return Promise.resolve(fallback);
      //     return fetchJSON(url).catch(function(err){
      //       console.warn('safeFetchJSON fallback for', url, err);
      //       return fallback;
      //     });
      //   }
      
      //   function resolveRelative(baseFile, relPath){
      //     if(!relPath) return null;
      //     if(/^https?:\/\//i.test(relPath)) return relPath;
      
      //     relPath = String(relPath).replace(/\\/g, '/');
      //     if(relPath.charAt(0) === '/') return relPath;
      
      //     baseFile = String(baseFile || '').replace(/\\/g, '/');
      //     var baseDir = baseFile.split('/').slice(0, -1).join('/');
      //     if(!baseDir) return relPath;
      
      //     return baseDir + '/' + relPath;
      //   }
      
      //   function getCharacterConfig(meta){
      //     var m = meta || {};
      //     var ch = m.characters;

      //     // Nieuw beleid: niet vermeld => geen personages
      //     if(!ch){
      //       return { enabled:false, implicit:true }; // implicit: niet geconfigureerd
      //     }

      //     // Expliciet aanzetten vereist
      //     if(ch.enabled !== true){
      //       return { enabled:false, implicit:false }; // wél characters-object, maar niet enabled:true
      //     }

      //     // Enabled:true => volledig config toepassen
      //     return {
      //       enabled: true,
      //       source: ch.source || 'personages.json',
      //       required: (ch.required === true),
      //       lockAtStartExit: (ch.lockAtStartExit !== false)
      //     };
      //   }

      
      //   var scenarioUrl = stopsFileFromQuery();
      
      //   return Promise.all([
      //     safeFetchJSON('./data/meta.json', {}),
      //     fetchJSON(scenarioUrl)
      //   ]).then(function(arr){
      //     var metaDefaults = arr[0] || {};
      //     var stopsRaw = arr[1];
      
      //     var isScenarioObject =
      //       stopsRaw &&
      //       typeof stopsRaw === 'object' &&
      //       !Array.isArray(stopsRaw) &&
      //       stopsRaw.locaties &&
      //       stopsRaw.slots;
      
      //     var slots = null, locaties = null;
      //     var scenarioMeta = {};
      //     var scenarioSettings = {};
      //     var scenarioPrestart = {};
      
      //     if(isScenarioObject){
      //       slots = stopsRaw.slots || [];
      //       locaties = stopsRaw.locaties || [];
      //       scenarioMeta = stopsRaw.meta || {};
      //       scenarioSettings = stopsRaw.settings || {};
      //       scenarioPrestart = stopsRaw.prestart || {};
      //     } else {
      //       locaties = Array.isArray(stopsRaw) ? stopsRaw : [];
      //       slots = [];
      
      //       var seen = {};
      //       locaties.forEach(function(l){
      //         var s = l && l.slot ? l.slot : null;
      //         if(s && !seen[s]){ seen[s] = true; slots.push({ id:s, label:s, required:true }); }
      //       });
      
      //       if(!slots.length){
      //         slots = [
      //           { id:'start', label:'Start', required:true },
      //           { id:'end', label:'Einde', required:true }
      //         ];
      //       }
      //     }
      
      //     // meta + settings
      //     var meta = Object.assign({}, metaDefaults, scenarioMeta);
      
      //     var settingsDefaults = {
      //       visibilityMode: 'nextOnly',
      //       multiLocationSlotMode: 'all',
      //       showOptionalSlots: true,
      //       listShowFutureSlots: true,
      //       mapShowFutureLocations: false
      //     };
      //     var settings = Object.assign({}, settingsDefaults, scenarioSettings);
      //     var prestart = Object.assign({}, scenarioPrestart);
      
      //     // start/end
      //     var startSlot = meta.startSlot || 'start';
      //     var endSlot   = meta.endSlot   || 'end';
      
      //     // slots: completeMode normaliseren
      //     var allowedModes = { any:1, all:1, nearest:1, random:1 };
      //     slots = (slots || []).map(function(s){
      //       var slot = Object.assign({ required:true }, s || {});
      //       var cm = slot.completeMode || settings.multiLocationSlotMode || 'all';
      //       cm = (cm + '').toLowerCase();
      //       if(!allowedModes[cm]) cm = 'all';
      //       slot.completeMode = cm;
      //       return slot;
      //     });
      
      //     // locaties normaliseren
      //     var defaultRadius = (meta && meta.radiusDefaultMeters != null) ? meta.radiusDefaultMeters : 200;
      //     locaties = (locaties || []).map(function(l, idx){
      //       var loc = Object.assign({}, l || {});
      //       if(!loc.id)   loc.id = 'loc_' + (idx+1);
      //       if(!loc.slot) loc.slot = startSlot;
      //       if(loc.radius == null) loc.radius = defaultRadius;
      //       return loc;
      //     });
      
      //     // personages config + laden
      //     var pcCfg = getCharacterConfig(meta);
      //     var pcUrl = pcCfg.enabled ? resolveRelative(scenarioUrl, pcCfg.source) : null;
      
      //     return safeFetchJSON(pcUrl, []).then(function(personages){
      //       // ✅ hard safety
      //       if(pcCfg && pcCfg.enabled === false) personages = [];
      
      //       var slotOrder = (slots || []).map(function(s){ return s.id; });
      //       var requiredSlots = (slots || []).filter(function(s){ return !!s.required; }).map(function(s){ return s.id; });
      
      //       return {
      //         meta: meta,
      //         settings: settings,
      //         prestart: prestart,
      
      //         stops: locaties,
      //         locaties: locaties,
      
      //         slots: slots,
      //         startSlot: startSlot,
      //         endSlot: endSlot,
      //         slotOrder: slotOrder,
      //         requiredSlots: requiredSlots,
      
      //         personages: Array.isArray(personages) ? personages : [],
      //         characters: pcCfg
      //       };
      //     });
      //   });
      // }
  
  


    // Globale errors
    window.addEventListener('error', function(e){ showDiag('JS error: '+e.message); });
    window.addEventListener('unhandledrejection', function(e){
      showDiag('Promise error: '+(e.reason && e.reason.message ? e.reason.message : e.reason));
    });
  
  })();
  