'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('../japan-2027/location-core'),T=require('../japan-2027/data-model');
const clone=x=>JSON.parse(JSON.stringify(x)),point=s=>[s.lat,s.lng],object=(p,name)=>({lat:p[0],lng:p[1],name});
function link(a,z){return {mode:'transfer',line:'정류장·보행 경로 연결',from:a.name||'',to:z.name||'',coords:[point(a),point(z)],distanceM:Math.round(G.distance(point(a),point(z))),durationMinutes:0,geometryAccuracy:'schematic',geometrySource:'정류장 승하차 연결 참고 · 실제 보행 통로 현장 확인',source:'https://www.openstreetmap.org/'};}
function access(a,z,r){
 const first=object(r.coords[0]),last=object(r.coords.at(-1)),parts=[];
 if(G.distance(point(a),point(first))>2)parts.push(link(a,first));
 parts.push({mode:r.shortConnector?'transfer':'walk',line:r.shortConnector?'정류장 입구 연결':'정류장까지 도보',from:a.name,to:z.name,coords:clone(r.coords),distanceM:r.distanceM,durationMinutes:r.durationMinutes,geometryAccuracy:r.shortConnector?'schematic':'mapped',geometrySource:r.shortConnector?'정류장 입구 연결 참고 · 현장 통로 확인':'OpenStreetMap / FOSSGIS 정류장 접근 보행 경로',source:r.source});
 if(G.distance(point(last),point(z))>2)parts.push(link(last,z));return parts;
}
function apply(bundle,e){
 for(const p of e.placeCorrections||[])for(const d of bundle.data.days)for(const v of d.variants)for(const s of v.stops)if(s.planKey===p.key){s.lat=p.point[0];s.lng=p.point[1];s.source=p.source;s.coordinateAccuracy='public-stop-reference';s.coordinateNote=p.note;s.details.sources=[...new Set([...s.details.sources,p.source])];}
 const reviewed=[];
 for(const r of e.routes){
  const d=bundle.data.days.find(d=>d.n===Number(r.key.split('-')[0])),v=d.variants.find(v=>v.id==='main'),l=bundle.routes.days[r.key][r.index],a=v.stops[r.index],z=v.stops[r.index+1];
  if(!l?.parts.some(p=>p.mode==='bus'&&p.lineId===r.lineId))throw Error('Bus signature changed '+r.key+'#'+r.index);
  const boarding=object(r.boarding.point,r.boarding.name),alighting=object(r.alighting.point,r.alighting.name),parts=access(a,boarding,r.walkIn),begin=object(r.bus.coords[0],r.boarding.name),end=object(r.bus.coords.at(-1),r.alighting.name);
  if(G.distance(point(boarding),point(begin))>2)parts.push(link(boarding,begin));
  parts.push({mode:'bus',lineId:r.lineId,line:r.line,from:r.boarding.name,to:r.alighting.name,fromJa:r.boarding.name,toJa:r.alighting.name,coords:clone(r.bus.coords),distanceM:r.bus.distanceM,durationMinutes:r.bus.durationMinutes,geometryAccuracy:r.accuracy,geometrySource:r.geometryBasis,source:r.bus.source,sources:r.sources,stopSequence:r.stops.map(s=>({name:s.name,point:s.point})),boardingStop:r.boarding,alightingStop:r.alighting,sourceCheckedAt:e.checkedAt});
  if(G.distance(point(end),point(alighting))>2)parts.push(link(end,alighting));parts.push(...access(alighting,z,r.walkOut));
  l.parts=parts;l.distanceM=parts.reduce((n,p)=>n+p.distanceM,0);l.walkDistanceM=parts.filter(p=>['walk','transfer'].includes(p.mode)).reduce((n,p)=>n+p.distanceM,0);l.durationMinutes=parts.reduce((n,p)=>n+p.durationMinutes,0)+r.waitMinutes;l.durationLabel='계획 약 '+l.durationMinutes+'분 · 도보·대기 포함';l.summary=r.line;
  l.busRoute={boarding:r.boarding,alighting:r.alighting,stops:r.stops.map(s=>({name:s.name,point:s.point})),accessMinutes:r.walkIn.durationMinutes,egressMinutes:r.walkOut.durationMinutes,waitMinutes:r.waitMinutes,geometryBasis:r.geometryBasis,geometryAccuracy:r.accuracy,sources:r.sources,checkedAt:e.checkedAt,winterTimetable:r.winterTimetable||null,feedEndDate:r.feedEndDate||null,live:false};
  l.note='승차 '+r.boarding.name+' → 하차 '+r.alighting.name+' · '+r.geometryBasis+' · 정류장까지의 도보·대기 포함. 실제 정류장 표지·운행·겨울 통제는 현장 확인.';
  reviewed.push({key:r.key,index:r.index,boarding:r.boarding.name,alighting:r.alighting.name,points:r.bus.coords.length,durationMinutes:l.durationMinutes,unchangedFare:l.fare.icYen});
 }
 // Preserve visit lengths when newly explicit access/wait time exceeds a gap.
 // This never invents a timetable or changes the chosen train services.
 for(const n of [5,8]){const d=bundle.data.days.find(d=>d.n===n),ss=d.variants[0].stops,ls=bundle.routes.days[n+'-main'];for(let i=1;i<ss.length;i++){const prior=T.interval(ss[i-1]),now=T.interval(ss[i]),start=T.minutes(now.start),before=T.minutes(prior.end),duration=ls[i-1].durationMinutes;if(start!==null&&before!==null&&Number.isFinite(duration)&&start<before+duration){const next=before+duration,stay=Math.max(0,(T.minutes(now.end)??start)-start);if(next+stay>=1440)throw Error('Day exceeds midnight');T.setTime(ss[i],T.formatTime(next),T.formatTime(next+stay));}}}
 T.prepare(bundle.data,bundle.routes);for(const d of bundle.data.days){d.schedule=d.variants[0].schedule;d.rows=d.schedule;}
 bundle.data.nightRows=bundle.data.days.map(d=>[d.date,d.title,d.variants[0].stops.at(-1).time]);bundle.data.metadata.reviewBusCheckedAt=e.checkedAt;bundle.data.metadata.reviewedBusLegs=reviewed.length;
 return {reviewed};
}
module.exports={apply,access};
if(require.main===module){const file=path.join(__dirname,'../japan-2027/trip-update.json'),b=JSON.parse(fs.readFileSync(file));console.log(JSON.stringify(apply(b,require('./tokyo-reviewed-bus-geometry.json')),null,2));fs.writeFileSync(file,JSON.stringify(b)+'\n');}
