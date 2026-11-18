'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {earliestArrival}=require('../scripts/earliest-arrival-core.cjs');
const ride=(trip,from,to,departure,arrival,extra={})=>({trip,from,to,departure,arrival,...extra});
const solve=(connections,extra={})=>earliestArrival({connections:connections.toSorted((a,b)=>a.departure-b.departure||a.arrival-b.arrival),origins:[{station:'A',minutes:0}],destinations:new Map([['Z',{minutes:0}]]),departure:0,...extra});
test('an express that leaves later wins on earliest arrival, independent of fare',()=>{
 const r=solve([ride('local','A','Z',2,30,{fare:1}),ride('express','A','Z',5,20,{fare:9999})]);assert.equal(r.arrival,20);assert.equal(r.steps[1].trip,'express');
});
test('walking access, transfers, waiting and egress all affect the chosen route',()=>{
 const r=solve([ride('one','A','B',6,10),ride('too-tight','C','Z',14,16),ride('safe','C','Z',17,20),ride('direct','A','Z',7,22)],{origins:[{station:'A',minutes:5}],transfers:new Map([['B',[{to:'C',minutes:5}]]]),destinations:new Map([['Z',{minutes:3}]])});assert.equal(r.durationMinutes,23);assert.ok(!r.steps.some(s=>s.trip==='too-tight'));assert.ok(r.steps.some(s=>s.trip==='safe'));
});
test('through riding requires an explicit predecessor finishing at this departure',()=>{
 const cs=[ride('first','A','B',1,10,{final:true}),ride('linked','C','Z',10,20,{previousTrips:['first']})];assert.equal(solve(cs).arrival,20);assert.equal(solve(cs.map(c=>({...c,previousTrips:[]}))),null);
 assert.equal(solve(cs.map(c=>c.trip==='first'?{...c,final:false}:c)),null);
});
test('equal-arrival ties avoid an unnecessary ride out and back to board the same train',()=>{
 const cs=[ride('detour','A','B',1,5),ride('return','B','A',6,10),ride('return','A','Z',11,20,{final:true})];const r=solve(cs);assert.equal(r.arrival,20);assert.deepEqual(r.steps.filter(s=>s.kind==='ride').map(s=>[s.from,s.to]),[['A','Z']]);
});
test('fewer transfers never beat an earlier arrival',()=>{
 const r=solve([ride('direct','A','Z',1,30),ride('one','A','B',2,5),ride('two','B','Z',7,20)]);assert.equal(r.arrival,20);assert.equal(r.steps.filter(s=>s.kind==='ride').length,2);
});
test('service-day minutes handle post-midnight trips without falling back to morning',()=>{
 const r=solve([ride('night','A','Z',1450,1460)],{departure:1445});assert.equal(r.durationMinutes,15);assert.equal(solve([ride('yesterday','A','Z',10,20)],{departure:1445}),null);
});
test('unreachable destinations and a passed boarding cutoff stay unavailable',()=>{
 assert.equal(solve([ride('missed','A','Z',0,10)]),null);assert.equal(solve([ride('far','A','Z',400,410)]),null);
});
test('train chains that split do not make an unlinked branch reachable',()=>{
 const r=solve([ride('first','A','B',1,5,{final:true}),ride('branch1','B','C',5,10,{previousTrips:['first'],final:true}),ride('branch2','D','Z',10,15,{previousTrips:['unreachable-other-train']})]);assert.equal(r,null);
});
const {referencePath}=require('../scripts/rail-reference-path.cjs'),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
test('geometry follows published station order at repeated interchange coordinates',()=>{
 const line=[[0,0],[1000,0],[1000,1000],[0,1000],[0,0],[-1000,0]],stops=[[0,1000],[0,0],[-1000,0]];
 assert.deepEqual(referencePath(line,stops,distance),line.slice(3));
 assert.deepEqual(referencePath(line,[[0,1000],[4000,4000],[-1000,0]],distance),[]);
});
test('a circular railway preserves the source train direction instead of the shorter opposite arc',()=>{
 const line=[[0,0],[1000,0],[1000,1000],[0,1000],[0,0]],stops=[[1000,0],[0,0],[0,1000],[1000,1000]];
 const r=referencePath(line,stops,distance);assert.ok(r.some(p=>p[0]===0&&p[1]===0));assert.ok(r.length>=4);
});
