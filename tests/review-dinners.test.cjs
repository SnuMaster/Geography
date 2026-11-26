'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),b=require('../japan-2027/trip-update.json'),P=require('../scripts/apply-review-meals.cjs'),e=require('../scripts/tokyo-review-meals.json'),G=require('../japan-2027/location-core'),T=require('../japan-2027/data-model'),C=require('../japan-2027/command-core');
test('both excursion return evenings have budget dinners and a connected free hotel walk',()=>{
 for(const m of e.meals){const d=b.data.days.find(d=>d.n===m.n),v=d.variants[0],i=v.stops.findIndex(s=>s.planKey===m.key),l=b.routes.days[d.n+'-main'];
 assert(i>0);assert.equal(v.stops[i].kind,'food');assert(v.stops[i].details.costMax<=2000);assert.match(v.stops[i].description,/저녁/);
 assert.equal(l[i-1].toUid,v.stops[i].uid);assert(l[i-1].parts.some(p=>p.mode==='metro'));assert.equal(l[i].fare.icYen,0);assert(l[i].parts.every(p=>['walk','transfer'].includes(p.mode)));
 assert(G.distance([v.stops[i].lat,v.stops[i].lng],l[i].parts[0].coords[0])<2);assert(G.distance([v.stops[i+1].lat,v.stops[i+1].lng],l[i].parts.at(-1).coords.at(-1))<2);
 assert.deepEqual(C.warnings(v.stops,l).filter(w=>['overlap','travel'].includes(w.type)),[]);
 }
 assert(b.routes.days['5-main'].at(-2).fare.icYen>0);assert.equal(b.routes.days['8-main'].at(-2).fare.icYen,4091);
});
test('meal patch keeps existing records stable and never duplicates food or rail fares',()=>{
 const copy=structuredClone(b),before=JSON.stringify(copy.routes),ids=copy.data.days.flatMap(d=>d.variants[0].stops.map(s=>s.uid));assert.deepEqual(P.apply(copy,e).added,[]);assert.equal(JSON.stringify(copy.routes),before);assert.equal(new Set(ids).size,ids.length);assert.equal(T.counts(copy.data,copy.routes).legs,b.data.days.reduce((n,d)=>n+Math.max(0,d.variants[0].stops.length-1),0));
});
