'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../japan-2027/rail-departure-profiles');
const manifest=global.RailDepartureProfiles,bundle=require('../japan-2027/trip-update.json'),D=require('../japan-2027/departure-core'),R=require('../japan-2027/ride-core'),F=require('../japan-2027/fare-core');
const entries=Object.entries(manifest.profiles).filter(([key])=>key.startsWith('tokyo27-'));
const pack=p=>require('../japan-2027/'+p.file),schedule=(k,p)=>pack(p).profiles[k];
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={URL,URLSearchParams,DepartureCore:D,FareCore:F,TravelStore:{VERSION:'test'},RailDepartureProfiles:manifest,BoundedCache:require('../japan-2027/lru-cache'),window:{TripPersonal:{station:(a,b)=>b?`${a}(${b})`:a}},TripPersonal:{station:(a,b)=>b?`${a}(${b})`:a},document:{addEventListener(){}},esc:h,railBadge:()=>'<span>노선</span>'};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-departures.js'),'utf8')+';globalThis.api=RailDepartures;',ctx);

test('every active rail part has a timetable profile',()=>{
 const remaining=[];let total=0;
 for(const legs of Object.values(bundle.routes.days))for(const leg of legs)for(const part of leg.parts.filter(p=>['rail','metro'].includes(p.mode))){total++;if(!ctx.api.keyFor(leg,part))remaining.push(part.lineId);}
 assert.ok(total>20);assert.deepEqual(remaining,[]);
 assert.ok(entries.length>10);assert.ok(Object.keys(manifest.profiles).length-entries.length>=102);
});
test('all active train cards and reverse directions have measured distances and fares',()=>{
 ctx.api.setRouteReferences(bundle.routes);
 assert.equal(ctx.api.noticeItems(bundle.data.days,bundle.routes).length,0);
 for(const [day,legs] of Object.entries(bundle.routes.days))for(const leg of legs){
  if(!ctx.api.keysFor(leg).length)continue;
  const html=ctx.api.html(Number(day.split('-')[0]),leg,null,{fare:F.format(leg.fare,leg)},true);
  assert.doesNotMatch(html,/확인 필요|요금 미확인|저장 시간표 없음/);
  for(const [,data] of html.matchAll(/data-compact-metrics="(.*?)" data-query-mode/g)){
   const {byProfile}=JSON.parse(data.replace(/&quot;|&lt;|&gt;|&amp;|&#39;/g,c=>({'&quot;':'"','&lt;':'<','&gt;':'>','&amp;':'&','&#39;':"'"}[c])));
   for(const [key,quote] of Object.entries(byProfile)){
    assert.match(quote.distance,/^\d+\.\d km$/,key);
    const payment=leg.fare.purchase;
    if(payment&&ctx.api.keysFor(leg).includes(key)&&(payment.scope==='full'||manifest.profiles[key]?.lineId.startsWith('Tobu.')))assert.equal(quote.fare,F.format(leg.fare,leg),key);
    else if(leg.fare.displayBlank){assert.equal(quote.fare,'');assert.equal(quote.displayBlank,true);}
    else assert.match(quote.fare,/^[\d,]+ JP¥$/,key);
   }
  }
 }
});
test('Haneda rail cards use the Yamanote outer loop and the Monorail terminal 3 stop',()=>{
 const legs=bundle.routes.days['12-main'];
 const [jr,mono]=ctx.api.keysFor(legs.at(-1));
 assert.deepEqual(Array.from(ctx.api.keysFor(legs.find(l=>l.to.includes('야키토리 고쿠')))),['metro-iriya-ueno']);
 assert.equal(jr,'yamanote-ueno-hamamatsucho-outer');
 assert.equal(mono,'monorail-hamamatsucho-haneda-t3');
 for(const [key,counts] of [[jr,[259,254]],[mono,[215,203]]]){
  const p=manifest.profiles[key],data=schedule(key,p);
  assert.deepEqual([data.Weekday.length,data.SaturdayHoliday.length],counts);
  for(const row of [...data.Weekday,...data.SaturdayHoliday]){
   assert(row.id.startsWith(p.lineId+'.'));
   assert.equal(row.stops[0].id,p.sourceFromId);
   assert.equal(row.stops.at(-1).id,p.sourceToId);
   assert.equal(row.destinationArrival,row.stops.at(-1).arrival??null);
   assert.equal(row.destinationDeparture,row.stops.at(-1).departure??null);
  }
 }
});
test('every new train survives real weekday and Japanese-holiday normalization with ordered source stop events',()=>{
 let rows=0;
 for(const[key,p]of entries)for(const [calendar,records]of Object.entries(schedule(key,p))){
  const date=calendar==='Weekday'?'2027-01-13':'2027-01-11',trains=R.trainsForDate(schedule(key,p),date,{...p,holidays:manifest.holidays});assert.equal(trains.length,records.length,key+' '+calendar);
  for(const t of trains){assert.ok(Number.isFinite(t.departureAt)&&Number.isFinite(t.destinationAt)&&t.destinationAt>t.departureAt,key);let last=t.departureAt;for(const s of t.stops.slice(1)){for(const at of [s.arrivalAt,s.timeAt,s.departureAt].filter(Number.isFinite)){assert.ok(at>=last,key+' reversed stop time');last=at;}}}
  for(const r of records){assert.equal(r.departure,r.stops[0].departure);assert.equal(r.destinationArrival,r.stops.at(-1).arrival||null);assert.equal(r.destinationDeparture,r.stops.at(-1).departure||null);if(p.sourceClass==='public-reference')assert.ok(r.sourceTrainIds.every(id=>id.split('.').includes(calendar)));}
  rows+=records.length;
 }
 assert.ok(rows>1000);
});
test('selected Nikko express chains preserve explicit through connections and exclude local trains',()=>{
 const both=entries.filter(([,p])=>p.throughParts?.some(q=>q.lineId==='Tobu.Nikko'));assert.ok(both.length>=2);
 for(const[k,p]of both){assert.ok(p.throughParts.length>=2);for(const r of Object.values(schedule(k,p)).flat()){assert.equal(r.type,'LimitedExpress');assert.ok(r.sourceTrainIds.length>=2);assert.ok(r.stops.length>=2);assert.equal(r.stops[0].id,p.sourceFromId);assert.equal(r.stops.at(-1).id,p.sourceToId);assert.match(r.number,/게곤|けごん|기누|きぬ|스페이시아|スペーシア|아이즈|会津/);}}
});

test('active Yamanote directions preserve the selected OD without traversing the opposite loop',()=>{
 for(const legs of Object.values(bundle.routes.days))for(const leg of legs)for(const part of leg.parts.filter(p=>p.lineId==='JR-East.Yamanote'&&!p.departureInfo)){
  const k=ctx.api.keyFor(leg,part),p=manifest.profiles[k];assert.ok(p);
  for(const r of Object.values(schedule(k,p)).flat()){assert.equal(r.stops[0].id,p.sourceFromId);assert.equal(r.stops.at(-1).id,p.sourceToId);const ids=r.stops.map(s=>s.id);assert.equal(new Set(ids).size,ids.length);}
 }
});
test('official cable columns preserve all 30 departures per direction and calendar without inventing arrival events',()=>{
 for(const [k,p]of entries.filter(([,p])=>p.lineId==='Hakone.Cable')){assert.equal(p.sourceClass,'official-current');for(const records of Object.values(schedule(k,p))){assert.equal(records.length,30);for(const r of records){assert.equal(r.destinationArrival,null);assert.equal(r.destinationDeparture,null);assert.equal(r.stops.length,6);assert.ok(r.stops.slice(1).every(s=>s.time&&!s.arrival&&!s.departure));assert.ok(r.sourcePage&&r.sourceColumn);}}}
 const [k,p]=entries.find(([,p])=>p.lineId==='Hakone.Cable'&&p.from==='고라'),r=schedule(k,p).Weekday.find(r=>r.departure==='10:01');assert.equal(r.stops.at(-1).time,'10:12');
});
test('public projections remain labeled as references and every pack fits the bounded timetable cache',()=>{
 const files=new Set();for(const[k,p]of entries){const meta=pack(p).metadata[k];assert.equal(p.sourceDate,meta.verifiedSourceDate||meta.retrievedAt);assert.equal(p.validUntil,null);if(p.sourceClass==='public-reference'){const validity=D.validity(p,'2027-01-13');assert.equal(validity.travelVerified,false);assert.match(validity.label,/공개 시간표 참고/);assert.doesNotMatch(validity.label,/공식 현재/);assert.equal(meta.upstreamCommit,'c708abea8bf05ab56137a50e52c032112b6f9beb');for(const sha of Object.values(meta.sourceSha256))assert.match(sha,/^[a-f0-9]{64}$/);}if(!files.has(p.file)){files.add(p.file);assert.ok(JSON.stringify(pack(p)).length*2<8*1024*1024,p.file+' exceeds mobile cache budget');}}
});
test('ropeway operating hours and official Shinkansen lookup cannot create countdowns or boarding actions',()=>{
 for(const[day,index,line,label]of [[6,1,'Hakone.Ropeway','연속 순환운행'],[14,0,'JR-Central.TokaidoShinkansen','공식 시간표 확인']]){
  const legacy=require('./fixtures/tokyo-plan-20261111.json'),leg=legacy.routes.days[day+'-main'][index],part=leg.parts.find(p=>p.lineId===line),html=ctx.api.html(day,leg,part,{},true);assert.match(html,new RegExp(label));assert.doesNotMatch(html,/data-departure-profile=|data-departure-countdown|data-ride-choose|data-ride-next/);assert.match(html,/공식 운행·시간표 확인/);
 }
});
