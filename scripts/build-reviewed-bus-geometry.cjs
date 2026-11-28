'use strict';
const fs=require('node:fs'),G=require('../japan-2027/location-core'),sources=require('./tokyo-reviewed-bus-sources.json'),fuji=require('./tokyo-fuji-reviewed-stops.json'),b=require('../japan-2027/trip-update.json');
const copy=x=>JSON.parse(JSON.stringify(x)),headers={'User-Agent':'KISEKI-Public-Itinerary/1.0 (github.com/SnuMaster/Geography)'};
async function route(mode,points){
 const url='https://routing.openstreetmap.de/routed-'+mode+'/route/v1/driving/'+points.map(p=>p[1]+','+p[0]).join(';')+'?overview=full&geometries=geojson&steps=false&continue_straight=true';
 let last;for(let i=0;i<3;i++){try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json(),a=j.routes?.[0];if(j.code!=='Ok'||!a?.geometry?.coordinates?.length)throw Error('No routed geometry');return {coords:a.geometry.coordinates.map(([lng,lat])=>[lat,lng]),distanceM:Math.round(a.distance),durationMinutes:Math.max(1,Math.ceil(a.duration/60)),source:url};}catch(e){last=e;await new Promise(r=>setTimeout(r,1500));}}throw last;
}
async function foot(a,z){if(G.distance(a,z)<15)return {coords:[a,z],distanceM:Math.round(G.distance(a,z)),durationMinutes:0,source:'https://www.openstreetmap.org/',shortConnector:true};return route('foot',[a,z]);}
function nearest(coords,p){
 const k=Math.cos(p[0]*Math.PI/180);let best={distance:Infinity};
 for(let i=1;i<coords.length;i++){const a=coords[i-1],z=coords[i],x=(z[1]-a[1])*k,y=z[0]-a[0],u=(p[1]-a[1])*k,v=p[0]-a[0],t=Math.max(0,Math.min(1,(u*x+v*y)/(x*x+y*y||1))),point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t],d=G.distance(point,p);if(d<best.distance)best={distance:d,index:i-1,t,point};}return best;
}
async function joined(r){
 const coords=copy(r.chains[0]),repairs=[];
 for(const raw of r.chains.slice(1)){let c=copy(raw);if(G.distance(coords.at(-1),c.at(-1))<G.distance(coords.at(-1),c[0]))c.reverse();const gap=G.distance(coords.at(-1),c[0]);
  if(gap>1){if(gap>350)throw Error('Unreviewed bus relation gap '+gap);const road=await route('car',[coords.at(-1),c[0]]);repairs.push({distanceM:road.distanceM,source:road.source});coords.push(...road.coords);}
  coords.push(...c.slice(gap<1?1:0));
 }return {coords,repairs};
}
function clip(coords,a,z){const p=nearest(coords,a),q=nearest(coords,z);if(p.distance>110||q.distance>110||p.index+p.t>=q.index+q.t)throw Error('Stop outside directional bus geometry '+JSON.stringify([p,q]));return {coords:[p.point,...coords.slice(p.index+1,q.index+1),q.point],snap:{boardingMeters:Math.round(p.distance),alightingMeters:Math.round(q.distance)}};}
function length(c){let n=0;for(let i=1;i<c.length;i++)n+=G.distance(c[i-1],c[i]);return Math.round(n);}
(async()=>{
 const out={checkedAt:'2026-11-18',builtAt:'2026-11-23',license:'OpenStreetMap ODbL',routes:[],placeCorrections:[]};
 // The former GSI area centroid was 540m from the park entrance. Pin the
 // adjacent official Natural Living Center stop as a disclosed entrance reference.
 const oishi={key:'oishi',point:fuji.routes.fujiOut.stops.at(-1).point,source:fuji.sourcePage,note:'오이시공원·자연생활관 입구 대표점 · 공식 버스 정류장 좌표 기준'};
 out.placeCorrections.push(oishi);
 for(const [name,index]of [['fujiOut',2],['fujiLunch',3],['fujiRopeway',5]]){
  const seq=fuji.routes[name],leg=b.routes.days['5-main'][index],ss=b.data.days[4].variants[0].stops;
  const first=seq.stops[0],last=seq.stops.at(-1),start=ss[index].planKey==='oishi'?oishi.point:[ss[index].lat,ss[index].lng],end=ss[index+1].planKey==='oishi'?oishi.point:[ss[index+1].lat,ss[index+1].lng];
  const road=await route('car',seq.stops.map(s=>s.point)),walkIn=await foot(start,first.point),walkOut=await foot(last.point,end),minutes=t=>{const a=t.split(':').map(Number);return a[0]*60+a[1];};
  const missed=seq.stops.filter(s=>nearest(road.coords,s.point).distance>90);if(missed.length)throw Error('Fujikyu route missed official stop '+JSON.stringify(missed));
  out.routes.push({key:'5-main',index,lineId:'Fujikyu.Kawaguchiko.Red',line:'후지급행 레드라인 · 가와구치코 주유버스',boarding:first,alighting:last,stops:seq.stops,bus:{...road,durationMinutes:minutes(last.arrival)-minutes(first.departure)},walkIn,walkOut,waitMinutes:5,accuracy:'stop-verified-reference',geometryBasis:'공식 GTFS 정류장 순서 경유 · OpenStreetMap 도로 복원 참고 · 운영사 GPS 선형은 미제공',sources:[fuji.sourcePage,fuji.source,'https://bus.fujikyu.co.jp/fujitour/kawaguchiko/'],feedVersion:fuji.feed[0]?.feed_version,feedEndDate:fuji.feed[0]?.feed_end_date});
 }
 for(const [name,index,from,to,minutes]of [['nikkoCout',1,'東武日光駅','中禅寺温泉',45],['nikkoYout',3,'二荒山神社中宮祠','三本松',20],['nikkoYin',4,'三本松','東武日光駅',65]]){
  const r=sources.routes[name],s=r.stops.find(s=>s.name===from),z=r.stops.find(s=>s.name===to),path=await joined(r),clipped=clip(path.coords,s.point,z.point),ss=b.data.days[7].variants[0].stops,walkIn=await foot([ss[index].lat,ss[index].lng],s.point),walkOut=await foot(z.point,[ss[index+1].lat,ss[index+1].lng]);
  const stops=r.stops.slice(r.stops.indexOf(s),r.stops.indexOf(z)+1);
  out.routes.push({key:'8-main',index,lineId:index===1?'TobuBus.Nikko.C':'TobuBus.Nikko.Y',line:index===1?'도부버스 C · 주젠지온천행':index===3?'도부버스 Y · 유모토온천 방면':'도부버스 Y · 도부닛코역행',boarding:s,alighting:z,stops,bus:{coords:clipped.coords,distanceM:length(clipped.coords),durationMinutes:minutes,source:r.source},walkIn,walkOut,waitMinutes:5,accuracy:path.repairs.length?'route-reference-repaired':'route-relation-reference',geometryBasis:path.repairs.length?'방향별 OpenStreetMap 버스 노선 · 누락된 짧은 연결은 도로 복원 참고':'방향별 OpenStreetMap 버스 노선 · 공식 정류장·운행 방향 대조',repairs:path.repairs,snap:clipped.snap,sources:[r.source,'https://www.tobu-bus.com/pc/area/nikko/','https://www.tobu-bus.com/storage/whatsnew/files/7CxYNIz4dep8d3S5EbEz2MUln85OSqxRxNwLXStd.pdf'],winterTimetable:{from:'2026-12-01',through:'2027-03-31',live:false}});
 }
 fs.writeFileSync('scripts/tokyo-reviewed-bus-geometry.json',JSON.stringify(out)+'\n');console.log(JSON.stringify(out.routes.map(r=>({key:r.key,index:r.index,from:r.boarding.name,to:r.alighting.name,points:r.bus.coords.length,stops:r.stops.length,busMinutes:r.bus.durationMinutes,walkIn:r.walkIn.durationMinutes,walkOut:r.walkOut.durationMinutes,basis:r.geometryBasis})),null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
