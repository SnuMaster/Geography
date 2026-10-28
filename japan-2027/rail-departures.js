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
 function noticeItems(days,routes){
  const found=new Map();
  for(const day of days||[])for(const variant of day.variants||[])for(const leg of routes?.days?.[`${day.n}-${variant.id}`]||[]){
   const date=travelDate(day.n);for(const key of keysFor(leg))for(const candidate of [key,profiles[key]?.reverseKey].filter(Boolean)){
    const p=profiles[candidate],validity=validityFor(candidate,date);if(!p||validity.usable)continue;
    if(!found.has(candidate))found.set(candidate,{key:candidate,line:p.line,from:p.from,to:p.to,validUntil:validity.validUntil,dates:new Set(),url:safeUrl(p.officialTimetableUrl)});
    found.get(candidate).dates.add(date);
   }
  }
  return [...found.values()].map(item=>({...item,dates:[...item.dates].sort()})).sort((a,b)=>a.dates[0].localeCompare(b.dates[0])||a.line.localeCompare(b.line));
 }
 function stationParts(name,japanese,country){
  const label=window.TripPersonal.station(name,japanese,country),match=country==='KR'?null:/^(.*?)[(（]([^()（）]+)[)）]$/.exec(label);
  return {korean:match?match[1]:label,japanese:match?'('+match[2]+')':''};
 }
 function stationName(parts,side){return `<strong class="departure-station-name departure-${side}"><span class="departure-station-korean">${esc(parts.korean)}</span>${parts.japanese?`<small class="departure-station-japanese" lang="ja">${esc(parts.japanese)}</small>`:''}</strong>`;}
 function shell(key,serviceDate,metrics={}){
  const p=profiles[key],u=links(p),info=typeof RAIL_LINES==='object'?RAIL_LINES[p.lineId]:null;
  const reverse=p.reverseKey&&profiles[p.reverseKey]?p.reverseKey:null,code=p.country==='KR'?'KTX':p.fromCode||info?.code||'철도';
  const from=stationParts(p.from,p.fromJa,p.country),to=stationParts(p.to,p.toJa,p.country),length=s=>[...s].length;
  const long=Math.max(length(from.korean),length(to.korean))>9||Math.max(length(from.japanese),length(to.japanese))>10||length(from.korean)+length(to.korean)>(reverse?10:12);
  return `<div class="compact-line"><span class="departure-station-code${info?.shape==='square'?' departure-jr-code':''}"${info?` style="border-color:${esc(info.color)}"`:''}>${esc(code)}</span><strong>${esc(p.line)}</strong>${reverse?`<button type="button" class="departure-reverse" data-departure-direction="${esc(reverse)}" aria-label="반대 방향 ${esc(p.to)}에서 ${esc(p.from)} 열차 보기" title="반대 방향">↔</button>`:''}</div>
   <div class="departure-stations departure-stations-aligned${long?' has-long-names':''}">${stationName(from,'origin')}<span class="departure-arrow" aria-label="에서">→</span>${stationName(to,'destination')}</div>
   <div class="compact-metrics"><span><small>${esc(metrics.distanceLabel||'거리')}</small><b>${esc(metrics.distance||'—')}</b></span><span><small>${esc(metrics.fareLabel||'요금')}</small><b>${esc(metrics.fare||'요금 미확인')}</b></span></div>
   <div class="departure-heading"><strong>다음 열차</strong><span class="departure-clock" data-departure-clock></span></div>
   <div data-departure-body aria-busy="true"><p class="departure-loading" role="status">불러오는 중…</p></div>
   <div class="compact-actions"><button type="button" data-ride-open="${esc(key)}">전체 시간표</button><a href="${esc(u.directions)}" target="_blank" rel="noopener noreferrer">길찾기 ↗</a></div>`;
 }
 function sectionHtml(key,metrics){const p=profiles[key];return `<section class="station-departures compact-station" data-compact-metrics="${esc(JSON.stringify(metrics||{}))}" data-query-mode="current" data-service-date="${esc(globalThis.RideCore?.serviceDateForNow(Date.now())||DepartureCore.japanDate(Date.now()))}" data-departure-profile="${esc(key)}" aria-label="${esc(p.line+' '+p.from)} 출발역 열차 정보">${shell(key,null,metrics)}</section>`;}
 function html(day,leg,part,metrics){
  if(!supported(day,leg,part))return '';
  const keys=keysFor(leg,part);
  const select=keys.length>1?`<label class="departure-select-label">열차 구간<select data-departure-select aria-label="열차를 확인할 승차 구간">${keys.map(key=>{const p=profiles[key];return `<option value="${esc(key)}">${esc(p.line+' · '+window.TripPersonal.station(p.from,p.fromJa,p.country)+' → '+window.TripPersonal.station(p.to,p.toJa,p.country))}</option>`;}).join('')}</select></label>`:'';
  return `<div class="departure-panel">${select}${sectionHtml(keys[0],metrics)}</div>`;
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
  // The itinerary date never controls the live station board.
  section.dataset.queryMode='current';section.dataset.serviceDate=globalThis.RideCore?.serviceDateForNow(now)||DepartureCore.japanDate(now);
  const body=section.querySelector('[data-departure-body]'),clock=section.querySelector('[data-departure-clock]'),local=new Date(now+9*3600000);
  clock.textContent='지금 '+local.toISOString().slice(11,19);
  if(!validityFor(key,section.dataset.serviceDate).usable){body.setAttribute('aria-busy','false');stateMessage(body,'travel-invalid','열차 시각 없음');return;}
  const data=loaded.get(p.file),schedules=data?.profiles?.[key];
  if(!schedules){body.setAttribute('aria-busy',String(!failed.has(p.file)));if(failed.has(p.file))stateMessage(body,'error','시간표를 불러오지 못했어요.',true);return;}
  body.setAttribute('aria-busy','false');
  const queryNow=now;
  const date=DepartureCore.japanDate(queryNow),calendarFrom=p.calendarFrom||manifest.calendarFrom,calendarThrough=p.calendarThrough||manifest.calendarThrough;
  if(calendarFrom&&date<calendarFrom){stateMessage(body,'out-of-range','해당 날짜에 적용할 시간표 자료가 없어요. 공식 시간표를 확인해 주세요.');return;}
  const options={limit:3,...calendarOptions(key)};
  const trains=DepartureCore.nextTrains(schedules,queryNow,options);
  if(!trains.length){stateMessage(body,'empty',p.unavailableReason||(calendarThrough&&date>calendarThrough?'해당 날짜에 적용할 시간표 자료가 없어요. 공식 시간표를 확인해 주세요.':'현재 적용할 다음 열차 시각을 확인할 수 없어요. 공식 시간표를 확인해 주세요.'));return;}
  section._rideTrains=trains;
  const first=trains[0],eventAt=first.departureAt;
  const signature=DepartureCore.renderSignature(trains,now);
  if(body.dataset.signature!==signature){
   body.dataset.signature=signature;
   body.innerHTML=`<button type="button" class="departure-next compact-next" data-ride-next="0" aria-label="${esc(timeLabel(eventAt,now)+' 이 열차 탑승')}"><span class="departure-next-time"><strong>${esc(timeLabel(eventAt,now))}</strong></span><span class="compact-train">출발 · ${esc(first.destination||p.to)}행 · ${esc(trainTypes[first.type]||first.type||'보통')}${first.number?' '+esc(first.number):''}</span><small data-departure-countdown="${eventAt}" role="timer" aria-live="off"></small></button>`;
  }
  body.querySelectorAll('[data-departure-countdown]').forEach(el=>{el.textContent='출발까지 '+DepartureCore.formatCountdown(Number(el.dataset.departureCountdown)-now);});
 }
 function paint(){if(!active?.element.isConnected||document.hidden)return;const now=Date.now();active.element.querySelectorAll('[data-departure-profile]').forEach(section=>renderTrains(section,now));}
 function resumeTimer(){clearInterval(interval);interval=null;if(active&&!document.hidden){paint();interval=setInterval(paint,1000);}}
 function unmount(popup){if(!active||(popup&&active.popup!==popup))return;active.element.removeEventListener('click',active.click);active.element.removeEventListener('change',active.change);active=null;clearInterval(interval);interval=null;}
 function mount(popup){
  unmount();const element=popup.getElement();if(!element?.querySelector('[data-departure-profile]'))return;
  // Retain live DOM when Leaflet remeasures the popup after async data loads.
  if(!popup.getContent()?.nodeType){const content=element.querySelector('.leaflet-popup-content'),node=document.createElement('div');while(content.firstChild)node.appendChild(content.firstChild);popup.setContent(node);}
  const refresh=async(key,force=false)=>{await loadData(key,force);if(active?.popup===popup){paint();popup.update();}};
  const selectProfile=(section,key)=>{
   if(!profiles[key]||!section)return;
   const content=shell(key,section.dataset.serviceDate,JSON.parse(section.dataset.compactMetrics||'{}'));
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
   if(ride){event.stopPropagation();const section=ride.closest('[data-departure-profile]'),key=section?.dataset.departureProfile;if(ride.hasAttribute('data-ride-next')){const train=section?._rideTrains?.[Number(ride.dataset.rideNext)];if(train&&train.departureAt>Date.now())window.RideTracker?.board(key,train.id,train.serviceDate,train.departureAt);else paint();}else window.RideTracker?.open(key);return;}
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
 return {notice,noticeItems,validityFor,travelDate,supported,html,attach,keysFor,keyFor,calendarOptions,getSchedule,cacheInfo:()=>({entries:loaded.size,bytes:loaded.weight,pending:pending.size}),typeLabel:type=>trainTypes[type]||type||'보통'};
})();

