'use strict';
(function(){
 const STORE='routebook-reservations-v1',h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const definitions={
  yamazaki:{name:'야마자키 · 2027년1월',states:['미신청','신청','당첨','낙선','예약완료','예약 불가'],day:14,variant:'no-yamazaki',alt:'예약 없으면 우지 대체안',source:'https://www.suntory.co.jp/factory/yamazaki/news/detail/post_4.html',facts:[
   '공식 발표2026-10-20 · 유료 제조 투어 추첨11/10 10:00~11/14 16:29 JST',
   '결과11/19 · 본예약11/19~23 / 재추첨11/27 · 재예약11/27~12/1',
   '본예약 다음날23:59까지 카드 결제. 결제 후 환불 없음. 신청 대표자 본인·사진 신분증 필요.',
   '무료 위스키관11/24 10:00 선착 예약. 제조 투어와 별개.',
   '해외 방문객은 공식 영어 안내·신청 경로 확인. 실제 해외 전화·주소 입력 조건은 개시 시점 재확인.',
   '방문 회차·잔여석·프로그램은 공식 예약 화면에서 확인. 저장한 확정 시각은 사용자 확인값.'
  ],links:[['공식 영어 예약 안내','https://www.suntory.com/factory/yamazaki/news/detail/how_to_make_a_reservation.html']]},
  zutomayo:{name:'ZUTOMAYO · 1/18 이치카와',states:['미신청','신청','당첨','낙선','일반 판매 대기','티켓 확보'],day:11,variant:'no-concert',alt:'티켓 없으면 공연 없는 대체안',source:'https://zutomayo.net/apicula/',facts:[
   '공식1/18 市川市文化会館 大ホール · OPEN17:30 / START18:30. 종료 시각 미공개.',
   '지정석9,900엔 · 해외 접수 수수료950엔 별도 / 선택 업그레이드+1,500엔',
   'PREMIUM 최속10/16 21:00~10/29 23:59 · 결과·입금11/7 18:00~11/10 23:59',
   'PREMIUM2차11/7 20:00~11/9 23:59 · 결과·입금11/17 18:00~11/20 23:59',
   '일반 최속 선행11/17 20:00~11/29 23:59 · 결과·입금12/5 18:00~12/8 23:59',
   '업그레이드12/1 20:00~12/6 23:59 · 결과·입금12/12 18:00~12/15 23:59. PREMIUM 선행 구매 회원 대상.',
   '일반 판매일은 미발표. 일반 최속 선행과 구분. 일본 국내 계약 전화번호가 없으면 공식 Apply (Outside Japan).',
   '등록 신청자 본인 방문·신분증 조건 확인. 해외 접수는 공식 리세일 이용 불가. 세부 후속 접수 조건은 개시 시점 확인.'
  ],links:[['공식 해외 PREMIUM 접수','https://zutomayo.net/apicula-denki_apply_pre_en/']]}
 };
 // Booking needs from the itinerary. A selected quote is never proof of a booking.
 const checklistItems=[
  {key:'zutomayo',group:'priority',kind:'필수',name:'ZUTOMAYO 이치카와 공연',day:11,variant:'main',date:'1/18 · 18:30 공연',stopKey:'zutomayo',note:'해외 접수 경로 확인 → 신청 → 당첨 후 입금',url:'https://zutomayo.net/apicula/',details:['PREMIUM 선행은 회원 대상. 일본 국내 계약 전화번호가 없으면 Apply (Outside Japan) 경로를 확인하세요.','입장 17:30 · 공연 18:30. 티켓을 확보한 뒤 완료로 체크하세요.'],milestones:[['2026-10-29T23:59:00+09:00','10/29 23:59 · PREMIUM 최속 신청 마감'],['2026-11-07T18:00:00+09:00','11/7 18:00 · 최속 결과·입금 시작'],['2026-11-09T23:59:00+09:00','11/9 23:59 · PREMIUM 2차 신청 마감'],['2026-11-10T23:59:00+09:00','11/10 23:59 · 최속 입금 마감'],['2026-11-17T20:00:00+09:00','11/17 20:00 · 일반 최속 선행 시작'],['2026-11-20T23:59:00+09:00','11/20 23:59 · PREMIUM 2차 입금 마감'],['2026-11-29T23:59:00+09:00','11/29 23:59 · 일반 최속 선행 마감'],['2026-12-08T23:59:00+09:00','12/8 23:59 · 일반 최속 입금 마감']]},
  {key:'yamazaki',group:'priority',kind:'필수',name:'야마자키 증류소',day:14,variant:'main',date:'1/21 · 목표 회차 10:00',stopKey:'yamazaki',note:'유료 투어 추첨 또는 무료 위스키관 예약',url:'https://www.suntory.co.jp/factory/yamazaki/news/detail/post_4.html',details:['유료 제조 투어: 11/10 10:00~11/14 16:29 추첨 신청. 결과 11/19, 본예약 11/23까지.','유료 투어는 본예약 다음 날 23:59까지 결제. 무료 위스키관은 11/24 10:00 선착순으로 별도 예약합니다.','무료 위스키관과 제조 투어를 중복 필수 예약으로 계산하지 않아요. 선택한 프로그램을 확보하면 체크하세요.'],milestones:[['2026-11-10T10:00:00+09:00','11/10 10:00 · 유료 투어 추첨 시작'],['2026-11-14T16:29:00+09:00','11/14 16:29 · 유료 투어 추첨 마감'],['2026-11-19T23:59:00+09:00','11/19 · 추첨 결과 확인'],['2026-11-23T23:59:00+09:00','11/23 · 본예약 기간 종료'],['2026-11-24T10:00:00+09:00','11/24 10:00 · 무료 위스키관 예약 시작'],['2026-11-27T23:59:00+09:00','11/27 · 재추첨 결과 확인'],['2026-12-01T23:59:00+09:00','12/1 · 재추첨 본예약 기간 종료']]},
  {key:'flight-tokyo',group:'travel',kind:'필수',name:'대구 → 나리타 항공권',day:1,leg:2,date:'1/8 · TW251',note:'날짜·편명·수하물·결제 완료 확인',url:'https://www.trinityairways.com/',details:['일정의 선택편은 TW251입니다. 기존 견적만으로 예약 완료로 처리하지 않아요.','예약한 항공사나 여행사에서 여권 영문명과 전자항공권을 확인하세요.']},
  {key:'hotel-tokyo',group:'travel',kind:'필수',name:'도쿄 숙소 · STAY&GO 이리야키타',day:1,stop:'STAY&GO 이리야키타',date:'1/8 체크인 → 1/19 체크아웃 · 11박',note:'숙박 날짜와 체크인 방법 확인',details:['숙소를 예약한 사이트에서 숙박 기간·결제·취소 조건을 확인하세요.','1/8 공항 도착 후 체크인 가능한 시각과 지연 시 연락 방법을 확인하세요.']},
  {key:'fuji-seats',group:'travel',kind:'필수',name:'후지회유 왕복 지정석',day:8,variant:'main',leg:2,date:'1/15 · 신주쿠 ↔ 가와구치코',note:'가는 편과 돌아오는 편 모두 확보',url:'https://www.eki-net.com/en/jreast-train-reservation/Top/Index',source:'https://www.jreast.co.jp/kippu/02.html',details:['JR 지정석 일반 발매 원칙인 승차 한 달 전 10:00을 적용하면 12/15 10:00입니다. 실제 운행편과 판매 화면을 확인하세요.','왕복 모두 날짜·열차·좌석을 확인한 뒤 체크하세요.'],milestones:[['2026-12-15T10:00:00+09:00','12/15 10:00 · 일반 지정석 발매 기준']]},
  {key:'flight-osaka',group:'travel',kind:'필수',name:'하네다 → 이타미 항공권',day:12,leg:6,date:'1/19 · JAL',note:'이타미 도착편·수하물·결제 확인',url:'https://www.jal.co.jp/en-jp/book-dom.html',details:['일정은 하네다 제1터미널 → 이타미 기준입니다. 간사이공항 도착편과 구분하세요.','실제 발권편의 편명·출발 시각을 예약 화면에서 확인하세요.']},
  {key:'hotel-osaka',group:'travel',kind:'필수',name:'오사카 숙소 · 호텔 주오 오아시스',day:12,stop:'호텔 주오 오아시스',date:'1/19 체크인 → 1/25 체크아웃 · 6박',note:'6박 객실과 결제·취소 조건 확인',url:'https://chuohotels.jp/oasis/en/reserve/',details:['공식 예약 화면 또는 이용하는 예약 사이트에서 날짜와 객실을 확인하세요.']},
  {key:'flight-fukuoka',group:'travel',kind:'필수',name:'이타미 → 후쿠오카 항공권',day:18,leg:3,date:'1/25 · ANA NH1189',note:'날짜·편명·수하물·결제 확인',url:'https://www.ana.co.jp/en/jp/',details:['일정의 선택편은 NH1189입니다. 공항은 이타미 출발 기준입니다.','예약한 항공사나 여행사에서 실제 운항 시각과 전자항공권을 확인하세요.']},
  {key:'hotel-fukuoka',group:'travel',kind:'필수',name:'후쿠오카 숙소 · 호텔 훌라톤',day:18,stop:'호텔 훌라톤',date:'1/25 체크인 → 1/28 체크아웃 · 3박',note:'3박 객실과 체크인 전 짐 보관 확인',url:'https://hulaton.com/',details:['공식 예약 화면 또는 이용하는 예약 사이트에서 숙박 기간을 확인하세요.','1/25 일찍 도착하면 체크인 전 짐 보관이 가능한지도 확인하세요.']},
  {key:'ferry-busan',group:'travel',kind:'필수',name:'뉴 카멜리아 · 하카타 → 부산',day:21,leg:5,date:'1/28 · 편도 승선권',note:'1/28 실제 운항·선실·결제 확인',url:'https://www.camellia-line.co.jp/rs/',source:'https://www.camellia-line.co.jp/boarding/',details:['공식 예약은 6개월 전 같은 날부터 접수하는 안내입니다. 실제 1/28 운항과 잔여 선실은 예약 화면에서 확인하세요.','승선자 영문명·여권 정보와 터미널 수속 시각을 확인하세요. 이 체크리스트에는 여권번호를 입력하지 않아도 됩니다.']},
  {key:'hotel-busan',group:'travel',kind:'필수',name:'부산역 주변 숙소 정하기',day:21,stop:'부산역 주변 숙소',date:'1/28 체크인 → 1/29 체크아웃 · 1박',note:'아직 미정인 숙소 선택·예약',details:['현재 지도에는 특정 숙소 대신 부산역 주변 구역만 표시돼 있어요.','입국심사 지연을 고려해 체크인 마감과 늦은 도착 연락 방법을 확인하세요.']},
  {key:'ktx-return',group:'travel',kind:'필수',name:'부산 → 서대구 KTX',day:22,leg:6,date:'1/29 · 서대구 정차편',note:'예매 오픈 후 서대구 정차·좌석 확인',url:'https://www.korail.com/ticket/search/general',details:['일정의 330편·시각은 현재표 참고입니다. 2027/1/29 운행과 서대구 정차를 확인해 예매하세요.','좌석을 확보한 뒤 체크하세요. 다른 도착역 표와 구분하세요.']},
  {key:'wasake',group:'visit',kind:'필수',name:'와사케 아사쿠사 사케 체험',day:2,stop:'와사케 아사쿠사',date:'1/9 · 20:00 목표',note:'1인·영어 진행·실제 열린 회차 예약',url:'https://lp.wasake.jp/',details:['공식 사이트의 예약 캘린더에서 날짜와 프로그램을 선택하세요.','20:00은 일정 목표이며, 실제 예약 가능한 회차와 소요시간을 확인하세요.']},
  {key:'teien',group:'visit',kind:'필수',name:'도쿄도 정원미술관',day:10,stop:'도쿄도 정원미술관',date:'1/17 · 10:00 목표',note:'리투아니아 전시 날짜·입장 회차 예약',url:'https://www.teien-art-museum.ne.jp/visit/ticket/',source:'https://www.teien-art-museum.ne.jp/exhibition/270116-0328_lithuania/',details:['해당 전시는 일시 지정 예약제입니다. 무료 입장 대상자는 별도 조건을 확인하세요.','1/17 실제 판매 회차를 확인해 입장권을 구매하세요.']},
  {key:'skytree',group:'visit',kind:'추천',name:'도쿄 스카이트리 입장권',day:2,stop:'도쿄 스카이트리',date:'1/9 · 15:30 목표',note:'노을 시간대 입장을 위해 시간 지정 예매',url:'https://www.tokyo-skytree.jp/ticket/',details:['350m 전망층과 450m 회랑을 모두 이용할지 확인해 표를 고르세요.','현장권 구매도 가능하지만, 일정 시각을 맞추려면 공식 예매권을 확인하세요. 카페 좌석 예약은 별개이며 기본 일정에 추가하지 않아요.']},
  {key:'kobe-port-tower',group:'visit',kind:'추천',name:'고베 포트타워 입장권',day:15,stop:'고베 포트타워',date:'1/22 · 16:30 목표',note:'시간 지정 입장권 미리 확보',url:'https://www.kobe-port-tower.com/ticket/',details:['전망층·옥상은 일시 지정 입장권이 필요해요. 현장권은 해당 시간대에 잔여석이 있을 때만 판매됩니다.','전망층만 볼지 옥상까지 갈지 선택하세요. 옥상은 날씨에 따라 닫힐 수 있습니다.']},
  {key:'gekkeikan',group:'visit',kind:'추천',name:'월계관 오쿠라기념관',day:13,stop:'월계관 오쿠라기념관',date:'1/20 · 10:45 회차 목표',note:'일반 관람 우선예약 자리 확인',url:'https://www.gekkeikan.co.jp/enjoy/museum/',details:['일정은 일반 관람 기준이며 제조공장 투어와 구분합니다.','공식 안내에서 2027년 1월 예약창과 실제 회차를 확인하세요.']},
  {key:'tokyo-city-view',group:'visit',kind:'추천',name:'Tokyo City View 입장권',day:10,stop:'Tokyo City View',date:'1/17 · 16:30 목표',note:'해당 날짜 운영·입장권 확인',url:'https://tcv.roppongihills.com/en/',details:['공식 Buy Tickets에서 전시·전망대 입장 범위와 날짜를 확인하세요.','일몰 시간대 계획을 유지하려면 실제 입장 가능한 시각을 확인하세요.']},
  {key:'ishikawa-tour',group:'visit',kind:'조건 확인',name:'이시카와 양조장 해설 투어 문의',day:8,variant:'brewery',stop:'후사 이시카와 양조장',date:'1/15 · 양조장 대체안',note:'평일 1인 해설 투어 가능 여부 먼저 문의',url:'https://www.tamajiman.co.jp/tour/',details:['소규모 해설 투어는 인원·요일 조건이 있어 평일 1인 참가를 확정할 수 없어요. 영어 투어는 별도 문의이며 답변에 최대 1주가 걸릴 수 있습니다.','예약 없는 자유 산책과 해설 투어는 별개입니다. 참가 확정을 받았을 때만 완료로 체크하세요.']},
  {key:'whisky-library',group:'food',kind:'추천',name:'도쿄 위스키 라이브러리',day:5,stop:'도쿄 위스키 라이브러리',date:'1/12 · 19:45 목표',note:'1인 일반석 예약',url:'https://www.tablecheck.com/en/shops/tokyo-whisky-library/reserve',source:'https://tokyo-whisky-library.com/access.html',details:['일반석을 선택하고 1인 예약 가능 여부를 확인하세요. 프라이빗룸은 별도 최소 이용금액이 있습니다.']},
  {key:'bebuya',group:'food',kind:'추천',name:'BEBU-YA 시부야점',day:6,stop:'BEBU-YA',date:'1/13 · 19:30 목표',note:'1인 이용과 선택 코스 확인·예약',url:'https://shop.bsp-j.com/detail/Be_shibuya/',details:['1인 예약이 가능한지와 음료 포함 범위·총액을 확인한 뒤 예약하세요.']},
  {key:'kayaba',group:'food',kind:'추천',name:'가야바 커피',day:9,stop:'가야바 커피',date:'1/16 · 14:00 목표',note:'공식 예약으로 자리 확보',url:'https://yoyaku.toreta.in/kayabacoffee',details:['공식 예약 접수는 전날 23:59까지라는 안내입니다. 실제 잔여석은 예약 화면에서 확인하세요.','메뉴별 좌석 이용시간과 예약 시각을 확인하세요.']},
  {key:'ibuki',group:'food',kind:'추천',name:'긴자 이부키',day:9,stop:'긴자 이부키',date:'1/16 · 19:00 목표',note:'1인 좌석·음료 포함 총액 확인 후 예약',url:'https://www.tablecheck.com/en/shops/ginza-ibuki/reserve',source:'https://ginza-ibuki.com/menu/',details:['음료와 세금·서비스료를 포함해 29,999엔 이하인 구성을 먼저 확인하세요.','1인 예약 가능한 코스와 취소 조건을 확인하세요.']},
  {key:'tsurutontan',group:'food',kind:'추천',name:'츠루톤탄 롯폰기',day:11,variant:'no-concert',stop:'츠루톤탄 롯폰기',date:'1/18 · 19:30 목표',note:'공연 없는 날에만 1인 좌석 예약',url:'https://www.tsurutontan.co.jp/shop/roppongi/',details:['ZUTOMAYO 공연을 보는 일정과 동시에 예약하지 마세요.','공식 사이트의 예약 경로에서 좌석과 메뉴 조건을 확인하세요.']},
  {key:'sanshotei',group:'food',kind:'추천',name:'산쇼테이',day:14,variant:'main',stop:'산쇼테이',date:'1/21 · 12:00 목표',note:'야마자키 예약 확정 후 1인 점심 자리 확인',url:'https://sansyotei.com/',details:['증류소 확정 회차와 점심 시간이 겹치지 않는지 확인하세요.','1인 좌석·해당 날짜 영업 여부를 공식 전화·예약 경로에서 확인하세요.']},
  {key:'hiramatsu',group:'food',kind:'추천',name:'히라마츠 하카타',day:20,stop:'히라마츠 하카타',date:'1/27 · 19:00 목표',note:'1인 좌석·와인 포함 구성 확인 후 예약',url:'https://www.tablecheck.com/ja/shops/frhiramatsu/reserve',source:'https://www.hiramatsurestaurant.jp/hiramatsu-hakata/menu/',details:['와인 3잔 포함 26,000엔 식사권의 해당 날짜 적용과 1인 이용을 먼저 확인하세요.','불가하면 음료 포함 총액 30,000엔 이내 코스로 상담하세요. 식사권 구매와 좌석 예약을 모두 확인한 뒤 체크하세요.']}
 ];
 const checklistGroups={priority:'신청 일정 먼저 확인',travel:'항공·숙소·교통',visit:'체험·입장권',food:'식당·카페'};
 let checklistConfig=null,checklistFilter='all';
 let records={},storageAvailable=true;try{records=JSON.parse(localStorage.getItem(STORE)||'{}');if(!records||typeof records!=='object'||Array.isArray(records))records={};}catch(_){}
 function getRecords(){return JSON.parse(JSON.stringify(records));}
 function html(key,{popup=false,timing={}}={}){
  const d=definitions[key];if(!d)return '';const r=records[key]||{},id='reservation-'+key+'-'+(popup?'popup':'card');
  const note=timing.applied?'사용자 확인 시작 시각 반영 · '+(Number.isFinite(timing.durationMinutes)?'종료는 기존 체류 '+timing.durationMinutes+'분 기준':'종료 시각 미확정'):r.updatedAt?'사용자 기록 · 저장 '+new Date(r.updatedAt).toLocaleDateString('ko-KR'):'미신청 · 예약·결제 미실행';
  return `<section class="reservation-info" data-reservation="${key}"><h3>${d.name}</h3><label>내 예약 상태 (사용자 기록)<select id="${id}-status" data-reservation-status="${key}">${d.states.map(s=>`<option${r.status===s?' selected':''}>${s}</option>`).join('')}</select></label><label>확정 방문·입장 시각 (일본 현지 시각)<input id="${id}-time" type="datetime-local" data-reservation-time="${key}" value="${h(r.time||'')}" aria-invalid="${!!timing.error}"></label><small>입력한 시각은 방문 카드·이동 계산에 반영됩니다. 날짜가 다르거나 예약 불가 상태면 반영을 보류합니다.</small><p data-reservation-note="${key}" role="status">${h(note)}${storageAvailable?'':' · 이 화면에만 반영됨 · 브라우저 저장 실패'}</p>${timing.applied?`<p class="reservation-plan-note">기존 계획 ${h(timing.baseTime)} · 예약 상태 ${h(timing.status)}</p>`:''}${(timing.messages||[]).map(message=>`<p class="reservation-conflict" role="status">${h(message)}</p>`).join('')}<details><summary>공식 신청 일정·조건 (모두 일본 시각)</summary><ul>${d.facts.map(f=>`<li>${h(f)}</li>`).join('')}</ul><a href="${d.source}" target="_blank" rel="noopener">공식 발표 ↗</a>${d.links.map(([label,url])=>`<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`).join('')}</details><button type="button" data-reservation-alt="${key}">${d.alt}</button></section>`;
 }
 function save(){try{localStorage.setItem(STORE,JSON.stringify(records));storageAvailable=true;}catch(_){storageAvailable=false;}}
 function isComplete(item){const r=records[item.key]||{};return definitions[item.key]?r.status===(item.key==='zutomayo'?'티켓 확보':'예약완료'):r.complete===true;}
 function checklistContext(){return checklistConfig?.context?.()||{days:[],preferences:{}};}
 function itemVariant(item,context){const day=context.days.find(d=>d.n===item.day);return item.variant||(day?JourneyState.chosen(day,context.preferences):'main');}
 function checklistModel(){
  const context=checklistContext(),active=[],alternatives=[];
  for(const item of checklistItems){const day=context.days.find(d=>d.n===item.day);if(!day)continue;
   (item.variant&&item.variant!==JourneyState.chosen(day,context.preferences)?alternatives:active).push(item);
  }
  active.sort((a,b)=>a.day-b.day);alternatives.sort((a,b)=>a.day-b.day);
  return {context,active,alternatives,done:active.filter(isComplete).length};
 }
 function itemTiming(item,context){const day=context.days.find(d=>d.n===item.day),variant=day?.variants.find(v=>v.id===itemVariant(item,context));return variant?.stops.find(s=>s.reservationKey===item.key)?.reservationTiming||{};}
 function milestone(item){return item.milestones?.find(([at])=>Date.parse(at)>=Date.now())?.[1]||'';}
 function linkedFields(item,context){
  const def=definitions[item.key];if(!def)return '';
  const r=records[item.key]||{},timing=itemTiming(item,context);
  return `<div class="booking-linked-fields"><label>진행 상태<select id="booking-status-${item.key}" data-reservation-status="${item.key}">${def.states.map(state=>`<option${r.status===state?' selected':''}>${h(state)}</option>`).join('')}</select></label><label>확정 방문·입장 시각<input id="booking-time-${item.key}" type="datetime-local" data-reservation-time="${item.key}" value="${h(r.time||'')}" aria-invalid="${!!timing.error}"></label><small>확정 시각은 방문 일정과 이동 계산에도 반영돼요.</small>${(timing.messages||[]).map(message=>`<p class="booking-message" role="status">${h(message)}</p>`).join('')}</div>`;
 }
 function checklistRow(item,context,alternative=false){
  const done=isComplete(item),r=records[item.key]||{},timing=definitions[item.key]?itemTiming(item,context):{},date=timing.applied&&typeof r.time==='string'?item.date.split(' · ')[0]+' · '+r.time.slice(11)+' 사용자 입력':item.date,next=!done?milestone(item):'';
  return `<li class="booking-item${done?' is-complete':''}" data-booking-item="${item.key}"><div class="booking-row"><label class="booking-check"><input id="booking-complete-${item.key}" type="checkbox" data-booking-complete="${item.key}" aria-label="${h(item.name)} 예약 완료" ${done?'checked':''}></label><div class="booking-content"><div class="booking-date">${h(date)} <span class="booking-kind">${alternative?'대체안 · ':''}${h(item.kind)}</span></div><label class="booking-item-title" for="booking-complete-${item.key}">${h(item.name)}</label><p>${h(timing.error?'입력한 예약 시각을 확인해 주세요':done?'예약 확인 완료':item.note)}</p>${next?`<p class="booking-next-date">${h(next)}</p>`:''}<details data-booking-details="${item.key}"><summary>예약 링크·상세${definitions[item.key]?' · '+h(r.status||'미신청'):''}</summary><div class="booking-details">${linkedFields(item,context)}<ul>${item.details.map(text=>`<li>${h(text)}</li>`).join('')}</ul>${definitions[item.key]?`<details class="booking-official-dates"><summary>공식 신청 일정 전체</summary><ul>${definitions[item.key].facts.map(text=>`<li>${h(text)}</li>`).join('')}</ul></details>`:''}<div class="booking-links">${item.url?`<a href="${h(item.url)}" target="_blank" rel="noopener noreferrer">예약·공식 안내 ↗</a>`:''}<button type="button" data-booking-jump="${item.key}">${alternative?'대체안 선택·보기':'일정에서 보기'}</button>${item.source?`<a class="booking-source" href="${h(item.source)}" target="_blank" rel="noopener noreferrer">예약 조건 ↗</a>`:''}</div><label class="booking-memo-label">메모<input id="booking-memo-${item.key}" type="text" maxlength="300" data-booking-memo="${item.key}" value="${h(r.memo||'')}" placeholder="예약 확인·남은 할 일"></label></div></details></div></div></li>`;
 }
 function renderChecklist(){
  const dialog=document.getElementById('bookingChecklistDialog'),list=document.getElementById('bookingChecklistList');if(!list||!checklistConfig)return;
  const model=checklistModel(),focusId=dialog.contains(document.activeElement)?document.activeElement.id:null,scroll=dialog.querySelector('.booking-dialog-body').scrollTop;
  const openKeys=[...list.querySelectorAll('[data-booking-details][open]')].map(el=>el.dataset.bookingDetails),alternativeOpen=!!list.querySelector('.booking-alternatives[open]');
  const visible=item=>checklistFilter==='all'||(checklistFilter==='done')===isComplete(item),active=model.active.filter(visible),alternatives=model.alternatives.filter(visible);
  document.getElementById('bookingChecklistCount').textContent=`${model.done} / ${model.active.length} 완료`;
  const progress=document.getElementById('bookingChecklistProgress');progress.max=Math.max(model.active.length,1);progress.value=model.done;
  document.getElementById('bookingStorageNote').textContent=storageAvailable?'이 브라우저에 자동 저장 · 실제 예약은 공식 링크에서':'현재 화면에만 반영됨 · 브라우저 저장 실패';
  dialog.querySelectorAll('[data-booking-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.bookingFilter===checklistFilter)));
  list.innerHTML=Object.entries(checklistGroups).map(([key,title])=>{const items=active.filter(item=>item.group===key);return items.length?`<section class="booking-group"><h3>${title}</h3><ul class="booking-list">${items.map(item=>checklistRow(item,model.context)).join('')}</ul></section>`:'';}).join('')+(active.length?'':'<p class="booking-empty">이 조건에 맞는 예약이 없어요.</p>')+(alternatives.length?`<details class="booking-alternatives"${alternativeOpen?' open':''}><summary>대체 일정의 예약 ${alternatives.length}개</summary><p>현재 선택한 일정의 완료 수에는 포함하지 않아요.</p><ul class="booking-list">${alternatives.map(item=>checklistRow(item,model.context,true)).join('')}</ul></details>`:'');
  for(const key of openKeys){const el=[...list.querySelectorAll('[data-booking-details]')].find(el=>el.dataset.bookingDetails===key);if(el)el.open=true;}
  dialog.querySelector('.booking-dialog-body').scrollTop=scroll;
  if(focusId){const target=document.getElementById(focusId)||dialog.querySelector('[data-booking-filter][aria-pressed=true]');target?.focus({preventScroll:true});}
 }
 function closeChecklist(){const dialog=document.getElementById('bookingChecklistDialog');if(dialog?.open){dialog.close();RouteUI.release(dialog);}}
 function initChecklist(config){
  checklistConfig=config;const dialog=document.getElementById('bookingChecklistDialog'),button=document.getElementById('bookingChecklistBtn');if(!dialog||!button)return;
  button.addEventListener('click',()=>{renderChecklist();RouteUI.showDialog(dialog);});
  document.getElementById('closeBookingChecklist').addEventListener('click',closeChecklist);
  dialog.addEventListener('click',event=>{
   const filter=event.target.closest('[data-booking-filter]');if(filter){checklistFilter=filter.dataset.bookingFilter;renderChecklist();dialog.scrollTop=0;dialog.querySelector('.booking-dialog-body').scrollTop=0;return;}
   const jump=event.target.closest('[data-booking-jump]'),item=checklistItems.find(item=>item.key===jump?.dataset.bookingJump);if(!item)return;
   const context=checklistContext();closeChecklist();window.dispatchEvent(new CustomEvent('routebook:booking-jump',{detail:{day:item.day,variant:itemVariant(item,context),leg:item.leg,stop:item.stop,stopKey:item.stopKey}}));
  });
  window.addEventListener('routebook:reservation-change',()=>{if(dialog.open)queueMicrotask(renderChecklist);});
 }
 document.addEventListener('input',event=>{
  const key=event.target.dataset.bookingMemo;if(!checklistItems.some(item=>item.key===key))return;
  const r=records[key]??={};r.memo=event.target.value.slice(0,300);r.updatedAt=Date.now();save();
  const note=document.getElementById('bookingStorageNote');if(note)note.textContent=storageAvailable?'이 브라우저에 자동 저장 · 실제 예약은 공식 링크에서':'현재 화면에만 반영됨 · 브라우저 저장 실패';
 });
 document.addEventListener('change',event=>{
  const item=checklistItems.find(item=>item.key===event.target.dataset.bookingComplete);
  if(item){const r=records[item.key]??={},checked=event.target.checked;
   if(definitions[item.key]){const done=item.key==='zutomayo'?'티켓 확보':'예약완료';if(checked){if(r.status!==done)r.checklistPreviousStatus=r.status||'미신청';r.status=done;}else r.status=definitions[item.key].states.includes(r.checklistPreviousStatus)&&r.checklistPreviousStatus!==done?r.checklistPreviousStatus:'미신청';}
   else r.complete=checked;
   r.updatedAt=Date.now();save();
   if(definitions[item.key])window.dispatchEvent(new CustomEvent('routebook:reservation-change',{detail:{key:item.key,field:'status'}}));else renderChecklist();return;
  }
  const key=event.target.dataset.reservationStatus||event.target.dataset.reservationTime;if(!definitions[key])return;
  const field=event.target.hasAttribute('data-reservation-status')?'status':'time',r=records[key]??={status:'미신청',time:''};r[field]=event.target.value;r.updatedAt=Date.now();
  save();
  window.dispatchEvent(new CustomEvent('routebook:reservation-change',{detail:{key,field}}));
 });
 document.addEventListener('click',event=>{const b=event.target.closest('[data-reservation-alt]'),d=definitions[b?.dataset.reservationAlt];if(d)window.dispatchEvent(new CustomEvent('routebook:reservation-alt',{detail:{day:d.day,variant:d.variant}}));});
 function confirmTime(key,value){if(!definitions[key]||!ReservationCore.parseTime(value))return false;const r=records[key]??={status:'미신청',time:''};r.time=value;r.updatedAt=Date.now();save();window.dispatchEvent(new CustomEvent('routebook:reservation-change',{detail:{key,field:'time'}}));return storageAvailable;}
 window.ReservationUI={html,getRecords,getAssistantBookings:()=>checklistModel().active.map(item=>({key:item.key,day:item.day,name:item.name,status:records[item.key]?.status||(isComplete(item)?'사용자 예약 확인':'미확인'),time:records[item.key]?.time||null,confirmed:isComplete(item)})),initChecklist,closeChecklist,renderChecklist,confirmTime,definitions:Object.freeze(Object.fromEntries(Object.entries(definitions).map(([key,d])=>[key,{day:d.day}]))),checklistSummary:()=>{const m=checklistModel();return {total:m.active.length,done:m.done,alternatives:m.alternatives.length};}};
})();
