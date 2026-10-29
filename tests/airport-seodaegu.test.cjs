'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('../scripts/japan-qa.cjs'),Location=require('../japan-2027/location-core'),Ride=require('../japan-2027/ride-core'),Departure=require('../japan-2027/departure-core');
require('../japan-2027/rail-departure-profiles');
const key='korail-busan-seodaegu',profile=globalThis.RailDepartureProfiles.profiles[key];
const file=require('../japan-2027/timetables/korail-busan-seodaegu.json'),schedules=file.profiles[key];
const at=value=>Date.parse(value+'+09:00');

test('airport access follows detailed mapped rail geometry, including the monorail coastal curve',()=>{
 const {routes}=load();
 for(const [day,index,min,max]of [['12-main',1,6500,8500],['12-main',2,16500,18000],['18-main',3,3000,3600]]){
  const leg=routes.days[day][index],p=leg.parts.find(p=>['rail','metro'].includes(p.mode));
  assert.ok(p.coords.length>40,day);assert.ok(p.distanceM>min&&p.distanceM<max,day);
  for(let i=1;i<p.coords.length;i++)assert.ok(Location.distance(p.coords[i-1],p.coords[i])<600,day+' disconnected line');
 }
 const mono=routes.days['12-main'][2].parts.find(p=>p.mode==='rail');
 assert.ok(mono.coords.some(([lat,lng])=>lat>35.61&&lat<35.63&&lng<139.753),'monorail must pass the Tennozu coast rather than cut diagonally to the airport');
});

test('January 29 plan, outgoing clock, fare and destination all agree on Seodaegu',()=>{
 const {data,routes}=load(),day=data.days.find(d=>d.n===22),stops=day.variants[0].stops,leg=routes.days['22-main'].at(-1);
 assert.equal(stops.at(-1).name,'서대구역 KTX');assert.equal(leg.to,stops.at(-1).name);
 assert.equal(leg.departureAt,at('2027-01-29T12:20:00'));assert.equal(leg.fare.min,16300);assert.equal(leg.fare.max,16300);
 assert.equal(stops.length,7);assert.ok(day.title.includes('서대구'));assert.ok(day.variants[0].schedule.at(-1)[1].includes('서대구'));
 assert.ok(Location.distance([stops.at(-1).lat,stops.at(-1).lng],[35.8813666,128.5417368])<10);
 assert.ok(Location.distance(leg.parts.find(p=>p.mode==='rail').coords.at(-1),[35.8813221,128.5402289])<10);
});

test('330 preserves official seconds and distinguishes a source stop event from an invented arrival',()=>{
 const train=Ride.trainsForDate(schedules,'2027-01-29',{...profile,...profile.calendarOptions}).find(t=>t.number==='330');
 assert.ok(train);assert.equal(train.departureAt,at('2027-01-29T12:44:00'));
 assert.deepEqual(train.stops.map(s=>s.name),['부산','울산','경주','동대구','서대구']);
 assert.equal(train.stops.at(-1).arrivalAt,null);assert.equal(train.stops.at(-1).timeAt,at('2027-01-29T13:47:30'));
 assert.equal(train.destinationEventKind,'source-event');assert.equal(train.destinationAt,at('2027-01-29T13:47:30'));
 const next=Departure.nextTrains(schedules,at('2027-01-29T12:21:00'),{...profile,...profile.calendarOptions,limit:1,lookAheadDays:0});
 assert.equal(next[0].number,'330');
});

test('Seodaegu profile includes only stopping high-speed services and obeys Friday restrictions and edition boundaries',()=>{
 assert.equal(globalThis.RailDepartureProfiles.profiles['korail-busan-dongdaegu'],undefined);
 for(const row of schedules.Daily){assert.ok(row.sourceStopTimes['서대구']);assert.ok(!['구포','물금','밀양','경산'].some(n=>row.sourceStopTimes[n]));}
 const trains=Ride.trainsForDate(schedules,'2027-01-29',{...profile,...profile.calendarOptions});
 assert.ok(trains.every(t=>t.validFrom!=='2026-09-01'));
 assert.ok(trains.some(t=>t.number==='4012'));assert.ok(!trains.some(t=>t.number==='312'));
});

test('Seodaegu source path preserves connected railway vertices and the required station order',()=>{
 const source=require('../japan-2027/assets/routes/return-route-sources.json').ktx;
 assert.equal(source.sourceNodeIds.length,source.coords.length);assert.equal(source.sourceWayIds.length,source.coords.length-1);
 assert.equal(new Set(source.sourceNodeIds).size,source.sourceNodeIds.length);
 assert.equal(source.validation.fabricatedConnectors,0);assert.equal(source.validation.oppositeOnewayEdges,0);
 assert.deepEqual(source.validation.stationProximity.map(s=>s.name),['부산역','울산역','경주역','동대구역','서대구역']);
 assert.ok(source.validation.stationProximity.every(s=>s.minimumVertexDistanceM<250));
 const indices=source.validation.stationProximity.map(s=>s.coordIndex);assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
});
