'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../japan-2027/connection-core'),D=require('../japan-2027/departure-core');
const at=t=>Date.parse('2027-01-08T'+t+':00+09:00');
const steps=[{mode:'walk',minutes:4},{mode:'metro',key:'metro',accessKnown:true},{mode:'transfer',minutes:5},{mode:'rail',key:'jr',accessKnown:true}];
test('hotel 17:10 departure cannot connect to Ueno 17:11; walking, preceding train and platform buffer are included',()=>{
 const schedules={Weekday:[{id:'metro',departure:'17:16',destinationArrival:'17:20'}]};
 const result=C.readyAt(steps,'jr',at('17:10'),(key,now)=>({status:'ready',train:D.nextTrains(schedules,now,{limit:1})[0]}));
 assert.equal(result.status,'ready');assert.equal(result.readyAt,at('17:25'));assert.equal(result.walkingMinutes,9);
 const jr=D.nextTrains({Weekday:[{id:'missed',departure:'17:11'},{id:'tight',departure:'17:25'},{id:'feasible',departure:'17:26'}]},result.queryAt,{limit:1})[0];
 assert.equal(jr.id,'feasible');
});
test('first boarding includes the walk and one minute to board, without needing earlier schedules',()=>{
 const result=C.readyAt(steps,'metro',at('17:10'),()=>assert.fail('no preceding train'));
 assert.equal(result.readyAt,at('17:14'));assert.equal(result.queryAt,at('17:15')-1);
});
test('missing source arrival, timetable errors and unknown access never advertise a connecting train',()=>{
 assert.equal(C.readyAt(steps,'jr',at('17:10'),()=>({status:'ready',train:{departureAt:at('17:16')}})).status,'unknown-arrival');
 assert.equal(C.readyAt(steps,'jr',at('17:10'),()=>({status:'connection-error'})).status,'connection-error');
 assert.equal(C.readyAt([{...steps[1],accessKnown:false}],'metro',at('17:10'),()=>{}).status,'unknown-access');
 assert.equal(C.readyAt(steps,'jr',null,()=>{}).status,'unknown-start');
});
test('through-service color boundaries do not add a boarding or a second trip',()=>{
 const parts=[{mode:'rail',durationMinutes:10},{mode:'transfer',durationMinutes:0},{mode:'rail',durationMinutes:20}];
 const grouped=C.stepsFor({parts},()=> 'through');assert.equal(grouped.length,1);assert.equal(grouped[0].minutes,30);
 assert.deepEqual(C.dependencies(grouped,'through'),['through']);
});
test('connections retain the next calendar date after midnight and disclose estimated arrivals',()=>{
 const arrival=Date.parse('2027-01-09T00:03:00+09:00');
 const r=C.readyAt(steps,'jr',at('23:50'),()=>({status:'ready',train:{departureAt:at('23:56'),destinationArrivalAt:arrival,stopTimeBasis:'estimated'}}));
 assert.equal(r.readyAt,arrival+5*60000);assert.equal(r.estimated,true);
});
test('real Day 1 walking and transfer steps exclude the previously shown impossible JR train',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),ctx={DepartureCore:D,ConnectionCore:C,TravelStore:{VERSION:'test'},BoundedCache:require('../japan-2027/lru-cache'),document:{addEventListener(){}},window:{},setInterval,clearInterval};
 require('../japan-2027/rail-departure-profiles');ctx.RailDepartureProfiles=global.RailDepartureProfiles;
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-departures.js'),'utf8')+';globalThis.rail=RailDepartures;',ctx);
 const {routes}=require('../scripts/japan-qa.cjs').load(),leg=routes.days['1-main'][7],parts=C.stepsFor(leg,ctx.rail.keyFor),key='jr-ueno-tokyo';
 const result=C.readyAt(parts,key,leg.departureAt,(k,now)=>{const profile=ctx.RailDepartureProfiles.profiles[k],schedule=require('../japan-2027/'+profile.file).profiles[k];return {status:'ready',train:D.nextTrains(schedule,now,{...ctx.rail.calendarOptions(k),limit:1})[0]};});
 assert.equal(result.status,'ready');assert.ok(result.readyAt>at('17:11'));
 const p=ctx.RailDepartureProfiles.profiles[key],train=D.nextTrains(require('../japan-2027/'+p.file).profiles[key],result.queryAt,{...ctx.rail.calendarOptions(key),limit:1})[0];
 assert.ok(train.departureAt>result.readyAt);console.log('Day 1 connected JR:',D.formatTime(train.departureAt));
});
