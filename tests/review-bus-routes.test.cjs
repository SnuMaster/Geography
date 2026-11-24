'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),b=require('../japan-2027/trip-update.json'),e=require('../scripts/tokyo-reviewed-bus-geometry.json'),G=require('../japan-2027/location-core'),P=require('../scripts/apply-review-buses.cjs');
test('unchanged bus legs use reviewed boarding, alighting and ordered intermediate stops',()=>{
 assert.equal(e.routes.length,6);
 for(const r of e.routes.filter(r=>r.key!=='8-main'||r.index===1)){const l=b.routes.days[r.key][r.index],p=l.parts.find(p=>p.mode==='bus');assert.equal(p.fromJa,r.boarding.name);assert.equal(p.toJa,r.alighting.name);assert.deepEqual(p.coords,r.bus.coords);assert(p.coords.length>20);assert.equal(p.stopSequence.length,r.stops.length);assert.equal(l.busRoute.live,false);assert.equal(l.busRoute.checkedAt,'2026-11-18');
  for(let i=1;i<l.parts.length;i++)assert(G.distance(l.parts[i-1].coords.at(-1),l.parts[i].coords[0])<=2.1,r.key+' joins');
  assert.equal(l.durationMinutes,l.parts.reduce((n,p)=>n+p.durationMinutes,0)+r.waitMinutes);
 }
 assert.equal(b.routes.days['5-main'][2].fare.icYen,570);assert.equal(b.routes.days['5-main'][3].fare.icYen,280);assert.equal(b.routes.days['5-main'][5].fare.icYen,230);
 assert.equal(b.routes.days['8-main'][1].fare.icYen,1250);assert.equal(b.routes.days['8-main'][4].fare.icYen,1250);
});
test('Nikko outbound and inbound use different Irohazaka alignments and directional platforms',()=>{
 const out=b.routes.days['8-main'][1].parts.find(p=>p.mode==='bus'),back=b.routes.days['8-main'][4].parts.find(p=>p.mode==='bus');
 assert(out.source.includes('8170947'));assert(back.source.includes('8269070'));assert.notDeepEqual(out.coords,back.coords.toReversed());
 assert.notDeepEqual(out.boardingStop.point,back.alightingStop.point);
 assert.equal(back.boardingStop.name,'中禅寺温泉');assert.equal(back.stopSequence[0].name,'中禅寺温泉');assert.equal(back.alightingStop.name,'東武日光駅');
});
test('Fujikyu Red Line respects the official stop order rather than a direct car shortcut',()=>{
 const p=b.routes.days['5-main'][2].parts.find(p=>p.mode==='bus'),names=p.stopSequence.map(s=>s.name);
 assert.equal(names[0],'河口湖駅');assert.equal(names.at(-1),'河口湖自然生活館');assert(names.indexOf('河口湖ハーブ館')<names.indexOf('遊覧船ロープウェイ入口'));assert(names.indexOf('遊覧船ロープウェイ入口')<names.indexOf('河口湖美術館'));
 assert.equal(p.geometryAccuracy,'stop-verified-reference');assert.match(p.geometrySource,/道路|도로/);
 const park=b.data.days[4].variants[0].stops.find(s=>s.planKey==='oishi');assert(G.distance([park.lat,park.lng],p.alightingStop.point)<2);assert.match(park.coordinateNote,/입구/);
});
test('reviewed bus patch is idempotent and preserves rail fares and the blank Skyliner',()=>{
 const copy=structuredClone(b),before=JSON.stringify(copy.routes);P.apply(copy,{...e,routes:e.routes.filter(r=>r.key!=='8-main'||r.index===1)});assert.equal(JSON.stringify(copy.routes),before);assert.equal(copy.routes.days['1-main'].find(l=>l.fare.displayBlank).fare.min,null);
});
