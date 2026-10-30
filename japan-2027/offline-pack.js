'use strict';
(function(){
 const REVISION='20261030-travel-2',RECORD='routebook-offline-pack-v1';
 let manifest=null,running=null,finalize=null,streetRunning=null;
 const $=s=>document.querySelector(s),format=n=>(n/1048576).toFixed(1)+' MB';
 const streetDate=map=>map.generatedAt?Date.parse(map.generatedAt):Number(map.savedAt);
 function record(){try{return JSON.parse(localStorage.getItem(RECORD)||'null');}catch(_){return null;}}
 function render({status=true}={}){const saved=record(),ready=saved?.revision===REVISION&&saved.complete;
  const button=$('#offlinePackBtn');if(button)button.textContent=running?'오프라인 저장 중':ready?'오프라인 준비됨':'오프라인 저장';
  const node=$('#offlinePackStatus');if(status&&node&&!running)node.textContent=ready?'이 브라우저에 전체 자료 저장 완료 · '+new Date(saved.savedAt).toLocaleDateString('ko-KR'):'처음 한 번 온라인에서 전체 자료를 저장해 주세요.';
 }
 function validate(value){if(value?.revision!==REVISION||!Array.isArray(value.files)||!value.files.length)throw Error('저장 목록 버전이 맞지 않습니다. 새로고침해 주세요.');
  for(const f of value.files){const u=new URL(f.path,document.baseURI);if(u.origin!==location.origin||!u.pathname.startsWith(new URL('./',document.baseURI).pathname)||!/^\w{64}$/.test(f.sha256)||!['json','shell'].includes(f.kind))throw Error('저장 목록을 확인할 수 없습니다.');}return value;
 }
 async function getManifest(){if(!manifest)manifest=validate(await TravelStore.readJson('offline-manifest.json?v='+REVISION));return manifest;}
 async function hash(response){const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
 function locationFor(file){const u=new URL(file.path,document.baseURI);if(file.kind==='json')u.search='v='+TravelStore.VERSION;return u.href;}
 async function prepareWorker(signal){
  if(!('serviceWorker'in navigator)||window.frameElement)throw Error('오프라인 저장은 이 사이트를 일반 브라우저 탭에서 열어 사용해 주세요.');
  const registration=await navigator.serviceWorker.register('sw.js?v='+REVISION,{scope:'./'});await registration.update();
  const deadline=Date.now()+30000;
  while(!registration.active?.scriptURL.endsWith('v='+REVISION)){if(signal.aborted)throw new DOMException('중단','AbortError');if(Date.now()>deadline)throw Error('오프라인 실행 준비가 지연됩니다. 잠시 후 다시 저장해 주세요.');await new Promise(r=>setTimeout(r,100));}
  await navigator.serviceWorker.ready;
 }
 async function verifyStored(){
  const saved=record();if(!saved?.complete||saved.revision!==REVISION)return false;
  try{const list=await getManifest(),publicCache=await TravelStore.cache(),shell=await caches.open('routebook-shell-'+REVISION);
   for(const f of list.files)if(!await(f.kind==='json'?publicCache:shell).match(locationFor(f)))throw Error('missing');
   return true;
  }catch(_){try{localStorage.setItem(RECORD,JSON.stringify({...saved,complete:false}));}catch(_){}render();return false;}
 }
 async function start(){if(running)return running.promise;
  const controller=new AbortController(),state=running={controller,done:0,total:0,bytes:0,promise:null};render();$('#offlinePackStart').disabled=true;$('#offlinePackCancel').hidden=false;
  state.promise=(async()=>{
   try{
    const list=await getManifest();state.total=list.files.length;$('#offlinePackProgress').max=state.total;
    await prepareWorker(controller.signal);
    const publicCache=await TravelStore.cache();if(!publicCache)throw Error('브라우저 저장 공간을 사용할 수 없습니다.');
    const shell=await caches.open('routebook-shell-'+REVISION);
    TravelStore.pinFiles(list.files.filter(f=>f.kind==='json').map(f=>f.path));
    localStorage.setItem(RECORD,JSON.stringify({revision:REVISION,complete:false}));
    let cursor=0;const failures=[];
    const worker=async()=>{while(cursor<list.files.length&&!controller.signal.aborted){const file=list.files[cursor++],target=file.kind==='json'?publicCache:shell,id=locationFor(file);
     try{const old=await target.match(id);if(!old||await hash(old.clone())!==file.sha256){const timeout=new AbortController(),stop=()=>timeout.abort();controller.signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,30000);let response;
       try{response=await fetch(file.path,{signal:timeout.signal,cache:'no-cache'});if(!response.ok||await hash(response.clone())!==file.sha256)throw Error('자료 확인 실패');await target.put(id,response);}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);}}
      state.done++;state.bytes+=file.bytes;$('#offlinePackProgress').value=state.done;$('#offlinePackStatus').textContent=`${state.done}/${state.total}개 저장 · ${format(state.bytes)} / ${format(list.totalBytes)}`;
     }catch(error){failures.push(file.path);if(controller.signal.aborted)break;}
    }};
    await Promise.all([worker(),worker(),worker()]);
    if(controller.signal.aborted)throw new DOMException('중단','AbortError');
    if(failures.length)throw Error(failures.length+'개 자료 저장 실패 · 다시 저장하면 이어서 확인합니다.');
    // The navigation fallback uses index.html; './' is an additional convenience entry.
    const index=await shell.match(new URL('index.html',document.baseURI).href);if(index)await shell.put(new URL('./',document.baseURI).href,index);
    if(!finalize)throw Error('일정 자료가 준비된 다음 다시 저장해 주세요.');await finalize();
    localStorage.setItem(RECORD,JSON.stringify({revision:REVISION,complete:true,savedAt:Date.now(),files:state.done,bytes:state.bytes}));
    $('#offlinePackStatus').textContent='저장 완료 · 인터넷을 꺼도 전체 일정·장소·경로·길 안내·시간표·간략 지도를 사용할 수 있어요.';
    window.dispatchEvent(new Event('routebook:offline-ready'));return true;
   }catch(error){$('#offlinePackStatus').textContent=error.name==='AbortError'?'저장을 중단했어요. 다시 누르면 저장한 파일부터 확인합니다.':error.message;return false;}
   finally{running=null;$('#offlinePackStart').disabled=false;$('#offlinePackCancel').hidden=true;render({status:false});}
  })();return state.promise;
 }
 async function saveStreets(){
  if(streetRunning)return;const trip=window.__routebook?.state;if(!trip?.data?.days?.length){$('#offlineStreetStatus').textContent='일정이 준비된 뒤 다시 시도해 주세요.';return;}
  const controller=new AbortController();streetRunning=controller;$('#offlineStreetStart').disabled=true;$('#offlineStreetCancel').hidden=false;
  const days=trip.data.days;let ok=0,fail=[],oldest=null;
  try{for(const day of days){
   if(controller.signal.aborted)break;
   $('#offlineStreetStatus').textContent=`상세 지도 ${ok}/${days.length}일 저장 · ${day.date} 처리 중`;
   const existing=await OfflineRoads.get(day.n);if(existing&&Date.now()-existing.savedAt<30*86400000&&OfflineRoads.covers(existing,OfflineRoads.centres(day,trip.routeData))){ok++;const date=streetDate(existing);if(Number.isFinite(date))oldest=Math.min(oldest??date,date);continue;}
   try{const saved=await OfflineRoads.save(day,trip.routeData,{signal:controller.signal,progress:(part,total)=>{$('#offlineStreetStatus').textContent=`상세 지도 ${ok}/${days.length}일 저장 · ${day.date} ${part}/${total}구역 완료`;}});ok++;const date=streetDate(saved);if(Number.isFinite(date))oldest=Math.min(oldest??date,date);if(!saved.generatedAt)await new Promise(resolve=>setTimeout(resolve,2000));}catch(e){if(controller.signal.aborted)break;fail.push({date:day.date||String(day.n),message:e.name==='AbortError'?'지도 서버 응답 시간 초과':e.message});break;}
  }
  if(controller.signal.aborted)$('#offlineStreetStatus').textContent=`상세 지도 저장 중단 · ${ok}/${days.length}일 저장됨. 다시 누르면 이어서 저장해요.`;
  else if(fail.length)$('#offlineStreetStatus').textContent=`${ok}/${days.length}일 저장 · ${fail[0].date}에서 중단 · ${fail[0].message}. 다시 누르면 저장한 구역 다음부터 진행해요.`;
  else $('#offlineStreetStatus').textContent=`상세 지도 ${ok}/${days.length}일 저장 완료 · 일정 주변 도로와 철도를 오프라인에서 볼 수 있어요.${oldest?' 지도 자료 준비일: '+new Date(oldest).toLocaleDateString('ko-KR')+'.':''}`;
  window.OfflineMap?.invalidate();window.dispatchEvent(new Event('routebook:offline-roads-ready'));
  }finally{streetRunning=null;$('#offlineStreetStart').disabled=false;$('#offlineStreetCancel').hidden=true;}
 }
 async function show(){RouteUI.showDialog($('#offlinePackDialog'));render();try{const list=await getManifest();$('#offlinePackSize').textContent='약 '+format(list.totalBytes)+' · 전체 '+list.files.length+'개 자료';}catch(e){$('#offlinePackSize').textContent=e.message;}
  const info=await window.OfflineRoads?.bundleInfo();const size=$('#offlineStreetSize');if(size)size.textContent=info?.days===22?`상세 지도 전체 약 ${format(info.storedBytes)} 저장 공간 · 다운로드 약 ${format(info.downloadBytes)}`:'';
 }
 document.addEventListener('DOMContentLoaded',()=>{
  $('#offlineStreetStart').addEventListener('click',saveStreets);$('#offlineStreetCancel').addEventListener('click',()=>streetRunning?.abort());
  $('#offlinePackBtn').addEventListener('click',show);$('#offlinePackStart').addEventListener('click',start);$('#offlinePackCancel').addEventListener('click',()=>running?.controller.abort());
  $('#offlinePackClose').addEventListener('click',()=>{$('#offlinePackDialog').close();RouteUI.release($('#offlinePackDialog'));});render();if(record()?.complete)verifyStored();
 });
 window.OfflinePack={REVISION,start,show,verifyStored,configure:options=>{finalize=options.finalize;},record};
})();
