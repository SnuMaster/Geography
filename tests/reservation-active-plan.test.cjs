'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../japan-2027/reservation-plan'),bundle=require('../japan-2027/trip-update.json');
const legacy=[{key:'ibuki',group:'food',name:'긴자 이부키',details:[]},{key:'flight-tokyo',day:1},{key:'hotel-tokyo',day:1},{key:'zutomayo',details:[]}];
const context=()=>({days:structuredClone(bundle.data.days),metadata:bundle.data.metadata});
test('booking checklist follows the actual itinerary dates and removes retired trips',()=>{
 const rows=P.build(context(),legacy),by=Object.fromEntries(rows.map(r=>[r.key,r]));
 assert.equal(by['fuji-excursion'].day,5);assert.match(by['fuji-excursion'].date,/1\/12/);assert.match(by['fuji-excursion'].milestones[0][0],/^2026-12-12T10:00/);
 assert.equal(by['nikko-express'].day,8);assert.match(by['nikko-express'].date,/1\/15/);assert.match(by['nikko-express'].details.join(' '),/스페이시아 X/);assert.match(by['nikko-express'].details.join(' '),/일반열차/);
 assert.match(by.ibuki.date,/18:00/);assert.doesNotMatch(by.ibuki.date,/19:00/);
 assert(!rows.some(r=>/hakone|ishikawa|osaka|fukuoka|yamazaki/.test(r.key)));
 assert.equal(by['hotel-dome'].day,12);assert.equal(by['flight-return-tokyo'].day,15);
});
test('booking dates and visit time derive from the plan without editing checklist literals',()=>{
 const c=context();c.days[4].date='01/13';c.days[8].variants[0].stops.find(s=>s.planKey==='ibuki').time='18:30-20:30';
 const r=P.build(c,legacy);assert.match(r.find(x=>x.key==='fuji-excursion').date,/1\/13/);assert.match(r.find(x=>x.key==='fuji-excursion').milestones[0][0],/^2026-12-13/);assert.match(r.find(x=>x.key==='ibuki').date,/18:30/);
});
test('a removed destination removes its booking instead of keeping an unrelated day link',()=>{
 const c=context();for(const d of c.days)for(const v of d.variants)v.stops=v.stops.filter(s=>s.planKey!=='fujiStation');
 assert(!P.build(c,legacy).some(x=>x.key==='fuji-excursion'));
});
