'use strict';
// Derive booking dates from the active itinerary instead of maintaining a
// second independent calendar. User completion records keep their stable keys.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationPlan=api;})(globalThis,function(){
 function build(context,legacy){
  const days=context.days||[],find=key=>{for(const day of days)for(const variant of day.variants||[])for(const stop of variant.stops||[])if(stop.planKey===key)return {day,variant,stop};return null;};
  const copy=key=>{const r=legacy.find(i=>i.key===key);return r?structuredClone(r):null;};
  const date=d=>d.date.split('/').map(Number).join('/'),items=[],push=x=>{if(x)items.push(x);};
  const anchor=(item,key)=>{if(!item)return null;const p=find(key);return p?{...item,day:p.day.n,variant:p.variant.id,stop:p.stop.name,date:date(p.day)+' · '+p.stop.time,stopKey:undefined}:null;};
  push(copy('flight-tokyo'));push(copy('hotel-tokyo'));
  const ibuki=anchor(copy('ibuki'),'ibuki');if(ibuki){ibuki.date=date(days.find(d=>d.n===ibuki.day))+' · '+find('ibuki').stop.time+' 목표';ibuki.details=['1인 좌석·코스·음료와 세금·서비스료·취소 조건을 공식 예약 화면에서 확인하세요.','일정 시각은 목표이며 예약 완료를 뜻하지 않습니다.'];push(ibuki);}
  const firstDome=find('domeBags')||find('dome'),checkout=find('domeCheckout');
  if(firstDome&&checkout)push({key:'hotel-dome',group:'travel',kind:'필수',name:'도쿄 돔 호텔 · 3박',day:firstDome.day.n,variant:firstDome.variant.id,stop:firstDome.stop.name,date:date(firstDome.day)+' 체크인 → '+date(checkout.day)+' 체크아웃',note:'예약·결제 상태·오전 짐 보관 확인',url:'https://www.tokyodome-hotels.co.jp/',details:['예약 상품의 체크인·체크아웃 시각을 확인하세요.','체크인 전·체크아웃 후 짐 보관을 확인하세요. 예약 완료로 자동 처리하지 않습니다.']});
  const last=days.find(d=>d.pendingReturn);if(last)push({key:'flight-return-tokyo',group:'travel',kind:'필수',name:date(last)+' 저녁 한국 귀국 항공권 · 미정',day:last.n,date:date(last)+' 저녁 예정 · 편명·공항 미정',note:'출발 공항·편명·시각·수하물 확정 필요',details:['하네다·나리타 중 실제 예약한 공항과 터미널을 확인하세요.','현재 비행편·출발·도착 시각은 미정입니다. 예약 완료로 자동 처리하지 않습니다.']});
  const fuji=find('fujiStation');if(fuji){
   const travel='2027-'+fuji.day.date.replace('/','-'),open=new Date(travel+'T10:00:00+09:00');open.setUTCMonth(open.getUTCMonth()-1);const opening=new Date(open.getTime()+9*3600000).toISOString().slice(0,16);
   push({key:'fuji-excursion',group:'travel',kind:'추천',name:'후지회유 왕복 지정석',day:fuji.day.n,variant:fuji.variant.id,stop:fuji.stop.name,date:date(fuji.day)+' · 신주쿠 ↔ 가와구치코',note:'가는 편·돌아오는 편 지정석 모두 확인',url:'https://www.eki-net.com/en/jreast-train-reservation/Top/Index',source:'https://www.jreast.co.jp/kippu/02.html',details:['일반 지정석 발매 원칙은 승차 한 달 전 10:00 JST입니다. 이번 일정 기준 '+opening.slice(5,10).replace('-','/')+' 10:00이며, 실제 열차 운행과 판매 화면을 확인하세요.','왕복 날짜·좌석·기상에 따른 변경·환불 조건을 확인하세요.'],milestones:[[opening+':00+09:00',opening.slice(5,10).replace('-','/')+' 10:00 · 일반 지정석 발매 기준']]});
  }
  const twelveDay=days.length===12;
  push(anchor({key:'nikko-express',group:'travel',kind:'추천',name:'닛코 특급 왕복 지정석',note:twelveDay?'스페이시아 X 3호·12호 지정석 확인':'리버티·스페이시아 X의 실제 운행·좌석 확인',url:'https://www.tobu.co.jp/railway/special_express/',details:twelveDay?['가는 편 09:13 기타센주 → 10:50 도부닛코 · 스페이시아 X 3호.','귀환편 17:44 도부닛코 → 19:21 기타센주 · 스페이시아 X 12호.','둘 다 직통 예약 후보. 실제 여행일의 운행·좌석과 특급권을 조회하세요.']:['가는 편 계획: 기타센주 → 도부닛코 리버티 게곤.','돌아오는 편 계획: 도부닛코 → 시모이마이치 일반열차, 시모이마이치 → 기타센주 스페이시아 X 스탠더드.','왕복 승차권·특급권과 실제 여행일 운행·환승 시각을 각각 확인하세요.']},'nikkoStation'));
  if(find('free')){const show=copy('zutomayo');if(show){const free=find('free');push({...show,day:free.day.n,variant:'concert',kind:'선택',date:date(free.day)+' · 공연 가능일',note:'티켓·공연 확정 시에만 일정 추가',stopKey:undefined,details:[...show.details,'현재 일정은 자유시간이며 공연장 이동·관람을 확정하지 않았습니다.']});}}
  return items;
 }
 return {build};
});
