'use strict';
// Day 1 only: source timetable events, not live arrival predictions.
const DayOneDepartures = (() => {
 const VERSION = '20261025-next-trains-2';
 const profiles = {
  'metro-ueno-iriya': {from:'우에노',fromJa:'上野',fromCode:'H18',to:'이리야',toJa:'入谷',toCode:'H19',lineId:'TokyoMetro.Hibiya',line:'히비야선',direction:'기타센주 방면',directionJa:'北千住方面',numbering:'H18',directionId:'0',reverse:'metro-iriya-ueno'},
  'metro-iriya-ueno': {from:'이리야',fromJa:'入谷',fromCode:'H19',to:'우에노',toJa:'上野',toCode:'H18',lineId:'TokyoMetro.Hibiya',line:'히비야선',direction:'나카메구로 방면',directionJa:'中目黒方面',numbering:'H19',directionId:'1',reverse:'metro-ueno-iriya'},
  'jr-ueno-tokyo': {from:'우에노',fromJa:'上野',fromCode:'JU02',to:'도쿄',toJa:'東京',toCode:'JU01',lineId:'JR-East.Takasaki',line:'JR 우에노도쿄선',direction:'도쿄·시나가와 방면',directionJa:'東京・品川方面',timetable:'https://timetables.jreast.co.jp/timetable/list0204.html',reverse:'jr-tokyo-ueno',jr:true},
  'jr-tokyo-ueno': {from:'도쿄',fromJa:'東京',fromCode:'JU01',to:'우에노',toJa:'上野',toCode:'JU02',lineId:'JR-East.Takasaki',line:'JR 우에노도쿄선',direction:'우에노·오미야 방면',directionJa:'上野・大宮方面',timetable:'https://timetables.jreast.co.jp/timetable/list1039.html',reverse:'jr-ueno-tokyo',jr:true}
 };
 let data=null, loading=null, failure=false, active=null, interval=null;
 const attached=new WeakSet();
 function match(part) {
  if (!part) return null;
  return Object.keys(profiles).find(key=>{const p=profiles[key];return p.lineId===part.lineId&&p.from===part.from&&p.to===part.to;})||null;
 }
 function supported(day,leg,part) {return Number(day)===1&&(part?!!match(part):(leg?.parts||[]).some(p=>!!match(p)));}
 function links(p) {
  const directions=new URL('https://www.google.com/maps/dir/');
  directions.search=new URLSearchParams({api:'1',origin:`${p.fromJa}駅 ${p.jr?'JR':'東京メトロ'} 東京都`,destination:`${p.toJa}駅 ${p.jr?'JR':'東京メトロ'} 東京都`,travelmode:'transit',hl:'ko'}).toString();
  if(p.jr)return {directions:directions.href,timetable:p.timetable,status:'https://traininfo.jreast.co.jp/train_info/kanto.aspx'};
  const timetable=new URL('https://transfer.tokyometro.jp/website/timetable');
  timetable.search=new URLSearchParams({numbering:p.numbering,direction:p.directionId,lang:'ko'}).toString();
  return {directions:directions.href,timetable:timetable.href,status:'https://www.tokyometro.jp/unkou/history/hibiya.html'};
 }
 function shell(key) {
  const p=profiles[key],u=links(p);
  return `<div class="departure-heading"><strong>다음 열차</strong><span class="departure-source-badge">시간표 기준 · 지연 미반영</span></div>
   <div class="departure-stations"><span class="departure-station-code${p.jr?' departure-jr-code':''}">${p.fromCode}</span><strong>${p.from}<small>${p.fromJa}</small></strong><span class="departure-arrow">→</span><strong>${p.to}<small>${p.toJa} · ${p.toCode}</small></strong><button type="button" class="departure-reverse" data-departure-direction="${p.reverse}" aria-label="반대 방향 ${p.to}에서 ${p.from} 열차 보기" title="반대 방향">↔</button></div>
   <div class="departure-direction">${p.line} · <b>${p.direction}</b><span>${p.directionJa}${p.jr?' · 다카사키·우쓰노미야선 직통':''}</span></div>
   <div class="departure-clock" data-departure-clock>현재 일본 시각으로 계산 중…</div>
   <div data-departure-body aria-busy="true"><p class="departure-loading" role="status">열차 시간표를 불러오는 중…</p></div>
   <p class="departure-notice">${p.jr?'도착·출발은 시간표의 예정 시각이에요. 지연·운휴·승강장은 현장 안내를 확인해 주세요.':'히비야선 자료는 출발 시각만 제공해요. 실제 역 도착 시각·지연은 알 수 없어 출발 기준으로 표시해요.'}</p>
   <div class="departure-secondary"><a href="${esc(u.timetable)}" target="_blank" rel="noopener noreferrer">공식 시간표 ↗</a><a href="${esc(u.status)}" target="_blank" rel="noopener noreferrer">운행 정보 ↗</a><a href="${esc(u.directions)}" target="_blank" rel="noopener noreferrer">길찾기 ↗</a></div>
   <details class="departure-source"><summary>시간표 출처·기준</summary><div data-departure-source>공개된 시간표 자료를 확인하고 있어요.</div><a href="https://github.com/nagix/mini-tokyo-3d" target="_blank" rel="noopener noreferrer">Mini Tokyo 3D · ODPT 기반 시간표 ↗</a></details>`;
 }
 function html(day,leg,part) {
  if(!supported(day,leg,part))return '';
  const picked=[...new Set((part?[part]:leg.parts).map(match).filter(Boolean))];
  return picked.map(key=>`<section class="station-departures" data-departure-profile="${key}" aria-label="${profiles[key].line} ${profiles[key].from} 출발역 열차 정보">${shell(key)}</section>`).join('');
 }
 async function loadData(force=false) {
  if(loading)return loading;
  if(data&&!force)return data;
  failure=false;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  loading=(async()=>{
   try {
    const response=await fetch(`day1-timetables.json?v=${VERSION}`,{signal:controller.signal,cache:'no-cache'});
    if(!response.ok)throw new Error('timetable unavailable');
    const next=await response.json();
    if(next.schemaVersion!==1||!next.profiles||!Array.isArray(next.holidays))throw new Error('invalid timetable');
    for(const key of Object.keys(profiles)) {const p=next.profiles[key];if(!Array.isArray(p?.Weekday)||!p.Weekday.length||!Array.isArray(p?.SaturdayHoliday)||!p.SaturdayHoliday.length)throw new Error('missing timetable');}
    data=next;return data;
   }catch(_){failure=true;return null;}
   finally{clearTimeout(timeout);loading=null;}
  })();
  return loading;
 }
 function timeLabel(epoch,now) {
  const date=DepartureCore.japanDate(epoch),today=DepartureCore.japanDate(now);
  const prefix=date===today?'':date===DepartureCore.japanDate(now+86400000)?'내일 ':`${date.slice(5).replace('-','/')} `;
  return prefix+DepartureCore.formatTime(epoch);
 }
 function renderTrains(section,now) {
  const key=section.dataset.departureProfile,p=profiles[key];if(!p)return;
  const body=section.querySelector('[data-departure-body]'),clock=section.querySelector('[data-departure-clock]'),japan=new Date(now+9*3600000);
  clock.textContent=`지금 기준 · 일본 ${japan.toISOString().slice(5,10).replace('-','/')} ${japan.toISOString().slice(11,19)}`;
  if(!data){body.setAttribute('aria-busy',!failure);if(failure)body.innerHTML='<div class="departure-error" role="status">시간표를 불러오지 못했어요.<button type="button" data-departure-retry>다시 불러오기</button></div>';return;}
  body.setAttribute('aria-busy','false');
  const date=DepartureCore.japanDate(now),source=section.querySelector('[data-departure-source]'),meta=data.profiles[key].metadata||data.metadata;
  source.textContent=`시간표 개정 ${meta.scheduleRevision||data.metadata.scheduleRevision} · 자료 취득 ${data.metadata.retrievedAt} · 대조 자료 기준 ${meta.verifiedSourceDate||data.metadata.retrievedAt}. 평일·토/일·일본 공휴일을 구분해 현재 시각 이후 열차를 계산해요. 여행일(2027.01.08)의 확정 운행표가 아니며, 개정·임시 운행은 공식 안내가 우선이에요.${p.jr?' 다카사키·우쓰노미야선 직통 보통·쾌속 기준. 조반선·야마노테선·게이힌도호쿠선은 포함하지 않아요.':''}`;
  if(date<data.calendarFrom||date>data.calendarThrough){body.innerHTML='<p class="departure-error" role="status">해당 날짜의 시간표·공휴일 자료가 없어요. 공식 시간표를 확인해 주세요.</p>';return;}
  const trains=DepartureCore.nextTrains(data.profiles[key],now,{limit:3,holidays:data.holidays,yearEndHoliday:true}).filter(train=>train.serviceDate>=data.calendarFrom&&train.serviceDate<=data.calendarThrough);
  if(!trains.length){body.innerHTML='<p class="departure-error" role="status">다음 열차 시각을 확인할 수 없어요. 공식 시간표를 확인해 주세요.</p>';return;}
  const first=trains[0],upcomingArrival=first.arrivalAt!==null&&first.arrivalAt>now,eventAt=upcomingArrival?first.arrivalAt:first.departureAt,eventLabel=upcomingArrival?`${p.from}역 도착 예정`:`${p.from}역 출발 예정`;
  const signature=trains.map(t=>t.id+'|'+t.departureAt).join(',')+'|'+upcomingArrival;
  if(body.dataset.signature!==signature){
   body.dataset.signature=signature;
   body.innerHTML=`<div class="departure-next" aria-label="다음 열차 시간표"><div class="departure-next-time"><small>${eventLabel}</small><strong>${timeLabel(eventAt,now)}</strong></div><div class="departure-next-count"><small>${upcomingArrival?'도착':'출발'}까지</small><b data-departure-countdown="${eventAt}" role="timer" aria-live="off"></b></div></div>
    <div class="departure-train"><strong>${esc(first.destination)}행</strong><span>${esc(first.type==='Local'?'보통':first.type||'보통')} · ${esc(first.number||'')}</span></div>
    ${first.arrivalAt!==null&&first.arrivalAt<=now?'<p class="departure-stop-note">시간표상 도착 시각이 지났어요. 출발까지 남은 시간을 표시해요.</p>':''}
    <div class="departure-journey"><span>${p.from} 출발 <b>${timeLabel(first.departureAt,now)}</b></span>${first.destinationArrivalAt!==null?`<span>${p.to} 도착 예정 <b>${timeLabel(first.destinationArrivalAt,now)}</b></span>`:''}</div>
    <div class="departure-following" aria-label="그다음 열차"><div class="departure-following-head"><span>그다음 열차</span><span>출발 예정 / 남은 시간</span></div>${trains.slice(1).map(t=>`<div class="departure-following-row"><span>${esc(t.destination)}행<small>${esc(t.number||'')}</small></span><span><b>${timeLabel(t.departureAt,now)}</b><small data-departure-countdown="${t.departureAt}"></small></span></div>`).join('')}</div>
    <div class="departure-calendar">${first.calendar==='Weekday'?'평일':'토·일·공휴일'} 시간표 · 초 단위 자동 갱신${first.serviceDate!==date?' · '+first.serviceDate.slice(5).replace('-','/')+' 운행분':''}</div>`;
  }
  body.querySelectorAll('[data-departure-countdown]').forEach(el=>{el.textContent=DepartureCore.formatCountdown(Number(el.dataset.departureCountdown)-now);});
 }
 function paint(){if(!active?.element.isConnected||document.hidden)return;const now=Date.now();active.element.querySelectorAll('[data-departure-profile]').forEach(section=>renderTrains(section,now));}
 function resumeTimer(){clearInterval(interval);interval=null;if(active&&!document.hidden){paint();interval=setInterval(paint,1000);}}
 function unmount(popup){if(!active||(popup&&active.popup!==popup))return;active.element.removeEventListener('click',active.click);active=null;clearInterval(interval);interval=null;}
 function mount(popup){
  unmount();const element=popup.getElement();if(!element?.querySelector('[data-departure-profile]'))return;
  // Give Leaflet a DOM node so update() measures, but never resets, live content.
  if(!popup.getContent()?.nodeType){
   const content=element.querySelector('.leaflet-popup-content'),node=document.createElement('div');
   while(content.firstChild)node.appendChild(content.firstChild);
   popup.setContent(node);
  }
  const click=async event=>{
   const reverse=event.target.closest('[data-departure-direction]');
   if(reverse&&element.contains(reverse)){
    const key=reverse.dataset.departureDirection,section=reverse.closest('[data-departure-profile]');if(!profiles[key]||!section)return;
    section.dataset.departureProfile=key;section.setAttribute('aria-label',`${profiles[key].line} ${profiles[key].from} 출발역 열차 정보`);section.innerHTML=shell(key);paint();popup.update();section.querySelector('[data-departure-direction]').focus({preventScroll:true});
   }
   if(event.target.closest('[data-departure-retry]')){failure=false;event.target.disabled=true;event.target.textContent='불러오는 중…';await loadData(true);if(active?.popup===popup){paint();popup.update();}}
  };
  active={popup,element,click};element.addEventListener('click',click);resumeTimer();loadData().then(()=>{if(active?.popup===popup){paint();popup.update();}});
 }
 function attach(map){if(attached.has(map))return;attached.add(map);map.on('popupopen',event=>mount(event.popup));map.on('popupclose',event=>unmount(event.popup));document.addEventListener('visibilitychange',resumeTimer);window.addEventListener('pagehide',event=>{if(event.persisted){clearInterval(interval);interval=null;}else unmount();});window.addEventListener('pageshow',event=>{if(event.persisted)resumeTimer();});}
 return {supported,html,attach};
})();
