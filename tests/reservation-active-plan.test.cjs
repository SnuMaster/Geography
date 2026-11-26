'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../japan-2027/reservation-plan'),bundle=require('../japan-2027/trip-update.json');
const legacy=[{key:'ibuki',group:'food',name:'긴자 이부키',details:[]},{key:'flight-tokyo',day:1},{key:'hotel-tokyo',day:1},{key:'zutomayo',details:[]},{key:'skytree',group:'visit',details:[]}];
const context=()=>({days:structuredClone(bundle.data.days),metadata:bundle.data.metadata});
test('booking checklist follows the actual itinerary dates and removes retired trips',()=>{
 const rows=P.build(context(),legacy),by=Object.fromEntries(rows.map(r=>[r.key,r]));
 assert.equal(by['fuji-excursion'].day,5);assert.match(by['fuji-excursion'].date,/1\/12/);assert.match(by['fuji-excursion'].milestones[0][0],/^2026-12-12T10:00/);
 assert.equal(by['fuji-excursion'].group,'rail');assert.match(by['fuji-excursion'].details.join(' '),/15호.*10:30.*12:24.*48호.*17:41.*19:48/);
 assert.equal(by['fuji-excursion'].kind,'공식 판매 대기 중');assert.match(by['fuji-excursion'].note,/78,032원/);
 assert.equal(by['nikko-express'].day,8);assert.match(by['nikko-express'].date,/1\/15/);assert.match(by['nikko-express'].details.join(' '),/5호.*10:12.*11:49.*콕핏 라운지.*12호.*17:44.*19:21.*프리미엄/);
 assert.equal(by['nikko-express'].kind,'공식 판매 대기 중');assert.match(by['nikko-express'].note,/47,100원/);
 assert.equal(by['nikko-express'].group,'rail');assert.equal(by['nikko-express'].milestones[0][0],'2026-12-15T09:00:00+09:00');
 const pass=by['nikko-maas-chuzenji-kegon'];
 assert.equal(pass.day,by['nikko-express'].day);assert.equal(pass.stop,by['nikko-express'].stop);
 assert.equal(pass.kind,'선택 구매');assert.match(pass.note,/기타센주.*4,350엔.*4일권/);
 assert.match(pass.details.join(' '),/기타센주↔도부닛코.*주젠지온센 버스.*스페이시아 X.*별도.*北千住.*1\/15/);
 assert.equal(pass.url,'https://www.tobu-maas.jp/traffic-tickets/1562/details');
 assert.equal(by['nikko-pass-all-area'],undefined);
 assert.match(by.ibuki.date,/18:00/);assert.doesNotMatch(by.ibuki.date,/19:00/);
 assert.equal(by.skytree.date,'1/18 · 16:00 입장 목표');assert.equal(by.skytree.day,11);assert.equal(by.zutomayo,undefined);
 assert(!rows.some(r=>/hakone|ishikawa|osaka|fukuoka|yamazaki/.test(r.key)));
 assert.equal(by['hotel-dome'],undefined);assert.equal(by['flight-tw251-20270108'].leg,2);
 assert.equal(by['flight-mm809-20270120'].day,12);
 assert.equal(by['flight-mm809-20270120'].leg,9);
 assert(!by['flight-tokyo']);assert(!by['flight-7c1129-20270108']);assert(!by['airport-bus-out']);assert(!by['flight-return-tokyo']);
});
test('booking dates and visit time derive from the plan without editing checklist literals',()=>{
 const c=context();c.days[4].date='01/13';c.days[7].date='01/16';c.days[8].variants[0].stops.find(s=>s.planKey==='ibuki').time='18:30-20:30';
 const r=P.build(c,legacy);assert.match(r.find(x=>x.key==='fuji-excursion').date,/1\/13/);assert.match(r.find(x=>x.key==='fuji-excursion').milestones[0][0],/^2026-12-13/);assert.match(r.find(x=>x.key==='ibuki').date,/18:30/);
 assert.equal(r.find(x=>x.key==='nikko-express').milestones[0][0],'2026-12-16T09:00:00+09:00');
 const pass=r.find(x=>x.key==='nikko-maas-chuzenji-kegon');
 assert.match(pass.date,/^1\/16/);assert.match(pass.details[1],/1\/16/);
 assert(!r.find(x=>x.key==='fuji-excursion').orderSelection);assert(!r.find(x=>x.key==='nikko-express').orderSelection);
});
test('a removed destination removes its booking instead of keeping an unrelated day link',()=>{
 const c=context();for(const d of c.days)for(const v of d.variants)v.stops=v.stops.filter(s=>s.planKey!=='fujiStation');
 assert(!P.build(c,legacy).some(x=>x.key==='fuji-excursion'));
});
test('arrival train and local buses are listed as on-site purchases for the active itinerary',()=>{
 const rows=P.onSite(context());
 assert.match(rows.find(x=>x.name.includes('스카이라이너')).note,/지정석.*제2터미널 지하 1층/);
 assert.equal(rows.find(x=>x.name.includes('레드라인')).date,'1/12');
 assert.equal(rows.find(x=>x.name.includes('주젠지온센')).date,'1/15');
 assert.match(rows.find(x=>x.name.includes('무기토로')).note,/현장 선착순/);
 assert.deepEqual(P.onSite({days:[]}),[]);
});
