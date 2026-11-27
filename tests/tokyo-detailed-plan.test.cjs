'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../japan-2027/data-model');
const b=JSON.parse(fs.readFileSync(__dirname+'/../japan-2027/trip-update.json'));
T.prepare(b.data,b.routes);
test('approved calendar with Jan 9 empty and two excursions',()=>{
 assert.equal(b.revision,require('../scripts/apply-tokyo-return-day.cjs').revision);
 assert.deepEqual(b.data.days.map(d=>d.n),Array.from({length:13},(_,i)=>i+1));
 assert.deepEqual(b.data.days.filter(d=>[5,8].includes(d.n)).map(d=>d.cityLabel),['가와구치코','닛코']);
 assert.equal(b.data.days[1].title,'일정 없음');assert.deepEqual(b.data.days[1].variants[0].stops,[]);assert.deepEqual(b.routes.days['2-main'],[]);
 const day11=b.data.days[10],stops=day11.variants[0].stops;
 assert.equal(day11.title,'아사쿠사·스미다강');
 assert.deepEqual(stops.map(s=>s.planKey),['hotel','kappabashi','sensoji','mugitoro','sumidaWalk','mizumachi','yoroiya','hotel']);
 assert.doesNotMatch(JSON.stringify(day11),/스카이트리|덴보데크|소라마치/);
 assert.equal(new Set(stops.map(s=>s.selectionId)).size,stops.length);
 assert.equal(b.data.nightRows[10][1],day11.title);
 const legs=b.routes.days['11-main'];
 assert(legs.every(l=>l.parts.every(p=>p.mode==='walk'&&p.geometryAccuracy==='mapped')));
 assert(legs[4].parts[0].coords.some(([lat,lng])=>Math.abs(lat-35.7116353)<0.00003&&Math.abs(lng-139.8015955)<0.00003),'River Walk crossing');
 assert(legs[5].parts[0].coords.some(([lat,lng])=>Math.abs(lat-35.70992)<0.00003&&Math.abs(lng-139.79924)<0.00003),'Azuma Bridge crossing');
 assert(legs.every(l=>l.parts[0].coords.every(([,lng])=>lng<139.805)),'Stay west of the tower complex');
 assert(!b.data.days.some(d=>/오사카|하코네|아타미|가와고에/.test(d.title)));
});
test('the public itinerary begins at Daegu Airport and ends at Dongdaegu Station',()=>{
 const [airport]=b.data.days[0].variants[0].stops;
 const station=b.data.days[12].variants[0].stops.at(-1);
 const [flight]=b.routes.days['1-main'];
 const walk=b.routes.days['13-main'].at(-1);
 assert.equal(airport.name,'대구국제공항');
 assert.equal(station.name,'동대구역 택시 승강장');
 assert.deepEqual(flight.parts[0].coords[0],[airport.lat,airport.lng]);
 assert.deepEqual(walk.parts.at(-1).coords.at(-1),[station.lat,station.lng]);
 assert(!['1-main','12-main','13-main'].some(key=>b.routes.days[key].some(leg=>leg.parts.some(part=>part.mode==='taxi'))));
});
test('1/11 retains the 10:00 garden visit with published holiday hours',()=>{
 const day=b.data.days[3],garden=day.variants[0].stops.find(s=>s.name==='신주쿠교엔');
 assert.equal(day.publicHoliday.name,'성년의 날');
 assert.equal(garden.start,'10:00');
 assert.match(garden.details.hours,/공휴일 개원.*1\/12 휴원/);
 require('../japan-2027/rail-departure-profiles');
 assert(globalThis.RailDepartureProfiles.holidays.includes(T.date(day.n)));
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
 for(const s of all.filter(s=>s.kind==='food'&&!['ibuki','midori','bebuya'].includes(s.planKey)))assert(s.details.costMax<=2000,s.name);
 assert(all.some(s=>/돈키호테 아사쿠사/.test(s.name)));
 assert(all.some(s=>s.planKey==='drug'));
});
test('BEBU-YA dinner follows Center Gai and connects to the Iriya hotel',()=>{
 const day=b.data.days[3];
 const [centerGai,dinner,hotel]=day.variants[0].stops.slice(-3);
 const [toDinner,toHotel]=b.routes.days['4-main'].slice(-2);
 assert.deepEqual([centerGai.planKey,dinner.planKey,hotel.planKey],['shibuya','bebuya','hotel']);
 assert.equal(dinner.time,'18:40~20:10');
 assert.equal(dinner.details.costMin,4000);
 assert(day.meals.includes(dinner.name));
 assert.equal(toDinner.parts[0].geometryAccuracy,'mapped');
 assert.equal(toDinner.durationMinutes,6);
 assert.deepEqual(toHotel.parts[0].coords.at(-1),toHotel.parts[1].coords[0]);
 assert.equal(hotel.start,'21:10');
 assert.equal(b.data.nightRows.find(row=>row[0]===day.date)[2],hotel.time);
});
test('Skyliner stays blank, and airport selections use the correct local dates',()=>{
 const sky=b.routes.days['1-main'].find(l=>l.fare?.displayBlank);
 assert(sky);assert.equal(sky.fare.icYen,null);assert.equal(sky.fare.min,null);
 const [flightOut]=b.routes.days['1-main'];
 assert(!b.routes.days["1-main"].some(l=>l.parts.some(p=>p.mode==="bus")));
 assert.equal(flightOut.fare.min,null);
 assert.match(flightOut.summary,/TW251/);
 assert.equal(flightOut.departureAt,Date.parse("2027-01-08T11:10:00+09:00"));assert.equal(flightOut.arrivalAt,Date.parse("2027-01-08T13:20:00+09:00"));
 const [flightBack,busBack,walkToTaxi]=b.routes.days['13-main'];
 const local=b.data.days[11],returnDay=b.data.days[12];
 assert.equal(local.date,'01/19');
 assert.equal(returnDay.date,'01/20');
 assert(b.routes.days['12-main'].every(l=>l.serviceDate==='2027-01-19'&&l.parts.every(p=>p.mode!=='flight')));
 assert(b.routes.days['13-main'].every(l=>l.serviceDate==='2027-01-20'));
 assert.equal(local.variants[0].stops.at(-1).name,returnDay.variants[0].stops[0].name);
 assert(returnDay.variants[0].stops.every(s=>!s.dayOffset));
 assert.match(flightBack.summary,/MM809/);
 assert.equal(flightBack.departureAt,Date.parse('2027-01-20T01:55:00+09:00'));
 assert.equal(flightBack.arrivalAt,Date.parse('2027-01-20T04:40:00+09:00'));
 assert.equal(busBack.departureAt,Date.parse('2027-01-20T06:50:00+09:00'));
 assert.equal(busBack.arrivalAt,Date.parse('2027-01-20T10:56:00+09:00'));
 assert.equal(busBack.fare.min,45200);
 assert.match(busBack.travel.notice,/10B-3.*동대구터미널 1층 하차장.*중간 승하차 정류장 없음/);
 assert.match(busBack.travel.notice,/동대구 직통 07:20편 또는 08:00편.*공개 시간표 기준/);
 assert.equal(busBack.parts[0].geometryAccuracy,'stop-verified-reference');
 assert.deepEqual(busBack.parts[0].coords,require('../scripts/tokyo-airport-geometry.json').rows.returnAirportBus.coords);
 assert.equal(returnDay.travelBookings.find(item=>item.key==='airport-bus-back-0650').leg,2);
 assert.equal(busBack.parts[0].operatorBrand,'kyungbuk-express');
 assert.equal(walkToTaxi.parts[0].mode,'walk');
 assert(!b.data.days[11].pendingReturn);
 const last=b.data.days[11].variants[0].stops;
 assert.equal(last[6].time,'18:30~19:00');
 assert.match(last[6].name,/짐 수령/);
 assert.match(last[7].name,/마쓰야/);
 const airportStation=b.data.days[0].variants[0].stops.find(s=>s.uid===sky.fromUid);
 assert.match(airportStation.description,/38호 14:42 출발 → 15:23.*40호 .*15:02 → 게이세이우에노 15:43/);
 assert.equal(sky.connectionBackup.text,airportStation.connectionBackup.text);
 assert.deepEqual(sky.connectionBackup.options.map(o=>[o.depart,o.arrive]),[['15:02','15:43']]);
 assert.deepEqual(busBack.connectionBackup.options.map(o=>o.depart),['07:20','08:00']);
});
test('single Iriya stay, daily breakfasts and lakeshore scenery',()=>{
 assert.match(b.data.days[11].variants[0].stops[0].name,/이리야키타 · 체크아웃/);
 assert(b.data.days.slice(2,12).every(d=>d.breakfast.includes('08:00')&&d.breakfast.includes('편의점')));
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
  assert.deepEqual(C.warnings(v.stops,legs).filter(w=>['overlap','travel'].includes(w.type)),[],d.n+' travel window');
  for(const [i,l]of legs.entries()){
   if(l.private||!l.parts.length)continue;
   assert(G.distance([v.stops[i].lat,v.stops[i].lng],l.parts[0].coords[0])<=70,d.n+' start');
   assert(G.distance([v.stops[i+1].lat,v.stops[i+1].lng],l.parts.at(-1).coords.at(-1))<=70,d.n+' finish');
   for(let j=1;j<l.parts.length;j++)assert(G.distance(l.parts[j-1].coords.at(-1),l.parts[j].coords[0])<=70,d.n+' join');
   if(l.timeComparison){compared++;assert.equal(l.timeComparison.live,false);assert.equal(l.timeComparison.travelDateVerified,false);assert.equal(l.timeComparison.departureDate,'2027-'+d.date.replace('/','-'));assert.equal(l.timeComparison.totalMinutes,l.durationMinutes);}
  }
 }
 assert.equal(b.data.days[4].variants[0].stops[1].end,"10:30");
 const fuji=b.data.days[4],returnOrder=fuji.railOrders.find(order=>order.departure.time==='17:41');
 assert(!fuji.variants[0].stops.some(s=>s.planKey==='ropeway'));
 assert.equal(fuji.variants[0].stops[returnOrder.leg-1].end,'17:41');
 assert.match(b.routes.days['5-main'][returnOrder.leg-1].summary,/후지회유 48호/);
 assert.equal(b.data.days[7].variants[0].stops[1].start,"11:49");
 assert.equal(b.data.days[7].variants[0].stops[5].end,"17:44");
 assert.deepEqual(b.routes.days['5-main'][2].busTimetable.trips[0],['12:45','13:12']);
 assert.deepEqual(b.routes.days['8-main'][1].busTimetable.trips[0],['12:15','13:00']);
 assert.match(b.routes.days['8-main'][4].connectionBackup.text,/기본 15:50 → 16:26 · 대체 16:30 → 17:06.*17:44.*38분/);
 assert.doesNotMatch(JSON.stringify(b.data.days[11]),/보관함|multiecube/);
});
