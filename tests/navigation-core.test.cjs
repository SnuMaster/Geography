'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),GPS=require('../japan-2027/location-core'),Nav=require('../japan-2027/navigation-core');
const now=100000,point=(north,east)=>[35+north/111195,139+east/(111195*Math.cos(35*Math.PI/180))],fix=(north,east,extra={})=>({lat:point(north,east)[0],lng:point(north,east)[1],accuracy:5,timestamp:now,...extra});
const walk=(coords,extra={})=>({mode:'walk',from:'출발',to:'도착',geometrySource:'FOSSGIS OSRM foot',coords:coords.map(p=>point(...p)),...extra}),leg=parts=>({from:'출발',to:'도착',parts});
test('walking guide detects a substantial right/left turn without exposing coordinate noise',()=>{
 let plan=Nav.build(leg([walk([[0,0],[25,1],[50,-1],[75,0],[100,0],[100,100]])]));
 assert.equal(plan.cues.length,1);assert.equal(plan.cues[0].kind,'right');
 let view=Nav.guide(plan,fix(50,0),null,now);assert.equal(view.state,'guiding');assert.equal(view.kind,'right');assert.ok(Math.abs(view.nextDistanceM-50)<3);assert.ok(Math.abs(view.remainingM-150)<4);
 plan=Nav.build(leg([walk([[0,0],[100,0],[100,-100]])]));assert.equal(plan.cues[0].kind,'left');
 const after=Nav.guide(plan,fix(100,-30),null,now);assert.equal(after.kind,'straight');assert.ok(after.remainingM<75);
});
test('short entrance bends are not emitted as rapid navigation commands',()=>{
 const plan=Nav.build(leg([walk([[0,0],[5,0],[5,5],[10,5],[10,0],[100,0]])]));assert.equal(plan.cues.length,0);
});
test('stale, future, inaccurate and malformed fixes never issue a turn instruction',()=>{
 const plan=Nav.build(leg([walk([[0,0],[100,0],[100,100]])]));
 for(const [value,state] of [[null,'waiting'],[fix(50,0,{timestamp:now-30001}),'stale'],[fix(50,0,{timestamp:now+5001}),'stale'],[fix(50,0,{accuracy:51}),'uncertain'],[fix(50,0,{accuracy:-1}),'waiting'],[fix(50,0,{lat:NaN}),'waiting']]){const view=Nav.guide(plan,value,null,now);assert.equal(view.state,state);assert.equal(view.kind,undefined);assert.equal(view.nextDistanceM,undefined);}
});
test('off-route state reports distance to saved geometry and does not invent a detour',()=>{
 const plan=Nav.build(leg([walk([[0,0],[300,0]])])),view=Nav.guide(plan,fix(100,100),null,now);assert.equal(view.state,'off');assert.ok(view.routeDistanceM>95);assert.ok(Number.isFinite(view.returnBearing));assert.equal(view.cue,undefined);assert.equal(view.nextDistanceM,undefined);
});
test('closed routes start at the beginning and require actual progress before a near-arrival hint',()=>{
 const plan=Nav.build(leg([walk([[0,0],[200,0],[200,200],[0,200],[0,0]])]));
 const first=Nav.guide(plan,fix(0,0),null,now);assert.equal(first.state,'guiding');assert.ok(first.remainingM>790);
 const end=Nav.guide(plan,fix(0,5,{timestamp:now+1000}),{alongM:780,fix:fix(0,20)},now+1000);assert.equal(end.state,'near');
});
test('self intersections wait for position evidence rather than jumping ahead',()=>{
 const plan=Nav.build(leg([walk([[0,-200],[0,200],[200,200],[200,0],[-200,0]])]));
 const uncertain=Nav.guide(plan,fix(0,0),null,now);assert.equal(uncertain.state,'ambiguous');
 const previous={alongM:180,fix:fix(0,-20,{timestamp:now-1000})},continued=Nav.guide(plan,fix(0,0),previous,now);assert.equal(continued.state,'guiding');assert.ok(continued.match.alongM<220);
});
test('rail, transfer, vehicle and schematic parts cannot produce road-turn or arrival commands',()=>{
 for(const mode of ['rail','metro','transfer','taxi','bus','flight','ferry']){
  const plan=Nav.build(leg([walk([[0,0],[100,0],[100,100]],{mode,line:'저장 노선',geometryAccuracy:mode==='ferry'?'schematic':'mapped'})]));assert.equal(plan.cues.length,0);
  const view=Nav.guide(plan,fix(50,0),null,now);assert.equal(view.state,['rail','metro'].includes(mode)?'transit':'reference');assert.ok(!['left','right','uturn','arrive'].includes(view.kind));
 }
 const unknown=Nav.build(leg([walk([[0,0],[100,0],[100,100]],{geometrySource:'역내 연결 개략'})]));assert.equal(unknown.cues.length,0);assert.equal(Nav.guide(unknown,fix(50,0),null,now).state,'reference');
});
test('mixed modes retain cumulative distances and only guide turns on mapped walking parts',()=>{
 const plan=Nav.build(leg([walk([[0,0],[100,0]]),walk([[100,0],[1100,0]],{mode:'rail',line:'철도'}),walk([[1100,0],[1200,0],[1200,100]])]));
 const train=Nav.guide(plan,fix(600,0),null,now);assert.equal(train.state,'transit');assert.ok(Math.abs(train.partRemainingM-500)<4);
 const final=Nav.guide(plan,fix(1150,0),null,now);assert.equal(final.kind,'right');assert.ok(Math.abs(final.nextDistanceM-50)<3);assert.ok(Math.abs(final.remainingM-150)<3);
});
test('all source itineraries build usable plans without changing stored geometry or fares',()=>{
 const fs=require('node:fs');for(const file of ['tokyo-routes','west-routes']){const data=JSON.parse(fs.readFileSync(require.resolve('../japan-2027/'+file+'.json'),'utf8')),before=JSON.stringify(data);for(const [key,legs] of Object.entries(data.days))for(const source of legs){const plan=Nav.build(source);assert.ok(Number.isFinite(plan.totalM),key);assert.ok(plan.cues.every(c=>c.atM>=0&&c.atM<=plan.totalM),key);}assert.equal(JSON.stringify(data),before);}
 assert.equal(Nav.guide(Nav.build(null),null,null,now).state,'unavailable');
});
test('wrong-way guidance requires sustained backward travel and clears after forward recovery',()=>{
 const plan=Nav.build(leg([walk([[0,0],[400,0]])]));let previous=null;const send=(north,t,heading=180,speed=1)=>{const v=Nav.guide(plan,fix(north,0,{timestamp:now+t*1000,heading,speed}),previous,now+t*1000);if(v.match)previous=v.match;return v;};
 assert.equal(send(200,0,0).state,'guiding');assert.equal(send(180,10).state,'guiding');assert.equal(send(160,20).state,'wrongway');assert.equal(send(170,30,0).state,'guiding');
});
test('stationary heading, a single backward jitter and repeated timers cannot trigger wrong-way guidance',()=>{
 const plan=Nav.build(leg([walk([[0,0],[400,0]])]));let previous=null;for(const [north,t,heading,speed] of [[200,0,180,0],[201,5,180,0],[199,10,180,0],[175,20,180,1],[175,30,180,1],[175,30,180,1],[175,30,180,1]]){const v=Nav.guide(plan,fix(north,0,{timestamp:now+t*1000,heading,speed}),previous,now+t*1000);assert.notEqual(v.state,'wrongway');if(v.match)previous=v.match;}
});
test('walking course can be inferred from position changes without using phone compass orientation',()=>{
 const plan=Nav.build(leg([walk([[0,0],[400,0]])]));let previous=null,view;for(const [north,t] of [[200,0],[175,10],[150,20]]){view=Nav.guide(plan,fix(north,0,{timestamp:now+t*1000,heading:null,speed:null}),previous,now+t*1000);previous=view.match;}assert.equal(view.state,'wrongway');
});
test('a long GPS interruption resets previous wrong-way evidence',()=>{
 const plan=Nav.build(leg([walk([[0,0],[400,0]])]));let previous=null,view;for(const [north,t] of [[200,0],[175,10],[150,20],[140,60]]){view=Nav.guide(plan,fix(north,0,{timestamp:now+t*1000,heading:180,speed:1}),previous,now+t*1000);previous=view.match;}assert.equal(view.state,'guiding');
});
