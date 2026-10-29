'use strict';
// Only public itinerary/timetable files are cached. GPS observations never enter disk storage.
(function(){
 // Keep the existing data cache: the schema is unchanged; the shell has its own revision.
 const VERSION='20261025-final-4a',CACHE=(window.frameElement?'routebook-qa-public-':'routebook-public-')+VERSION,META='routebook-updated-v1',meta={},pending=new Map();
 let stale=new Set(),displayedAt=null,hasDisplayedData=false,pendingSnapshot=null,storageAvailable=true,dbPromise=null;try{Object.assign(meta,JSON.parse(localStorage.getItem(META)||'{}'));}catch(_){}
 function key(url){return new URL(url,document.baseURI).href;}
 function status(){
  const el=document.querySelector('#offlineStatus');if(!el)return;
  const offline=!navigator.onLine||stale.size>0;el.dataset.offline=String(offline);
  let label=el.querySelector('[data-store-label]');
  if(!label){el.textContent='';label=document.createElement('span');label.dataset.storeLabel='';el.append(label);}
  label.textContent=(pendingSnapshot?'새 일정 대기 · 현재 작업 후 자동 적용':offline?'저장 자료 표시 · 오프라인/통신 불안정':storageAvailable?'현장 자료 · 이 브라우저에 저장':'온라인 자료 · 브라우저 저장 사용 불가')+(displayedAt?' · 표시 자료 확인 '+new Date(displayedAt).toLocaleString('ko-KR',{timeZone:'Asia/Tokyo'}):hasDisplayedData?' · 표시 자료 확인 시각 미확인':' · 일정 자료 확인 중')+' · 시간표는 예정 시각·실시간 지연 미반영';
 }
 function useSnapshot(value){hasDisplayedData=true;displayedAt=Number.isFinite(value?.updatedAt)?value.updatedAt:null;pendingSnapshot=null;stale.delete('snapshot');status();}
 function offerSnapshot(value){pendingSnapshot=value;stale.delete('snapshot');status();window.dispatchEvent(new CustomEvent('routebook:trip-update-ready',{detail:value}));}

 async function fallbackCache(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(CACHE,1);r.onupgradeneeded=()=>r.result.createObjectStore('responses');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const db=await dbPromise;
  const transaction=(mode,fn)=>new Promise((resolve,reject)=>{const tx=db.transaction('responses',mode),request=fn(tx.objectStore('responses'));let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);});
  return {match:async id=>{const r=await transaction('readonly',s=>s.get(typeof id==='string'?id:id.url));return r?new Response(r.body,{headers:r.headers}):undefined;},put:async(id,response)=>{const body=await response.text(),headers=[...response.headers];await transaction('readwrite',s=>s.put({body,headers},typeof id==='string'?id:id.url));},keys:async()=> (await transaction('readonly',s=>s.getAllKeys())).map(url=>new Request(url)),delete:async request=>transaction('readwrite',s=>s.delete(typeof request==='string'?request:request.url))};
 }
 async function cache(){try{return await caches.open(CACHE);}catch(_){try{return await fallbackCache();}catch(_){storageAvailable=false;return null;}}}
 async function readJson(url,{timeout=12000,preferCache=false,networkOnly=false}={}){
  const id=key(url),pendingId=id+(networkOnly?'|network':''),c=await cache(),old=await c?.match(id);
  if(pending.has(pendingId))return preferCache&&!networkOnly&&old?old.clone().json():pending.get(pendingId);
  const task=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw Error('data unavailable');const data=await response.clone().json();if(c)try{await c.put(id,response);storageAvailable=true;}catch(_){storageAvailable=false;}meta[id]=Date.now();stale.delete(id);try{localStorage.setItem(META,JSON.stringify(meta));}catch(_){}status();return data;}catch(error){if(old&&!networkOnly){stale.add(id);status();return old.clone().json();}throw error;}finally{clearTimeout(timer);pending.delete(pendingId);}})();pending.set(pendingId,task);
  if(preferCache&&!networkOnly&&old){task.catch(()=>{});return old.clone().json();}return task;
 }
 function checkedAt(urls){const values=urls.map(url=>meta[key(url)]);return values.length&&values.every(Number.isFinite)?Math.min(...values):null;}
 async function saveSnapshot(data,routes,sourceSignature,updatedAt=Date.now()){
  const value={version:VERSION,data,routes,sourceSignature,updatedAt};
  if(!window.frameElement){const c=await cache();if(c)try{await c.put(key('saved-trip-snapshot.json'),new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));}catch(_){storageAvailable=false;status();}}
  return value;
 }

 async function snapshot(){if(window.frameElement)return null;try{const c=await cache(),r=await c?.match(key('saved-trip-snapshot.json'));if(r){return r.json();}}catch(_){}return null;}
 function pinned(){try{return new Set(JSON.parse(localStorage.getItem('routebook-offline-pins-v1')||'[]'));}catch(_){return new Set();}}
 function pinFiles(files){localStorage.setItem('routebook-offline-pins-v1',JSON.stringify(files.map(f=>key(f).split('?')[0])));}
 async function readCachedJson(url){const c=await cache(),r=await c?.match(key(url));if(!r)throw Error('저장된 자료가 없습니다.');return r.json();}
 async function trimTimetables(){const c=await cache();if(!c)return;const protectedFiles=pinned(),files=(await c.keys()).filter(r=>new URL(r.url).pathname.includes('/timetables/'));files.sort((a,b)=>(meta[b.url]||0)-(meta[a.url]||0));let activeFile=null;try{const record=JSON.parse(localStorage.getItem('routebook-boarded-train-v1')||'null');activeFile=globalThis.RailDepartureProfiles?.profiles[record?.key]?.file;}catch(_){}for(const r of files.slice(12)){if(protectedFiles.has(r.url.split('?')[0])||activeFile&&new URL(r.url).pathname.endsWith('/'+activeFile))continue;await c.delete(r);delete meta[r.url];}}
 async function register(){if(!('serviceWorker'in navigator)||window.frameElement)return;try{const registration=await navigator.serviceWorker.register('sw.js?v='+(window.OfflinePack?.REVISION||VERSION),{scope:'./'});await registration.update();}catch(_){}status();}
 window.addEventListener('online',()=>{status();window.dispatchEvent(new Event('routebook:online'));});window.addEventListener('offline',status);document.addEventListener('DOMContentLoaded',register);
 window.TravelStore={markStale:()=>{stale.add('snapshot');status();},readJson,readCachedJson,cache,pinFiles,saveSnapshot,snapshot,checkedAt,useSnapshot,offerSnapshot,trimTimetables,status,VERSION};
})();

