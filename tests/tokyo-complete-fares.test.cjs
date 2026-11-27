'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bundle=require('../japan-2027/trip-update.json'),F=require('../japan-2027/fare-core'),complete=require('../scripts/complete-tokyo-fares.cjs');
test('every planned Japanese rail and bus movement is priced except the deliberately blank Skyliner',()=>{
 let priced=0,blank=0;
 for(const [key,legs]of Object.entries(bundle.routes.days))for(const l of legs){
  if(l.fare.currency==='KRW'||!l.parts.some(p=>['rail','metro','bus'].includes(p.mode)))continue;
  if(l.fare.displayBlank){blank++;for(const field of ['min','max','icYen','paperTicketYen'])assert.equal(l.fare[field],null);assert.deepEqual(l.fare.breakdown,[]);continue;}
  priced++;assert(Number.isFinite(l.fare.icYen)&&l.fare.icYen>=0,key+' '+l.summary);assert.equal(l.fare.min,l.fare.icYen);assert.equal(l.fare.max,l.fare.icYen);assert(l.fare.sources.length,key);
  assert.equal(l.fare.breakdown.reduce((n,r)=>n+r.icYen,0),l.fare.icYen,key);
 }
 assert(priced>25);assert.equal(blank,1);assert.equal(bundle.data.metadata.unpricedPublicTransport,0);
});
test('independent operators retain separate IC components',()=>{
 const l=bundle.routes.days['4-main'][0];assert.equal(l.fare.icYen,377);
 assert.deepEqual(l.fare.breakdown.map(r=>r.operator),['TokyoMetro','JR-East']);
});
test('Spacia X return includes one whole-OD base fare and one actual express ticket',()=>{
 const l=bundle.routes.days['8-main'][5],t=l.fare.breakdown.find(r=>r.operator==='TobuNikko');
 assert.equal(l.fare.icYen,4091);assert.equal(t.baseIcYen,1393);assert.equal(t.reservedSurchargeYen,2520);assert.equal(t.icYen,3913);assert.equal(t.travelDate,'2027-01-15');assert.equal(t.season,'normal');assert(t.ticketRequired);assert.match(t.ticketLabel,/스페이시아 X 프리미엄/);
 assert(l.parts.some(p=>/Spacia.?X|스페이시아.?X|スペーシア.?X/i.test(p.serviceName||'')));
 const out=bundle.routes.days['8-main'][0],cockpit=out.fare.breakdown.find(r=>r.operator==='TobuNikko');
 assert.equal(out.fare.icYen,4011);assert.equal(cockpit.reservedSurchargeYen,2440);assert.match(cockpit.ticketLabel,/콕핏 라운지/);
});
test('bus fares are separate from the Japanese rail-only subtotal and carry stop-level evidence',()=>{
 for(const key of ['5-main','8-main'])for(const l of bundle.routes.days[key].filter(l=>l.parts.some(p=>p.mode==='bus'))){assert(l.fare.breakdown.every(r=>r.mode==='bus'&&r.fromJa&&r.toJa&&r.checkedAt&&r.sources.length));assert.equal(F.summarize([l],{scope:'japan-rail'}).ic,0);assert(l.fare.icYen>0);}
 for(const [key,i,price] of [['5-main',2,570],['5-main',3,280],['5-main',5,370],['8-main',1,1250],['8-main',4,1250]])assert.equal(bundle.routes.days[key][i].fare.icYen,price);
});
test('Yurikamome amounts follow their exact station pairs',()=>{
 assert.equal(bundle.routes.days['7-main'][3].fare.icYen,325);
 assert.equal(bundle.routes.days['7-main'][6].fare.breakdown.find(r=>r.operator==='Yurikamome').icYen,325);
});
test('applying evidence again is idempotent and does not fill the Skyliner or overwrite the selected flights',()=>{
 const copy=structuredClone(bundle),before=JSON.stringify(copy.routes),r=complete.apply(copy);assert.deepEqual(r.missing,[]);assert.deepEqual(r.updated,[]);assert.equal(JSON.stringify(copy.routes),before);
 assert.match(copy.routes.days['13-main'].find(l=>l.parts.some(p=>p.mode==='flight')).summary,/MM809/);
 assert.match(copy.routes.days['1-main'][0].summary,/TW251/);
});
