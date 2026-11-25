'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../japan-2027/data-model');
const b=JSON.parse(fs.readFileSync(__dirname+'/../japan-2027/trip-update.json'));
T.prepare(b.data,b.routes);
test('approved 12-day allocation and three spaced excursions',()=>{
 assert.equal(b.revision,'20261125-tokyo-airports-3');
 assert.deepEqual(b.data.days.map(d=>d.n),Array.from({length:12},(_,i)=>i+1));
 assert.deepEqual(b.data.days.filter(d=>[2,5,8].includes(d.n)).map(d=>d.cityLabel),['가마쿠라·에노시마','가와구치코','닛코']);
 assert.equal(b.data.days[10].title,'공연 가능일·자유시간');
 assert(!b.data.days.some(d=>/오사카|하코네|아타미|가와고에/.test(d.title)));
});
test('public map stops have unique new IDs, sources and one connected leg per interval',()=>{
 const ids=new Set();
 for(const d of b.data.days)for(const v of d.variants){const legs=b.routes.days[d.n+'-'+v.id];assert.equal(legs.length,v.stops.length-1);assert(legs.every(l=>l.parts?.length),'App requires one explicit part per connection');
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
 const [taxi,busOut,flightOut]=b.routes.days['1-main'];
 const trip=require('../japan-2027/personal-trip').patch(structuredClone(b.data),structuredClone(b.routes));
 assert.equal(trip.data.days[0].variants[0].stops[0].name,'어나드범어아파트');
 assert.equal(taxi.parts[0].mode,'taxi');
 assert.equal(taxi.private,false);
 assert.equal(taxi.departureAt,Date.parse('2027-01-08T03:10:00+09:00'));
 assert.equal(busOut.fare.min,70600);
 assert.equal(flightOut.fare.min,null);
 assert.match(flightOut.summary,/7C1129/);
 const [flightBack,busBack]=b.routes.days['12-main'].slice(-2);
 assert.match(flightBack.summary,/MM809/);
 assert.equal(flightBack.departureAt,Date.parse('2027-01-20T01:55:00+09:00'));
 assert.equal(flightBack.arrivalAt,Date.parse('2027-01-20T04:40:00+09:00'));
 assert.equal(busBack.departureAt,Date.parse('2027-01-20T06:20:00+09:00'));
 assert.equal(busBack.fare.min,58800);
 assert(!b.data.days[11].pendingReturn);
 const last=b.data.days[11].variants[0].stops;
 assert.equal(last[6].time,'18:30~19:00');
 assert.match(last[6].name,/짐 수령/);
 assert.match(last[7].name,/마쓰야/);
 assert.match(b.data.days[0].variants[0].stops.find(s=>s.uid===sky.fromUid).description,/46호 16:02 출발 → 16:43/);
});
test('single Iriya stay, daily breakfasts and lakeshore scenery',()=>{
 assert.match(b.data.days[11].variants[0].stops[0].name,/이리야키타 · 체크아웃/);
 assert(b.data.days.slice(1).every(d=>d.breakfast.includes('08:00')&&d.breakfast.includes('편의점')));
 assert(b.data.days[1].variants[0].stops.find(s=>s.planKey==='hasedera').details.thingsToDo.some(t=>t.includes('전망대')));
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
