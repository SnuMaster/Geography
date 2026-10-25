'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Fare=require('../japan-2027/fare-core.js'),D=require('../japan-2027/departure-core.js'),GPS=require('../japan-2027/location-core.js');
const jpy={min:3000,max:5000,status:'variable',currency:'JPY'};
test('P0 variable taxi is a range, never fixed IC or paper fare',()=>{
 const s=Fare.summarize([{fare:{min:1200,max:1200,status:'exact',currency:'JPY'},parts:[]},{fare:jpy,parts:[{mode:'taxi'}]}]);
 assert.equal(s.ic,1200);assert.equal(s.paper,1200);assert.equal(s.variableJPY.min,3000);assert.equal(s.variableJPY.max,5000);
});
test('P0 subway pass uses boarding instant and a half-open 72-hour validity window',()=>{
 const fare={min:200,max:200,currency:'JPY',passEligible:true},leg={parts:[{mode:'metro',lineId:'TokyoMetro.Hibiya'}]};
 const start=Date.parse('2027-01-09T09:00:00+09:00'),pass={enabled:true,startAt:start,kind:'physical',purchased:true};
 assert.equal(Fare.quote(fare,{...leg,departureAt:start-1},{pass}).passApplied,false);
 assert.equal(Fare.quote(fare,{...leg,departureAt:start},{pass}).amount,0);
 assert.equal(Fare.quote(fare,{...leg,departureAt:start+72*3600000},{pass}).passApplied,false);
 assert.equal(Fare.quote(fare,leg,{passEnabled:true,day:2}).simulation,true);
 assert.equal(Fare.passWindow(pass).expiresAt,start+72*3600000);
});
test('P0 no-expiry is current official reference, not verified for travel',()=>{
 const v=D.validity({sourceDate:'2026-10-25'},'2027-01-09');assert.equal(v.confidence,'current-reference');assert.equal(v.travelVerified,false);
 assert.equal(D.validity({validUntil:'2026-11-20'},'2027-01-09').confidence,'expired');
});
test('P0 out-of-order GPS and implausible jumps do not move accepted location',()=>{
 const a={lat:35,lng:139,accuracy:10,timestamp:100000};
 assert.equal(GPS.validateFix({...a,timestamp:94000},a,100001).accepted,false);
 assert.equal(GPS.validateFix({...a,lat:36,timestamp:101000},a,101001).accepted,false);
 assert.equal(GPS.validateFix({...a,lat:35.00005,timestamp:106000},a,106001).accepted,true);
});
test('P0 03:00 service date rolls only in current-time mode',()=>{
 const R=require('../japan-2027/ride-core.js'),t=Date.parse('2027-01-10T03:00:00+09:00');
 assert.equal(R.serviceDateForNow(t-1),'2027-01-09');assert.equal(R.serviceDateForNow(t),'2027-01-10');
});
test('P1 route search preserves day, alternative and actual movement ID',()=>{const {data,routes}=require('../scripts/japan-qa.cjs').load(),J=require('../japan-2027/journey-state');for(const q of ['모노레일','게이세이 스카이라이너','미도스지선','후지회유','경부고속선']){const result=J.search(data.days,q,{},'tokyo',routes.days).find(r=>r.type==='leg');assert.ok(result,q);assert.ok(routes.days[`${result.day}-${result.variant}`][result.legIndex-1]);}});
test('P2 all 22 days / 25 alternatives / 263 places / 238 legs / 144 rail parts preserved',()=>{const a=require('../scripts/japan-qa.cjs').audit();assert.deepEqual(a.counts,{days:22,variants:25,stops:263,legs:238,railParts:144});assert.deepEqual(a.errors,[]);assert.deepEqual(a.admission,{min:36400,max:51950});});
test('P2 official Ohori pin and both recalculated foot paths agree',()=>{const {data,routes}=require('../scripts/japan-qa.cjs').load(),s=data.days.find(d=>d.n===19).variants[0].stops[3];assert.equal(s.lat,33.5870988183);const paths=routes.days['19-main'];assert.ok(GPS.distance([s.lat,s.lng],paths[2].parts.at(-1).coords.at(-1))<10);assert.ok(GPS.distance([s.lat,s.lng],paths[3].parts[0].coords[0])<10);});
test('P3 weighted LRU retains recent schedules and never grows without bound',()=>{const {LRU}=require('../japan-2027/lru-cache'),c=new LRU(2,10);c.set('a',1,4).set('b',2,4);assert.equal(c.get('a'),1);c.set('c',3,4);assert.equal(c.has('b'),false);c.set('too-big',0,20);assert.equal(c.has('too-big'),false);assert.ok(c.weight<=10);});
test('P0 missing pass start never discounts the full 22-day total; purchase cost counted once',()=>{const {data,routes}=require('../scripts/japan-qa.cjs').load(),J=require('../japan-2027/journey-state'),base=J.totals(data.days,routes.days),simulation=J.totals(data.days,routes.days,{}, {pass:{enabled:true,startAt:null,purchased:true}});assert.equal(simulation.transportJPY,base.transportJPY);assert.equal(simulation.passCost,2000);});
test('P0 crossing the pass expiry during a mixed trip requires boarding confirmation',()=>{const start=Date.parse('2027-01-08T09:00:00+09:00'),leg={departureAt:start+72*3600000-600000,arrivalAt:start+72*3600000+600000,parts:[{mode:'metro',lineId:'TokyoMetro.Hibiya'}]},fare={min:200,max:200,currency:'JPY',passEligible:true};const q=Fare.quote(fare,leg,{pass:{enabled:true,startAt:start}});assert.equal(q.passApplied,false);assert.equal(q.passUncertain,true);});
test('P3 screen-read flight reference never claims raw recorded GPS',()=>{const T=require('../japan-2027/data-model');assert.equal(T.geometry({mode:'flight',flightTrack:{status:'screen-reference'}}).kind,'map-reference');assert.match(T.geometry({mode:'flight',flightTrack:{status:'screen-reference'}}).label,/GPS 항적 아님/);});
test('P0 Jan19 Tokyo Hibiya segment remains eligible when a real 72-hour window covers it',()=>{const {routes}=require('../scripts/japan-qa.cjs').load(),leg=routes.days['12-main'][0],start=Date.parse('2027-01-17T09:00:00+09:00');assert.equal(leg.parts[0].lineId,'TokyoMetro.Hibiya');assert.equal(Fare.quote(leg.fare,leg,{pass:{enabled:true,startAt:start}}).amount,0);assert.equal(Fare.quote(routes.days['12-main'][1].fare,routes.days['12-main'][1],{pass:{enabled:true,startAt:start}}).passApplied,false);});
