'use strict';
(function(){
 const KEYS=['routebook-command-v1','routebook-assistant-v1','routebook-reservations-v1','routebook-variants-v1','routebook-pass-v2'];let raw;try{raw=window.localStorage;}catch(_){}
 const get=k=>raw?.getItem(k)??null,set=(k,v)=>{if(!raw)throw Error('기기 저장을 사용할 수 없습니다.');raw.setItem(k,v);};
 const account=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{2,31}$/.test(value)?value:'guest';
 let user='guest';try{user=account(JSON.parse(get('routebook-login-v1')||'null')?.user);}catch(_){}
 const prefix=(k,u=user)=>u==='guest'?k:'routebook-account:'+u+':'+k;
 const storage={getItem(k){const value=get(prefix(k));return KEYS.includes(k)&&user!=='guest'&&value===null&&!get('routebook-records-owner-v1')?get(k):KEYS.includes(k)?value:get(k);},setItem(k,v){set(KEYS.includes(k)?prefix(k):k,String(v));if(KEYS.includes(k))window.dispatchEvent(new Event('routebook:record-write'));},removeItem(k){raw?.removeItem(KEYS.includes(k)?prefix(k):k);if(KEYS.includes(k))window.dispatchEvent(new Event('routebook:record-write'));}};
 const database=(u=user)=>u==='guest'?'routebook-private-files-v1':'routebook-private-files-account-'+u;
 async function db(u=user){return new Promise((resolve,reject)=>{const r=indexedDB.open(database(u),1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('첨부 저장소를 열 수 없습니다.'));});}
 async function files(u=user){const d=await db(u);try{return await new Promise((resolve,reject)=>{const r=d.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('첨부 조회 실패'));});}finally{d.close();}}
 async function replaceFiles(values,u=user){const d=await db(u);try{await new Promise((resolve,reject)=>{const tx=d.transaction('files','readwrite'),s=tx.objectStore('files');s.clear();for(const f of values)s.put(f);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('첨부 저장 실패'));});}finally{d.close();}}
 window.AccountRecords={storage,database,scope:()=>user};
 let api,ready=false,busy=false,again=false,epoch=0,timer,remote=null,state='기기에 저장됨',applying=false,writeGeneration=0;
 const metaKey=()=>prefix('routebook-sync-meta-v1'),meta=()=>{try{const m=JSON.parse(get(metaKey())||'{}');if(m.base)m.base=fingerprint(JSON.parse(m.base));return m;}catch(_){return {};}};
 function status(text){state=text;const p=document.querySelector('#personalSyncStatus');if(p)p.textContent=text;window.dispatchEvent(new Event('routebook:sync-status'));}
 function conflict(show){const el=document.querySelector('#personalSyncConflict');if(el)el.hidden=!show;}
 const snapshot=()=>Object.fromEntries(KEYS.map(k=>[k,storage.getItem(k)]).filter(([,v])=>v!==null));
 const fingerprint=value=>Array.isArray(value)?'['+value.map(fingerprint).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+fingerprint(value[k])).join(',')+'}':JSON.stringify(value);
 const hasRecords=payload=>{if(payload.files.length)return true;for(const k of KEYS.slice(0,3)){const raw=payload.storage[k];if(!raw)continue;const v=JSON.parse(raw);if(k==='routebook-reservations-v1'&&Object.keys(v).length)return true;if(k==='routebook-command-v1'&&(Object.keys(v.notes||{}).length||Object.keys(v.plans||{}).length||Object.keys(v.bookings||{}).length||v.reminders?.length))return true;if(k==='routebook-assistant-v1'&&(v.expenses?.length||Object.keys(v.visits||{}).length||Object.keys(v.packing||{}).length||v.adjustments?.length||v.budget?.JPY||v.budget?.KRW))return true;}return false;};

 async function hash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
 async function capture(){const values=await files(),metadata=[];for(const f of values)metadata.push({id:f.id,owner:f.owner,name:f.name,bytes:f.data.length,hash:await hash(f.data)});return {payload:{storage:snapshot(),files:metadata},files:values};}
 const request=(path,body)=>TravelAssistant.recordsRequest(path,body);
 function reload(changed=false){if(changed){window.OriginalSidebar?.clearDrafts();window.ExpenseUI?.clearDrafts();}TravelAssistant.reloadPersonal();window.ReservationUI?.reloadRecords();window.CommandCenter?.reloadPersonal();api?.reloadPreferences?.();window.dispatchEvent(new Event('routebook:personal-change'));}
 async function migrate(u){
  if(u==='guest'||get('routebook-records-owner-v1'))return;
  const old=await files('guest');for(const k of KEYS){const value=get(k);if(value!==null&&get(prefix(k,u))===null)set(prefix(k,u),value);}
  await replaceFiles(old,u);await replaceFiles([],'guest');set('routebook-records-owner-v1',u);for(const k of KEYS)raw?.removeItem(k);
 }
 async function switchAccount(auth){const next=auth.authenticated?account(auth.user):'guest',changed=next!==user;const ticket=++epoch;remote=null;conflict(false);if(changed){user=next;reload(true);}try{await migrate(next);if(ticket!==epoch)return;if(next!=='guest')reload();}catch(_){status('기존 자료 연결 실패 · 기기 백업을 확인하세요.');return;}if(next==='guest'){status('기기에 저장됨 · 로그인하면 계정에 동기화');return;}await sync();}
 async function apply(payload,version,updatedAt,ticket){
  const generation=writeGeneration;
  const downloaded=[];for(const f of payload.files){const data=await request('/records/file?id='+encodeURIComponent(f.id));if(data.hash!==f.hash||await hash(data.data)!==f.hash)throw Error('첨부 무결성 확인 실패');downloaded.push({id:f.id,owner:f.owner,name:f.name,data:data.data});}
  if(ticket!==epoch)return;if(generation!==writeGeneration){const error=Error('동기화 중 기기 수정');error.status=409;throw error;}CommandCore.parseBackup({format:'routebook-personal-backup',version:1,storage:payload.storage,attachments:downloaded});const previous=snapshot(),oldFiles=await files();applying=true;
  try{await replaceFiles(downloaded);for(const k of KEYS){if(Object.hasOwn(payload.storage,k))set(prefix(k),payload.storage[k]);else raw?.removeItem(prefix(k));}set(metaKey(),JSON.stringify({revision:version,base:fingerprint(payload),updatedAt}));reload();}
  catch(error){await replaceFiles(oldFiles);for(const k of KEYS){if(Object.hasOwn(previous,k))set(prefix(k),previous[k]);else raw?.removeItem(prefix(k));}reload();throw error;}finally{applying=false;}
 }
 async function push(local,version,ticket){for(const f of local.files){const info=local.payload.files.find(x=>x.id===f.id);await request('/records/file',{...info,data:f.data});if(ticket!==epoch)return;}const result=await request('/records',{revision:version,payload:local.payload});if(ticket!==epoch)return;set(metaKey(),JSON.stringify({revision:result.revision,base:fingerprint(local.payload),updatedAt:result.updatedAt}));}
 async function sync(choice){
  if(!ready||user==='guest')return;if(!navigator.onLine){status('오프라인 · 기기에 저장됨 · 연결되면 동기화');return;}if(busy){again=true;return;}busy=true;const ticket=epoch;status('계정 자료 동기화 중…');
  try{const local=await capture(),saved=meta(),server=await request('/records');if(ticket!==epoch)return;
   const own=fingerprint(local.payload),other=server.payload?fingerprint(server.payload):'',empty=!saved.revision&&!hasRecords(local.payload);
   if(choice==='server'&&server.payload){await apply(server.payload,server.revision,server.updatedAt,ticket);}
   else if(choice==='local'||!server.payload){await push(local,server.revision,ticket);}
   else if(own===other){set(metaKey(),JSON.stringify({revision:server.revision,base:own,updatedAt:server.updatedAt}));}
   else if(own===saved.base||empty){if(document.activeElement?.matches('textarea,input:not([type=checkbox]):not([type=radio])')&&!document.activeElement.closest('#accountDialog')){status('입력 중 · 입력을 마친 뒤 동기화합니다.');return;}await apply(server.payload,server.revision,server.updatedAt,ticket);}
   else if(server.revision===saved.revision){await push(local,server.revision,ticket);}
   else{remote=server;conflict(true);status('두 기기의 수정이 충돌했어요. 아래에서 사용할 자료를 선택하세요.');return;}
   if(ticket!==epoch)return;conflict(false);remote=null;const latest=meta();status('계정 동기화 완료 · '+new Date(latest.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Tokyo'}));
  }catch(error){if(ticket===epoch){if(error.status===409){remote={};conflict(true);status('다른 기기의 변경과 충돌 · 기록은 기기에 보관 중');}else status((navigator.onLine?'동기화 실패 · 기기 기록 보관 중':'오프라인 · 기기에 저장됨')+' · 다시 시도할 수 있어요.');}}
  finally{busy=false;if(again){again=false;clearTimeout(timer);timer=setTimeout(()=>sync(),1500);}}
 }
 function dirty(){writeGeneration++;if(applying||!ready)return;status(user==='guest'?'기기에 저장됨 · 로그인하면 계정에 동기화':'기기에 저장됨 · 동기화 대기');clearTimeout(timer);timer=setTimeout(()=>sync(),1500);}
 function init(value){if(ready)return;api=value;ready=true;const body=document.querySelector('#ccRecordsDialog .cc-dialog-body');if(body){const section=document.createElement('section');section.className='personal-sync';section.innerHTML='<h3>계정 동기화</h3><p id="personalSyncStatus" role="status"></p><button type="button" id="personalSyncNow">지금 동기화</button><div id="personalSyncConflict" hidden><p>자동으로 덮어쓰지 않았어요. 기기 백업을 저장한 뒤 사용할 자료를 선택하세요.</p><button type="button" id="personalSyncServer">서버 자료 사용</button><button type="button" id="personalSyncLocal">이 기기 자료 사용</button></div><small>방문·경비·메모·예약·준비물·첨부를 계정에 저장합니다. GPS와 AI 채팅은 동기화하지 않습니다.</small>';body.prepend(section);document.querySelector('#personalSyncNow').onclick=()=>{if(user==='guest')window.RouteAccount?.open('login');else sync();};document.querySelector('#personalSyncServer').onclick=()=>sync('server');document.querySelector('#personalSyncLocal').onclick=()=>sync('local');}
  window.addEventListener('routebook:auth-change',e=>switchAccount(e.detail));window.addEventListener('routebook:record-write',dirty);window.addEventListener('online',()=>sync());window.addEventListener('storage',e=>{if(KEYS.some(k=>e.key===prefix(k))){reload();dirty();}});document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});setInterval(()=>{if(!document.hidden&&!remote)sync();},60000);switchAccount(TravelAssistant.getAuth());
 }
 window.PersonalSync={init,statusText:()=>state,sync};
})();
