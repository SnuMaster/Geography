'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../japan-2027/data-model');
const b=JSON.parse(fs.readFileSync(__dirname+'/../japan-2027/trip-update.json'));
T.prepare(b.data,b.routes);
test('approved 15-day allocation and four spaced excursions before the hotel move',()=>{
 assert.equal(b.revision,'20261118-detailed-plan-1');
 assert.deepEqual(b.data.days.map(d=>d.n),Array.from({length:15},(_,i)=>i+1));
 assert.deepEqual(b.data.days.filter(d=>[2,5,8,10].includes(d.n)).map(d=>d.cityLabel),['요코하마','가와구치코','닛코','가마쿠라·에노시마']);
 assert.equal(b.data.days[10].title,'공연 가능일·자유시간');
 assert(!b.data.days.some(d=>/오사카|하코네|아타미|가와고에/.test(d.title)));
});
test('public map stops have unique new IDs, sources and one connected leg per interval',()=>{
 const ids=new Set();
 for(const d of b.data.days)for(const v of d.variants){const legs=b.routes.days[d.n+'-'+v.id];assert.equal(legs.length,v.stops.length-1);assert(legs.every(l=>l.parts?.length),'App requires one explicit part per connection');
  v.stops.forEach((s,i)=>{assert(!ids.has(s.uid));ids.add(s.uid);assert(s.uid.startsWith('t27-p1118-'));if(s.kind==='home'){assert.equal(s.lat,null);assert.equal(s.lng,null);}else{assert(Number.isFinite(s.lat)&&Number.isFinite(s.lng),s.name);assert(s.source||s.coordinateSource||s.details?.sources?.length,s.name);}
   if(i){assert.equal(legs[i-1].fromUid,v.stops[i-1].uid);assert.equal(legs[i-1].toUid,s.uid);}
  });
 }
});
test('meal budget, Ginza Ibuki and shopping are preserved',()=>{
 const all=b.data.days.flatMap(d=>d.variants[0].stops);
 const ibuki=all.find(s=>s.planKey==='ibuki');assert.equal(ibuki.details.costMin,18150);
 assert(all.find(s=>s.planKey==='midori'));
 for(const s of all.filter(s=>s.kind==='food'&&!['ibuki','midori'].includes(s.planKey)))assert(s.details.costMax<=2000,s.name);
 assert(all.some(s=>/돈키호테 아사쿠사/.test(s.name)));
 assert(all.some(s=>s.planKey==='drug'));
 assert(all.some(s=>s.planKey==='donkiAkiba'));
});
test('Skyliner fare is blank and return flight remains genuinely unknown',()=>{
 const sky=b.routes.days['1-main'].find(l=>l.fare?.displayBlank);
 assert(sky);assert.equal(sky.fare.icYen,null);assert.equal(sky.fare.min,null);
 const back=b.data.days[14];assert.equal(back.pendingReturn.status,'unconfirmed');assert.equal(back.pendingReturn.airport,null);assert.equal(back.pendingReturn.flight,null);
 assert(!b.routes.days['15-main'].some(l=>l.parts.some(p=>p.mode==='flight')));
});
test('hotel move is Jan 19 and Nikko is scenery rather than the old shrine schedule',()=>{
 assert(b.data.days[11].variants[0].stops.some(s=>s.planKey==='domeCheckin'));
 const nikko=b.data.days[7].variants[0].stops;
 assert(nikko.some(s=>s.planKey==='kegon'));assert(nikko.some(s=>s.planKey==='chuzenji'));assert(nikko.some(s=>s.planKey==='sanbon'));
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
  if(d.n!==1&&d.n!==11)assert.deepEqual(C.warnings(v.stops,legs).filter(w=>['overlap','travel'].includes(w.type)),[],d.n+' travel window');
  for(const [i,l]of legs.entries()){
   if(l.private||!l.parts.length)continue;
   assert(G.distance([v.stops[i].lat,v.stops[i].lng],l.parts[0].coords[0])<=70,d.n+' start');
   assert(G.distance([v.stops[i+1].lat,v.stops[i+1].lng],l.parts.at(-1).coords.at(-1))<=70,d.n+' finish');
   for(let j=1;j<l.parts.length;j++)assert(G.distance(l.parts[j-1].coords.at(-1),l.parts[j].coords[0])<=70,d.n+' join');
   if(l.timeComparison){compared++;assert.equal(l.timeComparison.live,false);assert.equal(l.timeComparison.travelDateVerified,false);assert.equal(l.timeComparison.departureDate,'2027-'+d.date.replace('/','-'));assert.equal(l.timeComparison.totalMinutes,l.durationMinutes);}
  }
 }
 assert(compared>20);
});
