'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),G=require('../japan-2027/location-core');
const bundle=require('../japan-2027/trip-update.json'),all=Object.values(bundle.routes.days).flat();
function context(){
 const layers=[],symbols=[],selected=[],ctx={MODE:{rail:{color:'#477b95'},metro:{color:'#477b95'},walk:{color:'#78b995'},bus:{color:'#477b95'},taxi:{color:'#b9a7e8'},flight:{color:'#c97a4c'},ferry:{color:'#73cdd2'}},esc:String,icon:x=>x,stationLabel:x=>x,distanceText:m=>String(m),fareText:()=>'',window:{TripPersonal:{displayParts:l=>l.parts}},state:{night:false,view:'daily'},routeLayer:{},routeVisuals:[],DetailView:{options:()=>({})},overviewLegHtml:(leg,part)=>({leg,part}),setFocusedLeg:i=>selected.push(i),focusedLegs:new Map(),map:{getContainer:()=>({})},L:{latLng:p=>({point:p,distanceTo:q=>G.distance(p,q.point)}),polyline:(coords,options)=>{const node={attrs:{},setAttribute(k,v){this.attrs[k]=v;}},l={coords,options:{...options},events:{},addTo(){return this;},getElement(){return node;},bindPopup(fn){this.popup=fn;return this;},on(n,fn){this.events[n]=fn;return this;},setStyle(s){Object.assign(this.options,s);return this;}};layers.push(l);return l;}}};
 ctx.routeVisual=(layer,leg,index=leg.legIndex,mode)=>{ctx.routeVisuals.push({layer,day:leg.dayNumber,variant:leg.variant,index,modes:mode?[mode]:leg.parts.map(p=>p.mode)});return layer;};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-ui.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../japan-2027/rail-departure-profiles.js'),'utf8'),ctx);
 Object.assign(ctx,{addRailMapSymbol:(p,l)=>symbols.push({p,l}),showRailHover:(e,l,p)=>ctx.hover={l,p},positionRailHover(){},hideRailHover(){ctx.hover=null;}});
 return {ctx,layers,symbols,selected};
}
test('all 118 active movements retain every geometry, fare, timetable and transfer while choosing one map color',()=>{
 const {ctx}=context();assert.equal(all.length,118);
 for(const leg of all){const before=JSON.stringify(leg),plan=ctx.movementMapPlan(leg),old=ctx.railMapDrawParts(leg).filter(p=>ctx.mapPartVisible(p)&&p.coords?.length>=2&&p.distanceM>=8);
  assert.equal(JSON.stringify(plan.parts.map(p=>p.coords)),JSON.stringify(old.map(p=>p.coords)),leg.legId);
  assert.equal(JSON.stringify(leg),before);assert.match(plan.color,/^#[0-9a-f]{3,6}$/i);
  assert.equal(plan.hover.from,leg.from);assert.equal(plan.hover.to,leg.to);assert.equal(plan.hover.distanceM,leg.distanceM);
 }
});
test('every daily and overview movement has one complete hit target and all strokes highlight and reset together',()=>{
 for(const overview of [false,true])for(const leg of all){
  const {ctx,layers,selected}=context(),snapshot=JSON.stringify(leg),plan=ctx.movementMapPlan(leg);ctx.state.view=overview?'overview':'daily';
  ctx.drawMapMovement(leg,{overview,symbols:false});
  const hits=ctx.routeVisuals.filter(v=>v.role==='movement-hit'),lines=ctx.routeVisuals.filter(v=>v.role==='movement-line');
  assert.equal(hits.length,plan.parts.length?1:0,leg.legId);if(!hits.length)continue;
  assert.equal(lines.length,plan.parts.length);assert.equal(new Set(lines.map(v=>v.layer.options.color)).size,1);
  const hit=hits[0].layer;assert.equal(JSON.stringify(hit.coords),JSON.stringify(plan.parts.map(p=>p.coords)),'no fabricated bridge or omitted track');
  assert(lines.every(v=>v.layer.options.interactive===false));assert.equal(hit.options.interactive,true);
  const before=lines.map(v=>({...v.layer.options}));hit.events.mouseover({});assert(lines.every(v=>v.layer.options.weight===7&&v.layer.options.opacity===1));
  assert.equal(ctx.hover.p.from,leg.from);assert.equal(ctx.hover.p.to,leg.to);hit.events.mouseout();lines.forEach((v,i)=>assert.deepEqual(v.layer.options,before[i]));
  const popup=hit.popup();assert.equal(popup.leg,leg);assert.equal(popup.part,null,'popup includes every real boarding, not only the hovered line');
  if(!overview){hit.events.click();assert.deepEqual(selected,[leg.legIndex]);}
  assert.equal(JSON.stringify(leg),snapshot);
 }
});
test('the reported Kamakura journey includes the JR through ride AND the real Yokohama transfer in one selection',()=>{
 const {ctx}=context(),leg=bundle.routes.days['10-main'][0],plan=ctx.movementMapPlan(leg);
 assert(plan.parts.some(p=>p.lineId==='JR-East.Yokosuka'));assert.equal(plan.boardings,3);
 assert.equal(leg.parts.filter(p=>p.mode==='transfer'&&p.from==='요코하마'&&p.durationMinutes>0).length,1);
 const html=ctx.railHoverHtml(leg,plan.hover);assert.match(html,/환승 2회/);assert.doesNotMatch(html,/직통 열차 · 환승 없이 계속 탑승/);
 const tobu=bundle.routes.days['8-main'][5];assert.equal(ctx.movementMapPlan(tobu).boardings,3,'local to Spacia X to Metro stays three real boardings');
});
test('walking and schematic segments keep their own dash semantics under the movement color',()=>{
 const {ctx}=context(),leg=structuredClone(bundle.routes.days['10-main'][0]),p=leg.parts.find(p=>p.mode==='rail');p.geometryAccuracy='schematic';
 const plan=ctx.movementMapPlan(leg);ctx.drawMapMovement(leg,{symbols:false});
 for(const [i,part]of plan.parts.entries()){
  const visual=ctx.routeVisuals.filter(v=>v.role==='movement-line')[i];assert.equal(visual.layer.options.color,plan.color);
  assert.equal(visual.layer.options.dashArray,ctx.routeLineStyles(part).line.dashArray);
 }
});
test('every map and symbol entry point opens the whole movement',()=>{
 const app=fs.readFileSync(require.resolve('../japan-2027/app.js'),'utf8'),ui=fs.readFileSync(require.resolve('../japan-2027/rail-ui.js'),'utf8');
 assert.match(app,/legLines.push\(\.\.\.drawMapMovement\(detailed/);assert.match(app,/for\(const leg of legs\)drawMapMovement\(leg,\{overview:true/);
 assert.match(ui,/overviewLegHtml\(entry.leg,null\)/);
});
