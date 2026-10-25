(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RouteMatch=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const R=6371008.8,rad=x=>x*Math.PI/180;
 function distance(a,b){const p=rad(a[0]),q=rad(b[0]),dy=q-p,dx=rad(b[1]-a[1]);return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dy/2)**2+Math.cos(p)*Math.cos(q)*Math.sin(dx/2)**2)));}
 function project(point,a,b){const k=Math.cos(rad((point[0]+a[0]+b[0])/3));const ax=rad(a[1]-point[1])*k*R,ay=rad(a[0]-point[0])*R,bx=rad(b[1]-point[1])*k*R,by=rad(b[0]-point[0])*R,dx=bx-ax,dy=by-ay;const den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;const coord=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];return {coord,t,distanceM:distance(point,coord)};}
 function quality(part){if(part.geometryAccuracy)return part.geometryAccuracy;if(part.mode==='flight')return 'schematic';if(part.mode==='ferry')return 'reference';if(/개략|대표 연결|추정/.test(part.geometrySource||''))return 'reference';return 'mapped';}
 function build(legs){const segments=[];for(let i=0;i<legs.length;i++){const leg=legs[i];if(!leg)continue;let travelled=0;const local=[];for(const part of leg.parts||[]){const c=part.coords||[];for(let j=1;j<c.length;j++){const lengthM=distance(c[j-1],c[j]);if(lengthM<.5)continue;local.push({a:c[j-1],b:c[j],lengthM,beforeM:travelled,legIndex:i,leg,part,quality:lengthM>2500&&['rail','metro'].includes(part.mode)&&quality(part)==='mapped'?'reference':quality(part)});travelled+=lengthM;}}for(const s of local){s.totalM=travelled;segments.push(s);}}return segments;}
 function nearest(point,segments,legIndex=null){let best=null;for(const s of segments){if(legIndex!==null&&s.legIndex!==legIndex)continue;const p=project(point,s.a,s.b);if(!best||p.distanceM<best.distanceM)best={...p,legIndex:s.legIndex,leg:s.leg,part:s.part,quality:s.quality,remainingM:Math.max(0,s.totalM-s.beforeM-s.lengthM*p.t),progress:s.totalM?(s.beforeM+s.lengthM*p.t)/s.totalM:0};}return best;}
 function assess(match,fix,now=Date.now()){
  if(!fix||!Number.isFinite(fix.timestamp)||now-fix.timestamp>30000)return {kind:'stale',label:'위치 갱신 대기'};
  if(!Number.isFinite(fix.accuracy)||fix.accuracy>120)return {kind:'uncertain',label:'정확도 낮음 · 경로 판정 보류'};
  if(!match)return {kind:'unknown',label:'비교할 경로 없음'};
  if(match.quality!=='mapped')return {kind:'reference',label:match.part.mode==='ferry'?'참고 항로와 비교 중':'개략 경로 · 거리만 참고'};
  const threshold={walk:70,transfer:90,metro:180,rail:180,bus:250,taxi:250}[match.part.mode]||120;
  return match.distanceM>threshold+fix.accuracy?{kind:'off',label:'선택한 경로에서 떨어져 있어요'}:{kind:'on',label:'선택한 경로 근처에 있어요'};
 }
 return {distance,project,build,nearest,assess,quality};
});
