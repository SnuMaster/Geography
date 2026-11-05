'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bundle=require('../japan-2027/trip-update.json'),source=require('../scripts/tokyo-rail-geometry.json'),G=require('../japan-2027/location-core');
const parts=Object.values(bundle.routes.days).flat().flatMap(l=>l.parts);
test('Tokyo–Atami follows the official Shinkansen through Shin-Yokohama and Odawara in both directions',()=>{
 const legs=parts.filter(p=>p.lineId==='JR-Central.TokaidoShinkansen');assert.equal(legs.length,2);
 for(const p of legs){assert.equal(p.geometryAccuracy,'mapped');assert.equal(p.source,source.source);assert.ok(p.coords.length>1000);assert.ok(p.distanceM>94000&&p.distanceM<98000);
  for(const station of [[35.507,139.617],[35.256,139.155]])assert.ok(p.coords.some(c=>G.distance(c,station)<500),'verified intermediate station');
  for(let i=1;i<p.coords.length;i++)assert.ok(G.distance(p.coords[i-1],p.coords[i])<1500,'no invented long straight gap');
 }
 assert.deepEqual(legs[0].coords,legs[1].coords.toReversed());assert.match(legs[0].geometrySource,/N02-25/);assert.equal(source.license,'CC BY 4.0');
});
test('Hakone cable uses the sourced track; the unverified ropeway stays explicitly schematic',()=>{
 const cable=parts.filter(p=>p.lineId==='Hakone.Cable'),rope=parts.filter(p=>p.lineId==='Hakone.Ropeway');assert.equal(cable.length,2);assert.equal(rope.length,2);
 for(const p of cable){assert.equal(p.geometryAccuracy,'mapped');assert.ok(p.coords.length>10);assert.equal(p.source,source.source);}
 for(const p of rope)assert.equal(p.geometryAccuracy,'schematic');
});
const ui={MODE:{rail:{color:'#123456'},walk:{color:'#abc'},transfer:{color:'#def'},flight:{color:'#333'}},esc:String,icon:x=>x};vm.createContext(ui);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-ui.js'),'utf8'),ui);
test('schematic, transfer and flight dashes remain visible through both strokes at each map scope',()=>{
 for(const overview of [false,true])for(const part of [{mode:'rail',geometryAccuracy:'schematic'},{mode:'transfer',geometryAccuracy:'schematic'},{mode:'flight',geometryAccuracy:'mapped'}]){
  const styles=ui.routeLineStyles(part,{overview});assert.ok(styles.line.dashArray);assert.equal(styles.casing.dashArray,styles.line.dashArray);assert.equal(styles.casing.interactive,false);
  if(part.geometryAccuracy==='schematic'){assert.ok(styles.line.opacity<1);assert.ok(styles.casing.opacity<.6);}
 }
 const mapped=ui.routeLineStyles({mode:'rail',lineId:'JR-Central.TokaidoShinkansen',geometryAccuracy:'mapped'});assert.equal(mapped.line.dashArray,null);assert.equal(mapped.line.color,'#0068b7');
});
test('Shinkansen badge is available consistently and its static asset is in the offline shell',()=>{
 const p={mode:'rail',lineId:'JR-Central.TokaidoShinkansen',line:'도카이도 신칸센'};
 assert.ok(ui.railInfo(p));assert.match(ui.railBadge(p),/assets\/operators\/shinkansen.svg/);assert.match(ui.operatorLogo(p),/신칸센 로고/);
 assert.doesNotMatch(ui.operatorLogo({mode:'rail',lineId:'JR-East.Yamanote'}),/shinkansen/);
 assert.match(fs.readFileSync(require.resolve('../japan-2027/sw.js'),'utf8'),/assets\/operators\/shinkansen.svg/);
});
