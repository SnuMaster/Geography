'use strict';
// Only public itinerary/timetable files are cached. GPS observations never enter disk storage.
(function(){
 const VERSION='20261025-final-4a',CACHE=(window.frameElement?'routebook-qa-public-':'routebook-public-')+VERSION,META='routebook-updated-v1',meta={},pending=new Map();
 let stale=new Set(),lastUpdate=0,storageAvailable=true,dbPromise=null;try{Object.assign(meta,JSON.parse(localStorage.getItem(META)||'{}'));}catch(_){}
 function key(url){return new URL(url,document.baseURI).href;}
 function status(){const el=document.querySelector('#offlineStatus');if(!el)return;const offline=!navigator.onLine||stale.size>0,values=Object.values(meta).filter(Number.isFinite);lastUpdate=values.length?Math.min(...values):0;el.dataset.offline=String(offline);el.textContent=(offline?'저장 자료 표시 · 오프라인/통신 불안정':storageAvailable?'현장 자료 · 이 브라우저에 저장':'온라인 자료 · 브라우저 저장 사용 불가')+(lastUpdate?' · 자료 갱신 '+new Date(lastUpdate).toLocaleString('ko-KR',{timeZone:'Asia/Tokyo'}):' · 아직 저장되지 않은 자료는 통신 필요')+' · 시간표는 예정 시각·실시간 지연 미반영';}
 async function fallbackCache(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(CACHE,1);r.onupgradeneeded=()=>r.result.createObjectStore('responses');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const db=await dbPromise;
  const transaction=(mode,fn)=>new Promise((resolve,reject)=>{const tx=db.transaction('responses',mode),request=fn(tx.objectStore('responses'));let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);});
  return {match:async id=>{const r=await transaction('readonly',s=>s.get(typeof id==='string'?id:id.url));return r?new Response(r.body,{headers:r.headers}):undefined;},put:async(id,response)=>{const body=await response.text(),headers=[...response.headers];await transaction('readwrite',s=>s.put({body,headers},typeof id==='string'?id:id.url));},keys:async()=> (await transaction('readonly',s=>s.getAllKeys())).map(url=>new Request(url)),delete:async request=>transaction('readwrite',s=>s.delete(typeof request==='string'?request:request.url))};
 }
 async function cache(){try{return await caches.open(CACHE);}catch(_){try{return await fallbackCache();}catch(_){storageAvailable=false;return null;}}}
 async function readJson(url,{timeout=12000,preferCache=false}={}){
  const id=key(url),c=await cache(),old=await c?.match(id);
  if(pending.has(id))return preferCache&&old?old.clone().json():pending.get(id);
  const task=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw Error('data unavailable');const data=await response.clone().json();if(c)try{await c.put(id,response);storageAvailable=true;}catch(_){storageAvailable=false;}meta[id]=Date.now();stale.delete(id);try{localStorage.setItem(META,JSON.stringify(meta));}catch(_){}status();return data;}catch(error){if(old){stale.add(id);status();return old.clone().json();}throw error;}finally{clearTimeout(timer);pending.delete(id);}})();pending.set(id,task);
  if(preferCache&&old){task.catch(()=>{});return old.clone().json();}return task;
 }
 async function saveSnapshot(data,routes){if(window.frameElement)return;const c=await cache();if(c)try{await c.put(key('saved-trip-snapshot.json'),new Response(JSON.stringify({version:VERSION,data,routes,updatedAt:Date.now()}),{headers:{'Content-Type':'application/json'}}));}catch(_){storageAvailable=false;status();}}
 async function snapshot(){if(window.frameElement)return null;try{const c=await cache(),r=await c?.match(key('saved-trip-snapshot.json'));if(r){return r.json();}}catch(_){}return null;}
 async function trimTimetables(){const c=await cache();if(!c)return;const files=(await c.keys()).filter(r=>new URL(r.url).pathname.includes('/timetables/'));files.sort((a,b)=>(meta[b.url]||0)-(meta[a.url]||0));let activeFile=null;try{const record=JSON.parse(localStorage.getItem('routebook-boarded-train-v1')||'null');activeFile=globalThis.RailDepartureProfiles?.profiles[record?.key]?.file;}catch(_){}for(const r of files.slice(12)){if(activeFile&&new URL(r.url).pathname.endsWith('/'+activeFile))continue;await c.delete(r);delete meta[r.url];}}
 async function register(){if(!('serviceWorker'in navigator)||window.frameElement)return;try{const registration=await navigator.serviceWorker.register('sw.js?v='+VERSION,{scope:'./'});await registration.update();}catch(_){}status();}
 window.addEventListener('online',()=>{stale.clear();status();window.dispatchEvent(new Event('routebook:online'));});window.addEventListener('offline',status);document.addEventListener('DOMContentLoaded',register);
 window.TravelStore={markStale:()=>{stale.add('snapshot');status();},readJson,saveSnapshot,snapshot,trimTimetables,status,VERSION};
})();
