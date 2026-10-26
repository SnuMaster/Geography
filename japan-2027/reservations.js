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
 let records={},storageAvailable=true;try{records=JSON.parse(localStorage.getItem(STORE)||'{}');if(!records||typeof records!=='object'||Array.isArray(records))records={};}catch(_){}
 function getRecords(){return JSON.parse(JSON.stringify(records));}
 function html(key,{popup=false,timing={}}={}){
  const d=definitions[key];if(!d)return '';const r=records[key]||{},id='reservation-'+key+'-'+(popup?'popup':'card');
  const note=timing.applied?'사용자 확인 시작 시각 반영 · '+(Number.isFinite(timing.durationMinutes)?'종료는 기존 체류 '+timing.durationMinutes+'분 기준':'종료 시각 미확정'):r.updatedAt?'사용자 기록 · 저장 '+new Date(r.updatedAt).toLocaleDateString('ko-KR'):'미신청 · 예약·결제 미실행';
  return `<section class="reservation-info" data-reservation="${key}"><h3>${d.name}</h3><label>내 예약 상태 (사용자 기록)<select id="${id}-status" data-reservation-status="${key}">${d.states.map(s=>`<option${r.status===s?' selected':''}>${s}</option>`).join('')}</select></label><label>확정 방문·입장 시각 (일본 현지 시각)<input id="${id}-time" type="datetime-local" data-reservation-time="${key}" value="${h(r.time||'')}" aria-invalid="${!!timing.error}"></label><small>입력한 시각은 방문 카드·이동 계산에 반영됩니다. 날짜가 다르거나 예약 불가 상태면 반영을 보류합니다.</small><p data-reservation-note="${key}" role="status">${h(note)}${storageAvailable?'':' · 이 화면에만 반영됨 · 브라우저 저장 실패'}</p>${timing.applied?`<p class="reservation-plan-note">기존 계획 ${h(timing.baseTime)} · 예약 상태 ${h(timing.status)}</p>`:''}${(timing.messages||[]).map(message=>`<p class="reservation-conflict" role="status">${h(message)}</p>`).join('')}<details><summary>공식 신청 일정·조건 (모두 일본 시각)</summary><ul>${d.facts.map(f=>`<li>${h(f)}</li>`).join('')}</ul><a href="${d.source}" target="_blank" rel="noopener">공식 발표 ↗</a>${d.links.map(([label,url])=>`<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`).join('')}</details><button type="button" data-reservation-alt="${key}">${d.alt}</button></section>`;
 }
 document.addEventListener('change',event=>{
  const key=event.target.dataset.reservationStatus||event.target.dataset.reservationTime;if(!definitions[key])return;
  const field=event.target.hasAttribute('data-reservation-status')?'status':'time',r=records[key]??={status:'미신청',time:''};r[field]=event.target.value;r.updatedAt=Date.now();
  try{localStorage.setItem(STORE,JSON.stringify(records));storageAvailable=true;}catch(_){storageAvailable=false;}
  window.dispatchEvent(new CustomEvent('routebook:reservation-change',{detail:{key,field}}));
 });
 document.addEventListener('click',event=>{const b=event.target.closest('[data-reservation-alt]'),d=definitions[b?.dataset.reservationAlt];if(d)window.dispatchEvent(new CustomEvent('routebook:reservation-alt',{detail:{day:d.day,variant:d.variant}}));});
 window.ReservationUI={html,getRecords};
})();
