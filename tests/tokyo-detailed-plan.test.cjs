'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../japan-2027/data-model');
const b=JSON.parse(fs.readFileSync(__dirname+'/../japan-2027/trip-update.json'));
T.prepare(b.data,b.routes);
test('approved calendar with Jan 9 empty and two excursions',()=>{
 assert.equal(b.revision,'20261126-tokyo-asakusa-1');
 assert.deepEqual(b.data.days.map(d=>d.n),Array.from({length:12},(_,i)=>i+1));
 assert.deepEqual(b.data.days.filter(d=>[5,8].includes(d.n)).map(d=>d.cityLabel),['가와구치코','닛코']);
 assert.equal(b.data.days[1].title,'일정 없음');assert.deepEqual(b.data.days[1].variants[0].stops,[]);assert.deepEqual(b.routes.days['2-main'],[]);
 const day11=b.data.days[10],stops=day11.variants[0].stops;
 assert.equal(day11.title,'아사쿠사·스미다강·스카이트리');
 assert.deepEqual(stops.map(s=>s.planKey),['hotel','kappabashi','sensoji','mugitoro','sumidaWalk','solamachi','skytree','yoroiya','hotel']);
 assert.equal(new Set(stops.map(s=>s.selectionId)).size,stops.length);
 assert.equal(b.data.nightRows[10][1],day11.title);
 const legs=b.routes.days['11-main'];
 assert(legs.every(l=>l.parts.every(p=>p.mode==='walk'&&p.geometryAccuracy==='mapped')));
 assert(legs[4].parts[0].coords.some(([lat,lng])=>Math.abs(lat-35.7116353)<0.00003&&Math.abs(lng-139.8015955)<0.00003),'River Walk crossing');
 assert(legs[6].parts[0].coords.some(([lat,lng])=>Math.abs(lat-35.70992)<0.00003&&Math.abs(lng-139.79924)<0.00003),'Azuma Bridge crossing');
 assert(!b.data.days.some(d=>/오사카|하코네|아타미|가와고에/.test(d.title)));
});
test('public map stops have unique new IDs, sources and one connected leg per interval',()=>{
 const ids=new Set();
 for(const d of b.data.days)for(const v of d.variants){const legs=b.routes.days[d.n+'-'+v.id];assert.equal(legs.length,Math.max(0,v.stops.length-1));assert(legs.every(l=>l.parts?.length),'App requires one explicit part per connection');
  v.stops.forEach((s,i)=>{assert(!ids.has(s.uid));ids.add(s.uid);assert.match(s.uid,/^t27-(p1118|12)-/);if(s.kind==='home'){assert.equal(s.lat,null);assert.equal(s.lng,null);}else{assert(Number.isFinite(s.lat)&&Number.isFinite(s.lng),s.name);assert(s.source||s.coordinateSource||s.details?.sources?.length,s.name);}
   if(i){assert.equal(legs[i-1].fromUid,v.stops[i-1].uid);assert.equal(legs[i-1].toUid,s.uid);}
  });
 }
});
test('meal budget, Ginza Ibuki and shopping are preserved',()=>{
 const all=b.data.days.flatMap(d=>d.variants[0].stops);
 const ibuki=all.find(s=>s.planKey==='ibuki');assert.equal(ibuki.details.costMin,18150);
 assert(!all.some(s=>/도쿄 돔 호텔|스시노미도리/.test(s.name)));
 assert(all.some(s=>s.name==='도쿄 기프트 팔레트'));
 for(const s of all.filter(s=>s.kind==='food'&&!['ibuki','midori'].includes(s.planKey)))assert(s.details.costMax<=2000,s.name);
 assert(all.some(s=>/돈키호테 아사쿠사/.test(s.name)));
 assert(all.some(s=>s.planKey==='drug'));
});
test('Skyliner stays blank, and airport selections use the correct local dates',()=>{
 const sky=b.routes.days['1-main'].find(l=>l.fare?.displayBlank);
 assert(sky);assert.equal(sky.fare.icYen,null);assert.equal(sky.fare.min,null);
 const [taxi,flightOut]=b.routes.days['1-main'];
 const trip=require('../japan-2027/personal-trip').patch(structuredClone(b.data),structuredClone(b.routes));
 assert.equal(trip.data.days[0].variants[0].stops[0].name,'월성로 132');
 assert.equal(taxi.parts[0].mode,'taxi');
 assert.equal(taxi.private,false);
 assert.equal(taxi.departureAt,Date.parse('2027-01-08T07:20:00+09:00'));
 assert.equal(taxi.to,"대구국제공항");
 assert(!b.routes.days["1-main"].some(l=>l.parts.some(p=>p.mode==="bus")));
 assert.equal(flightOut.fare.min,null);
 assert.match(flightOut.summary,/TW251/);
 assert.equal(flightOut.departureAt,Date.parse("2027-01-08T11:10:00+09:00"));assert.equal(flightOut.arrivalAt,Date.parse("2027-01-08T13:20:00+09:00"));
 const [flightBack,busBack,walkToTaxi,taxiBack]=b.routes.days['12-main'].slice(-4);
 assert.match(flightBack.summary,/MM809/);
 assert.equal(flightBack.departureAt,Date.parse('2027-01-20T01:55:00+09:00'));
 assert.equal(flightBack.arrivalAt,Date.parse('2027-01-20T04:40:00+09:00'));
 assert.equal(busBack.departureAt,Date.parse('2027-01-20T06:50:00+09:00'));
 assert.equal(busBack.arrivalAt,Date.parse('2027-01-20T10:56:00+09:00'));
 assert.equal(busBack.fare.min,45200);
 assert.match(busBack.travel.notice,/10B-3.*동대구터미널 1층 하차장.*중간 승하차 정류장 없음/);
 assert.equal(busBack.parts[0].geometryAccuracy,'stop-verified-reference');
 assert.deepEqual(busBack.parts[0].coords,require('../scripts/tokyo-airport-geometry.json').rows.returnAirportBus.coords);
 assert.equal(b.data.days[11].travelBookings.find(item=>item.key==='airport-bus-back-0650').leg,10);
 assert.equal(walkToTaxi.parts[0].mode,'walk');
 assert.equal(taxiBack.from,'동대구역 택시 승강장');
 assert.equal(taxiBack.to,'월성로 132');
 assert.equal(taxiBack.parts[0].mode,'taxi');
 assert.equal(taxiBack.departureAt,Date.parse('2027-01-20T11:10:00+09:00'));
 assert.equal(taxiBack.arrivalAt,Date.parse('2027-01-20T11:50:00+09:00'));
 assert(!b.data.days[11].pendingReturn);
 const last=b.data.days[11].variants[0].stops;
 assert.equal(last[6].time,'18:30~19:00');
 assert.match(last[6].name,/짐 수령/);
 assert.match(last[7].name,/마쓰야/);
 assert.match(b.data.days[0].variants[0].stops.find(s=>s.uid===sky.fromUid).description,/38호 14:42 출발 → 15:23/);
});
test('single Iriya stay, daily breakfasts and lakeshore scenery',()=>{
 assert.match(b.data.days[11].variants[0].stops[0].name,/이리야키타 · 체크아웃/);
 assert(b.data.days.slice(2).every(d=>d.breakfast.includes('08:00')&&d.breakfast.includes('편의점')));
 const nikko=b.data.days[7].variants[0].stops;
 assert(nikko.some(s=>s.planKey==='kegon'));assert(nikko.some(s=>s.planKey==='chuzenji'));assert(!nikko.some(s=>s.planKey==='sanbon'));
 assert(!nikko.some(s=>/도쇼구/.test(s.name)));
});
test('mapped geometry has actual intermediate vertices and no airport route is invented',()=>{
 for(const legs of Object.values(b.routes.days))for(const l of legs)for(const p of l.parts){
  if(p.geometryAccuracy==='mapped'&&p.distanceM>1500)assert(p.coords.length>2,p.line);
  if(p.geometryAccuracy==='schematic')assert(p.geometrySource,p.line);
 }
});

