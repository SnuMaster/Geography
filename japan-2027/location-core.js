(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RouteMatch=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const R=6371008.8,rad=x=>x*Math.PI/180;
 function distance(a,b){const p=rad(a[0]),q=rad(b[0]),dy=q-p,dx=rad(b[1]-a[1]);return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dy/2)**2+Math.cos(p)*Math.cos(q)*Math.sin(dx/2)**2)));}
 function project(point,a,b){const k=Math.cos(rad((point[0]+a[0]+b[0])/3));const ax=rad(a[1]-point[1])*k*R,ay=rad(a[0]-point[0])*R,bx=rad(b[1]-point[1])*k*R,by=rad(b[0]-point[0])*R,dx=bx-ax,dy=by-ay;const den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;const coord=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];return {coord,t,distanceM:distance(point,coord)};}
 function quality(part){if(part.geometryAccuracy)return part.geometryAccuracy;if(part.mode==='flight')return 'schematic';if(part.mode==='ferry')return 'reference';if(/개략|대표 연결|추정/.test(part.geometrySource||''))return 'reference';return 'mapped';}
 function build(legs){const segments=[];for(let i=0;i<legs.length;i++){const leg=legs[i];if(!leg)continue;let travelled=0;const local=[];for(const part of leg.parts||[]){const c=part.coords||[];for(let j=1;j<c.length;j++){const lengthM=distance(c[j-1],c[j]);if(lengthM<.5)continue;local.push({a:c[j-1],b:c[j],lengthM,beforeM:travelled,legIndex:i,leg,part,quality:lengthM>2500&&['rail','metro'].includes(part.mode)&&quality(part)==='mapped'?'reference':quality(part)});travelled+=lengthM;}}for(const s of local){s.totalM=travelled;segments.push(s);}}return segments;}
 function nearest(point,segments,legIndex=null){let best=null;for(const s of segments){if(legIndex!==null&&s.legIndex!==legIndex)continue;const p=project(point,s.a,s.b);if(!best||p.distanceM<best.distanceM)best={...p,legIndex:s.legIndex,leg:s.leg,part:s.part,quality:s.quality,remainingM:Math.max(0,s.totalM-s.beforeM-s.lengthM*p.t),progress:s.totalM?(s.beforeM+s.lengthM*p.t)/s.totalM:0};}return best;}
 function bearing(a,b){const p=rad(a[0]),q=rad(b[0]),d=rad(b[1]-a[1]);return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))*180/Math.PI+360)%360;}
 function resolve(point,segments,options={}){
  const accuracy=Number.isFinite(options.accuracy)?options.accuracy:30;
  const forced=Number.isInteger(options.manualLeg)?options.manualLeg:Number.isInteger(options.selectedLeg)?options.selectedLeg:null;
  const previous=options.previousMatch,passed=new Set(options.passedLegs||[]),heading=Number.isFinite(options.heading)?options.heading:null;
  const candidates=[];
  for(const s of segments){
   if(forced!==null&&s.legIndex!==forced)continue;
   if(forced===null&&passed.has(s.legIndex))continue;
   const p=project(point,s.a,s.b),alongM=s.beforeM+s.lengthM*p.t;
   // Retain progress through loops and overlapping portions of the same leg.
   if(previous?.legIndex===s.legIndex&&Number.isFinite(previous.alongM)){
    if(alongM < previous.alongM-Math.max(80,accuracy*2))continue;
    if(Number.isFinite(options.maxAdvanceM)&&alongM-previous.alongM>options.maxAdvanceM)continue;
   }
   const alignment=heading===null?0:1-Math.cos(rad(bearing(s.a,s.b)-heading));
   const planned=s.leg.departureAt,late=Number.isFinite(options.now)&&Number.isFinite(planned)?Math.min(30,Math.abs(options.now-planned)/3600000*6):0;
   const score=p.distanceM+alignment*90+(previous&&s.legIndex<previous.legIndex?70:0)+late;
   candidates.push({...p,alongM,score,legIndex:s.legIndex,leg:s.leg,part:s.part,quality:s.quality,remainingM:Math.max(0,s.totalM-alongM),progress:s.totalM?alongM/s.totalM:0});
  }
  if(!candidates.length)return {match:null,ambiguous:false,candidates:[]};
  const minDistance=Math.min(...candidates.map(c=>c.distanceM));
  const close=candidates.filter(c=>c.distanceM<=minDistance+Math.max(25,Math.min(accuracy,80)));
  const byLeg=new Map();for(const c of close)if(!byLeg.has(c.legIndex)||c.score<byLeg.get(c.legIndex).score)byLeg.set(c.legIndex,c);
  const ranked=[...byLeg.values()].sort((a,b)=>a.score-b.score||a.legIndex-b.legIndex);
  if(forced!==null)return {match:ranked[0],ambiguous:false,candidates:ranked,reason:'selected'};
  if(ranked.length>1&&ranked[1].score-ranked[0].score<45){
   // A recent accepted leg is continuity evidence, only while still plausible.
   const held=ranked.find(c=>c.legIndex===previous?.legIndex);
   if(held&&held.score<=ranked[0].score+20)return {match:held,ambiguous:false,candidates:ranked,reason:'continuity'};
   return {match:null,ambiguous:true,candidates:ranked,reason:'overlap'};
  }
  return {match:ranked[0],ambiguous:false,candidates:ranked,reason:heading!==null?'direction':'distance'};
 }
 function validateFix(next,previous,now=Date.now()){
  if(!next||![next.lat,next.lng,next.accuracy,next.timestamp].every(Number.isFinite)||Math.abs(next.lat)>90||Math.abs(next.lng)>180||next.accuracy<0)return {accepted:false,reason:'invalid'};
  if(next.timestamp>now+5000)return {accepted:false,reason:'future'};
  if(previous&&next.timestamp<=previous.timestamp)return {accepted:false,reason:'old'};
  if(previous){const dt=(next.timestamp-previous.timestamp)/1000,dm=distance([previous.lat,previous.lng],[next.lat,next.lng]),slack=next.accuracy+previous.accuracy+100;
   const maxSpeed=Number.isFinite(next.speed)?Math.min(350,Math.max(90,next.speed*2+30)):120;
   if(dt>0&&dt<120&&dm>slack+maxSpeed*dt)return {accepted:false,reason:'jump'};
  }
  return {accepted:true,reason:next.accuracy>120?'uncertain':'accepted'};
 }
 function assess(match,fix,now=Date.now()){
  if(!fix||!Number.isFinite(fix.timestamp)||now-fix.timestamp>30000)return {kind:'stale',label:'위치 갱신 대기'};
  if(!Number.isFinite(fix.accuracy)||fix.accuracy>120)return {kind:'uncertain',label:'정확도 낮음 · 경로 판정 보류'};
  if(!match)return {kind:'unknown',label:'비교할 경로 없음'};
  if(match.quality!=='mapped')return {kind:'reference',label:match.part.mode==='ferry'?'참고 항로와 비교 중':'개략 경로 · 거리만 참고'};
  const threshold={walk:70,transfer:90,metro:180,rail:180,bus:250,taxi:250}[match.part.mode]||120;
  return match.distanceM>threshold+fix.accuracy?{kind:'off',label:'선택한 경로에서 떨어져 있어요'}:{kind:'on',label:'선택한 경로 근처에 있어요'};
 }
 return {distance,project,build,nearest,resolve,bearing,assess,quality,validateFix};
});
