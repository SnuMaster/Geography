'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../japan-2027/data-model'),P=require('../japan-2027/personal-trip'),G=require('../japan-2027/location-core'),Offline=require('../japan-2027/offline-roads');
const base=require('../japan-2027/data.json'),tokyo=require('../japan-2027/tokyo-data.json'),west=require('../japan-2027/west-data.json');
const routes={days:{...require('../japan-2027/tokyo-routes.json').days,...require('../japan-2027/west-routes.json').days}};
require('../japan-2027/rail-departure-profiles');
const patched=P.patch(T.merge(base,tokyo,west),routes),{data}=T.prepare(patched.data,patched.routes);
const point=s=>[s.lat,s.lng],close=(a,b)=>assert.ok(G.distance(a,b)<1,JSON.stringify([a,b]));
test('all 239 primary and alternate itinerary legs connect stops and adjacent parts without a 70m omission',()=>{
 let count=0;for(const d of data.days)for(const v of d.variants){const ls=routes.days[`${d.n}-${v.id}`];assert.equal(ls.length,v.stops.length-1);
  for(let i=0;i<ls.length;i++){count++;const ps=ls[i].parts,id=`${d.n}-${v.id}:${i}`;assert.ok(G.distance(point(v.stops[i]),ps[0].coords[0])<=70,id+' missing access');assert.ok(G.distance(ps.at(-1).coords.at(-1),point(v.stops[i+1]))<=70,id+' missing exit');for(let j=1;j<ps.length;j++)assert.ok(G.distance(ps[j-1].coords.at(-1),ps[j].coords[0])<=70,id+' missing transfer');for(const p of ps)if(['rail','metro'].includes(p.mode))assert.ok(p.coords.length>2,id+' schematic hotel-to-rail chord');}
 }assert.equal(count,239);
});
test('Narita B1 station access stays indoors instead of a 1.4km road loop',()=>{
 const l=routes.days['1-main'][3],p=l.parts[0];assert.equal(p.mode,'transfer');assert.equal(p.geometryAccuracy,'schematic');assert.ok(p.distanceM<150);assert.ok(l.walkDistanceM<250);close(p.coords.at(-1),l.parts[1].coords[0]);assert.match(p.source,/narita-airport.jp/);
});
test('Jan19 hotel access uses Iriya-Ueno railway and a separate JR transfer',()=>{
 const l=routes.days['12-main'][0];assert.deepEqual(l.parts.map(p=>p.mode),['walk','metro','transfer']);assert.equal(l.parts[1].from,'이리야');assert.equal(l.parts[1].to,'우에노');assert.ok(l.walkDistanceM>500);assert.equal(l.fare.min,178);assert.ok(globalThis.RailDepartureProfiles.profiles['day12-metro-iriya-ueno'].matches.some(m=>m.from==='이리야'&&m.to==='우에노'));
});
test('Jan19 official A1 alighting point connects continuously through Midosuji to the hotel',()=>{
 const ss=data.days.find(d=>d.n===12).variants[0].stops,[bus,access]=routes.days['12-main'].slice(6,8);close(point(ss[7]),[34.646827,135.511802]);assert.match(ss[7].name,/A1 하차/);assert.match(ss[7].source,/busstop\/12341/);assert.equal(bus.fare.min,730);assert.ok(bus.parts.find(p=>p.mode==='bus').coords.length>100);assert.equal(access.fare.min,190);assert.deepEqual(access.parts.map(p=>p.mode),['walk','rail','walk']);assert.equal(access.parts[1].from,'天王寺');assert.equal(access.parts[1].to,'動物園前');close(bus.parts.at(-1).coords.at(-1),access.parts[0].coords[0]);for(let i=1;i<access.parts.length;i++)close(access.parts[i-1].coords.at(-1),access.parts[i].coords[0]);assert.ok(access.walkDistanceM>500);
});
test('airport rail and KTX preserve detailed railway geometry and separate indoor access',()=>{
 for(const [key,i] of [['12-main',1],['12-main',2],['18-main',3],['22-main',5]]){const l=routes.days[key][i];assert.deepEqual(l.parts.map(p=>p.mode),['transfer',i===3?'metro':'rail','transfer']);assert.ok(l.parts[1].coords.length>40);assert.equal(l.parts[0].geometryAccuracy,'schematic');assert.equal(l.parts[2].geometryAccuracy,'schematic');close(l.parts[0].coords.at(-1),l.parts[1].coords[0]);close(l.parts[1].coords.at(-1),l.parts[2].coords[0]);assert.equal(l.distanceM,l.parts.reduce((n,p)=>n+p.distanceM,0));assert.equal(l.walkDistanceM,l.parts[0].distanceM+l.parts[2].distanceM);}assert.equal(routes.days['22-main'][5].parts[1].distanceM,139059);assert.equal(routes.days['22-main'][5].fare.min,16300);
});
test('all corrected stops remain covered by existing offline maps and retain stable route identities',()=>{
 const manifest=require('../japan-2027/assets/offline-streets/manifest.json');for(const d of data.days)assert.ok(Offline.covers(manifest.days[String(d.n)],Offline.centres(d,routes)),'offline day '+d.n);for(const d of data.days)for(const v of d.variants)for(let i=0;i<v.stops.length;i++){assert.ok(v.stops[i].uid);if(i){const l=routes.days[`${d.n}-${v.id}`][i-1];assert.equal(l.fromUid,v.stops[i-1].uid);assert.equal(l.toUid,v.stops[i].uid);}}
});
