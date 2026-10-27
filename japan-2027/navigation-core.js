(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./location-core'):root.RouteMatch);if(typeof module==='object'&&module.exports)module.exports=api;else root.TripNavigation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(GPS){
 'use strict';
 const point=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
 const angle=(a,b)=>(b-a+540)%360-180;
 function simplify(coords,tolerance=6){
  if(coords.length<3)return coords.map((_,i)=>i);
  const keep=new Set([0,coords.length-1]),stack=[[0,coords.length-1]];
  while(stack.length){const [a,b]=stack.pop();let far=tolerance,index=-1;for(let i=a+1;i<b;i++){const d=GPS.project(coords[i],coords[a],coords[b]).distanceM;if(d>far){far=d;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}
  return [...keep].sort((a,b)=>a-b);
 }
 function turns(coords,offset,partIndex){
  const lengths=[0];for(let i=1;i<coords.length;i++)lengths.push(lengths[i-1]+GPS.distance(coords[i-1],coords[i]));
  const reduced=simplify(coords),candidates=[];
  for(let j=1;j<reduced.length-1;j++){
   const i=reduced[j],before=reduced[j-1],after=reduced[j+1],change=angle(GPS.bearing(coords[before],coords[i]),GPS.bearing(coords[i],coords[after]));
   if(Math.abs(change)<40||lengths[i]<15||lengths.at(-1)-lengths[i]<15)continue;
   const kind=Math.abs(change)>145?'uturn':change>0?'right':'left';
   candidates.push({kind,text:kind==='right'?'오른쪽으로 이동':kind==='left'?'왼쪽으로 이동':'반대 방향으로 돌아 이동',atM:offset+lengths[i],coord:coords[i],partIndex,angle:change});
  }
  // Tiny bends around entrances must not become a rapid succession of GPS commands.
  const result=[];for(const cue of candidates){const previous=result.at(-1);if(previous&&cue.atM-previous.atM<25){if(Math.abs(cue.angle)>Math.abs(previous.angle))result[result.length-1]=cue;}else result.push(cue);}return result;
 }
 function build(leg){
  const parts=[],cues=[];let totalM=0;
  for(const source of leg?.parts||[]){
   if(!Array.isArray(source.coords)||source.coords.some(p=>!point(p)))continue;
   const coords=[];for(const p of source.coords||[])if(point(p)&&(!coords.length||GPS.distance(coords.at(-1),p)>.5))coords.push([p[0],p[1]]);
   if(coords.length<2)continue;
   const lengthM=coords.slice(1).reduce((sum,p,i)=>sum+GPS.distance(coords[i],p),0),walkPath=source.mode==='walk'&&GPS.quality(source)==='mapped'&&/OSRM foot/i.test(source.geometrySource||'');
   const part={...source,coords,startM:totalM,endM:totalM+lengthM,lengthM,walkPath,index:parts.length};parts.push(part);
   if(walkPath)cues.push(...turns(coords,totalM,part.index));totalM+=lengthM;
  }
  const segments=GPS.build([{...leg,parts}]);return {from:leg?.from||'',to:leg?.to||'',parts,cues,segments,totalM,start:parts[0]?.coords[0],end:parts.at(-1)?.coords.at(-1)};
 }
 function match(plan,fix,previous){
  const p=[fix.lat,fix.lng],moved=previous?.fix?GPS.distance(p,[previous.fix.lat,previous.fix.lng]):0,dt=previous?.fix?(fix.timestamp-previous.fix.timestamp)/1000:Infinity;
  const limit=Math.max(100,moved*2+fix.accuracy*2+30),candidates=[];
  for(const s of plan.segments){const projected=GPS.project(p,s.a,s.b),alongM=s.beforeM+s.lengthM*projected.t;
   if(previous&&dt>=0&&dt<120&&(alongM<previous.alongM-40||alongM>previous.alongM+limit))continue;
   candidates.push({...projected,alongM,part:s.part,remainingM:Math.max(0,plan.totalM-alongM),fix});
  }
  if(!candidates.length)return {ambiguous:false,match:null};
  const closest=Math.min(...candidates.map(c=>c.distanceM)),near=candidates.filter(c=>c.distanceM<=closest+Math.min(10,fix.accuracy/2));
  near.sort((a,b)=>a.distanceM-b.distanceM||(previous?Math.abs(a.alongM-previous.alongM)-Math.abs(b.alongM-previous.alongM):a.alongM-b.alongM));
  let selected=near[0];
  if(!previous&&GPS.distance(p,plan.start)<=Math.max(20,fix.accuracy))selected=near.reduce((a,b)=>a.alongM<b.alongM?a:b);
  else if(!previous&&near.some(c=>Math.abs(c.alongM-selected.alongM)>100))return {ambiguous:true,match:null};
  if(previous){const continuous=near.filter(c=>c.distanceM<=selected.distanceM+5).sort((a,b)=>Math.abs(a.alongM-previous.alongM)-Math.abs(b.alongM-previous.alongM));selected=continuous[0]||selected;}
  return {ambiguous:false,match:selected};
 }
 function guide(plan,fix,previous=null,now=Date.now()){
  if(!plan?.segments.length)return {state:'unavailable',text:'저장된 이동 경로가 없어요'};
  if(!fix)return {state:'waiting',text:'현재 위치 확인 중…'};
  if(![fix.lat,fix.lng,fix.timestamp,fix.accuracy].every(Number.isFinite)||Math.abs(fix.lat)>90||Math.abs(fix.lng)>180||fix.accuracy<0)return {state:'waiting',text:'위치 갱신을 기다려 주세요'};
  if(now-fix.timestamp>30000||fix.timestamp>now+5000)return {state:'stale',text:'GPS 위치 갱신 대기'};
  if(fix.accuracy>50)return {state:'uncertain',text:'위치 오차가 커서 안내를 기다려요'};
  const result=match(plan,fix,previous),m=result.match;
  if(result.ambiguous)return {state:'ambiguous',text:'경로가 겹치는 지점 · 조금 이동해 주세요'};
  if(!m)return {state:'checking',text:'진행 위치를 다시 확인 중'};
  const p=m.part,base={match:m,part:p,remainingM:m.remainingM,routeDistanceM:m.distanceM,partRemainingM:Math.max(0,p.endM-m.alongM)};
  if(p.walkPath&&m.distanceM>Math.max(35,fix.accuracy*1.5))return {...base,state:'off',text:'저장 경로에서 벗어났어요',returnBearing:GPS.bearing([fix.lat,fix.lng],m.coord)};
  if(p.walkPath&&m.remainingM<=Math.max(18,fix.accuracy)&&GPS.distance([fix.lat,fix.lng],plan.end)<=Math.max(15,Math.min(20,fix.accuracy)))return {...base,state:'near',kind:'arrive',text:'목적지 근처예요 · 도착을 확인해 주세요',nextDistanceM:m.remainingM};
  if(p.walkPath){const cue=plan.cues.find(c=>c.partIndex===p.index&&c.atM>=m.alongM-6);return {...base,state:'guiding',kind:cue?.kind||'straight',text:cue?.text||`${p.to||plan.to} 방향으로 계속 이동`,cue,nextDistanceM:Math.max(0,(cue?.atM??p.endM)-m.alongM)};}
  if(['rail','metro'].includes(p.mode))return {...base,state:'transit',kind:'rail',text:`${p.to||plan.to} 방향으로 이동`,nextDistanceM:base.partRemainingM};
  if(p.mode==='transfer')return {...base,state:'reference',kind:'transfer',text:`현장 표지판을 따라 ${p.to||plan.to} 이동`};
  return {...base,state:'reference',kind:p.mode||'reference',text:p.mode==='taxi'?`Uber로 ${p.to||plan.to} 이동`:p.mode==='bus'?`${p.line||'버스'} 이용`:p.mode==='walk'?'현장 보행로를 확인하며 이동':'운항 구간 · 저장 경로는 위치 참고용'};
 }
 return {build,guide,turns,simplify};
});
