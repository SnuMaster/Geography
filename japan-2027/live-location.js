(function(){
 'use strict';
 let options,layer,marker,circle,trail,trailSegments=[],lastTrailFix=null,watch=null,timer=null,fix=null,following=true,firstFix=true,key='',segments=[],chosen=null,phase='off',offSince=null,offCount=0;
 let observedLegs=null,observedDay=null,dateNotice=false,dateReason='selection',rejectedNotice='';
 let resolution=null,lastMatch=null,previousFix=null,selectedHint=null,passedLegs=new Set();
 let compass=null,orientationPermission='idle',orientationGeneration=0,orientationAttached=false,headingFrame=null,lastOrientation=null;
 const screenAngle=()=>Number.isFinite(window.screen?.orientation?.angle)?window.screen.orientation.angle:Number.isFinite(window.orientation)?window.orientation:0;
 function renderHeading(){
  const heading=document.hidden?null:RouteMatch.displayHeading(fix,compass),el=marker?.getElement(),cone=el?.querySelector('.gps-heading-cone'),label=$('#locationDirection');
  if(cone){cone.hidden=!heading;if(heading){cone.style.transform=`rotate(${heading.degrees}deg)`;el.dataset.heading=String(Math.round(heading.degrees));el.dataset.headingSource=heading.source;}else{delete el.dataset.heading;delete el.dataset.headingSource;}}
  label.textContent=heading?`${heading.source==='compass'?'휴대폰 방향':'이동 방향'} · ${RouteMatch.directionName(heading.degrees)} ${Math.round(heading.degrees)%360}°`:orientationPermission==='denied'?'방향 권한 꺼짐 · 이동 중에는 GPS 방향 표시':orientationPermission==='unsupported'?'이동 중에는 GPS 방향 표시':'방향 확인 중 · GPS 위치는 계속 표시';
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
 function tripDay(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const d=Object.fromEntries(parts.map(p=>[p.type,p.value]));const n=Number(d.day)-7;return d.year==='2027'&&d.month==='01'&&n>=1&&n<=22?n:null;}
 function show(){document.querySelector('.map-panel').classList.add('location-active');$('#locationCard').hidden=false;}
 function buttonState(){const active=watch!==null||phase==='starting';$('#locationBtn').setAttribute('aria-pressed',String(active));$('#locationBtnLabel').textContent=active?'위치 켜짐':'내 위치';$('#locationFollow').textContent=following?'지도 따라가는 중':'내 위치로 돌아가기';$('#locationFollow').setAttribute('aria-pressed',String(following));$('#locationFollow').disabled=!fix;}
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
 function selectLeg(index){if(watch===null&&phase!=='starting')return;if(!Number.isInteger(index)||!$('#locationLeg').querySelector(`option[value="${index}"]`))return;chosen=index;selectedHint=index;$('#locationLeg').value=String(index);lastMatch=null;if(fix){resolveFix();render();}}
 function render(){if(!fix||!options)return;const now=Date.now(),p=[fix.lat,fix.lng],m=resolution?.match,a=resolution?.ambiguous&&fix.accuracy<=120&&now-fix.timestamp<=30000?{kind:'ambiguous',label:'왕복·중복 경로 · 현재 구간을 선택해 주세요'}:RouteMatch.assess(m,fix,now);
  let kind=a.kind,label=a.label;if(rejectedNotice){kind='uncertain';label=rejectedNotice;}if(dateNotice){kind='stale';label=dateReason==='rollover'?'일본 날짜 변경 · 오늘 일정 확인 필요':'오늘과 다른 일정 · 현재 경로 확인 필요';}
  if(kind==='off'){if(offSince===null)offSince=now;if(now-offSince<8000||offCount<2){kind='checking';label='경로와 거리 확인 중';}}else{offSince=null;offCount=0;}
  $('#locationCard').dataset.state=kind;$('#locationStatus').textContent=label;
  const age=Math.max(0,Math.floor((now-fix.timestamp)/1000));$('#locationAccuracy').textContent=`정확도 ±${metres(fix.accuracy)} · ${age<3?'방금':age+'초 전'} 갱신`;
  $('#locationDistance').textContent=m?`${m.quality==='mapped'?'경로':'참고선'}까지 ${metres(m.distanceM)}`:'선택한 날짜의 이동선을 확인하세요';
  $('#locationNext').textContent=!dateNotice&&!rejectedNotice&&m&&['on','reference'].includes(kind)&&m.distanceM<=500+fix.accuracy?`${m.leg.to} 방향 · 표시 경로 남은 ${metres(m.remainingM)}`:resolution?.ambiguous?'구간 선택 전 남은 거리는 표시하지 않아요.':'';
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
 function accept(position){if(phase==='off'||phase==='denied')return;const c=position.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy))return;const next={lat:c.latitude,lng:c.longitude,accuracy:Math.max(0,c.accuracy),heading:Number.isFinite(c.heading)?c.heading:null,speed:Number.isFinite(c.speed)?c.speed:null,timestamp:Number.isFinite(position.timestamp)?position.timestamp:Date.now()};const check=RouteMatch.validateFix(next,fix);if(!check.accepted){if(check.reason!=='old'){rejectedNotice='GPS 위치 도약 · 다음 관측 확인 중';render();}return;}rejectedNotice='';previousFix=fix;fix=next;phase='tracking';offCount++;show();resolveFix();render();addTrail();window.dispatchEvent(new CustomEvent('routebook:location',{detail:{...fix}}));
  if(following){const p=[fix.lat,fix.lng];if(firstFix){const m=resolution?.match,zoom=fix.accuracy>1000?10:m?.part.mode==='ferry'?9:m?.part.mode==='rail'?13:15;followFix(zoom);firstFix=false;}else followFix();}
 }
 function error(e){if(phase==='off')return;show();if(e.code===1){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;phase='denied';stopOrientation();renderHeading();$('#locationAccuracy').textContent='위치 갱신 중지';$('#locationStatus').textContent='위치 권한이 꺼져 있어요';$('#locationExplain').textContent='이 사이트의 위치 권한을 허용한 뒤 ‘내 위치’를 다시 눌러 주세요.';if(timer){clearInterval(timer);timer=null;}}
  else{$('#locationStatus').textContent=e.code===3?'위치 응답을 기다리는 중':'현재 위치를 잡지 못했어요';$('#locationExplain').textContent='화면을 열어 두고 GPS·통신 상태를 확인해 주세요. 위치가 잡히면 자동으로 갱신해요.';}
  $('#locationCard').dataset.state='uncertain';buttonState();
 }
 function start({preserveDay=false}={}){if(!options||watch!==null||phase==='starting')return;window.dispatchEvent(new CustomEvent('routebook:location-start'));if(!window.isSecureContext||!navigator.geolocation){show();phase='unsupported';$('#locationStatus').textContent='이 브라우저에서 위치를 사용할 수 없어요';$('#locationExplain').textContent='HTTPS 주소를 Safari 또는 Chrome으로 열어 주세요.';return;}
  const today=tripDay(),c=options.context();observedDay=today;dateNotice=false;chosen=null;selectedHint=null;$('#locationLeg').value='auto';if(!preserveDay&&today!==null&&today!==c.day.n)options.selectDay(today);else if(c.view==='overview')options.selectDay(c.day.n);
  options.prepareMap?.();following=true;firstFix=true;phase='starting';offSince=null;offCount=0;show();refresh();startOrientation();$('#locationStatus').textContent='현재 위치 확인 중…';$('#locationExplain').textContent='브라우저에서 위치 사용을 허용해 주세요.';buttonState();
  try{watch=navigator.geolocation.watchPosition(accept,error,{enableHighAccuracy:true,maximumAge:5000,timeout:20000});timer=setInterval(()=>{if(watch!==null){const today=tripDay();if(today!==observedDay){observedDay=today;dateReason='rollover';dateNotice=today!==null&&today!==options.context().day.n;lastMatch=null;resolution=null;chosen=null;selectedHint=null;}if(fix)render();}},5000);buttonState();}catch(e){error({code:1});}
 }
 function stop(){stopOrientation();if(watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watch);watch=null;if(timer)clearInterval(timer);timer=null;fix=null;previousFix=null;lastMatch=null;resolution=null;selectedHint=null;chosen=null;passedLegs=new Set();phase='off';window.dispatchEvent(new CustomEvent('routebook:location',{detail:null}));firstFix=true;layer?.clearLayers();marker=null;circle=null;trail=null;trailSegments=[];lastTrailFix=null;$('#locationCard').hidden=true;document.querySelector('.map-panel').classList.remove('location-active');buttonState();}
 function init(config){options=config;layer=L.layerGroup().addTo(config.map);$('#locationBtn').addEventListener('click',()=>watch!==null||phase==='starting'?stop():start());$('#locationStop').addEventListener('click',stop);$('#locationCompass').addEventListener('click',startOrientation);$('#locationFollow').addEventListener('click',()=>{following=!following;if(following&&fix){followFix(Math.max(12,config.map.getZoom()));}buttonState();});$('#locationAuto').addEventListener('click',()=>{$('#locationLeg').value='auto';chosen=null;selectedHint=null;lastMatch=null;if(fix){resolveFix();render();}});$('#locationToday').addEventListener('click',()=>{const today=tripDay();if(today){options.selectDay(today);dateNotice=false;refresh();}});$('#locationLeg').addEventListener('change',e=>{chosen=e.target.value==='auto'?null:Number(e.target.value);window.RouteUI?.userExplore();selectedHint=null;lastMatch=null;offSince=null;offCount=0;if(fix){resolveFix();render();}});config.map.on('dragstart popupopen',pauseFollow);window.addEventListener('pagehide',stop);window.addEventListener('orientationchange',()=>{if(lastOrientation&&Date.now()-(compass?.timestamp||0)<=10000)orientationChanged(lastOrientation);});window.screen?.orientation?.addEventListener('change',()=>{if(lastOrientation&&Date.now()-(compass?.timestamp||0)<=10000)orientationChanged(lastOrientation);});document.addEventListener('visibilitychange',()=>{compass=null;if(fix)render();});refresh();buttonState();queueMicrotask(()=>window.RouteNavigation?.init());}
 window.RouteLocation={init,refresh,selectLeg,pauseFollow,start,stop,requestHeading:startOrientation,follow:()=>{following=true;if(fix){firstFix=false;followFix(Math.max(15,options.map.getZoom()));}buttonState();},getStatus:()=>({phase,following,rejectedNotice,orientationPermission}),getHeading:()=>document.hidden?null:RouteMatch.displayHeading(fix,compass),getFix:()=>fix?{...fix}:null,isActive:()=>watch!==null||phase==='starting'};
})();
