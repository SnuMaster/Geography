'use strict';
(async()=>{
 const frame=document.querySelector('#app'),run=document.querySelector('#run'),results=document.querySelector('#results'),status=document.querySelector('#status');
 const qa=window.stateQA={storage:new Map(),clock:Date.parse('2027-01-09T18:00:00+09:00'),mockGPS:true,mockOrientation:true,orientationResult:'granted',hidden:false};
 let total=0,failed=0,nonce=0;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m);};
 async function until(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(50);}throw Error('검증 대기 시간 초과');}
 async function load(width=390){qa.clock=Date.parse('2027-01-09T18:00:00+09:00');qa.orientationCalls=0;qa.hidden=false;frame.width=width;frame.style.width=width+'px';frame.src='state-fixture.html?day=2&qa=gps-'+(++nonce);await until(()=>frame.contentWindow.location.search.includes('gps-'+nonce)&&frame.contentDocument.querySelector('#ridePanel'));return frame.contentWindow;}
 function gps(w,{heading=null,speed=0,accuracy=10}={}){qa.gpsReceiver({timestamp:qa.clock,coords:{latitude:35.7148,longitude:139.7966,accuracy,heading,speed}});}
 function orientation(w,data){const event=new w.Event('deviceorientation');for(const [key,value]of Object.entries(data))Object.defineProperty(event,key,{value});w.dispatchEvent(event);}
 async function report(name,fn){total++;const li=document.createElement('li');try{await fn();li.textContent='PASS · '+name;}catch(e){failed++;li.className='fail';li.textContent='FAIL · '+name+' · '+e.message;}results.appendChild(li);status.textContent=`${total-failed}/${total} 통과 · 실패 ${failed}`;}
 run.onclick=async()=>{run.disabled=true;results.replaceChildren();total=failed=0;
  for(const width of [320,390,768,1280])await report(width+'px 접힌 일정·열기·닫기·가로 넘침',async()=>{
   qa.storage.clear();const w=await load(width),d=w.document;check(d.querySelector('#itineraryPanel').hidden,'기본 일정이 펼쳐짐');check(d.body.dataset.mapStyle==='simple','기본 지도 불일치');
   const before=d.querySelector('#map').getBoundingClientRect().width;d.querySelector('#itineraryToggle').click();check(!d.querySelector('#itineraryPanel').hidden,'일정 열기 실패');check(d.querySelector('#itineraryClose').getBoundingClientRect().height>=44,'닫기 터치 영역 부족');check(d.documentElement.scrollWidth<=width+1,'가로 넘침');
   d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));check(d.querySelector('#itineraryPanel').hidden,'Escape 닫기 실패');check(d.activeElement===d.querySelector('#itineraryToggle'),'포커스 복귀 실패');check(d.querySelector('#map').getBoundingClientRect().width>=before-1,'지도 폭 복구 실패');
  });
  await report('단순한 지도와 상세한 지도 선택·재방문 유지',async()=>{
   let w=await load(),d=w.document;d.querySelector('#settingsBtn').click();const select=d.querySelector('#mapAppearance');select.value='detailed';select.dispatchEvent(new w.Event('change',{bubbles:true}));check(d.body.dataset.mapStyle==='detailed','상세 미적용');w=await load();d=w.document;check(d.body.dataset.mapStyle==='detailed','상세 선택 유실');d.querySelector('#settingsBtn').click();const next=d.querySelector('#mapAppearance');next.value='simple';next.dispatchEvent(new w.Event('change',{bubbles:true}));d.querySelector('#closeSettings').click();check(d.body.dataset.mapStyle==='simple','단순 복귀 실패');
  });
  await report('iPhone 방향 권한·정지 중 나침반·상대 alpha 거부',async()=>{
   qa.orientationResult='granted';const w=await load(),d=w.document;d.querySelector('#locationBtn').click();check(qa.orientationCalls===1&&qa.absolutePermission===true,'클릭 시 절대 방향 권한 미요청');await sleep(20);gps(w);orientation(w,{alpha:90,absolute:false});await sleep(40);check(d.querySelector('.gps-heading-cone').hidden,'상대 방향을 북쪽으로 오인');orientation(w,{webkitCompassHeading:90,webkitCompassAccuracy:8});await until(()=>d.querySelector('.gps-location-marker').dataset.heading==='90');check(d.querySelector('#locationDirection').textContent.includes('휴대폰 방향 · 동 90°'),'방향 안내 불일치');check(!d.querySelector('.gps-heading-cone').hidden,'부채꼴 숨김');w.RouteLocation.stop();check(!d.querySelector('.gps-location-marker'),'종료 후 위치 잔류');
  });
  await report('나침반 거절에도 위치와 이동 방향 유지·정지 시 방향 숨김',async()=>{
   qa.orientationResult='denied';const w=await load(),d=w.document;d.querySelector('#locationBtn').click();await sleep(20);gps(w,{speed:1,heading:180});check(d.querySelector('.gps-location-marker').dataset.headingSource==='gps','GPS 진행 방향 미표시');check(d.querySelector('#locationDirection').textContent.includes('이동 방향 · 남 180°'),'센서 방향과 GPS 혼동');qa.clock+=1000;gps(w,{speed:0,heading:180});check(d.querySelector('.gps-heading-cone').hidden,'정지 중 GPS 방향 잔류');check(!d.querySelector('#locationCompass').hidden,'방향 권한 재시도 불가');w.RouteLocation.stop();
  });
  await report('만료·화면 숨김·중지 후 늦은 권한 응답 정리',async()=>{
   qa.orientationResult='granted';let w=await load(),d=w.document;w.RouteLocation.start();await sleep(20);gps(w);orientation(w,{webkitCompassHeading:0,webkitCompassAccuracy:5});await until(()=>d.querySelector('.gps-location-marker').dataset.heading==='0');qa.hidden=true;d.dispatchEvent(new w.Event('visibilitychange'));check(d.querySelector('.gps-heading-cone').hidden,'숨김 중 방향 유지');qa.hidden=false;qa.clock+=31000;d.dispatchEvent(new w.Event('visibilitychange'));check(d.querySelector('.gps-heading-cone').hidden,'오래된 위치 방향 유지');w.RouteLocation.stop();qa.orientationResult='pending';w=await load();d=w.document;w.RouteLocation.start();w.RouteLocation.stop();qa.resolveOrientation('granted');await sleep(20);orientation(w,{webkitCompassHeading:270,webkitCompassAccuracy:5});check(!d.querySelector('.gps-location-marker'),'종료 후 센서 재활성화');
  });
  status.textContent=`완료 · ${total-failed}/${total} 통과 · 실패 ${failed}`;run.disabled=false;
 };
 await load();run.disabled=false;run.dataset.ready='true';
})();
