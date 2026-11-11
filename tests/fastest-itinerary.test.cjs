'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),bundle=require('../japan-2027/trip-update.json'),F=require('../japan-2027/fare-core');
test('all timed, covered railway journeys carry a dated, explicitly non-live time comparison',()=>{
 const optimized=Object.values(bundle.routes.days).flat().filter(l=>l.timeComparison);assert.equal(optimized.length,43);
 for(const leg of optimized){const t=leg.timeComparison;assert.equal(t.policy,'earliest-arrival');assert.equal(t.live,false);assert.equal(t.travelDateVerified,false);assert.match(t.departureDate,/^2027-01-/);assert.equal(t.referenceArrivalMinutes-t.departureMinutes,leg.durationMinutes);assert.equal(t.totalMinutes,leg.durationMinutes);assert.ok(t.sources.length);assert.ok(t.walkingMinutes+t.transferMinutes+t.waitingMinutes<=t.totalMinutes);assert.match(t.scope,/전 노선.*보장 아님/);for(const p of leg.parts.filter(p=>p.referenceTrainIds)){assert.ok(p.referenceTrainIds.length);assert.equal(p.durationBasis,'stored-timetable-reference');assert.ok(p.referenceTimetable.startsWith('https://'));}}
});
test('Toyosu uses the verified Tsukiji–Shintomicho connection and charges integrated Metro fare once',()=>{
 const leg=bundle.routes.days['2-main'][0],rail=leg.parts.filter(p=>['rail','metro'].includes(p.mode));assert.deepEqual(rail.map(p=>p.lineId),['TokyoMetro.Hibiya','TokyoMetro.Yurakucho','Yurikamome.Yurikamome']);assert.equal(rail[0].toJa,'築地');assert.equal(rail[1].fromJa,'新富町');assert.equal(rail[2].fromJa,'豊洲');assert.equal(leg.fare.icYen,398);assert.deepEqual(F.railItems([leg]).map(r=>r.icYen),[209,189]);assert.equal(bundle.data.days[1].fareAlternatives[0].normalFare,839);
});
test('Roppongi return uses Hibiya and Mita, with the reviewed 70-yen transfer discount',()=>{
 const leg=bundle.routes.days['12-main'][6];assert.deepEqual(leg.parts.filter(p=>['rail','metro'].includes(p.mode)).map(p=>p.lineId),['TokyoMetro.Hibiya','Toei.Mita']);assert.equal(leg.fare.icYen,286);assert.equal(leg.fare.breakdown[1].transferDiscountYen,70);assert.equal(leg.fare.breakdown[1].beforeTransferDiscountIcYen,178);
});
test('time-priority Hakone includes Shinkansen but cannot claim invented live train departures',()=>{
 for(const i of [0,4]){const leg=bundle.routes.days['6-main'][i],part=leg.parts.find(p=>p.lineId==='JR-Central.TokaidoShinkansen');assert.ok(part);assert.ok(part.referenceTimetable.includes('timetables.jreast.co.jp'));assert.equal(part.geometryAccuracy,'mapped');assert.ok(part.distanceM>75000);const ticket=leg.fare.breakdown.find(r=>r.operator==='JR-Central');assert.equal(ticket.icYen,3280);assert.equal(ticket.ticketRequired,true);}
 assert.equal(bundle.routes.days['1-main'].find(l=>l.fare.displayBlank).fare.icYen,null);assert.equal(bundle.data.days.at(-1).pendingReturn.status,'unconfirmed');
 assert.doesNotMatch(JSON.stringify(bundle.data.days[5].variants[0].stops),/신주쿠 출발 로망스카/);
});
test('unsupported fixed airport and tourist services remain identifiable instead of falsely labeled fastest',()=>{
 const remaining=Object.values(bundle.routes.days).flat().filter(l=>l.routePreference==='retained-special-service');assert.equal(remaining.length,5);for(const l of remaining){assert.equal(l.timeComparison,undefined);assert.match(l.routePreferenceNotice,/비교 미지원/);}
});
