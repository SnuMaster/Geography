'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../japan-2027/fare-core'),T=require('../japan-2027/data-model'),refs=require('../scripts/tokyo-fare-references.cjs'),bundle=require('../japan-2027/trip-update.json');
const {data,routes}=T.prepare(structuredClone(bundle.data),structuredClone(bundle.routes));
test('all active Japanese rail fares are sourced; only the explicitly blank Skyliner remains unknown',()=>{
 const unknown=[];for(const [key,legs]of Object.entries(routes.days))for(const leg of legs){const rows=F.railItems([leg]);if(!rows.length)continue;if(leg.fare.icYen===null)unknown.push(leg);else{assert.equal(leg.fare.icYen,rows.reduce((n,r)=>n+r.icYen,0),key);assert.equal(leg.fare.min,leg.fare.icYen);assert.ok(rows.every(r=>r.checkedAt&&r.sources.length));assert.ok(rows.every(r=>r.sources.every(url=>new URL(url).protocol==='https:')));}}
 assert.equal(unknown.length,1);assert.equal(unknown[0].fare.displayBlank,true);assert.equal(F.format(unknown[0].fare,unknown[0]),'');assert.deepEqual(unknown[0].fare.breakdown,[]);
});
test('integrated Metro and JR changes of train are charged once, separately from other operators',()=>{
 const rows=F.railItems(routes.days['2-main']);assert.deepEqual(rows.map(r=>r.icYen),[209,388,325,325,209]);assert.equal(F.summarize(routes.days['2-main'],{scope:'japan-rail'}).ic,1456);
 const yoko=F.railItems([routes.days['4-main'][0]]);assert.deepEqual(yoko.map(r=>r.icYen),[178,616,224]);assert.equal(yoko[1].combined,true);assert.deepEqual(yoko[1].lineIds,['JR-East.Takasaki','JR-East.Tokaido']);
 const part=routes.days['4-main'][0].parts.find(p=>p.lineId==='JR-East.Tokaido');assert.equal(F.boardingFare(routes.days['4-main'][0],part).amount,616);
 assert.equal(F.summarize(routes.days['12-main'],{scope:'japan-rail'}).ic,992);
});
test('Romancecar and Nikko show IC base fare and the actual selected supplementary ticket basis',()=>{
 const romance=F.railItems(routes.days['6-main']).filter(r=>r.lineIds.includes('Odakyu.Odawara'));assert.equal(romance.length,2);for(const r of romance){assert.equal(r.baseIcYen,1261);assert.equal(r.reservedSurchargeYen,1200);assert.equal(r.icYen,2461);assert.equal(r.ticketRequired,true);}
 const nikko=F.railItems(routes.days['10-main']).filter(r=>r.lineIds.includes('Tobu.Nikko'));for(const r of nikko){assert.equal(r.baseIcYen,1393);assert.equal(r.reservedSurchargeYen,1650);assert.equal(r.icYen,3043);assert.match(r.fareBasis,/2027-01-17.*통상기/);}
 assert.equal(F.summarize(routes.days['10-main'],{scope:'japan-rail'}).ic,6442);
 assert.equal(routes.days['10-main'][1].fare.icYen,350);assert.equal(routes.days['10-main'][4].fare.icYen,350);assert.equal(F.summarize(routes.days['10-main']).ic,7142);
});
test('Hakone ropeway round-trip ticket is counted once and cannot silently become a free unpaired return',()=>{
 const legs=routes.days['6-main'],rope=F.railItems(legs).filter(r=>r.lineIds.includes('Hakone.Ropeway'));assert.deepEqual(rope.map(r=>r.icYen),[3000,0]);assert.ok(rope.every(r=>r.ticketRequired));assert.match(rope[1].ticketLabel,/왕복권에 포함/);assert.equal(F.summarize(legs,{scope:'japan-rail'}).ic,10476);
 const bad=structuredClone(bundle);bad.routes.days['6-main'].splice(1,1);bad.routes.days['6-main'][1].fare.status='unverified';assert.throws(()=>refs.apply(bad),/Return fare needs/);
});
test('Atami Shinkansen is a separate base ticket plus non-reserved surcharge, never an IC-only fare',()=>{
 const legs=routes.days['14-main'],rows=F.railItems(legs),shinkansen=rows.filter(r=>r.lineIds.includes('JR-Central.TokaidoShinkansen'));assert.equal(shinkansen.length,2);for(const r of shinkansen){assert.equal(r.icYen,3740);assert.equal(r.baseTicketYen,1980);assert.equal(r.baseIcYen,undefined);assert.equal(r.reservedSurchargeYen,1760);assert.equal(r.ticketRequired,true);assert.match(r.ticketLabel,/자유석/);}
 assert.equal(F.summarize(legs,{scope:'japan-rail'}).ic,8100);assert.equal(data.days[1].fareAlternatives[0].autoApplied,false);assert.equal(data.days[5].fareAlternatives[0].autoApplied,false);
});
