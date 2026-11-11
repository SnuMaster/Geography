'use strict';
// Build-time reference planning only. Published timetable stop events are not
// a live service feed or a guarantee that the January 2027 timetable is final.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {earliestArrival}=require('./earliest-arrival-core.cjs');
const D=require('../japan-2027/departure-core'),inputs=require('./tokyo-timetable-source-files.json');
const cache=path.resolve(process.env.TOKYO_TIMETABLE_CACHE||path.join(__dirname,'../../tokyo-timetable-cache'));
const checkedAt='2026-11-10',source='https://github.com/nagix/mini-tokyo-3d/tree/'+inputs.pin+'/data';
function read(name){const f=inputs.files.find(f=>f.name===name);if(!f)throw Error('Unregistered source '+name);const b=fs.readFileSync(path.join(cache,name));if(crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Source hash mismatch '+name);return JSON.parse(b);}
const minutes=s=>{if(!/^\d{1,2}:[0-5]\d$/.test(s||''))return null;let n=Number(s.split(':')[0])*60+Number(s.split(':')[1]);return n<180?n+1440:n;};
const distance=(a,b)=>{const rad=Math.PI/180,x=(a.coord[0]-b.coord[0])*Math.cos((a.coord[1]+b.coord[1])/2*rad),y=a.coord[1]-b.coord[1];return Math.hypot(x,y)*111195;};
const calendar=t=>['Weekday','SaturdayHoliday','Saturday','SundayHoliday','Daily'].find(c=>t.id.split('.').includes(c));
function network(){
 const bytes=fs.readFileSync(path.join(cache,'official-shinkansen.json'));if(crypto.createHash('sha256').update(bytes).digest('hex')!==require('./shinkansen-reference-inputs.json').compiledSha256)throw Error('Unverified official train reference. Run the checked extractor.');
 const central=JSON.parse(bytes),stations=[...read('stations.json'),...central.stations],stationMap=new Map(stations.map(s=>[s.id,s])),trains=central.trains.map(t=>({...t,file:'official-shinkansen'}));
 for(const f of inputs.files.filter(f=>f.path.startsWith('data/train-timetables/')))for(const t of read(f.name)){
  if(!t.tt?.length||/TH-LINER|HomeLiner|Liner|S-TRAIN/i.test(t.y||''))continue;
  trains.push({...t,file:f.name});
 }
 const byId=new Map(trains.map(t=>[t.id,t])),previous=new Map();
 for(const t of trains)for(const id of t.nt||[]){const n=byId.get(id),last=t.tt.at(-1),first=n?.tt[0];
  if(n&&calendar(n)===calendar(t)&&stationMap.get(last.s)?.title.ja===stationMap.get(first.s)?.title.ja&&minutes(last.a||last.d)<=minutes(first.d||first.a)){
   if(!previous.has(id))previous.set(id,[]);previous.get(id).push(t.id);
  }
 }
 const all=[],stationIds=new Set();
 for(const t of trains)for(let i=1;i<t.tt.length;i++){
  const a=t.tt[i-1],b=t.tt[i],dep=minutes(a.d),arr=minutes(b.a||b.d);if(dep===null||arr===null||arr<dep||!stationMap.has(a.s)||!stationMap.has(b.s))continue;
  stationIds.add(a.s);stationIds.add(b.s);all.push({from:a.s,to:b.s,departure:dep,arrival:arr,trip:t.id,lineId:t.r,type:t.y,calendar:calendar(t),file:t.file,train:t,callIndex:i,final:i===t.tt.length-1,...(i===1?{previousTrips:previous.get(t.id)||[]}:{})});
 }
 all.sort((a,b)=>a.departure-b.departure||a.arrival-b.arrival);
 const transfers=new Map();
 for(const group of read('station-groups.json'))for(let g=0;g<group.length;g++)for(const from of group[g])for(let h=0;h<group.length;h++)for(const to of group[h]){
  if(from===to||!stationIds.has(from)||!stationIds.has(to))continue;
  const meters=distance(stationMap.get(from),stationMap.get(to));
  // Source groups document connected stations; the walking/boarding allowance
  // remains an explicit estimate, never a claim about a verified passage.
  const min=g===h?3:6,amount=Math.max(min,Math.ceil(meters/65)+2);
  if(!transfers.has(from))transfers.set(from,[]);transfers.get(from).push({to,minutes:amount,meters,source:source+'/station-groups.json',samePaidArea:g===h});
 }
 for(const link of require('./tokyo-transfer-references.json').links)for(const [from,to]of [[link.from,link.to],[link.to,link.from]]){
  if(!stationIds.has(from)||!stationIds.has(to))throw Error('Unknown verified interchange '+from+' / '+to);
  if(!transfers.has(from))transfers.set(from,[]);transfers.get(from).push({to,minutes:link.minutes,source:link.source,samePaidArea:false});
 }
 // Shinkansen has separate gates. Include a deliberately generous transfer
 // allowance; a JR local-line platform change is never treated as a through ride.
 for(const s of central.stations)for(const other of stations.filter(x=>x.railway?.startsWith('JR-East.')&&x.title.ja===s.title.ja&&stationIds.has(x.id)))for(const [from,to]of [[s.id,other.id],[other.id,s.id]]){
  if(!transfers.has(from))transfers.set(from,[]);transfers.get(from).push({to,minutes:12,source:'https://railway.jr-central.co.jp/station-guide/shinkansen/',samePaidArea:false});
 }
 return {stations:stations.filter(s=>stationIds.has(s.id)),stationMap,all,transfers};
}
function apply(bundle,api){
 const net=network(),report=[],memo=new Map(),rail=p=>['rail','metro'].includes(p.mode);
 const point=s=>({name:s.title.ko||s.title.ja,jp:s.title.ja,lat:s.coord[1],lng:s.coord[0],stationId:s.id});
 function access(stop,inbound,old){const at={coord:[stop.lng,stop.lat]},near=net.stations.filter(s=>distance(s,at)<=1500).sort((a,b)=>distance(a,at)-distance(b,at));
  const unique=new Map();for(const s of near){const group=s.title.ja;if(!unique.has(group))unique.set(group,[]);unique.get(group).push(s);}
  const out=[];for(const candidates of [...unique.values()].slice(0,5))for(const s of candidates){const key=[stop.uid,s.id,inbound].join('|');let p=memo.get(key);
   if(!p){p=inbound?api.walk(point(s),stop):api.walk(stop,point(s));memo.set(key,p);}
   if(p.geometryAccuracy==='schematic'&&p.distanceM>30)continue;
   out.push({station:s.id,minutes:p.durationMinutes,part:p});
  }
  // Reuse the itinerary's reviewed walking approach when the street snapshot
  // does not cover a park/market entrance. Only a short station-representative
  // connector may be added; never replace a missing road by a long straight line.
  const atRail=inbound?old.parts.findLastIndex(rail):old.parts.findIndex(rail),edge=old.parts[atRail];
  const existing=inbound?old.parts.slice(atRail+1):old.parts.slice(0,atRail);
  if(edge&&existing.length&&existing.every(p=>['walk','transfer'].includes(p.mode))&&existing.some(p=>p.mode==='walk'&&p.geometryAccuracy!=='schematic')){
   const end=inbound?existing[0].coords[0]:existing.at(-1).coords.at(-1),pAt={coord:[end[1],end[0]]};
   for(const s of net.stations.filter(s=>distance(s,pAt)<=200)){
    const ps=structuredClone(existing),join=api.connector(inbound?point(s):{lat:end[0],lng:end[1]},inbound?{lat:end[0],lng:end[1]}:point(s));
    if(join.distanceM>2){if(inbound)ps.unshift(join);else ps.push(join);}
    const candidate={station:s.id,minutes:ps.reduce((n,p)=>n+p.durationMinutes,0),parts:ps};
    const i=out.findIndex(x=>x.station===s.id);if(i<0)out.push(candidate);else if(candidate.minutes<out[i].minutes)out[i]=candidate;
   }
  }return out;
 }
 for(const day of bundle.data.days)for(const variant of day.variants){const key=day.n+'-'+variant.id,legs=bundle.routes.days[key];
  for(let index=0;index<legs.length;index++){
   const old=legs[index],from=variant.stops[index],to=variant.stops[index+1];try{if(!old.parts.some(rail))continue;
   const protectedTrip=old.private||old.travel||old.fare?.displayBlank||old.parts.some(p=>p.lineId==='Special.Direct'||/^Hakone\./.test(p.lineId||''));
   if(protectedTrip){old.routePreference='retained-special-service';old.routePreferenceNotice='지정 직통·관광 교통 유지 · 최단시간 비교 미지원';report.push({key,index,status:'retained-special-service',reason:old.routePreferenceNotice});continue;}
   const end=api.interval(from).end,departure=minutes(end);if(departure===null){report.push({key,index,status:'departure-time-unavailable'});continue;}
   const date='2027-'+day.date.replace('/','-'),cal=D.calendarFor(date,{holidays:globalThis.RailDepartureProfiles.holidays}),weekday=new Date(date+'T00:00:00Z').getUTCDay();
   const allowed=new Set(cal==='Weekday'?['Weekday','Daily']:weekday===6?['SaturdayHoliday','Saturday','Daily']:['SaturdayHoliday','SundayHoliday','Daily']);
   const origins=access(from,false,old),ends=access(to,true,old),destinations=new Map(ends.map(x=>[x.station,x]));
   let result=earliestArrival({connections:net.all.filter(c=>allowed.has(c.calendar)),transfers:net.transfers,origins,destinations,departure});
   const direct=distance({coord:[from.lng,from.lat]},{coord:[to.lng,to.lat]})<=3000?api.walk(from,to):null;if(direct&&direct.geometryAccuracy!=='schematic'&&direct.durationMinutes<(result?.durationMinutes??Infinity))result={arrival:departure+direct.durationMinutes,durationMinutes:direct.durationMinutes,steps:[{kind:'access',part:direct,start:departure,end:departure+direct.durationMinutes}]};
   if(!result){report.push({key,index,status:'no-covered-reference-path',origins:origins.map(x=>x.station),destinations:ends.map(x=>x.station),allowed:[...allowed]});continue;}
   const parts=[];let invalid=false;
   for(const step of result.steps){
    if(step.kind==='access'||step.kind==='egress'){parts.push(...structuredClone(step.parts||[step.part]).filter(p=>p.distanceM>0));continue;}
    const a=net.stationMap.get(step.from),b=net.stationMap.get(step.to);
    if(step.kind==='transfer'){
     parts.push({...api.connector(point(a),point(b),'환승 · 여유 시간 포함'),durationMinutes:step.end-step.start,transferTimeBasis:'reference-estimate',source:step.source});continue;
    }
    const t=step.first.train,lastIndex=step.last.callIndex,startIndex=t.tt.findIndex(s=>s.s===step.from),calls=t.tt.slice(startIndex,lastIndex+1),limited=/LimitedExpress/.test(t.y),name=t.nm?.[0]?.ko||t.nm?.[0]?.ja;
    const p=api.rail(t.r,point(a),point(b),{minutes:step.end-step.start,...(limited?{line:t.r==='JR-Central.TokaidoShinkansen'?'도카이도 신칸센':/^(Odakyu|OdakyuHakone)\./.test(t.r)?'로망스카 · 특급':t.r==='Tobu.Tojo'?'가와고에 특급 · 추가요금 없음':t.r.startsWith('Tobu.')?'도부 특급':'특급',serviceType:t.y,serviceName:name}:{}),referenceStationIds:calls.map(s=>s.s),referenceStops:calls.map(s=>net.stationMap.get(s.s)).filter(Boolean).map(point)});
    if(p.geometryAccuracy==='schematic'){invalid=true;break;}
    p.durationMinutes=step.end-step.start;p.durationBasis='stored-timetable-reference';p.serviceType=t.y;p.fareClass=limited&&/^(Tobu\.(?!Tojo)|Odakyu\.|OdakyuHakone\.|JR-Central\.)/.test(t.r)?'reserved':'ordinary';p.referenceTrainIds=[t.id];p.referenceTimetable=t.officialSource||source+'/train-timetables/'+t.file;p.referenceServiceDate=date;
    // Continuation exists only when the raw source explicitly links trains.
    if(step.continued&&parts.at(-1)&&rail(parts.at(-1))){const prev=parts.at(-1),tag=prev.throughService||'직통 열차 · 계속 탑승';prev.throughService=tag;p.throughService=tag;}
    const previous=parts.at(-1);
    if(step.continued&&previous?.lineId===p.lineId&&previous.line===p.line){previous.coords.push(...p.coords.slice(1));previous.to=p.to;previous.toJa=p.toJa;previous.durationMinutes=step.end-result.steps.find(s=>s.kind==='ride'&&s.trip===previous.referenceTrainIds[0]).start;previous.distanceM+=p.distanceM;previous.referenceTrainIds.push(...p.referenceTrainIds);previous.referenceStationIds.push(...p.referenceStationIds.slice(1));}
    else parts.push(p);
   }
   if(invalid){report.push({key,index,status:'unverified-geometry-retained'});continue;}
   const next=api.connection(from,to,{parts,minutes:result.durationMinutes,...(parts.some(rail)?{fare:api.unknown()}:{})});
   // Small representative-coordinate joins sit inside the boarding/transfer
   // allowance. Counting these again would double-charge transfer minutes.
   for(const p of next.parts)if(p.mode==='transfer'&&p.line==='역내·출입구 연결'){p.durationMinutes=0;p.durationIncludedInAllowance=true;}
   // Do not overwrite a fare from a different OD or an old route's booking.
   const signature=ps=>ps.filter(rail).map(p=>[p.lineId,p.from,p.to,p.line]);
   const changed=JSON.stringify(signature(old.parts))!==JSON.stringify(signature(next.parts));
   if(!changed)next.fare=structuredClone(old.fare);
   next.routePreference='fastest-reference';next.timeComparison={policy:'earliest-arrival',departureDate:date,departureMinutes:departure,referenceArrivalMinutes:result.arrival,totalMinutes:result.durationMinutes,walkingMinutes:result.steps.filter(s=>s.kind==='access'||s.kind==='egress').reduce((n,s)=>n+s.end-s.start,0),transferMinutes:result.steps.filter(s=>s.kind==='transfer').reduce((n,s)=>n+s.end-s.start,0),source,sourceCheckedAt:checkedAt,sourceClass:'public-reference',travelDateVerified:false,live:false,boardingAllowanceMinutes:1,transferAllowance:'동일 유료 구역 최소 3분·구역 간 최소 6분 + 대표 좌표 보행 추정',scope:'등록된 공개 시간표·환승 연결·저장 보행로에서 가장 빠른 도착. 전 노선·실시간·여행일 확정 다이어 보장 아님',previousSummary:old.summary,previousPlannedMinutes:old.durationMinutes};
   next.durationLabel='참고 시간표 기준 약 '+result.durationMinutes+'분';next.note+=' 도보·환승·대기를 포함한 저장 시간표 최단시간 후보 · 여행일 운행 재확인.';
   next.timeComparison.sources=[...new Set(next.parts.map(p=>p.referenceTimetable||p.source).filter(Boolean))];
   next.timeComparison.waitingMinutes=Math.max(0,result.durationMinutes-result.steps.reduce((n,s)=>n+s.end-s.start,0));
   legs[index]=next;to.transportFromPrevious=next.summary+' · '+next.durationLabel;
   report.push({key,index,status:changed?'route-changed':'timing-rechecked',previous:old.summary,selected:next.summary,minutes:result.durationMinutes,railParts:next.parts.filter(rail).map(p=>({lineId:p.lineId,from:p.from,to:p.to}))});
   }finally{
    // Recompute the next departure from the updated visit window, rather than
    // optimizing later trains against an already obsolete departure time.
    const prev=api.interval(from),cur=api.interval(to),a=api.minutes(prev.end),b=api.minutes(cur.start),z=api.minutes(cur.end),duration=legs[index].durationMinutes;
    if(day.n!==1&&!to.reservationKey&&a!==null&&b!==null&&z!==null&&Number.isFinite(duration)&&a+duration>b){const delta=a+duration-b;api.setTime(to,api.formatTime(b+delta),api.formatTime(z+delta));}
   }
  }
 }
 bundle.data.metadata.routePreference='fastest-reference';bundle.data.metadata.fastestCheckedAt=checkedAt;bundle.data.metadata.fastestScope='등록된 저장 시간표·환승·도보 기준 최단시간 우선 · 2027 운행 미확정 · 실시간 아님';
 bundle.data.metadata.fastestCoverage=report.reduce((n,r)=>(n[r.status]=(n[r.status]||0)+1,n),{});
 return report;
}
module.exports={apply,network};
