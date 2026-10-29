'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const routes=require('../japan-2027/west-routes.json'),data=require('../japan-2027/west-data.json');
const GPS=require('../japan-2027/location-core'),Offline=require('../japan-2027/offline-roads');
require('../japan-2027/rail-departure-profiles');
const day=data.days.find(d=>d.n===18),stops=day.variants[0].stops,[first,bus,flight]=routes.days['18-main'];
const point=s=>[s.lat,s.lng],near=(a,b)=>assert.ok(GPS.distance(a,b)<1,`${a} / ${b}`);
test('Jan25 hotel access uses two foot connections and the actual one-stop Midosuji railway',()=>{
 assert.deepEqual(first.parts.map(p=>p.mode),['walk','rail','walk']);
 const [a,r,b]=first.parts;near(a.coords[0],point(stops[0]));near(a.coords.at(-1),r.coords[0]);near(r.coords.at(-1),b.coords[0]);near(b.coords.at(-1),point(stops[1]));
 assert.equal(r.from,'動物園前');assert.equal(r.to,'天王寺');assert.ok(r.coords.length>=7);assert.equal(r.durationMinutes,2);assert.match(r.geometrySource,/N02/);
 const profile=globalThis.RailDepartureProfiles.profiles['kansai-metro-dobutsuenmae-tennoji'];assert.ok(profile.matches.some(m=>m.from===r.from&&m.to===r.to&&m.lineId===r.lineId));
 assert.ok(first.walkDistanceM>=500&&first.walkDistanceM<=650);assert.equal(first.distanceM,first.parts.reduce((n,p)=>n+p.distanceM,0));
});
test('Jan25 airport bus boards at the operator A1 point by exit14 and keeps the ANA terminal walk separate',()=>{
 near(point(stops[1]),[34.646827,135.511802]);assert.match(stops[1].name,/A1/);assert.match(stops[1].address,/14/);assert.match(stops[1].source,/busstop\/12341/);
 assert.deepEqual(bus.parts.map(p=>p.mode),['bus','walk']);near(bus.parts[0].coords[0],point(stops[1]));near(bus.parts[0].coords.at(-1),bus.parts[1].coords[0]);near(bus.parts[1].coords.at(-1),point(stops[2]));
 assert.equal(bus.parts[0].durationMinutes,30);assert.ok(bus.parts[0].coords.length>100);assert.equal(bus.parts[1].geometryAccuracy,'schematic');assert.match(bus.note,/08:00.*08:30/);
});
test('Jan25 correction preserves the paid fares, flight and itinerary identities',()=>{
 assert.equal(first.fare.min,190);assert.equal(bus.fare.min,730);assert.equal(stops.length,16);assert.equal(routes.days['18-main'].length,15);
 assert.deepEqual(stops.slice(0,4).map(s=>s.uid),['d18-main-0','d18-main-1','d18-main-2','d18-main-3']);
 assert.equal(stops[0].time,'07:30 출발');assert.equal(stops[1].time,'08:00 버스 출발 목표');assert.equal(stops[2].time,'09:00-10:20');
 assert.equal(flight.travel.depart,'1/25 10:45');assert.equal(flight.travel.arrive,'1/25 12:00');assert.match(flight.travel.operator,/NH1189/);
});
test('Jan25 corrected walks and bus stop remain covered by the existing offline street package',()=>{
 const manifest=require('../japan-2027/assets/offline-streets/manifest.json');assert.ok(Offline.covers(manifest.days['18'],Offline.centres(day,routes)));
});