// A reading-view departure board. It never changes an itinerary or a boarded train.
window.TripPlanTransport=(()=>{
 if(typeof document.querySelector!=='function')return null;
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const profiles=globalThis.RailDepartureProfiles?.profiles||{};
 const eventLabel=kind=>kind==='arrival'?'도착':kind==='departure'?'출발':'정차';
 const clock=at=>Number.isFinite(at)?new Date(at+32400000).toISOString().slice(11,19).replace(/:00$/,''):'시각 미제공';
 const datedClock=(at,base)=>Number.isFinite(at)?(DepartureCore.japanDate(at)===DepartureCore.japanDate(base)?'':DepartureCore.japanDate(at).slice(5).replace('-','/')+' ')+clock(at):'시각 미제공';
 let dialog=null,config=null,timer=null,observer=null,generation=0,rows=[],visible=new Set();
 const schedules=new Map(),requests=new Map(),normalized=new Map();
 function isKTX(leg){return leg.parts?.some(p=>p.lineId==='KORAIL.GyeongbuHSR');}
 function html(day,variant,leg,index){
  if(!leg)return '';
  if(leg.travel&&leg.parts.some(p=>['flight','ferry'].includes(p.mode))){const t=leg.travel,type=leg.parts.some(p=>p.mode==='flight')?'항공':'선박';return `<li class="plan-transport plan-transport-important" data-plan-travel="${type}"><small>${type} · 계획편</small><strong>${h(t.operator)}</strong><div class="plan-transport-clock">${h(t.depart)} 출발 <span>→</span> ${h(t.arrive)} 도착</div></li>`;}
  const keys=RailDepartures.keysFor(leg);if(!keys.length)return '';
  const fixed=isKTX(leg)?`<div class="plan-fixed-service"><small>KTX · 계획편 참고</small><strong>${h(leg.summary)}</strong><p data-plan-fixed-service>계획편 시각 확인 중…</p></div>`:'';
  return `<li class="plan-transport${fixed?' plan-transport-important':''}" data-plan-rail="${day.n}:${variant.id}:${index}" data-plan-rail-day="${day.n}" data-plan-rail-variant="${h(variant.id)}" data-plan-rail-leg="${index}">${fixed}<div class="plan-rail-route">${h(TripPersonal.station(leg.from))} → ${h(TripPersonal.station(leg.to))}</div><div data-plan-rail-body><small>시간표 확인 중…</small></div></li>`;
 }
 function contextLeg(row){const c=config?.context(),day=Number(row.dataset.planRailDay),variant=row.dataset.planRailVariant;return c?.routes?.days?.[`${day}-${variant}`]?.[Number(row.dataset.planRailLeg)];}
 function normalizedFor(key,date){const id=key+'|'+date;if(!normalized.has(id)){const p=profiles[key];normalized.set(id,RideCore.trainsForDate(schedules.get(key),date,{...RailDepartures.calendarOptions(key),fromName:p.from,toName:p.to}));while(normalized.size>24)normalized.delete(normalized.keys().next().value);}return normalized.get(id);}
 function next(key,at){
  if(!Number.isFinite(at))return {status:'unknown-start'};
  if(!schedules.has(key))return {status:'connection-loading'};
  if(!schedules.get(key))return {status:'connection-error'};
  const date=RideCore.serviceDateForNow(at),valid=RailDepartures.validityFor(key,date);if(!valid.usable)return {status:'invalid-connection'};
  const start=Date.parse(DepartureCore.japanDate(at)+'T00:00:00+09:00'),trains=[];
  for(let offset=-1;offset<=2;offset++){const d=DepartureCore.japanDate(start+offset*86400000);if(RailDepartures.validityFor(key,d).usable)trains.push(...normalizedFor(key,d).filter(t=>t.departureAt>at));const boundary=RailDepartures.calendarOptions(key).serviceDayHour??3;if(trains.length&&Math.min(...trains.map(t=>t.departureAt))<start+(offset+1)*86400000+boundary*3600000)break;}
  trains.sort((a,b)=>a.departureAt-b.departureAt||a.id.localeCompare(b.id));return trains[0]?{status:'ready',train:trains[0]}:{status:'connection-empty'};
 }
 function neededKeys(leg){return RailDepartures.keysFor(leg);}
 function load(key){
  if(schedules.has(key))return Promise.resolve();if(requests.has(key))return requests.get(key);
  const epoch=generation,task=RailDepartures.getSchedule(key).then(data=>{if(epoch===generation&&[...visible].some(row=>neededKeys(contextLeg(row)||{parts:[]}).includes(key)))schedules.set(key,data);}).finally(()=>{if(requests.get(key)===task)requests.delete(key);});requests.set(key,task);return task;
 }
 const messages={'unknown-start':'일정 출발 시각 미확정','unknown-access':'승차역 접근 시간 확인 필요','unknown-arrival':'앞 열차 하차 시각 미제공','outside-route':'연결 구간 확인 필요','invalid-connection':'이 날짜의 시간표 갱신 필요','connection-loading':'시간표 확인 중…','connection-error':'시간표를 불러오지 못했어요.','connection-empty':'다음 편 시각 미제공'};
 function trainHtml(key,result,now){
  const p=profiles[key];if(result.status!=='ready')return `<div class="plan-rail-segment"><small>${h(p.line)} · ${h(messages[result.status]||'시각 확인 필요')}</small>${result.status==='connection-error'?'<button type="button" data-plan-rail-retry>다시 불러오기</button>':''}</div>`;
  const t=result.train,r=result.reference,type=RailDepartures.typeLabel(t.type),name=t.number&&String(t.number).includes(type)?String(t.number):[type,t.number].filter(Boolean).join(' '),destination=Number.isFinite(t.destinationAt)?`${datedClock(t.destinationAt,t.departureAt)} ${eventLabel(t.destinationEventKind)}`:'하차역 시각 미제공';
  const source=t.stopTimeBasis==='estimated'?' · 하차 시각 추정':'';
  return `<div class="plan-rail-segment" data-plan-train-id="${h(t.id)}" data-plan-departure="${t.departureAt}"><small>${h(p.line)} · ${h(r.label)}</small><div class="plan-next-train"><strong>${h(datedClock(t.departureAt,r.startAt))} 출발</strong><span>${h(name)} · ${h(t.destination||p.to)}행</span></div><p>${h(p.to)} ${h(destination)}${h(source)}</p><div class="plan-rail-actions">${r.live?`<small data-plan-countdown="${t.departureAt}"></small>`:'<small>여행일 참고</small>'}<button type="button" data-plan-timetable="${h(key)}" data-plan-timetable-date="${h(t.serviceDate)}">전체 시간표</button></div></div>`;
 }
 function paintRow(row,now){
  if(!row.isConnected)return;const leg=contextLeg(row);if(!leg)return;
  const reference={startAt:now,live:true,label:'지금 기준'},keys=RailDepartures.keysFor(leg),results=keys.map(key=>({...next(key,now),reference}));
  const fixed=row.querySelector('[data-plan-fixed-service]');if(fixed&&keys[0]&&schedules.has(keys[0])&&!schedules.get(keys[0]))fixed.textContent='계획편 시각을 불러오지 못했어요.';if(fixed&&keys[0]&&schedules.get(keys[0])){const key=keys[0],number=/(?:KTX[^\d]*)(\d+)/i.exec(leg.summary||'')?.[1],train=normalizedFor(key,leg.serviceDate).find(t=>String(t.number)===number);fixed.textContent=train?`${clock(train.departureAt)} 출발 → ${clock(train.destinationAt)} ${eventLabel(train.destinationEventKind)}`:'계획편 시각 확인 필요';}
  const body=row.querySelector('[data-plan-rail-body]'),signature=JSON.stringify(results.map(r=>[r.status,r.train?.id,r.train?.departureAt,r.reference?.label]));
  if(body.dataset.signature!==signature){body.dataset.signature=signature;body.innerHTML=results.map((r,i)=>trainHtml(keys[i],r,now)).join('');}
  body.querySelectorAll('[data-plan-countdown]').forEach(n=>{n.textContent='출발까지 '+DepartureCore.formatCountdown(Number(n.dataset.planCountdown)-now);});
 }
 function prune(){const needed=new Set([...visible].flatMap(row=>neededKeys(contextLeg(row)||{parts:[]})));for(const key of schedules.keys())if(!needed.has(key)){schedules.delete(key);for(const id of normalized.keys())if(id.startsWith(key+'|'))normalized.delete(id);}}
 function tick(){
  if(!dialog?.open||document.hidden)return;const now=Date.now(),clockNode=dialog.querySelector('[data-plan-transport-clock]');if(clockNode)clockNode.textContent='지금 기준 · '+new Date(now+32400000).toISOString().slice(5,19).replace('-','/').replace('T',' ')+' · 시간표 기준·지연 미반영';
  for(const row of visible){const leg=contextLeg(row);if(!leg)continue;paintRow(row,now);const missing=neededKeys(leg).filter(k=>!schedules.has(k));if(missing.length){const epoch=generation;Promise.all(missing.map(load)).then(()=>{if(epoch===generation&&visible.has(row)&&dialog?.open&&!document.hidden)paintRow(row,Date.now());}).catch(()=>{});}}
 }
 function stop(){generation++;clearInterval(timer);timer=null;observer?.disconnect();observer=null;visible.clear();rows=[];schedules.clear();requests.clear();normalized.clear();}
 function mount(root,options){
  stop();dialog=root;config=options;if(!dialog.open)return;rows=[...dialog.querySelectorAll('[data-plan-rail]')];
  const scroller=getComputedStyle(dialog).overflowY==='auto'?dialog:dialog.querySelector('#tripPlanBody');
  if('IntersectionObserver'in window){observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!rows.includes(entry.target))continue;entry.isIntersecting?visible.add(entry.target):visible.delete(entry.target);}prune();tick();},{root:scroller,rootMargin:'160px 0px'});rows.forEach(row=>observer.observe(row));}
  else{rows.forEach(row=>visible.add(row));}
  tick();timer=setInterval(tick,1000);
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-plan-timetable]');if(button&&dialog?.contains(button)){config?.openTimetable?.(button.dataset.planTimetable,button.dataset.planTimetableDate,Number(button.closest('[data-plan-rail]').dataset.planRailDay),button.closest('[data-plan-rail]').dataset.planRailVariant);return;}
  const retry=event.target.closest('[data-plan-rail-retry]');if(retry&&dialog?.contains(retry)){const leg=contextLeg(retry.closest('[data-plan-rail]'));for(const key of neededKeys(leg)){schedules.delete(key);for(const id of normalized.keys())if(id.startsWith(key+'|'))normalized.delete(id);}tick();}
 });
 document.addEventListener('visibilitychange',()=>{clearInterval(timer);timer=null;if(dialog?.open&&!document.hidden){tick();timer=setInterval(tick,1000);}});
 window.addEventListener('resize',()=>{if(dialog?.open)mount(dialog,config);});
 window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{if(dialog?.open)mount(dialog,config);});
 window.addEventListener('routebook:online',()=>{if(dialog?.open){for(const [key,value]of schedules)if(!value)schedules.delete(key);tick();}});
 return {html,mount,stop};
})();
