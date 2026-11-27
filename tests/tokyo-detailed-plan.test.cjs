'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../japan-2027/data-model');
const b=JSON.parse(fs.readFileSync(__dirname+'/../japan-2027/trip-update.json'));
T.prepare(b.data,b.routes);
test('approved calendar with Jan 9 empty and three excursions',()=>{
 assert.equal(b.revision,'20261127-tokyo-dining-bookings-1');
 assert.equal(b.data.version,b.revision);
 assert.equal(b.routes.version,b.revision);
 assert.deepEqual(b.data.days.map(d=>d.n),Array.from({length:13},(_,i)=>i+1));
 assert.deepEqual(b.data.days.filter(d=>[5,8,11].includes(d.n)).map(d=>d.cityLabel),['가와구치코','닛코','요코하마']);
 assert.equal(b.data.days[1].title,'일정 없음');assert.deepEqual(b.data.days[1].variants[0].stops,[]);assert.deepEqual(b.routes.days['2-main'],[]);
 const day11=b.data.days[10],stops=day11.variants[0].stops;
 assert.equal(day11.title,'요코하마 차이나타운·항구 야경');
 assert.deepEqual(stops.slice(1,-1).map(s=>s.planKey),['motomachiChukagai','santon','wangfujing','edosei','osanbashi','redBrick','minatoMiraiView','okkon']);
 assert.equal(b.data.nightRows[10][1],day11.title);
 const parks=b.data.days.flatMap(d=>d.variants[0].stops).filter(stop=>stop.kind==='sight'&&/공원|교엔|은사정원/.test(stop.name));
 assert.deepEqual(parks.map(s=>s.name),['이노카시라공원','오이시공원','신주쿠교엔']);
 assert(!b.data.days.some(d=>/메이지신궁|메이지진구|아사쿠사/.test(JSON.stringify(d))));
 assert(!b.data.days.some(d=>/오사카|하코네|아타미|가와고에/.test(d.title)));
});
test('the public itinerary begins at Daegu Airport and ends at Dongdaegu Station',()=>{
 const [airport]=b.data.days[0].variants[0].stops;
 const station=b.data.days[12].variants[0].stops.at(-1);
 const [flight]=b.routes.days['1-main'];
 const walk=b.routes.days['13-main'].at(-1);
 assert.equal(airport.name,'대구국제공항');
 assert.equal(station.name,'동대구역 택시 승강장');
 assert.equal(station.time,'버스 도착·짐 수령 후');
 assert.match(station.description,/도보 약 10분/);
 assert.equal(station.start,null);
 assert.equal(walk.departureAt,null);
 assert.equal(walk.arrivalAt,null);
 assert.equal(b.data.nightRows.at(-1)[2],station.time);
 assert.deepEqual(flight.parts[0].coords[0],[airport.lat,airport.lng]);
 assert.deepEqual(walk.parts.at(-1).coords.at(-1),[station.lat,station.lng]);
 assert(!['1-main','12-main','13-main'].some(key=>b.routes.days[key].some(leg=>leg.parts.some(part=>part.mode==='taxi'))));
});
test('the two days swap while the 1/11 holiday stays on the calendar',()=>{
 const day=b.data.days[3],shibuya=b.data.days[9],garden=shibuya.variants[0].stops.find(s=>s.name==='신주쿠교엔');
 assert.match(day.title,/마루노우치/);
 assert.match(shibuya.title,/시부야/);
 assert.equal(shibuya.publicHoliday,undefined);
 assert.equal(day.publicHoliday.name,'성년의 날');
 assert.equal(garden.start,'10:00');
 assert.match(garden.details.hours,/일요일 09:00~16:30/);
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
test('every requested restaurant has its own dated stop, address and menu',()=>{
 const all=b.data.days.flatMap(d=>d.variants[0].stops);
 const expected=[['tarekatsu','rakkan'],['luvfish','matsumotoro'],['kobaiya','mentsudan'],['kurofunetei','oyama','aona'],['kagura','kukuru','fugetsu'],['tsumikko','katsura'],['ginzakashiwa','sushiden'],['negishi','bebuya'],['santon','wangfujing','edosei','okkon'],['noboritei','goku','isomaru']];
 const days=b.data.days.slice(2,12);
 for(const [i,d] of days.entries()){
  const dining=d.variants[0].stops.filter(s=>s.kind==='food');
  assert.deepEqual(dining.map(s=>s.planKey),expected[i],d.date);
  for(const s of dining){
   assert(s.jp&&s.address&&s.details.menu&&s.details.mealSlot,s.name);
   assert.equal(b.data.food[s.foodKey].name,s.name);
   if(s.diningBooking){
    const v=d.variants[0],i=v.stops.indexOf(s),legs=b.routes.days[d.n+'-main'];
    assert.equal(s.diningBooking.arrival,T.date(d.n)+'T'+s.start);
    assert.equal(s.diningBooking.partySize,1);
    assert(T.minutes(s.start)-T.minutes(v.stops[i-1].end)>=legs[i-1].durationMinutes,s.name);
    assert(T.minutes(v.stops[i+1].start)-T.minutes(s.end)>=legs[i].durationMinutes,s.name);
   }
  }
 }
 assert(b.data.days[7].meals.includes('저녁 자유식 · 당일 결정'));
 assert(!all.some(s=>/도쿄 돔 호텔|스시노미도리/.test(s.name)));
 assert(all.some(s=>s.name==='도쿄 기프트 팔레트'));
 assert(all.some(s=>/돈키호테 우에노/.test(s.name)));
 assert(all.some(s=>s.planKey==='drug'));
});
test('BEBU-YA dinner follows Center Gai and connects to the Iriya hotel',()=>{
 const day=b.data.days[9];
 const [centerGai,dinner,hotel]=day.variants[0].stops.slice(-3);
 const [toDinner,toHotel]=b.routes.days['10-main'].slice(-2);
 assert.deepEqual([centerGai.planKey,dinner.planKey,hotel.planKey],['shibuya','bebuya','hotel']);
 assert.equal(dinner.time,'18:45~20:15');
 assert.equal(dinner.details.costMin,4000);
 assert(day.meals.includes(dinner.name));
 assert.equal(toDinner.parts[0].geometryAccuracy,'mapped');
 assert.equal(toDinner.durationMinutes,6);
 assert.deepEqual(toHotel.parts[0].coords.at(-1),toHotel.parts[1].coords[0]);
 assert.equal(hotel.start,'21:15');
 assert.equal(b.data.nightRows.find(row=>row[0]===day.date)[2],hotel.time);
});
test('airport and Skyliner payments retain the correct local dates and currencies',()=>{
 const sky=b.routes.days['1-main'].find(l=>l.fare?.displayBlank);
 assert(sky);assert.equal(sky.fare.icYen,null);assert.equal(sky.fare.min,null);
 const [flightOut]=b.routes.days['1-main'];
 assert(!b.routes.days["1-main"].some(l=>l.parts.some(p=>p.mode==="bus")));
 assert.equal(flightOut.fare.min,359000);
 assert.equal(sky.fare.purchase.amount,18400);
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
 assert.equal(flightBack.fare.currency,'JPY');
 assert.equal(flightBack.fare.min,28230);
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
 assert.equal(last[7].planKey,'goku');
 assert.equal(last[8].end,'20:55');
 assert.equal(last[9].start,'22:15');
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
test('the Gundam shop and revised restaurant pins have connected routes',()=>{
 const [odaiba,nikko,tower]=[6,7,3].map(i=>b.data.days[i]);
 const gundam=odaiba.variants[0].stops.find(stop=>stop.planKey==='diver');
 assert.equal(gundam.name,'건담 베이스 도쿄');
 assert.match(gundam.address,/7F/);
 assert.doesNotMatch(JSON.stringify([odaiba,b.routes.days['7-main']]),/유니콘 건담|15:00 변신/);
 for(const [day,index,expectedName] of [[nikko,4,'수타소바 카츠라'],[tower,7,'히비야 마츠모토로 본점']]){
  const stops=day.variants[0].stops,meal=stops[index];
  const [inbound,outbound]=b.routes.days[day.n+'-main'].slice(index-1,index+1);
  assert(day.meals.includes(expectedName));
  assert.equal(b.data.food[meal.foodKey].name,expectedName);
  assert.deepEqual(inbound.parts.at(-1).coords.at(-1),[meal.lat,meal.lng]);
  assert.deepEqual(outbound.parts[0].coords[0],[meal.lat,meal.lng]);
  assert(T.minutes(meal.start)-T.minutes(stops[index-1].end)>=inbound.durationMinutes);
  assert(T.minutes(stops[index+1].start)-T.minutes(meal.end)>=outbound.durationMinutes);
 }
 assert.equal(tower.variants[0].stops[7].time,'18:15~19:10');
 assert(b.routes.days['4-main'][7].parts.some(part=>part.mode==='metro'&&part.from==='히비야'&&part.geometryAccuracy==='mapped'));
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
 assert.equal(b.data.days[7].variants[0].stops[6].end,"17:44");
 assert.deepEqual(b.routes.days['5-main'][2].busTimetable.trips[0],['12:45','13:12']);
 assert.deepEqual(b.routes.days['8-main'][1].busTimetable.trips[0],['12:15','13:00']);
 assert.match(b.routes.days['8-main'][5].connectionBackup.text,/기본 15:50 → 16:26 · 대체 16:30 → 17:06.*17:44.*38분/);
 assert.doesNotMatch(JSON.stringify(b.data.days[11]),/보관함|multiecube/);
});

test('recorded payments and the reference bus fare use separate totals',()=>{
 const Core=require('../japan-2027/assistant-core'),Fare=require('../japan-2027/fare-core');
 const {items,estimates}=Core.tripExpenses(b.data,b.routes,[],()=> 'main');
 assert.deepEqual(Core.expenses(items,1).total,{KRW:528852,JPY:118038});
 assert.equal(estimates.length,1);
 assert.equal(estimates[0].amount,45200);
 assert.equal(estimates[0].currency,'KRW');
 assert.equal(items.filter(row=>row.category==='숙박비').length,1);
 assert.equal(b.data.days.reduce((total,day)=>total+Core.dayExpenses(items,day.n).filter(item=>item.category==='숙박비').reduce((sum,item)=>sum+item.amount,0),0),89808);
 const saved=Core.itineraryExpense([],{day:1,variant:'main',type:'leg',uid:'d1-main-leg-1'},'KRW',359000,'항공료');
 assert.deepEqual(Core.expenses(Core.tripExpenses(b.data,b.routes,saved,()=> 'main').items,1).total,Core.expenses(items,1).total);
 const [out]=b.routes.days['8-main'];
 assert.equal(Fare.summarize([out],{scope:'japan-rail'}).ic,1571);
 assert.equal(Fare.format(out.fare,out),'특급권 결제 · 23,200원');
});
