(function(){
 'use strict';
 let options,layer,marker,circle,trail,trailSegments=[],lastTrailFix=null,watch=null,timer=null,fix=null,following=true,firstFix=true,key='',segments=[],chosen=null,phase='off',offSince=null,offCount=0;
 const $=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const metres=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1)+'km':Math.round(n)+'m';
 function tripDay(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const d=Object.fromEntries(parts.map(p=>[p.type,p.value]));const n=Number(d.day)-7;return d.year==='2027'&&d.month==='01'&&n>=1&&n<=22?n:null;}
 function show(){document.querySelector('.map-panel').classList.add('location-active');$('#locationCard').hidden=false;}
 function buttonState(){const active=watch!==null||phase==='starting';$('#locationBtn').setAttribute('aria-pressed',String(active));$('#locationBtnLabel').textContent=active?'위치 켜짐':'내 위치';$('#locationFollow').textContent=following?'지도 따라가는 중':'내 위치로 돌아가기';$('#locationFollow').setAttribute('aria-pressed',String(following));$('#locationFollow').disabled=!fix;}
 function pauseFollow(){if(!fix)return;following=false;buttonState();}
 function refresh(){if(!options)return;const c=options.context(),newKey=c.day.n+'|'+c.variant.id;if(key!==newKey){key=newKey;chosen=null;segments=RouteMatch.build(c.legs);$('#locationLeg').innerHTML='<option value="auto">자동 · 가장 가까운 이동 구간</option>'+c.legs.map((l,i)=>l&&l.distanceM>20?`<option value="${i}">${h(l.from)} → ${h(l.to)}</option>`:'').join('');offSince=null;offCount=0;}
  $('#locationDay').textContent=`${c.day.date} · ${c.variant.label||c.day.cityLabel} 기준`;
  if(fix)render();
 }
 function render(){if(!fix||!options)return;const now=Date.now(),p=[fix.lat,fix.lng],m=RouteMatch.nearest(p,segments,chosen),a=RouteMatch.assess(m,fix,now);
  let kind=a.kind,label=a.label;
  if(kind==='off'){if(offSince===null)offSince=now;if(now-offSince<8000||offCount<2){kind='checking';label='경로와 거리 확인 중';}}else{offSince=null;offCount=0;}
  $('#locationCard').dataset.state=kind;$('#locationStatus').textContent=label;
  const age=Math.max(0,Math.floor((now-fix.timestamp)/1000));$('#locationAccuracy').textContent=`정확도 ±${metres(fix.accuracy)} · ${age<3?'방금':age+'초 전'} 갱신`;
  $('#locationDistance').textContent=m?`${m.quality==='mapped'?'경로':'참고선'}까지 ${metres(m.distanceM)}`:'선택한 날짜의 이동선을 확인하세요';
  $('#locationNext').textContent=m?`${m.leg.to} 방향 · 표시 경로 남은 ${metres(m.remainingM)}`:'';
  $('#locationExplain').textContent=kind==='reference'?'참고선은 실제 운항·역내 이동과 다를 수 있어요. 내 위치 점은 GPS 관측값입니다.':kind==='uncertain'?'실내·터널에서는 오차가 커질 수 있어요. 정확도가 좋아지면 다시 비교해요.':kind==='stale'?'마지막 위치를 표시 중이에요. 화면을 열고 GPS·통신 상태를 확인해 주세요.':'자동 선택이 다른 구간을 고르면 위 목록에서 지금 이동 중인 구간을 골라 주세요.';
  const color=kind==='off'?'#d67d27':kind==='stale'||kind==='uncertain'?'#7b8794':'#1873d1';
  if(!marker){marker=L.circleMarker(p,{radius:8,fillColor:'#1873d1',fillOpacity:1,color:'#fff',weight:3,pane:'markerPane'}).addTo(layer);circle=L.circle(p,{radius:fix.accuracy,color:'#1873d1',weight:1,fillColor:'#1873d1',fillOpacity:.09,interactive:false}).addTo(layer);}
  marker.setLatLng(p).setStyle({fillColor:color});circle.setLatLng(p).setRadius(fix.accuracy).setStyle({color});marker.bindTooltip(`내 위치 · 정확도 ±${metres(fix.accuracy)}`,{direction:'top',className:'stop-tooltip'});
  buttonState();
 }
 function addTrail(){if(fix.accuracy>120||Date.now()-fix.timestamp>30000)return;const p=[fix.lat,fix.lng],dt=lastTrailFix?(fix.timestamp-lastTrailFix.timestamp)/1000:Infinity,dm=lastTrailFix?RouteMatch.distance(p,[lastTrailFix.lat,lastTrailFix.lng]):Infinity;
  if(lastTrailFix&&dt>=0&&dt<5)return;if(lastTrailFix&&dt<=30&&dm<10)return;
  if(!lastTrailFix||dt>30||dt<=0||dm/dt>350)trailSegments.push([]);trailSegments.at(-1).push(p);lastTrailFix={...fix};
  while(trailSegments.reduce((n,s)=>n+s.length,0)>8000){if(trailSegments[0].length>1)trailSegments[0].shift();else trailSegments.shift();}
  if(!trail)trail=L.polyline([],{color:'#1873d1',weight:4,opacity:.8,interactive:false}).addTo(layer);trail.setLatLngs(trailSegments);
 }
 function accept(position){if(phase==='off'||phase==='denied')return;const c=position.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy))return;fix={lat:c.latitude,lng:c.longitude,accuracy:Math.max(0,c.accuracy),timestamp:Number.isFinite(position.timestamp)?position.timestamp:Date.now()};phase='tracking';offCount++;show();render();addTrail();window.dispatchEvent(new CustomEvent('routebook:location',{detail:{...fix}}));
  if(following){const p=[fix.lat,fix.lng];if(firstFix){const m=RouteMatch.nearest(p,segments,chosen),zoom=fix.accuracy>1000?10:m?.part.mode==='ferry'?9:m?.part.mode==='rail'?13:15;options.map.setView(p,zoom,{animate:false});firstFix=false;}else options.map.panTo(p,{animate:true,duration:.5});}
 }
 function error(e){if(phase==='off')return;show();if(e.code===1){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;phase='denied';$('#locationAccuracy').textContent='위치 갱신 중지';$('#locationStatus').textContent='위치 권한이 꺼져 있어요';$('#locationExplain').textContent='이 사이트의 위치 권한을 허용한 뒤 ‘내 위치’를 다시 눌러 주세요.';if(timer){clearInterval(timer);timer=null;}}
  else{$('#locationStatus').textContent=e.code===3?'위치 응답을 기다리는 중':'현재 위치를 잡지 못했어요';$('#locationExplain').textContent='화면을 열어 두고 GPS·통신 상태를 확인해 주세요. 위치가 잡히면 자동으로 갱신해요.';}
  $('#locationCard').dataset.state='uncertain';buttonState();
 }
 function start(){if(!window.isSecureContext||!navigator.geolocation){show();phase='unsupported';$('#locationStatus').textContent='이 브라우저에서 위치를 사용할 수 없어요';$('#locationExplain').textContent='HTTPS 주소를 Safari 또는 Chrome으로 열어 주세요.';return;}
  const today=tripDay(),c=options.context();if(today!==null&&today!==c.day.n)options.selectDay(today);else if(c.view==='overview')options.selectDay(c.day.n);
  options.prepareMap?.();following=true;firstFix=true;phase='starting';offSince=null;offCount=0;show();refresh();$('#locationStatus').textContent='현재 위치 확인 중…';$('#locationExplain').textContent='브라우저에서 위치 사용을 허용해 주세요.';buttonState();
  try{watch=navigator.geolocation.watchPosition(accept,error,{enableHighAccuracy:true,maximumAge:5000,timeout:20000});timer=setInterval(()=>{if(fix&&watch!==null)render();},5000);buttonState();}catch(e){error({code:1});}
 }
 function stop(){if(watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watch);watch=null;if(timer)clearInterval(timer);timer=null;fix=null;phase='off';window.dispatchEvent(new CustomEvent('routebook:location',{detail:null}));firstFix=true;layer?.clearLayers();marker=null;circle=null;trail=null;trailSegments=[];lastTrailFix=null;$('#locationCard').hidden=true;document.querySelector('.map-panel').classList.remove('location-active');buttonState();}
 function init(config){options=config;layer=L.layerGroup().addTo(config.map);$('#locationBtn').addEventListener('click',()=>watch!==null||phase==='starting'?stop():start());$('#locationStop').addEventListener('click',stop);$('#locationFollow').addEventListener('click',()=>{following=!following;if(following&&fix){config.map.setView([fix.lat,fix.lng],Math.max(12,config.map.getZoom()),{animate:false});}buttonState();});$('#locationLeg').addEventListener('change',e=>{chosen=e.target.value==='auto'?null:Number(e.target.value);offSince=null;offCount=0;if(fix)render();});config.map.on('dragstart popupopen',pauseFollow);window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&fix)render();});refresh();buttonState();}
 window.RouteLocation={init,refresh,pauseFollow,start,stop,getFix:()=>fix?{...fix}:null,isActive:()=>watch!==null||phase==='starting'};
})();
