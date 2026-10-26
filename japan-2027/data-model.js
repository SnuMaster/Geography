'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TripData=api;})(globalThis,function(){
 function merge(base,tokyo,west){
  base=JSON.parse(JSON.stringify(base));
  if(tokyo){const a=base.days[0],old=a.variants[0],prefix=old.stops.slice(0,8).map((s,i)=>({...s,uid:`d1-main-${i}`,id:`d1-main-${i}`}));
   for(const patch of tokyo.arrival.prefixDetails){Object.assign(prefix[patch.index],patch);delete prefix[patch.index].index;}
   const v={...old,...tokyo.arrival.variant,stops:[...prefix,...tokyo.arrival.variant.stops]};v.schedule=v.stops.map(s=>[s.time,s.name,s.description]);
   Object.assign(a,tokyo.arrival.day,{variants:[v],schedule:v.schedule,rows:v.schedule});base.days.splice(1,10,...tokyo.days);Object.assign(base.food,tokyo.food);
  }
  if(west){const by=new Map(west.days.map(d=>[d.n,d]));base.days=base.days.map(d=>by.get(d.n)||d);Object.assign(base.food,west.food);}
  return base;
 }
 function minutes(t){const m=/^(\d{1,2}):(\d{2})$/.exec(t||'');return m?Number(m[1])*60+Number(m[2]):null;}
 function interval(s){const times=(s.time||'').match(/\d{1,2}:\d{2}/g)||[];return {start:s.start||times[0]||null,end:s.end||times[1]||times[0]||null};}
 function date(n){return `2027-01-${String(n+7).padStart(2,'0')}`;}
 function geometry(part){
  const src=part.geometrySource||'';
  if(part.mode==='flight'){const recorded=part.flightTrack?.status==='recorded-reference',screen=part.flightTrack?.status==='screen-reference';return {kind:recorded?'recorded-reference':screen?'map-reference':'schematic',label:recorded?'기록 기반 참고 항로 · 여행 당일 실제 항적 아님':screen?'지도 복원 참고 항로 · 원본 GPS 항적 아님':'개략 항로 · 실제 항적 아님'};}
  if(part.mode==='ferry')return {kind:'recorded-reference',label:'기록 기반 해상 참고선 · 실제 항적 아님'};
  if(/개략|직선|대표 연결|추정|미확인/.test(src)||!src)return {kind:'schematic',label:'개략선 · 실제 경로 미확인'};
  if(/OSRM|도로|보행|N02|선형|Mini Tokyo|OpenStreetMap|고속선/i.test(src))return {kind:'map-reference',label:'지도 복원 참고 경로'};
  return {kind:'map-reference',label:'지도 복원 참고 경로 · 출입구 확인 필요'};
 }
 function prepare(data,routes){
  for(const d of data.days)for(const v of d.variants){
   v.stops.forEach((s,i)=>{const t=interval(s);s.start=t.start;s.end=t.end;s.uid=s.uid||s.id||`d${d.n}-${v.id}-${i}`;s.mapQuery=`${s.lat},${s.lng}`;});
   const legs=routes.days?.[`${d.n}-${v.id}`]||[];
   legs.forEach((l,i)=>{if(!l)return;l.dayNumber=d.n;l.variant=v.id;l.legIndex=i+1;l.legId=`d${d.n}-${v.id}-leg-${i+1}`;l.serviceDate=date(d.n);l.departureBasis='일정 예정 시각';const arrival=interval(v.stops[i+1]||{});l.arrivalAt=arrival.start?Date.parse(`${l.serviceDate}T${arrival.start}:00+09:00`):null;const t=interval(v.stops[i]||{});l.departureTimeKnown=!!(t.end||t.start);l.departureAt=Date.parse(`${l.serviceDate}T${t.end||t.start||'00:00'}:00+09:00`);for(const p of l.parts||[])p.geometry=geometry(p);});
  }
  return {data,routes};
 }
 function counts(data,routes){return {days:data.days.length,variants:data.days.reduce((n,d)=>n+d.variants.length,0),stops:data.days.flatMap(d=>d.variants).reduce((n,v)=>n+v.stops.length,0),legs:Object.values(routes.days).reduce((n,ls)=>n+ls.length,0),railParts:Object.values(routes.days).flat().filter(Boolean).flatMap(l=>l.parts).filter(p=>['rail','metro'].includes(p.mode)).length};}
 return {merge,prepare,interval,minutes,date,geometry,counts};
});
