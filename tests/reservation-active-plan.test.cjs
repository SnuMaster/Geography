'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../japan-2027/reservation-plan'),bundle=require('../japan-2027/trip-update.json');
const legacy=[{key:'ibuki',group:'food',name:'긴자 이부키',details:[]},{key:'flight-tokyo',day:1},{key:'hotel-tokyo',day:1},{key:'zutomayo',details:[]},{key:'skytree',group:'visit',details:[]}];
const context=()=>({days:structuredClone(bundle.data.days),metadata:bundle.data.metadata});
test('booking checklist follows the actual itinerary dates and removes retired trips',()=>{
 const rows=P.build(context(),legacy),by=Object.fromEntries(rows.map(r=>[r.key,r]));
 const insurance=by['travel-insurance'],sim=by['japan-travel-sim'],skyliner=by['narita-skyliner-outbound'];
 assert.equal(insurance.group,'prep');assert.equal(insurance.date,'출국 전 · 1/8~1/20');
 assert.equal(sim.group,'prep');assert.match(sim.details.join(' '),/eSIM.*유심.*나리타 공항/);
 assert.equal(skyliner.day,1);assert.equal(skyliner.leg,3);assert.equal(skyliner.group,'rail');
 assert.match(skyliner.note,/지정석.*제2터미널 지하 1층/);assert.match(skyliner.date,/나리타 T2 → 게이세이우에노/);
 assert.match(skyliner.details.at(-1),/40호 .*15:02 → 게이세이우에노 15:43/);
 assert.match(skyliner.source,/skyliner_timetable/);
 const bus=by['airport-bus-back-0650'];
 assert.equal(bus.date,'1/20 06:50 → 10:56');
 assert.match(bus.details.join(' '),/10B-3.*직통 07:20편 또는 08:00편/);
 assert.match(bus.details.at(-1),/경북고속.*06:50 공개 배차/);
 assert.equal(by['fuji-excursion'].day,5);assert.match(by['fuji-excursion'].date,/1\/12/);assert.match(by['fuji-excursion'].milestones[0][0],/^2026-12-12T10:00/);
 assert.equal(by['fuji-excursion'].group,'rail');assert.match(by['fuji-excursion'].details.join(' '),/15호.*10:30.*12:24.*48호.*17:41.*19:48/);
 assert.equal(by['fuji-excursion'].kind,'공식 판매 대기 중');assert.match(by['fuji-excursion'].note,/78,032원/);
 assert.equal(by['nikko-express'].day,8);assert.match(by['nikko-express'].date,/1\/15/);assert.match(by['nikko-express'].details.join(' '),/5호.*10:12.*11:49.*콕핏 라운지.*12호.*17:44.*19:21.*프리미엄/);
 assert.equal(by['nikko-express'].kind,'공식 판매 대기 중');assert.match(by['nikko-express'].note,/47,100원/);
 assert.equal(by['nikko-express'].group,'rail');assert.equal(by['nikko-express'].milestones[0][0],'2026-12-15T09:00:00+09:00');
 const pass=by['nikko-maas-chuzenji-kegon'];
 assert.equal(pass.day,by['nikko-express'].day);assert.equal(pass.stop,by['nikko-express'].stop);
 assert.equal(pass.kind,'추가 구매');assert.match(pass.note,/기타센주.*4,350엔.*4일권/);
 assert.match(pass.details.join(' '),/기타센주↔도부닛코.*주젠지온센 버스.*스페이시아 X.*별도.*北千住.*1\/15/);
 assert.equal(pass.url,'https://www.tobu-maas.jp/traffic-tickets/1562/details');
 assert.equal(by['nikko-pass-all-area'],undefined);
 assert.equal(by.ibuki,undefined);
 const confirmed={luvfish:['1/11 · 12:45','핫페퍼'],ikinoya:['1/14 · 13:00','TableCheck'],fugetsu:['1/14 · 18:00','타베로그'],ginzakashiwa:['1/16 · 12:30','이큐'],sushiden:['1/16 · 18:00','이큐'],'bebuya-shibuya':['1/17 · 18:45','타베로그',3],okkon:['1/18 · 18:30','이큐']};
 for(const [key,[start,provider,partySize=1]] of Object.entries(confirmed)){
  assert.equal(by[key].date,`${start} · ${partySize}인 · ${provider}`);
  assert.equal(by[key].diningStatus,'confirmed');
  assert.equal(by[key].action,undefined);
  assert(by[key].cancellation?.deadline && by[key].cancellation?.fee);
 }
 const confirmations={
  fugetsu:['예약 메뉴 · 좌석만 예약','좌석 · 금연 테이블석','당일 현장 결제','최대 2시간 이용','별도 룸 요금 없음'],
  ginzakashiwa:['예약 메뉴 · 히나이 토종닭 토리마부시 + 샐러드 + 차완무시','좌석 · 카운터석'],
  sushiden:['예약 메뉴 · 디너 【上】 덴 오마카세 코스','좌석 · 카운터석'],
  okkon:['예약 메뉴 · 흑모와규 스키야키 정식 (저녁 한정)','좌석 · 테이블석']
 };
 for(const [key,details] of Object.entries(confirmations)){
  assert.deepEqual(by[key].diningDetails,details);
  assert(details.every(detail=>by[key].details.includes(detail)));
 }
 assert.equal(by.kurofunetei.date,'1/13 · 11:30 · 1인 · 핫페퍼');
 assert.equal(by.kurofunetei.diningStatus,'requested');
 assert.equal(by.kurofunetei.action,'confirm');
 assert.equal(by.matsumotoro.date,'1/11 · 18:15 · 1인 · TableCheck');
 assert.equal(by.matsumotoro.diningOpensOn,'2026-12-11');
 assert.equal(by.matsumotoro.kind,'예약 개시 대기');
 assert.match(by.matsumotoro.note,/12\/11부터/);
 assert.equal(by.goku,undefined);
 assert.deepEqual(rows.filter(x=>x.group==='food').map(x=>x.key),['luvfish','matsumotoro','kurofunetei','ikinoya','fugetsu','ginzakashiwa','sushiden','bebuya-shibuya','okkon']);
 const bebuya=by['bebuya-shibuya'];
 assert.equal(bebuya.day,10);assert.equal(bebuya.stop,'BEBU-YA 시부야점');
 assert.equal(bebuya.url,'https://tabelog.com/tokyo/A1303/A130301/13249575/');
 assert.match(bebuya.details.join(' '),/SHIBUYA 5층.*친구 포함 3인/);
 assert.equal(by.skytree,undefined);assert.equal(by.zutomayo,undefined);
 assert(!rows.some(r=>/hakone|ishikawa|osaka|fukuoka|yamazaki/.test(r.key)));
 assert.equal(by['hotel-dome'],undefined);assert.equal(by['flight-tw251-20270108'].leg,1);
 assert.equal(by['flight-mm809-20270120'].day,13);
 assert.equal(by['flight-mm809-20270120'].leg,1);
 assert.equal(bus.day,13);assert.equal(bus.leg,2);
 assert(!by['flight-tokyo']);assert(!by['flight-7c1129-20270108']);assert(!by['airport-bus-out']);assert(!by['flight-return-tokyo']);
});
test('booking dates and visit time derive from the plan without editing checklist literals',()=>{
 const c=context();c.metadata={...c.metadata,returnDate:'2027-01-21'};c.days[4].date='01/13';c.days[7].date='01/16';c.days[8].variants[0].stops.find(s=>s.planKey==='sushiden').time='18:30-20:30';
 c.days[9].variants[0].stops.find(s=>s.planKey==='bebuya').time='19:00~20:30';
 const r=P.build(c,legacy);assert.match(r.find(x=>x.key==='fuji-excursion').date,/1\/13/);assert.match(r.find(x=>x.key==='fuji-excursion').milestones[0][0],/^2026-12-13/);assert.match(r.find(x=>x.key==='sushiden').date,/18:30/);
 assert.equal(r.find(x=>x.key==='sushiden').diningStatus,undefined);
 assert.equal(r.find(x=>x.key==='sushiden').diningDetails,undefined);
 assert.equal(r.find(x=>x.key==='bebuya-shibuya').date,'1/17 · 19:00 입장 목표');
 assert.equal(r.find(x=>x.key==='travel-insurance').date,'출국 전 · 1/8~1/21');
 assert.equal(r.find(x=>x.key==='nikko-express').milestones[0][0],'2026-12-16T09:00:00+09:00');
 const pass=r.find(x=>x.key==='nikko-maas-chuzenji-kegon');
 assert.match(pass.date,/^1\/16/);assert.match(pass.details[1],/1\/16/);
 assert(!r.find(x=>x.key==='fuji-excursion').orderSelection);assert(!r.find(x=>x.key==='nikko-express').orderSelection);
});
test('a removed destination removes its booking instead of keeping an unrelated day link',()=>{
 const c=context();for(const d of c.days)for(const v of d.variants)v.stops=v.stops.filter(s=>s.planKey!=='fujiStation');
 assert(!P.build(c,legacy).some(x=>x.key==='fuji-excursion'));
});
test('the arrival IC card and local buses are listed as on-site purchases for the active itinerary',()=>{
 const rows=P.onSite(context());
 assert(!rows.some(x=>x.name.includes('로프웨이')));
 assert.match(rows.find(x=>x.name==='TOURIST PASMO').note,/제2터미널 지하 1층/);
 assert(!rows.some(x=>x.name.includes('스카이라이너')));
 assert.equal(rows.find(x=>x.name.includes('레드라인')).date,'1/12');
 assert.equal(rows.find(x=>x.name.includes('주젠지온센')).date,'1/15');
 const dining=rows.filter(x=>x.group==='food');
 assert(!dining.some(x=>/무기토로|요로이야|미즈마치/.test(x.name)));
 assert.equal(dining.find(x=>x.name.includes('왕푸징')).date,'1/18');
 assert.equal(dining.find(x=>x.name.includes('락칸')).date,'1/10');
 assert(dining.some(x=>x.name.includes('츠밋코')));
 assert(!dining.some(x=>/무테키야|가야시마|포니피리카|호토 후도/.test(x.name)));
 assert.deepEqual(P.onSite({days:[]}),[]);
});
