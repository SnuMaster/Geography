'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bundle=require('../japan-2027/trip-update.json'),F=require('../japan-2027/fare-core'),complete=require('../scripts/complete-tokyo-fares.cjs');
test('every planned public rail and bus movement is priced except the deliberately blank Skyliner',()=>{
 let priced=0,blank=0;
 for(const [key,legs]of Object.entries(bundle.routes.days))for(const l of legs){
  if(!l.parts.some(p=>['rail','metro','bus'].includes(p.mode)))continue;
  if(l.fare.displayBlank){blank++;for(const field of ['min','max','icYen','paperTicketYen'])assert.equal(l.fare[field],null);assert.deepEqual(l.fare.breakdown,[]);continue;}
  priced++;assert(Number.isFinite(l.fare.icYen)&&l.fare.icYen>=0,key+' '+l.summary);assert.equal(l.fare.min,l.fare.icYen);assert.equal(l.fare.max,l.fare.icYen);assert(l.fare.sources.length,key);
  assert.equal(l.fare.breakdown.reduce((n,r)=>n+r.icYen,0),l.fare.icYen,key);
 }
 assert(priced>35);assert.equal(blank,1);assert.equal(bundle.data.metadata.unpricedPublicTransport,0);
});
test('Metro and Toei transfer discounts are deducted once without changing the selected route',()=>{
 for(const [key,index,total,original]of [['4-main',0,328,220],['12-main',5,286,178]]){
  const l=bundle.routes.days[key][index],discount=l.fare.breakdown.filter(r=>r.transferDiscountYen);
  assert.equal(l.fare.icYen,total);assert.equal(discount.length,1);assert.equal(discount[0].transferDiscountYen,70);assert.equal(discount[0].beforeTransferDiscountIcYen,original);
 }
});
test('Spacia X return includes one whole-OD base fare and one actual express ticket',()=>{
 const l=bundle.routes.days['8-main'][5],t=l.fare.breakdown.find(r=>r.operator==='TobuNikko');
 assert.equal(l.fare.icYen,3511);assert.equal(t.baseIcYen,1393);assert.equal(t.reservedSurchargeYen,1940);assert.equal(t.icYen,3333);assert.equal(t.travelDate,'2027-01-15');assert.equal(t.season,'normal');assert(t.ticketRequired);assert.match(t.ticketLabel,/스페이시아 X/);
 assert(l.parts.some(p=>/Spacia.?X|스페이시아.?X|スペーシア.?X/i.test(p.serviceName||'')));
});
test('bus fares are separate from the Japanese rail-only subtotal and carry stop-level evidence',()=>{
 for(const key of ['5-main','8-main'])for(const l of bundle.routes.days[key].filter(l=>l.parts.some(p=>p.mode==='bus'))){assert(l.fare.breakdown.every(r=>r.mode==='bus'&&r.fromJa&&r.toJa&&r.checkedAt&&r.sources.length));assert.equal(F.summarize([l],{scope:'japan-rail'}).ic,0);assert(l.fare.icYen>0);}
 for(const [key,i,price] of [['5-main',2,570],['5-main',3,280],['5-main',5,230],['8-main',1,1250],['8-main',3,650],['8-main',4,1750]])assert.equal(bundle.routes.days[key][i].fare.icYen,price);
});
test('Enoden and Yurikamome amounts follow their exact station pairs',()=>{
 assert.equal(bundle.routes.days['10-main'][5].fare.icYen,260);
 assert.equal(bundle.routes.days['10-main'][6].fare.icYen,200);
 assert.equal(bundle.routes.days['10-main'][8].fare.breakdown.find(r=>r.operator==='Enoden').icYen,220);
 assert.equal(bundle.routes.days['7-main'][3].fare.icYen,325);
 assert.equal(bundle.data.days[6].fareAlternatives[0].normalFare,839);
});
test('the optional ropeway uses the current individual round-trip fare, not the group fare',()=>{
 const s=bundle.data.days[4].variants[0].stops.find(s=>s.planKey==='ropeway');
 assert.equal(s.details.costMin,1200);assert.equal(s.details.costMax,1200);assert.match(s.description,/선택/);
});
test('applying evidence again is idempotent and does not fill the Skyliner or invent the return flight',()=>{
 const copy=structuredClone(bundle),before=JSON.stringify(copy.routes),r=complete.apply(copy);assert.deepEqual(r.missing,[]);assert.deepEqual(r.updated,[]);assert.equal(JSON.stringify(copy.routes),before);
 assert.equal(copy.data.days[14].pendingReturn.airport,null);assert.equal(copy.data.days[14].pendingReturn.flight,null);
});
