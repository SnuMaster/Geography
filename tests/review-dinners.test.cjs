'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),b=require('../japan-2027/trip-update.json'),G=require('../japan-2027/location-core'),C=require('../japan-2027/command-core');

test('Kawaguchiko returns via dinner in Shinjuku and Nikko leaves dinner open',()=>{
 const [fuji,nikko]=[5,8].map(n=>b.data.days.find(d=>d.n===n));
 const fujiStops=fuji.variants[0].stops,nikkoStops=nikko.variants[0].stops;
 const dinner=fujiStops.at(-2),fujiLegs=b.routes.days['5-main'],nikkoLegs=b.routes.days['8-main'];
 const [toDinner,toHotel]=fujiLegs.slice(-2);
 assert.equal(dinner.planKey,'mentsudan');
 assert.equal(toDinner.from,'JR 신주쿠역');
 assert.equal(toDinner.toUid,dinner.uid);
 assert.equal(toDinner.fare.icYen,0);
 assert(toHotel.parts.some(p=>p.mode==='metro'));
 assert.equal(toHotel.fromUid,dinner.uid);
 assert(G.distance([dinner.lat,dinner.lng],toHotel.parts[0].coords[0])<2);
 assert(nikko.meals.includes('저녁 자유식 · 당일 결정'));
 assert.match(nikkoStops.at(-1).description,/당일 결정/);
 assert.equal(nikkoLegs.at(-1).fare.icYen,4091);
 assert.equal(nikkoLegs.at(-1).toUid,nikkoStops.at(-1).uid);
 for(const [stops,legs] of [[fujiStops,fujiLegs],[nikkoStops,nikkoLegs]]){
  assert.deepEqual(C.warnings(stops,legs).filter(w=>['overlap','travel'].includes(w.type)),[]);
 }
});
