'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../japan-2027/personal-trip'),T=require('../japan-2027/data-model'),R=require('../japan-2027/offline-roads');
test('public home placeholders contain no address, coordinate, cached query or route geometry',()=>{
 assert.equal(P.HOME.lat,null);assert.equal(P.HOME.lng,null);assert.equal(P.HOME.address,'');
 const read=f=>JSON.parse(fs.readFileSync('japan-2027/'+f)),raw={days:{...read('tokyo-routes.json').days,...read('west-routes.json').days}},original=structuredClone(raw);
 const trip=P.patch(T.merge(read('data.json'),read('tokyo-data.json'),read('west-data.json')),raw);T.prepare(trip.data,trip.routes);let hidden=0;
 for(const d of trip.data.days)for(const v of d.variants){const home=new Set(v.stops.filter(s=>s.kind==='home').map(s=>s.uid));for(const s of v.stops)if(home.has(s.uid)){hidden++;assert.equal(s.lat,null);assert.equal(s.lng,null);assert.equal(s.address,'');assert.equal(s.mapQuery,'');}
  const key=d.n+'-'+v.id;for(const [i,l]of trip.routes.days[key].entries()){if(home.has(l.fromUid)||home.has(l.toUid)){assert.equal(l.private,true);assert.ok(l.parts.every(p=>p.coords.length===0));assert.equal(l.distanceM,null);}else assert.deepEqual(l.parts.map(p=>p.coords),original.days[key][i].parts.map(p=>p.coords));}}
 assert.equal(hidden,2);assert.equal(fs.existsSync('japan-2027/tests/route-fetch.cjs'),false);
});
test('opening a legacy offline snapshot redacts home strings and geometry while preserving its UIDs',()=>{
 const data={days:[{n:1,variants:[{id:'main',stops:[{uid:'h',name:'PRIVATE HOME NAME',address:'비밀길 999',kind:'home',lat:12.34567,lng:98.76543,time:'07:10',details:{address:'비밀길 999'}},{uid:'a',kind:'airport',name:'공개 공항',lat:35,lng:139}],schedule:[['PRIVATE HOME NAME','비밀길 999']]}]}]},routes={days:{'1-main':[{fromUid:'h',toUid:'a',from:'PRIVATE HOME NAME',parts:[{mode:'taxi',coords:[[12.34567,98.76543],[35,139]]}],custom:'비밀길 999'}]}};
 P.patch(data,routes);const text=JSON.stringify({data,routes});assert.doesNotMatch(text,/PRIVATE HOME NAME|비밀길|12\.34567|98\.76543/);assert.equal(data.days[0].variants[0].stops[0].uid,'h');assert.equal(routes.days['1-main'][0].fromUid,'h');assert.deepEqual(R.centres(data.days[0],routes),[[35,139]]);
 const before=JSON.stringify({data,routes});P.patch(data,routes);assert.equal(JSON.stringify({data,routes}),before);
});
