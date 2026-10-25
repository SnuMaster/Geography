(function(root){
 'use strict';
 const radians=Math.PI/180;
 const safePoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
 function distance(a,b){const dy=(b[0]-a[0])*radians,dx=(b[1]-a[1])*radians,s=Math.sin(dy/2)**2+Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dx/2)**2;return 6371000*2*Math.atan2(Math.sqrt(s),Math.sqrt(Math.max(0,1-s)));}
 function buildPath(parts){
  const segments=[],coords=[];let totalM=0,partCount=0;
  for(const part of parts||[]){if(part.mode!=='flight'||!Array.isArray(part.coords))continue;let previous=null;const partIndex=partCount++;
   for(const point of part.coords){if(!safePoint(point)){previous=null;continue;}const p=[point[0],point[1]];coords.push(p);if(previous){const lengthM=distance(previous,p);if(lengthM>.01){segments.push({a:previous,b:p,beforeM:totalM,lengthM,partIndex});totalM+=lengthM;}}previous=p;}
  }
  return {segments,coords,totalM,partCount};
 }
 function samplePath(path,fraction){
  if(!path?.segments?.length||!Number.isFinite(fraction))return null;
  const target=Math.max(0,Math.min(1,fraction))*path.totalM;
  let low=0,high=path.segments.length-1;
  while(low<high){const mid=(low+high)>>1,s=path.segments[mid];if(s.beforeM+s.lengthM<target)low=mid+1;else high=mid;}
  const s=path.segments[low],t=Math.max(0,Math.min(1,(target-s.beforeM)/s.lengthM));
  return {...s,index:low,t,point:[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t]};
 }
 const core={buildPath,samplePath,distance};
 if(typeof module==='object'&&module.exports)module.exports=core;
 if(typeof document==='undefined')return;
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const airplane='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2c-1 0-1.6 1.8-1.6 4.2v6.6L3 20v3l11.4-4.2v6L10 28v2l6-1.8 6 1.8v-2l-4.4-3.2v-6L29 23v-3l-11.4-7.2V6.2C17.6 3.8 17 2 16 2Z"/></svg>';
 const references=new Map(),referenceIds=new WeakMap();let config=null,panel=null,marker=null,active=null,frame=0,referenceSerial=0,generation=0;
 function flightParts(leg){return (leg?.parts||[]).filter(p=>p.mode==='flight');}
 function track(leg){return flightParts(leg).find(p=>p.flightTrack)?.flightTrack||null;}
 function geometryLabel(leg){const t=track(leg);return t?.status==='screen-reference'?'공개 지도 기반 참고 항로':t?.status==='recorded-reference'?'운항 기록 참고 항로':'개략 항로';}
 function canPlay(leg){return buildPath(flightParts(leg)).segments.length>0;}
 function button(leg){
  if(!flightParts(leg).length||!canPlay(leg))return '';
  let id=referenceIds.get(leg);if(!id){id=String(++referenceSerial);referenceIds.set(leg,id);references.set(id,leg);}
  const label=track(leg)?'참고 항로 따라가기':'개략 항로 미리보기';
  return `<button type="button" class="flight-replay-start" data-flight-replay="${id}">${airplane}<span>${label}</span><span aria-hidden="true">▶</span></button>`;
 }
 function provenanceHtml(leg){
  const t=track(leg);if(!t)return '';
  const reference=[t.referenceDate,t.flightNumber].filter(Boolean).join(' · '),link=/^https:\/\//.test(t.sourceUrl||'')?`<a href="${h(t.sourceUrl)}" target="_blank" rel="noopener">Flightradar24 참고편 ↗</a>`:'';
  return `<div class="flight-track-source"><strong>${h(geometryLabel(leg))}</strong>${reference?`<span>참고 운항 ${h(reference)}</span>`:''}<p>${h(t.precisionNote||'여행 당일 실제 항로·위치와 다를 수 있습니다.')}</p>${link}</div>`;
 }
 function clock(ms){const s=Math.floor(Math.max(0,ms)/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
 function setText(element,value){if(element.textContent!==value)element.textContent=value;}
 function schedule(){const token=active.generation;frame=requestAnimationFrame(now=>tick(now,token));}
 function updatePanel(){
  if(!active)return;
  const ratio=Math.min(1,active.elapsed/active.duration),percent=Math.round(ratio*100),p=panel;
  p.querySelector('[data-flight-progress]').value=percent;setText(p.querySelector('[data-flight-percent]'),percent+'%');
  setText(p.querySelector('[data-flight-clock]'),`화면 재생 ${clock(active.elapsed)} / ${clock(active.duration)}`);
  setText(p.querySelector('[data-flight-pause]'),active.complete?'다시 재생':active.paused?'계속 재생':'일시정지');
  setText(p.querySelector('[data-flight-state]'),active.complete?'참고 항로 끝':active.paused?'잠시 멈춤':'참고 항로 재생 중');
 }
 function draw(){
  if(!active||!marker)return;const sample=samplePath(active.path,active.elapsed/active.duration);if(!sample)return;
  marker.setLatLng(sample.point);
  const a=config.map.latLngToLayerPoint(sample.a),b=config.map.latLngToLayerPoint(sample.b),svg=marker.getElement()?.querySelector('svg');
  if(svg)svg.style.transform=`rotate(${Math.atan2(b.x-a.x,a.y-b.y)*180/Math.PI}deg)`;
  if(!active.paused&&performance.now()-active.lastPan>150){
   active.lastPan=performance.now();
   const projected=config.map.project(sample.point),offset=Math.min(panel.offsetHeight/2,110);
   config.map.panTo(config.map.unproject([projected.x,projected.y+offset]),{animate:false});
  }
  if(active.partIndex!==undefined&&active.partIndex!==sample.partIndex)panel.querySelector('[data-flight-note]').textContent='표시가 없는 구간은 선으로 잇지 않고 다음 참고선부터 재생해요.';
  active.partIndex=sample.partIndex;
 }
 function tick(now,token){
  if(!active||active.paused||active.generation!==token)return;frame=0;
  if(active.lastTime!==null)active.elapsed=Math.min(active.duration,active.elapsed+Math.max(0,now-active.lastTime));
  active.lastTime=now;draw();updatePanel();
  if(active.elapsed>=active.duration){
   active.complete=true;active.paused=true;updatePanel();const done=active.onComplete;
   if(done){stop({notify:false});done();}return;
  }
  schedule();
 }
 function pause(){if(!active||active.paused||active.complete)return;active.paused=true;active.lastTime=null;active.generation=++generation;if(frame)cancelAnimationFrame(frame);frame=0;updatePanel();}
 function resume(){if(!active)return;if(active.complete){restart();return;}if(!active.paused)return;active.paused=false;active.lastTime=null;active.lastPan=-Infinity;config.pauseLocation?.();updatePanel();schedule();}
 function restart(){if(!active)return;active.generation=++generation;active.elapsed=0;active.complete=false;active.paused=false;active.lastTime=null;active.lastPan=-Infinity;active.partIndex=undefined;panel.querySelector('[data-flight-note]').textContent=active.note;if(frame)cancelAnimationFrame(frame);draw();updatePanel();schedule();}
 function stop(options={}){
  const cancel=active?.onCancel;++generation;if(frame)cancelAnimationFrame(frame);frame=0;active=null;
  if(marker){marker.remove();marker=null;}if(panel)panel.hidden=true;document.body.classList.remove('flight-preview-open');
  config?.map.getContainer().closest('.map-panel')?.classList.remove('flight-replay-active');
  if(options.notify!==false)cancel?.();
 }
 function play(leg,options={}){
  if(!config)return false;const path=buildPath(flightParts(leg));if(!path.segments.length)return false;
  stop({notify:false});config.pauseLocation?.();config.map.stop();config.map.closePopup();config.prepareMap?.();
  const t=track(leg),reference=[t?.referenceDate,t?.flightNumber].filter(Boolean).join(' · ');
  const note=t?.status==='screen-reference'?'공개 재생 지도에서 읽어낸 참고선을 일정한 속도로 재생해요. 실제 위치·비행 속도가 아니에요.':t?'참고 운항의 경로를 일정한 속도로 재생해요. 실제 위치·비행 속도가 아니에요.':'공항 사이 개략선을 미리 보는 화면이에요. 실제 운항 경로·위치가 아니에요.';
  active={leg,path,generation:++generation,elapsed:0,duration:Math.max(18000,Math.min(36000,path.totalM/18000*1000)),paused:false,complete:false,lastTime:null,lastPan:-Infinity,note,onComplete:options.onComplete,onCancel:options.onCancel};
  panel.querySelector('[data-flight-title]').textContent=leg.travel?.operator||leg.summary||flightParts(leg)[0].line;
  panel.querySelector('[data-flight-reference]').textContent=(reference?'참고 운항 '+reference+' · ':'')+geometryLabel(leg);
  panel.querySelector('[data-flight-note]').textContent=note;panel.hidden=false;document.body.classList.add('flight-preview-open');
  config.map.getContainer().closest('.map-panel')?.classList.add('flight-replay-active');
  const bounds=L.latLngBounds(path.coords);config.map.fitBounds(bounds,{paddingTopLeft:[30,100],paddingBottomRight:[30,Math.min(panel.offsetHeight+35,240)],maxZoom:9,animate:false});
  config.map.setZoom(Math.min(9,Math.max(6,config.map.getZoom()+1)),{animate:false});
  marker=L.marker(path.segments[0].a,{interactive:false,keyboard:false,zIndexOffset:1500,icon:L.divIcon({className:'flight-replay-aircraft',html:airplane,iconSize:[36,36],iconAnchor:[18,18]})}).addTo(config.map);
  draw();updatePanel();schedule();panel.querySelector('[data-flight-pause]').focus({preventScroll:true});return true;
 }
 function init(options){
  if(config)return;config=options;panel=document.createElement('section');panel.className='flight-replay-panel';panel.hidden=true;panel.setAttribute('aria-label','참고 항로 재생');
  panel.innerHTML='<div class="flight-replay-heading"><span>FLIGHT ROUTE PREVIEW</span><strong data-flight-state role="status" aria-live="polite"></strong></div><h3 data-flight-title></h3><div class="flight-replay-reference" data-flight-reference></div><div class="flight-replay-progress"><progress data-flight-progress max="100" value="0" aria-label="참고 항로 재생 진행률"></progress><b data-flight-percent>0%</b></div><div class="flight-replay-controls"><button type="button" data-flight-pause>일시정지</button><button type="button" data-flight-restart>처음부터</button><button type="button" data-flight-stop>종료</button></div><div class="flight-replay-clock" data-flight-clock></div><p data-flight-note></p>';
  config.map.getContainer().closest('.map-panel').appendChild(panel);
  panel.querySelector('[data-flight-pause]').addEventListener('click',()=>{config.onManualControl?.();active?.paused?resume():pause();});
  panel.querySelector('[data-flight-restart]').addEventListener('click',()=>{config.onManualControl?.();restart();});panel.querySelector('[data-flight-stop]').addEventListener('click',()=>{config.onManualControl?.();stop();});
  document.addEventListener('click',event=>{const control=event.target.closest('[data-flight-replay]');if(!control)return;const leg=references.get(control.dataset.flightReplay);if(!leg)return;config.onManualStart?.();config.revealMap?.();play(leg);});
  config.map.on('dragstart',pause);config.map.on('popupopen',event=>{if(event.popup.options.interactionSource!=='auto')pause();});config.map.on('zoomend',()=>{if(active)draw();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',()=>stop());
 }
 root.FlightPlayback={init,play,pause,resume,restart,stop,isActive:()=>!!active,canPlay,button,geometryLabel,provenanceHtml,core};
})(typeof window!=='undefined'?window:globalThis);
