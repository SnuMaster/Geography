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
test('Hakone cable and ropeway both use sourced track geometry',()=>{
 const cable=parts.filter(p=>p.lineId==='Hakone.Cable'),rope=parts.filter(p=>p.lineId==='Hakone.Ropeway');assert.equal(cable.length,2);assert.equal(rope.length,2);
 for(const p of cable){assert.equal(p.geometryAccuracy,'mapped');assert.ok(p.coords.length>10);assert.equal(p.source,source.source);}
 for(const p of rope){assert.equal(p.geometryAccuracy,'mapped');assert.ok(p.coords.length>=7);assert.match(p.source,/openstreetmap.org\/way\/26776732/);}
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
test('every active rail, metro and bus service has a visible mark, including split through services',()=>{
 ui.L={latLng:p=>({point:p,distanceTo:q=>G.distance(p,q.point)})};
 for(const leg of Object.values(bundle.routes.days).flat())for(const p of ui.railParts(leg).filter(p=>['rail','metro','bus'].includes(p.mode))){assert.ok(ui.railInfo(p),p.lineId+' '+p.line);assert.match(ui.railBadge(p),/role="img"|operator-logo/,p.line);}
 for(const id of ['Yurikamome.Yurikamome','Minatomirai.Minatomirai','JR-East.KeihinTohokuNegishi','JR-East.Ito','Tobu.TobuSkytree','Tobu.Nikko','OdakyuHakone.HakoneTozan','Hakone.Cable','Hakone.Ropeway'])assert.ok(ui.railInfo({lineId:id}).source,id);
});
test('all formerly long straight walking gaps now follow a walking graph; internal shortcuts are not painted',()=>{
 assert.deepEqual(parts.filter(p=>p.mode==='walk'&&p.geometryAccuracy==='schematic'&&p.distanceM>80),[]);
 const corrected=parts.filter(p=>p.mode==='walk'&&p.responseSha256&&/OSRM foot/.test(p.geometrySource));assert.equal(corrected.length,20);
 for(const p of corrected){assert.ok(p.coords.length>2);assert.equal(G.quality(p),'mapped');for(let i=1;i<p.coords.length;i++)assert.ok(G.distance(p.coords[i-1],p.coords[i])<1000);}
 assert.equal(ui.mapPartVisible({mode:'transfer',geometryAccuracy:'schematic'}),false);assert.equal(ui.mapPartVisible({mode:'walk',geometryAccuracy:'mapped'}),true);
 assert.equal(ui.mapPartVisible({mode:'transfer',geometrySource:'역내 통로 대표 연결(개략)'}),false);
});
test('Nikko bus stops at Nishisando and walks to the mapped front entrance instead of driving through the shrine',()=>{
 const stops=bundle.data.days.find(d=>d.n===10).variants[0].stops,entrance=require('../scripts/tokyo-transit-corrections.json').toshoguEntrance;
 assert.ok(G.distance([stops[2].lat,stops[2].lng],entrance.point)<1);assert.match(stops[2].coordinateSource,/699013021/);
 for(const index of [1,4]){const leg=bundle.routes.days['10-main'][index],bus=leg.parts.find(p=>p.mode==='bus');assert.equal(bus.lineId,'TobuBus.Nikko.C');assert.equal(bus.geometryAccuracy,'mapped');assert.ok(bus.coords.length>70);assert.ok(leg.parts.some(p=>p.mode==='walk'&&p.distanceM>400));assert.match(bus.from+' '+bus.to,/니시산도입구/);assert.equal(leg.fare.icYen,350);}
});
test('Fuua shuttle uses a road-shaped reference and never claims a verified bus alignment',()=>{
 const shuttle=parts.filter(p=>p.lineId==='Atami.FuuaShuttle');assert.equal(shuttle.length,2);
 for(const p of shuttle){assert.ok(p.coords.length>100);assert.equal(p.geometryAccuracy,'schematic');assert.match(p.geometrySource,/실제 셔틀 경유로 미확인/);assert.ok(p.distanceM>2500);assert.equal(ui.railInfo(p).vehicle,'bus');}
});
