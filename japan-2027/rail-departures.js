'use strict';
// Scheduled station events for every itinerary. Live disruption data is separate.
const RailDepartures = (() => {
 const VERSION=TravelStore.VERSION;
 const manifest=globalThis.RailDepartureProfiles||{profiles:{},holidays:[]},profiles=manifest.profiles;
 const entries=Object.entries(profiles),loaded=new BoundedCache.LRU(6,16*1024*1024),pending=new Map(),failed=new Set(),attached=new WeakSet();
 let active=null,interval=null;
 const railPart=p=>p&&['rail','metro'].includes(p.mode);
 const samePart=(a,b)=>a&&b&&(a.lineId??null)===(b.lineId??null)&&a.from===b.from&&a.to===b.to&&(!a.line||a.line===b.line);
 function match(part){
  if(!railPart(part))return null;
  return entries.find(([,p])=>(p.matches||[p.match||{lineId:p.lineId,from:p.from,to:p.to}]).some(m=>samePart(m,part)))?.[0]||null;
 }
 function keyFor(leg,part){
  if(!railPart(part))return null;
  // Color boundaries on a through train are not new boarding stations.
  if(part.throughService){const original=leg.parts.find(p=>p.lineId==='Special.Direct'&&p.line===part.throughService);if(original)return match(original);}
  const through=entries.find(([,p])=>{
   if(!p.throughParts?.length||!p.throughParts.some(m=>samePart(m,part)))return false;
   const sequence=(leg.parts||[]).filter(railPart);
   return sequence.some((_,i)=>p.throughParts.every((m,j)=>samePart(m,sequence[i+j])));
  });
  return through?.[0]||match(part);
 }
 function keysFor(leg,part){return [...new Set((part?[part]:leg?.parts||[]).map(p=>keyFor(leg,p)).filter(Boolean))];}
 function supported(day,leg,part){return Number(day)>=1&&Number(day)<=22&&keysFor(leg,part).length>0;}
 function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch(_){return null;}}
 function links(p){
  const directions=new URL('https://www.google.com/maps/dir/'),station=p.country==='KR'?'역':'駅';
  const stationQuery=name=>`${String(name).replace(/(?:역|駅)$/,'')}${station} ${p.operator||''}`;
  directions.search=new URLSearchParams({api:'1',origin:p.originQuery||stationQuery(p.fromJa||p.from),destination:p.destinationQuery||stationQuery(p.toJa||p.to),travelmode:'transit',hl:'ko'}).toString();
  return {directions:directions.href,timetable:safeUrl(p.officialTimetableUrl),status:safeUrl(p.statusUrl)};
 }
 function sourceHtml(p){
  const m=p.metadata||{},facts=[];
  if(m.scheduleRevision)facts.push(`시간표 개정 ${m.scheduleRevision}`);
  if(m.retrievedAt)facts.push(`자료 취득 ${m.retrievedAt}`);
  if(m.verifiedSourceDate)facts.push(`자료 확인 기준 ${m.verifiedSourceDate}`);
  facts.push(p.validFrom?`자료 적용 시작 ${p.validFrom}`:'자료 적용 시작일 미공개');
  facts.push(p.validUntil?`자료 유효 종료 ${p.validUntil}`:'자료 유효 종료일 미공개 · 여행일 확정 아님');
  if(p.calendarThrough)facts.push(`계산 지원 ${p.calendarThrough}까지`);
  const policy=p.country==='KR'?'열차별 운행 요일·적용일을 확인해 계산해요.':'평일·토요일·일요일·일본 공휴일에 맞는 시간표를 사용해요.';
  const urls=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(urls):value&&typeof value==='object'?Object.values(value).flatMap(urls):[];
  const sources=[...new Set(urls([m.sourceUrl,m.sourceUrls]))].filter(safeUrl);
  return `${esc(facts.join(' · ')||'공개된 운영사·노선 시간표를 사용해요.')}<br>${esc(m.note||p.sourceNote||'')}${m.note||p.sourceNote?'<br>':''}${policy} 여행일의 확정 운행·좌석을 보장하지 않으며, 개정·임시 운행은 공식 안내가 우선이에요.${sources.slice(0,3).map((url,i)=>`<a class="departure-source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${sources.length===1?'시간표 자료':`시간표 자료 ${i+1}`} ↗</a>`).join('')}`;
 }
 function travelDate(day){return DepartureCore.japanDate(Date.parse('2027-01-08T00:00:00+09:00')+(Number(day)-1)*86400000);}
 function validityFor(key,date){return DepartureCore.validity(calendarOptions(key),date);}
 function warning(key,date){const p=profiles[key],v=validityFor(key,date);return !v.usable?`<p class="timetable-warning" role="status">여행일 시간표 갱신 필요 · ${esc(date)}<br>${p.validUntil?`기존 자료 유효 종료 ${esc(p.validUntil)} · `:''}공식 개정 자료 확인 전 열차 시각·탑승 선택을 표시하지 않아요.</p>`:`<p class="timetable-confidence">${esc(v.label)} · ${esc(date)}<br>예정 시각 · 실시간 지연 미반영</p>`;}
 function notice(day,leg){return keysFor(leg).map(key=>warning(key,travelDate(day))).join('');}
 function shell(key,serviceDate){
  const p=profiles[key],u=links(p),info=typeof RAIL_LINES==='object'?RAIL_LINES[p.lineId]:null;
  const reverse=p.reverseKey&&profiles[p.reverseKey]?p.reverseKey:null,code=p.country==='KR'?'KTX':p.fromCode||info?.code||'철도';
  const toDetail=[...new Set([p.toJa,p.toCode].filter(value=>value&&value!==p.to))].join(' · ');
  return `${warning(key,serviceDate)}<div class="departure-heading"><strong>다음 열차</strong><span class="departure-source-badge">시간표 기준 · 지연 미반영</span></div>
   <div class="departure-stations"><span class="departure-station-code${info?.shape==='square'?' departure-jr-code':''}"${info?` style="border-color:${esc(info.color)}"`:''}>${esc(code)}</span><strong>${esc(window.TripPersonal.station(p.from,p.fromJa,p.country))}</strong><span class="departure-arrow">→</span><strong>${esc(window.TripPersonal.station(p.to,p.toJa,p.country))}</strong>${reverse?`<button type="button" class="departure-reverse" data-departure-direction="${esc(reverse)}" aria-label="반대 방향 ${esc(p.to)}에서 ${esc(p.from)} 열차 보기" title="반대 방향">↔</button>`:''}</div>
   <div class="departure-direction">${esc(p.line)}${p.direction?` · <b>${esc(p.direction)}</b>`:''}${p.directionJa&&p.directionJa!==p.direction?`<span>${esc(p.directionJa)}</span>`:''}</div>
   ${p.throughParts?'<p class="departure-through">직통 구간 · 색이 바뀌어도 출발역에서 탄 열차로 계속 이동</p>':''}
   <p class="departure-validity">자료 확인 ${esc(p.sourceDate||'미확인')} · ${p.validUntil?'자료 유효 종료 '+esc(p.validUntil):'유효 종료일 미공개 · 여행일 운행 미확정'}</p><div class="departure-clock" data-departure-clock>현재 ${p.country==='KR'?'한국':'일본'} 시각으로 계산 중…</div>
   <div data-departure-body aria-busy="true"><p class="departure-loading" role="status">열차 시간표를 불러오는 중…</p></div>
   <div class="departure-board-actions"><button type="button" data-ride-open="${esc(key)}">내가 탄 열차 · 전체 시간표</button></div>
   <p class="departure-notice">도착 시각이 없는 자료는 출발 기준으로 표시해요. ${p.notice?esc(p.notice):'지연·운휴·승강장은 현장 안내를 확인해 주세요.'}</p>
   <div class="departure-secondary">${u.timetable?`<a href="${esc(u.timetable)}" target="_blank" rel="noopener noreferrer">공식 시간표 ↗</a>`:''}${u.status?`<a href="${esc(u.status)}" target="_blank" rel="noopener noreferrer">운행 정보 ↗</a>`:''}<a href="${esc(u.directions)}" target="_blank" rel="noopener noreferrer">길찾기 ↗</a></div>
   <details class="departure-source"><summary>시간표 출처·기준</summary><div>${sourceHtml(p)}</div></details>`;
 }
 function sectionHtml(key,serviceDate,referenceAt,steps){const p=profiles[key];return `<section class="station-departures" data-connection-steps="${esc(JSON.stringify(steps||[]))}" data-reference-at="${Number.isFinite(referenceAt)?referenceAt:''}" data-service-date="${esc(serviceDate)}" data-departure-profile="${esc(key)}" aria-label="${esc(p.line+' '+p.from)} 출발역 열차 정보">${shell(key,serviceDate)}</section>`;}
 function html(day,leg,part){
  if(!supported(day,leg,part))return '';
  const keys=keysFor(leg,part);
  const select=keys.length>1?`<label class="departure-select-label">열차를 확인할 승차 구간<select data-departure-select aria-label="열차를 확인할 승차 구간">${keys.map(key=>{const p=profiles[key];return `<option value="${esc(key)}">${esc(p.line+' · '+window.TripPersonal.station(p.from,p.fromJa,p.country)+' → '+window.TripPersonal.station(p.to,p.toJa,p.country))}</option>`;}).join('')}</select><small>여행일 참고는 앞 열차·도보·환승 반영 · 현재 시간표는 출발역 기준</small></label>`:'';
  return `<div class="departure-panel">${select}${sectionHtml(keys[0],travelDate(leg.dayNumber||day),leg.departureTimeKnown===false?null:leg.departureAt,ConnectionCore.stepsFor(leg,keyFor))}</div>`;
 }
 async function loadData(key,force=false){
  const file=profiles[key]?.file;if(!file)return null;
  if(pending.has(file))return pending.get(file);
  if(loaded.has(file)&&!force)return loaded.get(file);
  failed.delete(file);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  const promise=(async()=>{
   try{
    const data=await TravelStore.readJson(`${file}?v=${VERSION}`,{timeout:15000});
    if(data.schemaVersion!==2||!data.profiles||typeof data.profiles!=='object')throw new Error('invalid timetable');
    if(!data.profiles[key]||!['Weekday','SaturdayHoliday','Saturday','SundayHoliday','Daily'].some(k=>Array.isArray(data.profiles[key][k])))throw new Error('missing timetable');
    loaded.set(file,data,JSON.stringify(data).length*2);TravelStore.trimTimetables().catch(()=>{});return data;
   }catch(_){failed.add(file);return null;}
   finally{clearTimeout(timeout);pending.delete(file);}
  })();
  pending.set(file,promise);return promise;
 }
 const timeLabel=DepartureCore.timeLabel;
 const calendarNames={Weekday:'평일',SaturdayHoliday:'토·일·공휴일',Saturday:'토요일',SundayHoliday:'일·공휴일',Daily:'운행 요일·날짜별'};
 const trainTypes={Local:'보통',Rapid:'쾌속',Express:'급행',LimitedExpress:'특급',SemiExpress:'준급',RapidExpress:'쾌속급행',SpecialRapid:'신쾌속',CommuterRapid:'통근쾌속',CommuterExpress:'통근급행',AirportRapid:'공항쾌속',HanedaExpress:'공항쾌속',SectionRapid:'구간쾌속',SectionExpress:'구간급행',CommuterSemiExpress:'통근준급',CommuterLimitedExpress:'통근특급',SpecialRapidService:'신쾌속',ChuoSpecialRapid:'주오특쾌',OmeSpecialRapid:'오메특쾌',Skyliner:'스카이라이너',FujiExcursion:'후지회유'};
 Object.assign(trainTypes,{RapidLimitedExpress:'쾌특',AirportRapidLimitedExpress:'에어포트쾌특',AccessExpress:'액세스특급',KawagoeLimitedExpress:'가와고에특급',CommuterSpecialRapid:'통근특쾌','普通':'보통','快速':'쾌속','新快速':'신쾌속','急行':'급행','準急':'준급','区間準急':'구간준급','快速急行':'쾌속급행','快速特急':'쾌속특급','準特急':'준특급','特急':'특급','通勤快急':'통근쾌속급행','通勤準急':'통근준급','通勤特急':'통근특급','新快速（Aシート連結）':'신쾌속 · A시트 연결','新快速（一部区間Aシート連結）':'신쾌속 · 일부 A시트 연결','新快速（京都から快速）':'신쾌속 · 교토부터 쾌속','Ａ新快速（うれしート連結）':'신쾌속 · 우레시트 연결','A快速（うれしート連結）':'쾌속 · 우레시트 연결','Dみやこ路快速（うれしート連結）':'미야코지쾌속 · 우레시트 연결','D区間快速（うれしート連結）':'구간쾌속 · 우레시트 연결','E快速（うれしート連結）':'쾌속 · 우레시트 연결','普通A快速（うれしート連結）':'보통·쾌속 · 우레시트 연결','快速（島本・山崎・向日町・桂川・西大路通過）':'쾌속 · 일부 역 통과'});
 function stateMessage(body,state,message,retry=false){
  if(body.dataset.signature===state)return;
  body.dataset.signature=state;
  body.innerHTML=`<div class="departure-error" role="status">${esc(message)}${retry?'<button type="button" data-departure-retry>다시 불러오기</button>':''}</div>`;
 }
 function renderTrains(section,now){
  const key=section.dataset.departureProfile,p=profiles[key];if(!p)return;
  section._rideTrains=[];
  const serviceNow=globalThis.RideCore?.serviceDateForNow(now)||DepartureCore.japanDate(now);if(!section.dataset.queryMode)section.dataset.queryMode=[DepartureCore.japanDate(now),serviceNow].includes(section.dataset.serviceDate)?'current':'fixed';if(section.dataset.queryMode==='current')section.dataset.serviceDate=serviceNow;
  const body=section.querySelector('[data-departure-body]'),clock=section.querySelector('[data-departure-clock]'),local=new Date(now+9*3600000);
  clock.textContent=`지금 기준 · ${p.country==='KR'?'한국':'일본'} ${local.toISOString().slice(5,10).replace('-','/')} ${local.toISOString().slice(11,19)}`;
  const confidence=section.querySelector('.timetable-confidence');if(confidence)confidence.textContent=validityFor(key,section.dataset.serviceDate).label+' · '+section.dataset.serviceDate+' · 예정 시각·실시간 지연 미반영';
  if(!validityFor(key,section.dataset.serviceDate).usable){body.setAttribute('aria-busy','false');stateMessage(body,'travel-invalid','여행일 시간표 갱신 필요 · 해당 여행일 열차는 선택할 수 없어요.');return;}
  const data=loaded.get(p.file),schedules=data?.profiles?.[key];
  if(!schedules){body.setAttribute('aria-busy',String(!failed.has(p.file)));if(failed.has(p.file))stateMessage(body,'error','시간표를 불러오지 못했어요.',true);return;}
  body.setAttribute('aria-busy','false');
  const selectedDate=section.dataset.serviceDate,currentServiceDate=globalThis.RideCore?.serviceDateForNow(now)||DepartureCore.japanDate(now),future=section.dataset.queryMode!=='current';
  const reference=Number(section.dataset.referenceAt),steps=JSON.parse(section.dataset.connectionSteps||'[]');
  const connection=future?ConnectionCore.readyAt(steps,key,reference>0?reference:null,(prior,at)=>{
   if(!validityFor(prior,DepartureCore.japanDate(at)).usable)return {status:'invalid-connection'};
   const schedule=loaded.get(profiles[prior].file)?.profiles?.[prior];
   if(!schedule)return {status:failed.has(profiles[prior].file)?'connection-error':'connection-loading'};
   const train=DepartureCore.nextTrains(schedule,at,{...calendarOptions(prior),limit:1})[0];
   return train?{status:'ready',train}:{status:'connection-empty'};
  }):null;
  if(future&&connection.status!=='ready'){
   clock.textContent=selectedDate+' · 일정 연결 시각을 확인해야 해요';
   section.querySelector('.departure-heading strong').textContent='일정 연결 확인 필요';
   const messages={'unknown-start':'일정 출발 시각이 없어 연결 열차를 추천하지 않아요.','unknown-access':'승차역까지의 접근·환승 시간이 미확인이라 연결 열차를 추천하지 않아요.','unknown-arrival':'앞 열차의 하차역 도착 시각이 없어 연결 열차를 추천하지 않아요.','outside-route':'반대 방향은 현재 이동 계획에 포함되지 않아요. 역 기준 전체 시간표에서 확인하세요.','invalid-connection':'앞 구간의 여행일 시간표 갱신이 필요해요.','connection-loading':'앞 구간의 연결 시간표를 불러오는 중…','connection-error':'앞 구간 시간표를 불러오지 못했어요.','connection-empty':'앞 구간에서 연결할 열차 시각을 확인할 수 없어요.'};
   stateMessage(body,connection.status,messages[connection.status]||'연결 시간표를 확인해 주세요.',connection.status==='connection-error');return;
  }
  const queryNow=future?connection.queryAt:now;
  section.querySelector('.departure-heading strong').textContent=future?'여행일 기준 참고 시간표':'현재 다음 열차';
  clock.textContent=future?`${selectedDate} 이동 시작 ${DepartureCore.formatTime(reference)} · ${p.from} 승차 준비 ${DepartureCore.timeLabel(connection.readyAt,reference)} 이후 · 도보·환승 + 승차 여유 1분 반영${connection.estimated?' · 앞 열차 도착은 소요시간 추정':''} · 지연 미반영`:`현재 ${p.country==='KR'?'한국':'일본'} ${local.toISOString().slice(5,10).replace('-','/')} ${local.toISOString().slice(11,19)} · 출발역 현재 시간표 · 이동·환승 연결은 별도 확인 · 지연 미반영`;
  const date=DepartureCore.japanDate(queryNow),calendarFrom=p.calendarFrom||manifest.calendarFrom,calendarThrough=p.calendarThrough||manifest.calendarThrough;
  if(calendarFrom&&date<calendarFrom){stateMessage(body,'out-of-range','해당 날짜에 적용할 시간표 자료가 없어요. 공식 시간표를 확인해 주세요.');return;}
  const options={limit:3,...calendarOptions(key)};
  const trains=DepartureCore.nextTrains(schedules,queryNow,options);
  if(!trains.length){stateMessage(body,'empty',p.unavailableReason||(calendarThrough&&date>calendarThrough?'해당 날짜에 적용할 시간표 자료가 없어요. 공식 시간표를 확인해 주세요.':'현재 적용할 다음 열차 시각을 확인할 수 없어요. 공식 시간표를 확인해 주세요.'));return;}
  section._rideTrains=trains;
  const first=trains[0],upcomingArrival=first.arrivalAt!==null&&first.arrivalAt>now,eventAt=upcomingArrival?first.arrivalAt:first.departureAt,eventLabel=upcomingArrival?`${p.from}역 도착 예정`:`${p.from}역 출발 예정`;
  const signature=DepartureCore.renderSignature(trains,now,upcomingArrival)+'|'+future;
  if(body.dataset.signature!==signature){
   body.dataset.signature=signature;
   body.innerHTML=`<div class="departure-next" aria-label="다음 열차 시간표"><div class="departure-next-time"><small>${esc(eventLabel)}</small><strong>${timeLabel(eventAt,now)}</strong></div><div class="departure-next-count"><small>${upcomingArrival?'도착':'출발'}까지</small><b data-departure-countdown="${eventAt}" role="timer" aria-live="off"></b></div></div>
    <div class="departure-train"><strong>${esc(first.destination||p.to)}행</strong><span>${esc(first.line||trainTypes[first.type]||first.type||'보통')}${first.number?' · '+esc(first.number):''}</span></div>
    ${first.arrivalAt!==null&&first.arrivalAt<=now?'<p class="departure-stop-note">시간표상 도착 시각이 지났어요. 출발까지 남은 시간을 표시해요.</p>':''}
    <div class="departure-journey"><span>${esc(p.from)} 출발 <b>${timeLabel(first.departureAt,now)}</b></span>${first.destinationArrivalAt!==null?`<span>${esc(p.to)} 도착 예정 <b>${timeLabel(first.destinationArrivalAt,now)}</b></span>`:''}</div>
    ${trains.length>1?`<div class="departure-following" aria-label="그다음 열차"><div class="departure-following-head"><span>그다음 열차</span><span>출발 예정 / 남은 시간</span></div>${trains.slice(1).map(t=>`<div class="departure-following-row"><span>${esc(t.destination||p.to)}행<small>${esc(t.number||trainTypes[t.type]||t.type||'')}</small></span><span><b>${timeLabel(t.departureAt,now)}</b><small data-departure-countdown="${t.departureAt}"></small></span></div>`).join('')}</div>`:''}
    <div class="departure-board-actions"><button type="button" data-ride-next="0">${timeLabel(first.departureAt,now)} ${future?'참고 열차 선택':'이 열차 탑승'}</button></div>
    <div class="departure-calendar">${calendarNames[first.calendar]||'운행일별'} 시간표 · 초 단위 자동 갱신${first.serviceDate!==date?' · '+first.serviceDate.slice(5).replace('-','/')+' 운행분':''}</div>`;
  }
  body.querySelectorAll('[data-departure-countdown]').forEach(el=>{el.textContent=future?'여행일 참고':DepartureCore.formatCountdown(Number(el.dataset.departureCountdown)-now);});
 }
 function paint(){if(!active?.element.isConnected||document.hidden)return;const now=Date.now();active.element.querySelectorAll('[data-departure-profile]').forEach(section=>renderTrains(section,now));}
 function resumeTimer(){clearInterval(interval);interval=null;if(active&&!document.hidden){paint();interval=setInterval(paint,1000);}}
 function unmount(popup){if(!active||(popup&&active.popup!==popup))return;active.element.removeEventListener('click',active.click);active.element.removeEventListener('change',active.change);active=null;clearInterval(interval);interval=null;}
 function mount(popup){
  unmount();const element=popup.getElement();if(!element?.querySelector('[data-departure-profile]'))return;
  // Retain live DOM when Leaflet remeasures the popup after async data loads.
  if(!popup.getContent()?.nodeType){const content=element.querySelector('.leaflet-popup-content'),node=document.createElement('div');while(content.firstChild)node.appendChild(content.firstChild);popup.setContent(node);}
  const refresh=async(key,force=false)=>{const section=element.querySelector('[data-departure-profile]'),steps=JSON.parse(section?.dataset.connectionSteps||'[]'),keys=ConnectionCore.dependencies(steps,key);await Promise.all([...new Set([key,...keys])].map(k=>loadData(k,force)));if(active?.popup===popup){paint();popup.update();}};
  const selectProfile=(section,key)=>{
   if(!profiles[key]||!section)return;
   const content=shell(key,section.dataset.serviceDate);
   const select=section.closest('.departure-panel')?.querySelector('[data-departure-select]');
   if(select){
    select.querySelectorAll('[data-reverse-option]').forEach(option=>{if(option.value!==key)option.remove();});
    if(!Array.from(select.options).some(option=>option.value===key)){const option=document.createElement('option');option.value=key;option.dataset.reverseOption='true';option.textContent=`반대 방향 · ${profiles[key].line} · ${profiles[key].from} → ${profiles[key].to}`;select.appendChild(option);}
    select.value=key;
   }
   section.dataset.departureProfile=key;section.setAttribute('aria-label',`${profiles[key].line} ${profiles[key].from} 출발역 열차 정보`);section.innerHTML=content;paint();popup.update();refresh(key);
  };
  const click=event=>{
   const ride=event.target.closest('[data-ride-open],[data-ride-next]');
   if(ride){event.stopPropagation();const section=ride.closest('[data-departure-profile]'),key=section?.dataset.departureProfile;if(ride.hasAttribute('data-ride-next')){const train=section?._rideTrains?.[Number(ride.dataset.rideNext)];if(train)window.RideTracker?.board(key,train.id,train.serviceDate,train.departureAt);}else window.RideTracker?.open(key,section?.dataset.serviceDate);return;}
   const reverse=event.target.closest('[data-departure-direction]');
   if(reverse&&element.contains(reverse)){event.stopPropagation();const section=reverse.closest('[data-departure-profile]');selectProfile(section,reverse.dataset.departureDirection);section?.querySelector('[data-departure-direction]')?.focus({preventScroll:true});}
   const retry=event.target.closest('[data-departure-retry]');
   if(retry){event.stopPropagation();retry.disabled=true;retry.textContent='불러오는 중…';const body=retry.closest('[data-departure-body]');body.dataset.signature='retrying';body.setAttribute('aria-busy','true');refresh(retry.closest('[data-departure-profile]').dataset.departureProfile,true);}
  };
  const change=event=>{if(event.target.matches('[data-departure-select]'))selectProfile(event.target.closest('.departure-panel').querySelector('[data-departure-profile]'),event.target.value);};
  active={popup,element,click,change};element.addEventListener('click',click);element.addEventListener('change',change);resumeTimer();
  element.querySelectorAll('[data-departure-profile]').forEach(section=>refresh(section.dataset.departureProfile));
 }
 function attach(map){if(attached.has(map))return;attached.add(map);map.on('popupopen',event=>mount(event.popup));map.on('popupclose',event=>unmount(event.popup));document.addEventListener('visibilitychange',resumeTimer);window.addEventListener('pagehide',event=>{if(event.persisted){clearInterval(interval);interval=null;}else unmount();});window.addEventListener('pageshow',event=>{if(event.persisted)resumeTimer();});}
 function calendarOptions(key){const p=profiles[key]||{};return {holidays:manifest.holidays,yearEndHoliday:true,calendarFrom:p.calendarFrom||manifest.calendarFrom,calendarThrough:p.calendarThrough||manifest.calendarThrough,validFrom:p.validFrom,validUntil:p.validUntil,sourceDate:p.sourceDate,sourceClass:p.sourceClass,...p.calendarOptions};}
 async function getSchedule(key){const data=await loadData(key);return data?.profiles?.[key]||null;}
 return {notice,validityFor,travelDate,supported,html,attach,keysFor,keyFor,calendarOptions,getSchedule,cacheInfo:()=>({entries:loaded.size,bytes:loaded.weight,pending:pending.size}),typeLabel:type=>trainTypes[type]||type||'보통'};
})();
