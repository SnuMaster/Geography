'use strict';
(function(){
 const KEY='routebook-navigation-v1',$=s=>document.querySelector(s),metres=n=>n>=1000?(n/1000).toFixed(1)+'km':Math.max(0,Math.round(n/5)*5)+'m';
 let ready=false,active=null,timer=null,previous=null,ownsGPS=false,packageReady=false,generation=0,resumeAfter=null;
 const symbols={left:'↰',right:'↱',uturn:'↶',straight:'↑',arrive:'⚑',rail:'⇄',transfer:'⇄',taxi:'↗',flight:'✈',ferry:'⚓',bus:'B'};
 function record(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return v?.version===1&&Number.isInteger(v.day)&&typeof v.variant==='string'&&Number.isInteger(v.index)&&v.index>0?v:null;}catch(_){return null;}}
 function save(){if(!active)return;try{localStorage.setItem(KEY,JSON.stringify({version:1,day:active.day,variant:active.variant,index:active.index}));}catch(_){}}
 function clear(){try{localStorage.removeItem(KEY);}catch(_){}}
 function setText(id,text){const node=$(id);if(node.textContent!==text)node.textContent=text;}
 function refresh(){
  if(!ready)return;const c=focusedContext(),index=focusedIndex(c),saved=record();
  if(active&&(!c||c.day.n!==active.day||c.variant.id!==active.variant||index!==active.index||c.legs[index-1]!==active.source)){stop({clearSaved:false});return;}
  const available=!!c&&!!c.legs[index-1]?.parts?.some(p=>p.coords?.length>1);$('#routeNavigationStart').disabled=!available;
  $('#routeNavigationStart').textContent=saved&&c&&saved.day===c.day.n&&saved.variant===c.variant.id&&saved.index===index?'길 안내 계속':'길 안내';
 }
 function renderScreen(){if(!active)return;const value=NavigationScreen.state(),button=$('#navigationWake');button.disabled=!value.supported;button.setAttribute('aria-pressed',String(value.held));button.textContent=!value.supported?'화면 유지 미지원':value.held?'화면 유지 중':['blocked','released'].includes(value.status)?'화면 유지 재시도':'화면 유지';}
 function renderDirection(){if(!active)return;const heading=RouteLocation.getHeading();setText('#navigationDirection',heading?`${heading.source==='compass'?'휴대폰':'이동'} 방향 · ${RouteMatch.directionName(heading.degrees)} ${Math.round(heading.degrees)%360}°`:$('#locationDirection').textContent||'방향 확인 중');}
 function render(){
  if(!active)return;const fix=RouteLocation.getFix(),status=RouteLocation.getStatus(),value=TripNavigation.guide(active.plan,fix,previous);
  if(status.phase==='denied'||status.phase==='unsupported'){value.state='permission';value.text=status.phase==='denied'?'위치 권한을 허용해 주세요':'이 브라우저에서 위치를 사용할 수 없어요';}
  else if(status.rejectedNotice){value.state='uncertain';value.text='GPS 위치 도약 · 다음 관측을 기다려요';}
  else if(resumeAfter!==null&&(!fix||fix.timestamp<resumeAfter)){value.state='stale';value.text='돌아온 위치를 새로 확인 중…';}
  else if(document.hidden){value.state='stale';value.text='화면을 다시 열면 위치를 확인해요';}
  if(value.match&&['guiding','near','transit','reference','wrongway'].includes(value.state)&&value.match.distanceM<=80+fix.accuracy)previous=value.match;
  const card=$('#navigationCard');card.dataset.state=value.state;
  setText('#navigationInstruction',value.text);
  const actionable=['guiding','near','transit'].includes(value.state);
  setText('#navigationDistance',actionable&&Number.isFinite(value.nextDistanceM)?value.nextDistanceM<12?'바로 앞':metres(value.nextDistanceM)+' 앞':value.state==='off'?metres(value.routeDistanceM)+' · 저장 경로까지':value.state==='reference'?'저장된 이동 정보':value.state==='wrongway'?'진행 방향 확인':'GPS 확인 중');
  setText('#navigationSymbol',symbols[actionable||['reference','wrongway'].includes(value.state)?value.kind:'']||'·');
  const reliable=actionable||['reference','wrongway'].includes(value.state);
  setText('#navigationRemaining',reliable&&Number.isFinite(value.remainingM)?(value.state==='reference'?'참고선 남은 ':'남은 경로 ')+metres(value.remainingM):'남은 거리 확인 중');
  $('#navigationProgress').value=reliable?Math.max(0,active.plan.totalM-value.remainingM):0;
  $('#navigationFollow').textContent=status.following?'내 위치 따라가는 중':'내 위치로';$('#navigationFollow').disabled=!fix;$('#navigationFollow').setAttribute('aria-pressed',String(status.following));
  $('#navigationCompass').hidden=Boolean(RouteLocation.getHeading())||status.orientationPermission==='unsupported';
  $('#navigationArrived').hidden=value.state!=='near';
  const accurate=fix&&Date.now()-fix.timestamp<=30000;setText('#navigationAccuracy',accurate?'GPS ±'+metres(fix.accuracy):'위치 갱신 대기');
  const explanation=value.state==='wrongway'?'경로를 거꾸로 이동하는 흐름이 이어지고 있어요. 안전한 곳에서 진행 방향을 확인하세요.':value.state==='off'?'안전한 보행로로 저장 경로에 돌아와 주세요. 새 경로를 자동으로 만들지는 않아요.':value.state==='transit'?`${value.part.line||'철도'} · 승하차는 현장 안내와 탑승 열차에서 확인하세요.`:value.state==='reference'?'개략선·역내 통로·차량 이동은 회전 안내를 하지 않아요. 현장 안내를 확인하세요.':value.state==='permission'?'브라우저의 이 사이트 위치 권한을 허용한 뒤 ‘위치 다시 시도’를 눌러 주세요.':value.state==='stale'||value.state==='uncertain'?'화면을 켜고 GPS가 다시 잡힐 때까지 기다려 주세요.':'저장된 보행 경로 기준 · 실제 표지판과 횡단보도를 따라 이동하세요.';
  setText('#navigationNote',explanation);$('#navigationRetry').hidden=!['permission'].includes(value.state);
  setText('#navigationOffline',navigator.onLine?packageReady?'오프라인 준비됨':'출발 전 오프라인 저장':packageReady?'오프라인 길 안내':'오프라인 · 열린 경로 안내');
  renderDirection();renderScreen();
 }
 function steps(){
  const list=$('#navigationSteps');list.replaceChildren();
  for(const p of active.plan.parts){
   const li=document.createElement('li');li.textContent=p.walkPath?`${p.from||active.plan.from} → ${p.to||active.plan.to} · 도보`:p.mode==='transfer'?`${p.to} · 현장 표지판 확인`:`${p.line||p.mode} · ${p.from} → ${p.to}`;list.append(li);
   for(const cue of active.plan.cues.filter(c=>c.partIndex===p.index)){const item=document.createElement('li');item.textContent=metres(cue.atM-p.startM)+' 지점 · '+cue.text;item.className='navigation-step-turn';list.append(item);}
  }
 }
 function start(){
  let c=focusedContext(),index=focusedIndex(c);if(!c||index===null)return;
  const inheritedOwnership=!!active&&ownsGPS;if(active)stop({clearSaved:false,keepGPS:true});
  if(state.view==='overview'){const target={day:c.day.n,variant:c.variant.id,view:'daily'};navigateScreen(target);setFocusedLeg(index);c=focusedContext();}
  const leg=c.legs[index-1],plan=TripNavigation.build(leg);if(!plan.segments.length){announce('이 구간의 저장 경로가 없어요.');return;}
  RouteUI.userExplore();stopPlay();DetailView.close();ItineraryDrawer.close();routeAll=false;applyRouteFocus();
  ownsGPS=inheritedOwnership||!RouteLocation.isActive();active={day:c.day.n,variant:c.variant.id,index,plan,source:leg};previous=null;resumeAfter=null;generation++;packageReady=false;
  document.querySelector('.map-panel').classList.add('navigation-active');$('#navigationCard').hidden=false;$('#navigationMore').open=false;
  setText('#navigationDestination',stopLabel(c.variant.stops[index]));$('#navigationProgress').max=plan.totalM;steps();save();
  // Keep permission requests in the original button activation, including iOS compass permission.
  RouteLocation.start({preserveDay:true});RouteLocation.selectLeg(index-1);RouteLocation.follow();NavigationScreen.start();render();
  if(timer)clearInterval(timer);timer=setInterval(render,1000);
  const current=generation;OfflinePack.verifyStored().then(value=>{if(active&&generation===current){packageReady=value;render();}});
 }
 function stop({clearSaved=true,keepGPS=false}={}){
  if(!active)return;active=null;previous=null;resumeAfter=null;NavigationScreen.stop();generation++;if(timer)clearInterval(timer);timer=null;
  $('#navigationCard').hidden=true;document.querySelector('.map-panel').classList.remove('navigation-active');
  if(clearSaved)clear();if(ownsGPS&&!keepGPS)RouteLocation.stop();ownsGPS=false;refresh();
 }
 function init(){
  if(ready)return;ready=true;$('#routeNavigationStart').addEventListener('click',start);$('#navigationStop').addEventListener('click',()=>stop());
  $('#navigationFollow').addEventListener('click',()=>{RouteLocation.follow();render();});$('#navigationCompass').addEventListener('click',()=>RouteLocation.requestHeading());
  $('#navigationRetry').addEventListener('click',()=>{RouteLocation.start({preserveDay:true});if(active)RouteLocation.selectLeg(active.index-1);render();});
  $('#navigationWake').addEventListener('click',()=>NavigationScreen.toggle());window.addEventListener('routebook:screen-lock',renderScreen);
  $('#navigationSave').addEventListener('click',()=>OfflinePack.show());
  $('#navigationArrived').addEventListener('click',()=>{const c=focusedContext(),next=active?.index+1;stop();if(c&&next<c.variant.stops.length)setFocusedLeg(next,{fit:true});announce('도착 확인 · 다음 이동은 길 안내를 눌러 시작하세요.');});
  window.addEventListener('routebook:location',event=>{if(active&&event.detail===null){stop({clearSaved:false});return;}render();});window.addEventListener('routebook:heading',renderDirection);
  window.addEventListener('offline',render);window.addEventListener('online',render);window.addEventListener('routebook:offline-ready',()=>{if(active){packageReady=true;render();}});
  window.addEventListener('pagehide',()=>stop({clearSaved:false}));document.addEventListener('visibilitychange',()=>{if(active){if(document.hidden)resumeAfter=Date.now();else{resumeAfter=Date.now();previous=null;RouteLocation.requestFresh?.();}}render();});
  const saved=record(),c=focusedContext();if(saved&&c&&saved.day===c.day.n&&saved.variant===c.variant.id&&saved.index<c.variant.stops.length)setFocusedLeg(saved.index,{fit:true});refresh();
 }
 window.RouteNavigation={init,start,stop,refresh,isActive:()=>!!active};
})();