test('active routes retain continuous public endpoints and explicit reference-only timing',()=>{
 const G=require('../japan-2027/location-core'),C=require('../japan-2027/command-core');
 let compared=0;
 for(const d of b.data.days)for(const v of d.variants){
  const legs=b.routes.days[d.n+'-'+v.id];
  if(d.n!==11)assert.deepEqual(C.warnings(v.stops,legs).filter(w=>['overlap','travel'].includes(w.type)),[],d.n+' travel window');
  for(const [i,l]of legs.entries()){
   if(l.private||!l.parts.length)continue;
   assert(G.distance([v.stops[i].lat,v.stops[i].lng],l.parts[0].coords[0])<=70,d.n+' start');
   assert(G.distance([v.stops[i+1].lat,v.stops[i+1].lng],l.parts.at(-1).coords.at(-1))<=70,d.n+' finish');
   for(let j=1;j<l.parts.length;j++)assert(G.distance(l.parts[j-1].coords.at(-1),l.parts[j].coords[0])<=70,d.n+' join');
   if(l.timeComparison){compared++;assert.equal(l.timeComparison.live,false);assert.equal(l.timeComparison.travelDateVerified,false);assert.equal(l.timeComparison.departureDate,'2027-'+d.date.replace('/','-'));assert.equal(l.timeComparison.totalMinutes,l.durationMinutes);}
  }
 }
 assert.equal(b.data.days[4].variants[0].stops[1].end,"09:30");
 assert.equal(b.data.days[7].variants[0].stops[5].end,"17:44");
});
