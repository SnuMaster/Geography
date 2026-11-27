(function(){
 'use strict';
 let options,layer,marker,circle,trail,trailSegments=[],lastTrailFix=null,watch=null,timer=null,fix=null,following=true,firstFix=true,key='',segments=[],chosen=null,phase='off',offSince=null,offCount=0;
 let observedLegs=null,observedDay=null,dateNotice=false,dateReason='selection',rejectedNotice='';
 let resolution=null,lastMatch=null,previousFix=null,selectedHint=null,passedLegs=new Set();
 let compass=null,orientationPermission='idle',orientationGeneration=0,orientationAttached=false,headingFrame=null,lastOrientation=null;
 let watchGeneration=0,watchStartedAt=0,freshWatch=false,suspended=false,waitingReason=null,lowAccuracy=false,refreshAttempted=false;
 const staleAfter=30000;
 const tripCalendar=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
 const screenAngle=()=>Number.isFinite(window.screen?.orientation?.angle)?window.screen.orientation.angle:Number.isFinite(window.orientation)?window.orientation:0;
 function renderHeading(){
  const heading=currentHeading(),el=marker?.getElement(),cone=el?.querySelector('.gps-heading-cone'),label=$('#locationDirection');
  if(cone){cone.hidden=!heading;if(heading){cone.style.transform=`rotate(${heading.degrees}deg)`;el.dataset.heading=String(Math.round(heading.degrees));el.dataset.headingSource=heading.source;}else{delete el.dataset.heading;delete el.dataset.headingSource;}}
  label.textContent=heading?`${heading.source==='compass'?'휴대폰 방향':'이동 방향'} · ${RouteMatch.directionName(heading.degrees)} ${Math.round(heading.degrees)%360}°`:phase==='denied'?'위치 권한이 필요해요':orientationPermission==='denied'?'방향 권한 꺼짐 · 이동 중에는 GPS 방향 표시':orientationPermission==='unsupported'?'이동 중에는 GPS 방향 표시':'방향 확인 중';
  $('#locationCompass').hidden=orientationPermission==='granted'||orientationPermission==='pending'||orientationPermission==='unsupported';
  window.dispatchEvent(new Event('routebook:heading'));
 }
 function orientationChanged(event){
  if(phase==='off'||phase==='denied'||document.hidden)return;
  const degrees=RouteMatch.compassHeading(event,screenAngle());
  if(degrees===null){if(Number.isFinite(event.webkitCompassAccuracy)){compass=null;renderHeading();}return;}
  lastOrientation=event;compass={degrees,timestamp:Date.now()};
  if(headingFrame===null)headingFrame=requestAnimationFrame(()=>{headingFrame=null;renderHeading();});
 }
 function attachOrientation(){if(orientationAttached)return;orientationAttached=true;window.addEventListener('deviceorientation',orientationChanged);window.addEventListener('deviceorientationabsolute',orientationChanged);}
 function stopOrientation(){orientationGeneration++;compass=null;lastOrientation=null;orientationPermission='idle';if(headingFrame!==null)cancelAnimationFrame(headingFrame);headingFrame=null;window.removeEventListener('deviceorientation',orientationChanged);window.removeEventListener('deviceorientationabsolute',orientationChanged);orientationAttached=false;}
 function startOrientation(){
  const generation=++orientationGeneration,api=window.DeviceOrientationEvent;compass=null;
  if(!api){orientationPermission='unsupported';renderHeading();return;}
  if(typeof api.requestPermission!=='function'){orientationPermission='granted';attachOrientation();renderHeading();return;}
  orientationPermission='pending';
  // Called synchronously from the location/direction button: iOS requires user activation.
  let permission;try{permission=api.requestPermission(true);}catch(_){orientationPermission='denied';renderHeading();return;}
  Promise.resolve(permission).then(result=>{if(generation!==orientationGeneration||phase==='off'||phase==='denied')return;orientationPermission=result==='granted'?'granted':'denied';if(result==='granted')attachOrientation();renderHeading();},()=>{if(generation!==orientationGeneration)return;orientationPermission='denied';renderHeading();});
 }
 const $=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const metres=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1)+'km':Math.round(n)+'m';
 function tripDay(){
  const parts=tripCalendar.formatToParts(new Date());
  const {year,month,day}=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const today=`${year}-${month}-${day}`,days=window.__routebook?.state.data.days||[];
  return days.find(d=>TripData.date(d.n)===today)?.n||
   days.find(d=>d.variants.some(v=>v.stops.some(s=>s.dayOffset>0&&TripData.date(d.n,s.dayOffset)===today)))?.n||null;
 }
 function active(){return phase==='starting'||phase==='tracking';}
 function pendingPosition(){
  if(suspended||document.hidden)return '화면을 다시 열면 위치를 확인해요';
  return {
   refresh:'현재 위치를 다시 확인 중…',
   fallback:'다른 방식으로 위치를 확인 중…',
   timeout:'GPS 응답이 늦어요',
   unavailable:'현재 위치를 잡지 못했어요'
  }[waitingReason]||null;
 }
 function currentFix(){return fix&&!pendingPosition()&&Date.now()-fix.timestamp<=staleAfter?fix:null;}
 function currentHeading(){return RouteMatch.displayHeading(currentFix(),compass);}
 function canRetry(){return phase==='denied'||active()&&['timeout','unavailable'].includes(waitingReason);}
 function show(){document.querySelector('.map-panel').classList.add('location-active');$('#locationCard').hidden=false;}
 function buttonState(){
  $('#locationBtn').setAttribute('aria-pressed',String(active()));
  $('#locationBtnLabel').textContent=active()?'위치 켜짐':'내 위치';
  $('#locationFollow').textContent=following?'지도 따라가는 중':'내 위치로 돌아가기';
  $('#locationFollow').setAttribute('aria-pressed',String(following));
  $('#locationFollow').disabled=!currentFix();
  $('#locationRetry').hidden=!canRetry();
 }
 function pauseFollow(){following=false;if(options)buttonState();}
 function refresh(){if(!options)return;const c=options.context(),newKey=c.day.n+'|'+c.variant.id;if(key!==newKey||observedLegs!==c.legs){observedLegs=c.legs;dateReason='selection';dateNotice=tripDay()!==null&&tripDay()!==c.day.n;key=newKey;chosen=null;selectedHint=null;lastMatch=null;previousFix=null;resolution=null;passedLegs=new Set();segments=RouteMatch.build(c.legs);$('#locationLeg').innerHTML='<option value="auto">자동 · 방향·진행 순서로 비교</option>'+c.legs.map((l,i)=>l&&l.distanceM>20?`<option value="${i}">${h(l.from)} → ${h(l.to)}</option>`:'').join('');offSince=null;offCount=0;}
  $('#locationDay').textContent=`${c.day.date} · ${c.variant.label||c.day.cityLabel} 기준`;
  if(fix){resolveFix();render();}
 }
 function resolveFix(){
  if(!fix)return;
  const moved=previousFix?RouteMatch.distance([previousFix.lat,previousFix.lng],[fix.lat,fix.lng]):0;
  const dt=previousFix?(fix.timestamp-previousFix.timestamp)/1000:0;
  const reliable=fix.accuracy<=80&&previousFix?.accuracy<=80&&dt>0&&dt<=30&&moved>Math.max(18,fix.accuracy,previousFix.accuracy);
  const heading=fix.speed>=1.5&&Number.isFinite(fix.heading)?fix.heading:reliable?RouteMatch.bearing([previousFix.lat,previousFix.lng],[fix.lat,fix.lng]):null;
  resolution=RouteMatch.resolve([fix.lat,fix.lng],segments,{manualLeg:chosen,selectedLeg:selectedHint,previousMatch:lastMatch,passedLegs,heading,accuracy:fix.accuracy,now:Date.now(),maxAdvanceM:previousFix?Math.max(250,moved*3+fix.accuracy*2):null});
  const match=resolution.match;
  if(match&&fix.accuracy<=120&&match.distanceM<=250+fix.accuracy){
   if(lastMatch&&match.legIndex>lastMatch.legIndex&&lastMatch.progress>.9)passedLegs.add(lastMatch.legIndex);
   lastMatch=match;
  }
 }
 function selectLeg(index){if(!active())return;if(!Number.isInteger(index)||!$('#locationLeg').querySelector(`option[value="${index}"]`))return;chosen=index;selectedHint=index;$('#locationLeg').value=String(index);lastMatch=null;if(fix){resolveFix();render();}}
 function render(){
  if(!active())return;
  const pending=pendingPosition();
  if(!fix){
   $('#locationCard').dataset.state=canRetry()?'uncertain':'checking';
   $('#locationStatus').textContent=pending||'현재 위치 확인 중…';
   $('#locationExplain').textContent=canRetry()?'휴대폰의 위치 서비스와 이 사이트의 위치 권한을 확인해 주세요.':'위치 권한을 허용하면 지도에 현재 위치를 표시해요.';
   renderHeading();buttonState();
   return;
  }
  const now=Date.now(),p=[fix.lat,fix.lng],m=resolution?.match;
  const a=resolution?.ambiguous&&fix.accuracy<=120&&now-fix.timestamp<=staleAfter?{kind:'ambiguous',label:'왕복·중복 경로 · 현재 구간을 선택해 주세요'}:RouteMatch.assess(m,fix,now);
  let {kind,label}=a;
  if(pending){kind='stale';label=pending;}
  else if(kind!=='stale'&&rejectedNotice){kind='uncertain';label=rejectedNotice;}
  else if(kind!=='stale'&&dateNotice){kind='different-day';label=dateReason==='rollover'?'날짜 변경 · 오늘 일정 확인 필요':'다른 날의 일정 · 경로 비교 보류';}
  if(kind==='off'){if(offSince===null)offSince=now;if(now-offSince<8000||offCount<2){kind='checking';label='경로와 거리 확인 중';}}else{offSince=null;offCount=0;}
  $('#locationCard').dataset.state=kind;$('#locationStatus').textContent=label;
  const age=Math.max(0,Math.floor((now-fix.timestamp)/1000));
  $('#locationAccuracy').textContent=kind==='stale'?`마지막 위치 · ${age}초 전 · 정확도 ±${metres(fix.accuracy)}`:`정확도 ±${metres(fix.accuracy)} · ${age<3?'방금':age+'초 전'} 갱신`;
  const comparable=kind!=='stale'&&kind!=='different-day'&&!rejectedNotice;
  $('#locationDistance').textContent=comparable&&m?`${m.quality==='mapped'?'경로':'참고선'}까지 ${metres(m.distanceM)}`:'';
  $('#locationNext').textContent=m&&['on','reference'].includes(kind)&&m.distanceM<=500+fix.accuracy?`${m.leg.to} 방향 · 표시 경로 남은 ${metres(m.remainingM)}`:kind==='ambiguous'?'구간 선택 전 남은 거리는 표시하지 않아요.':'';
  $('#locationMode').textContent=Number.isInteger(chosen)?'사용자 수동 선택 중':'GPS 자동 모드';
  $('#locationExplain').textContent=kind==='ambiguous'?'같은 선을 왕복하거나 이동 방향이 불분명해요. 위 목록에서 현재 이동 구간을 선택하세요.':kind==='reference'?'참고선은 실제 운항·역내 이동과 다를 수 있어요. 내 위치 점은 GPS 관측값입니다.':kind==='uncertain'?'실내·터널에서는 오차가 커질 수 있어요. 정확도가 좋아지면 다시 비교해요.':kind==='stale'?'마지막 위치를 표시 중이에요. 화면을 열고 GPS·통신 상태를 확인해 주세요.':'자동 선택이 다른 구간을 고르면 위 목록에서 지금 이동 중인 구간을 골라 주세요.';
  const color=kind==='off'?'#d67d27':kind==='stale'||kind==='uncertain'?'#7b8794':'#1873d1';
  if(!marker){marker=L.marker(p,{interactive:false,keyboard:false,zIndexOffset:2500,icon:L.divIcon({className:'gps-location-marker',html:'<span class="gps-heading-cone" hidden></span><span class="gps-location-dot"></span>',iconSize:[84,84],iconAnchor:[42,42]})}).addTo(layer);circle=L.circle(p,{radius:fix.accuracy,color:'#1873d1',weight:1,fillColor:'#1873d1',fillOpacity:.09,interactive:false}).addTo(layer);}
  marker.setLatLng(p);marker.getElement()?.style.setProperty('--gps-color',color);circle.setLatLng(p).setRadius(fix.accuracy).setStyle({color});
  renderHeading();buttonState();
 }
 function followFix(zoom=null){
  if(!fix)return;
  const p=[fix.lat,fix.lng];if(zoom!==null)options.map.setView(p,zoom,{animate:false});
  const bounds=options.map.getContainer().getBoundingClientRect(),card=$(document.querySelector('.map-panel').classList.contains('navigation-active')?'#navigationCard':'#locationCard').getBoundingClientRect(),middle=bounds.width/2;
  // Keep the whole direction cone above the GPS card on narrow maps.
  const overlap=middle+42>card.left-bounds.left&&middle-42<card.right-bounds.left;
  const safeY=overlap?Math.min(bounds.height/2,Math.max(80,card.top-bounds.top-62)):bounds.height/2;
  const offset=bounds.height/2-safeY,center=options.map.unproject(options.map.project(p).add([0,offset]));
  options.map.panTo(center,{animate:zoom===null,duration:.5});
 }
 function addTrail(){if(fix.accuracy>120||Date.now()-fix.timestamp>30000)return;const p=[fix.lat,fix.lng],dt=lastTrailFix?(fix.timestamp-lastTrailFix.timestamp)/1000:Infinity,dm=lastTrailFix?RouteMatch.distance(p,[lastTrailFix.lat,lastTrailFix.lng]):Infinity;
  if(lastTrailFix&&dt>=0&&dt<5)return;if(lastTrailFix&&dt<=30&&dm<10)return;
  if(!lastTrailFix||dt>30||dt<=0||dm/dt>350)trailSegments.push([]);trailSegments.at(-1).push(p);lastTrailFix={...fix};
  while(trailSegments.reduce((n,s)=>n+s.length,0)>8000){if(trailSegments[0].length>1)trailSegments[0].shift();else trailSegments.shift();}
  if(!trail)trail=L.polyline([],{color:'#1873d1',weight:4,opacity:.8,interactive:false}).addTo(layer);trail.setLatLngs(trailSegments);
 }
 function accept(position){
  if(!active())return;
  if(suspended||document.hidden){waitingReason='refresh';return;}
  const c=position.coords,now=Date.now();
  const next={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,heading:Number.isFinite(c.heading)?c.heading:null,speed:Number.isFinite(c.speed)?c.speed:null,timestamp:position.timestamp};
  if(next.timestamp<=fix?.timestamp||now-next.timestamp>staleAfter||freshWatch&&next.timestamp<watchStartedAt)return;
  const recent=fix&&!waitingReason&&now-fix.timestamp<=staleAfter?fix:null;
  const check=RouteMatch.validateFix(next,recent,now);
  if(!check.accepted){
   if(check.reason==='jump'){rejectedNotice='GPS 위치 도약 · 다음 관측 확인 중';render();}
   return;
  }
  if(!recent){lastMatch=null;passedLegs.clear();offSince=null;offCount=0;}
  waitingReason=null;rejectedNotice='';refreshAttempted=false;previousFix=recent;fix=next;phase='tracking';offCount++;
  resolveFix();render();addTrail();
  window.dispatchEvent(new CustomEvent('routebook:location',{detail:{...fix}}));
  if(!following)return;
  if(!firstFix){followFix();return;}
  const mode=resolution?.match?.part.mode,zoom=fix.accuracy>1000?10:mode==='ferry'?9:mode==='rail'?13:15;
  followFix(zoom);firstFix=fix.accuracy>1000;
 }
 function clearWatch(){
  watchGeneration++;
  if(watch!==null)navigator.geolocation?.clearWatch(watch);
  watch=null;
 }
 function clearPosition(){
  fix=null;previousFix=null;lastMatch=null;resolution=null;passedLegs.clear();rejectedNotice='';
  layer?.clearLayers();marker=null;circle=null;trail=null;trailSegments=[];lastTrailFix=null;
  for(const id of ['locationAccuracy','locationDistance','locationNext'])$('#'+id).textContent='';
 }
 function watchPosition({fresh=false,highAccuracy=true}={}){
  clearWatch();
  const generation=watchGeneration,geo=navigator.geolocation;
  lowAccuracy=!highAccuracy;freshWatch=fresh;watchStartedAt=Date.now();
  try{
   const id=geo.watchPosition(
    position=>{if(generation===watchGeneration)accept(position);},
    failure=>{if(generation===watchGeneration)error(failure);},
    {enableHighAccuracy:highAccuracy,maximumAge:fresh?0:5000,timeout:20000}
   );
   if(generation===watchGeneration)watch=id;else geo.clearWatch(id);
  }catch(_){error({code:2});}
 }
 function error(e){
  if(!active())return;
  if(e.code===1){
   phase='denied';suspended=false;waitingReason=null;
   clearWatch();clearInterval(timer);timer=null;clearPosition();stopOrientation();
   $('#locationCard').dataset.state='uncertain';
   $('#locationStatus').textContent='위치 권한이 꺼져 있어요';
   $('#locationExplain').textContent='이 사이트의 위치 권한을 허용한 뒤 ‘위치 다시 시도’를 눌러 주세요.';
   renderHeading();buttonState();
   return;
  }
  if(suspended||document.hidden)return;
  if(!lowAccuracy&&(!fix||waitingReason==='refresh'))return standardAccuracy();
  waitingReason=e.code===3?'timeout':'unavailable';
  render();
 }
 function standardAccuracy(){
  waitingReason='fallback';
  watchPosition({fresh:true,highAccuracy:false});render();
 }
 function requestFresh(){
  waitingReason='refresh';refreshAttempted=true;compass=null;
  render();watchPosition({fresh:true});
 }
 function updateTripDay(){
  const today=tripDay();
  if(today===observedDay)return;
  observedDay=today;dateReason='rollover';dateNotice=today!==null&&today!==options.context().day.n;
  lastMatch=null;resolution=null;chosen=null;selectedHint=null;passedLegs.clear();$('#locationLeg').value='auto';
 }
 function tick(){
  if(!active()||suspended||document.hidden)return;
  updateTripDay();
  if(fix&&Date.now()-fix.timestamp>staleAfter&&!refreshAttempted){requestFresh();return;}
  if((!fix||waitingReason)&&Date.now()-watchStartedAt>25000&&!canRetry()){
   if(!lowAccuracy)return standardAccuracy();
   waitingReason='timeout';
  }
  render();
 }
 function suspend(release=false){
  if(!active())return;
  suspended=true;compass=null;
  if(release||fix)clearWatch();
  render();
 }
 function resume(){
  if(!active()||!suspended||document.hidden)return;
  suspended=false;updateTripDay();
  // A browser permission prompt can itself briefly hide the page.
  if(!fix&&watch!==null&&!waitingReason){render();return;}
  requestFresh();
 }
 function start({preserveDay=false}={}){
  if(!options||active())return;
  window.dispatchEvent(new CustomEvent('routebook:location-start'));
  show();
  if(!window.isSecureContext||!navigator.geolocation){
   phase='unsupported';$('#locationStatus').textContent='이 브라우저에서 위치를 사용할 수 없어요';
   $('#locationExplain').textContent='HTTPS 주소를 Safari 또는 Chrome으로 열어 주세요.';buttonState();return;
  }
  const today=tripDay(),c=options.context();
  observedDay=today;chosen=null;selectedHint=null;$('#locationLeg').value='auto';
  if(!preserveDay&&today!==null&&today!==c.day.n)options.selectDay(today);
  else if(c.view==='overview')options.selectDay(c.day.n);
  dateNotice=today!==null&&today!==options.context().day.n;dateReason='selection';
  options.prepareMap?.();following=true;firstFix=true;phase='starting';offSince=null;offCount=0;
  waitingReason=null;suspended=false;refreshAttempted=false;
  refresh();startOrientation();render();
  timer=setInterval(tick,5000);
  watchPosition();
 }
 function retry(){
  if(active())requestFresh();
  else start({preserveDay:true});
 }
 function stop(){
  phase='off';suspended=false;waitingReason=null;firstFix=true;
  stopOrientation();clearWatch();clearInterval(timer);timer=null;clearPosition();
  selectedHint=null;chosen=null;
  window.dispatchEvent(new CustomEvent('routebook:location',{detail:null}));
  $('#locationCard').hidden=true;document.querySelector('.map-panel').classList.remove('location-active');buttonState();
 }
 function init(config){
  options=config;layer=L.layerGroup().addTo(config.map);
  $('#locationBtn').addEventListener('click',()=>active()?stop():start());
  $('#locationStop').addEventListener('click',stop);
  $('#locationRetry').addEventListener('click',retry);
  $('#locationCompass').addEventListener('click',startOrientation);
  $('#locationFollow').addEventListener('click',()=>{following=!following;if(following&&currentFix())followFix(Math.max(12,config.map.getZoom()));buttonState();});
  $('#locationAuto').addEventListener('click',()=>{$('#locationLeg').value='auto';chosen=null;selectedHint=null;lastMatch=null;if(fix){resolveFix();render();}});
  $('#locationToday').addEventListener('click',()=>{const today=tripDay();if(today){options.selectDay(today);dateNotice=false;refresh();}});
  $('#locationLeg').addEventListener('change',e=>{chosen=e.target.value==='auto'?null:Number(e.target.value);window.RouteUI?.userExplore();selectedHint=null;lastMatch=null;offSince=null;offCount=0;if(fix){resolveFix();render();}});
  config.map.on('dragstart popupopen',pauseFollow);
  document.addEventListener('visibilitychange',()=>document.hidden?suspend():resume());
  document.addEventListener('freeze',()=>suspend(true));
  document.addEventListener('resume',resume);
  window.addEventListener('focus',()=>{
   if(document.hidden||!active())return;
   if(suspended)return resume();
   if(canRetry()||fix&&Date.now()-fix.timestamp>staleAfter&&!refreshAttempted)requestFresh();
  });
  window.addEventListener('pagehide',event=>event.persisted?suspend(true):stop());
  window.addEventListener('pageshow',event=>{if(event.persisted)resume();});
  const rotate=()=>{if(lastOrientation&&Date.now()-(compass?.timestamp||0)<=10000)orientationChanged(lastOrientation);};
  window.addEventListener('orientationchange',rotate);window.screen?.orientation?.addEventListener('change',rotate);
  refresh();buttonState();queueMicrotask(()=>window.RouteNavigation?.init());
 }
 window.RouteLocation={
  init,refresh,selectLeg,pauseFollow,start,stop,retry,requestHeading:startOrientation,
  follow:()=>{following=true;if(currentFix()){firstFix=false;followFix(Math.max(15,options.map.getZoom()));}buttonState();},
  getStatus:()=>({phase,following,rejectedNotice,orientationPermission,pending:pendingPosition(),canRetry:canRetry()}),
  getHeading:currentHeading,getFix:()=>fix?{...fix}:null,isActive:active
 };
})();
