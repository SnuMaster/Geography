'use strict';
const ICON_PATHS={
 locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 moon:'<path d="M20.5 13.5A9 9 0 0 1 10.5 3a9 9 0 1 0 10 10.5Z"/>',
 link:'<path d="m10 13 4-4M8.5 16.5l-2 2a4 4 0 0 1-5.5-5.5l4-4a4 4 0 0 1 5.5 0m3 6a4 4 0 0 0 5.5 0l4-4A4 4 0 0 0 17.5 5l-2 2" transform="translate(1 -1) scale(.9)"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 chevronLeft:'<path d="m15 6-6 6 6 6"/>',chevronRight:'<path d="m9 6 6 6-6 6"/>',
 arrowLeft:'<path d="M20 12H4m6-6-6 6 6 6"/>',arrowRight:'<path d="M4 12h16m-6-6 6 6-6 6"/>',arrowUpRight:'<path d="M6 18 18 6M6 6h12v12"/>',
 play:'<path d="m8 4 12 8-12 8z"/>',pause:'<path d="M8 5v14M16 5v14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 walk:'<circle cx="14" cy="4" r="2"/><path d="m7 9 4-2 4 3h4M11 7l-2 7 5 2 2 6M9 14l-4 7"/>',
 rail:'<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 10h14M9 18l-3 4m9-4 3 4M9 14h.01M15 14h.01M12 3v7"/>',
 bus:'<rect x="4" y="4" width="16" height="15" rx="3"/><path d="M4 11h16M8 19v2m8-2v2M8 15h.01M16 15h.01"/>',
 flight:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
 ferry:'<path d="M12 3v5M7 8h10v4l4 2-4 6H7l-4-6 9-4 9 4M3 22l3-1 3 1 3-1 3 1 3-1 3 1"/>',
 taxi:'<path d="m5 8 2-4h10l2 4M3 10h18v9H3zM6 19v2m12-2v2M6 14h1m10 0h1"/>',
 coffee:'<path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 9h2a3 3 0 1 1 0 6h-2M7 3v2m5-2v2M2 23h18"/>',
 star:'<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3.2 9.6l6.3-.9z"/>'
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[n]||ICON_PATHS.pin}</svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
icons();
const MODE={walk:{label:'도보',color:'#49765d',icon:'walk'},metro:{label:'지하철',color:'#477b95',icon:'rail'},rail:{label:'철도',color:'#477b95',icon:'rail'},bus:{label:'버스',color:'#477b95',icon:'bus'},taxi:{label:'Uber Taxi',color:'#477b95',icon:'taxi'},flight:{label:'비행기',color:'#c97a4c',icon:'flight'},ferry:{label:'배',color:'#a67a5a',icon:'ferry'}};
const state={selectedVariantByDay:{},data:null,day:1,variant:'main',view:'daily',filter:'all',search:'',night:false,selected:-1,playing:null,routeData:null,passEnabled:false,pass:{enabled:false,kind:'physical',startAt:null,purchased:false}};
let screenGeneration=0;
const tripFiles=['data.json','tokyo-data.json','tokyo-routes.json','west-data.json','west-routes.json'];
let tripSignature='',tripRefresh=null;
const journeyStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
let tileProvider='',tilePreference='auto',flightPreviousProvider=null;const failedTileProviders=new Set();try{tilePreference=localStorage.getItem('routebook-map-provider')||'auto';}catch(_){}
let map, tiles, routeLayer, markers=[],legLines=[],stopGroups=[],arrows=[],overviewFocus=null,overviewMoveFrame=null,overviewRendering=false,overviewContext=null;
const isNight=s=>s.kind==='sight'&&/야경|조명|등불|네온|겨울 조명|밤거리|밤바다|노을/.test(s.name+' '+s.description);
const getDay=()=>state.data.days.find(d=>d.n===state.day);
const getVariant=()=>getDay().variants.find(v=>v.id===state.variant)||getDay().variants[0];
const getStops=()=>getVariant().stops;
const getLeg=i=>state.routeData?.days?.[`${state.day}-${getVariant().id}`]?.[i-1]||null;
const hasDetailedRoutes=()=>!!state.routeData?.days?.[`${state.day}-${getVariant().id}`];
const distanceText=m=>m>=1000?`${(m/1000).toFixed(1)} km`:`${Math.round(m)} m`;
const fareOptions=(enabled=state.passEnabled)=>({pass:{...state.pass,enabled},day:state.day});
const fareText=(f,leg)=>FareCore.format(f,leg,fareOptions());
function dailyCost(n=state.day,id=null,pass=state.passEnabled){return FareCore.summarize(state.routeData?.days?.[`${n}-${id||JourneyState.chosen(state.data.days.find(d=>d.n===n),state.selectedVariantByDay)}`]||[],{...fareOptions(pass),day:n});}
function costSummary(n=state.day,id=null,pass=state.passEnabled){const c=dailyCost(n,id,pass),r=c.variableJPY;return `${c.ic.toLocaleString()}엔${c.krw?' + '+c.krw.toLocaleString()+'원':''}${r.max?' + 예상 '+r.min.toLocaleString()+'~'+r.max.toLocaleString()+'엔':''}${c.variableKRW.max?' + 원화 예상 별도':''}${c.unknown?' + 미확인 '+c.unknown+'구간':''}`;}
function passEditor(){const w=FareCore.passWindow(state.pass),value=w.startAt===null?'':new Date(w.startAt+9*3600000).toISOString().slice(0,16);return `<fieldset class="pass-editor"><legend>Tokyo Subway Ticket · 72시간</legend><label class="pass-toggle"><input id="passToggle" type="checkbox" ${state.passEnabled?'checked':''}>패스 운임 비교·적용</label><label>권종<select id="passKind"><option value="physical" ${state.pass.kind==='physical'?'selected':''}>실물권 · 첫 개찰부터</option><option value="qr" ${state.pass.kind==='qr'?'selected':''}>QR · 첫 개찰부터</option><option value="pasmo" ${state.pass.kind==='pasmo'?'selected':''}>PASMO IC형 · 구매부터</option></select></label><label>${state.pass.kind==='pasmo'?'구매 시각':'첫 개찰 시각'} (일본)<input id="passStart" type="datetime-local" value="${value}"></label><label><input id="passPurchased" type="checkbox" ${state.pass.purchased?'checked':''}>구매 완료 · 2,000엔 별도 합산</label><p role="status">${w.expiresAt?'만료 '+new Date(w.expiresAt+9*3600000).toISOString().slice(0,16).replace('T',' ')+' JST':'사용 시작 미설정 · 가상 비교 (실제 적용 상태 아님)'}</p><small>이 계산은 일정 예정 승차 시각 기준입니다. 실제 승차가 유효시간 경계를 넘으면 현장에서 다시 확인하세요. 메트로·도에이만 대상. JR·사철·모노레일·공항철도·버스 제외. 첫 승차 전 구매·교환 필요. IC형은 EX예약 이용 등 구매 자격 제한이 있으니 공식 조건 확인.</small><a href="https://www.tokyometro.jp/ticket/value/travel/index.html" target="_blank" rel="noopener">공식 권종·구매 조건 ↗</a></fieldset>`;}
function savePass(){try{localStorage.setItem('routebook-pass-v2',JSON.stringify(state.pass));}catch(_){}}
function bindPass(){for(const id of ['passToggle','passKind','passStart','passPurchased'])$('#'+id)?.addEventListener('change',()=>{state.pass.enabled=state.passEnabled=$('#passToggle').checked;state.pass.kind=$('#passKind').value;const value=$('#passStart').value;state.pass.startAt=value?Date.parse(value+':00+09:00'):null;state.pass.purchased=$('#passPurchased').checked;savePass();preserveDetails(()=>{renderHeader();renderStops();});renderMap(false);});}
function preserveDetails(render){const focusId=document.activeElement?.id,nodes=[...document.querySelectorAll('#dayHeader details,#stopList details,#routeDetails details')],open=nodes.filter(n=>n.open).map(n=>n.closest('[data-stop]')?'stop:'+n.closest('[data-stop]').dataset.stop+':'+n.className:'class:'+n.className),scroll=$('#itineraryScroll').scrollTop,y=scrollY;render();for(const n of document.querySelectorAll('#dayHeader details,#stopList details,#routeDetails details')){const key=n.closest('[data-stop]')?'stop:'+n.closest('[data-stop]').dataset.stop+':'+n.className:'class:'+n.className;if(open.includes(key))n.open=true;}$('#itineraryScroll').scrollTop=scroll;window.scrollTo({top:y,behavior:'instant'});if(focusId&&!document.activeElement?.id)document.getElementById(focusId)?.focus({preventScroll:true});}
function fareDetails(f){if(!f)return '';return `<div class="fare-proof"><b>${f.confidence==='official-current'?'공식 현재 운임 · 여행 전 재확인':f.status==='exact'?'검색 확인 운임 · 여행 전 재확인':f.status==='selectedQuote'?'이전 선택 견적':f.status==='publishedTariff'?'현재 공시 요금':'변동·확인 필요'}</b>${f.icYen!=null&&f.currency==='JPY'&&f.status==='exact'?`<p>IC ${f.icYen.toLocaleString()}엔 · 종이표 ${(f.paperTicketYen??f.icYen).toLocaleString()}엔</p>`:''}<p>${esc(f.basis)}</p>${(f.breakdown||[]).map(g=>`<div>${esc(g.fromJa||g.from||g.from_)} → ${esc(g.toJa||g.to)} <strong>${(g.icYen??0).toLocaleString()}엔</strong></div>`).join('')}</div>`;}
function stationLabel(v){return window.TripPersonal?.station(v)||v;}function stopLabel(s){return window.TripPersonal?.stopName(s)||s.name;}function serviceLogo(p){return airlineLogo(p)||operatorLogo(p);}
function travelHtml(leg){const t=leg.travel;return `${airlineLogo(leg.parts[0],'airline-popup-logo')}<div class="popup-time">${icon(leg.parts[0].mode)} ${esc(t.operator)}</div><div class="popup-title">${esc(leg.from)} → ${esc(leg.to)}</div><div class="travel-clock"><span><small>출발</small><b>${esc(t.depart)}</b></span><span>→</span><span><small>도착</small><b>${esc(t.arrive)}</b></span></div><div class="travel-fare">${esc(leg.durationLabel)} · ${esc(fareText(leg.fare,leg))}</div>${fareDetails(leg.fare)}${window.FlightPlayback?.button(leg)||''}${window.FlightPlayback?.provenanceHtml(leg)||''}<p class="geometry-note">${esc((leg.parts.find(p=>!p.suppressSymbol)||leg.parts[0]).geometrySource)}${t.geometryNotice?'<br>'+esc(t.geometryNotice):''}</p><p class="geometry-note">${esc(t.notice)}</p><div class="popup-links"><a href="${esc(t.source)}" target="_blank" rel="noopener">공식 안내 ↗</a></div>`;}

function costText(s){const d=s.details;if(!d)return '';if(!Number.isFinite(d.costMin)||!Number.isFinite(d.costMax))return d.costLabel||'비용 미확인';return d.costLabel||(d.costMin===0&&d.costMax===0?'무료':d.costMin===d.costMax?`${d.costMin.toLocaleString()}엔`:`${d.costMin.toLocaleString()}~${d.costMax.toLocaleString()}엔`);}
function stayText(s){const matches=[...s.time.matchAll(/(\d{1,2}):(\d{2})/g)];if(s.kind!=='hotel'&&matches.length===2){const mins=(Number(matches[1][1])-Number(matches[0][1]))*60+Number(matches[1][2])-Number(matches[0][2]);if(mins>=0&&mins<720)return mins>=60?`${Math.floor(mins/60)}시간${mins%60?' '+mins%60+'분':''}`:`${mins}분`;}return s.details.stayLabel||s.details.typicalStayMin+'분';}
function placeFacts(s){const d=s.details;if(!d)return '';return `<div class="place-facts"><span>${icon('calendar')}체류 ${esc(stayText(s))}</span><span>${icon('star')}${esc(costText(s))}</span></div>`;}
function fukuokaPassHtml(){const legs=state.routeData.days['18-main']||[],ic=legs.filter(l=>l?.parts.some(p=>p.lineId==='West.FK'||p.lineId==='West.FN')).reduce((n,l)=>n+(l.fare?.min||0),0);return `<section class="reservation-info"><h3>공항역 첫 승차 전 · 1일권 비교</h3><p>공식 현재 성인640엔 · 공항·하코자키·나나쿠마선. 각 역 발매기에서 개찰 전에 구매. 발매기권은 구매 당일 첫차~막차, JR·니시테쓰 제외.</p><p>오늘 대상 IC합계${ic.toLocaleString()}엔 / 1일권640엔 / 절약${Math.max(0,ic-640).toLocaleString()}엔. 공항역에서 첫 승차 전 구매해야 공항→하카타도 포함됩니다.</p><a href="https://subway.city.fukuoka.lg.jp/fare/card/oneday.php" target="_blank" rel="noopener">공식1일권 ↗</a></section>`;}
function detailHtml(s,popup=false){const d=s.details;if(!d)return '';const sources=(d.sources||[]).filter(u=>/^https?:\/\//.test(u));return `<div class="place-detail-content"><div class="detail-section"><b>특징</b><p>${esc(d.feature||cleanDesc(s))}</p></div><div class="detail-section"><b>할 것</b><ul>${(d.thingsToDo||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div><div class="detail-section"><b>비용</b><p>${esc(costText(s))}<small class="cost-confidence">${esc(({ 'official-current':'공식 현재 요금 · 여행 전 재확인','historical-official':'과거 공식 자료',estimate:'예상 범위',unknown:'미확정','source-reference':'자료 참고 · 여행 전 재확인'})[d.costConfidence]||'자료 참고 · 여행 전 재확인')}</small>${d.costNote?` · ${esc(d.costNote)}`:''}</p></div>${d.hours?`<div class="detail-section"><b>영업시간·운영</b><p>${esc(d.hours)}</p></div>`:''}${d.soloNote?`<div class="detail-section"><b>1인 이용</b><p>${esc(d.soloNote)}</p></div>`:''}${s.timeConfidence==='target'?'<p class="timetable-warning">목표 회차 · 예약 확정 아님</p>':''}${s.reservationKey?ReservationUI.html(s.reservationKey,{popup,timing:s.reservationTiming}):''}${s.fukuokaPassInfo?fukuokaPassHtml():''}${d.reservationNote?`<div class="detail-section"><b>예약·방문 팁</b><p>${esc(d.reservationNote)}</p></div>`:''}${sources.length?`<div class="detail-source-links">${sources.slice(0,3).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">공식·참고 안내 ${i+1} ↗</a>`).join('')}</div>`:''}</div>`;}
function legDirectionsUrl(leg){const first=leg.parts[0].coords[0],last=leg.parts.at(-1).coords.at(-1);const a=getStops().find(s=>s.uid===leg.fromUid)||{lat:first[0],lng:first[1]},b=getStops().find(s=>s.uid===leg.toUid)||{lat:last[0],lng:last[1],modeFromPrevious:leg.parts[0].mode};return directionsUrl(a,b);}
function legHtml(leg,part=null){if(leg.travel)return travelHtml(leg);const walk=part&&['walk','transfer'].includes(part.mode);const partFare=walk?'도보·환승 추가 0엔':fareText(leg.fare,leg);const departures=RailDepartures.html(leg.dayNumber||state.day,leg,part);return `${departures}<button type="button" class="outline-button" data-location-set="${leg.legIndex-1}" data-day="${leg.dayNumber}" data-variant="${esc(leg.variant)}">현재 이동 구간으로 설정</button><div class="popup-time"><span class="popup-line-badges">${part?railBadge(part):railLegBadges(leg)}</span>${esc(part?.line||leg.summary)}</div><div class="popup-title">${esc(stationLabel(part?part.from:leg.from))} → ${esc(stationLabel(part?part.to:leg.to))}</div><div class="route-metrics"><span><small>${part?'선택한 선 거리':'전체 구간 거리'}</small><b>${distanceText(part?part.distanceM:leg.distanceM)}</b></span><span><small>${walk?'선택한 선 요금':'환승 포함 구간 총운임'}</small><b>${esc(partFare)}</b></span></div><div class="popup-desc">전체 이동 ${esc(leg.durationLabel)} · 총 ${distanceText(leg.distanceM)}<br>${esc(leg.summary)}</div>${part&&walk&&leg.fare.max>0?`<p class="route-fare-note">철도 포함 전체 구간 운임: ${esc(fareText(leg.fare,leg))}</p>`:''}${fareDetails(leg.fare)}<p class="route-fare-note">${state.passEnabled&&state.day<=11?' · 72시간권 '+(FareCore.passWindow(state.pass).simulation?'가상 비교 · ':'')+'구입비 2,000엔 별도':''}</p>${part?.throughService||leg.parts.some(p=>p.lineId==='Special.Direct')?'<p class="through-service-note">직통 열차입니다. 노선 색이 바뀌는 경계에서도 내리지 않고 계속 탑승합니다.</p>':''}<details class="route-part-list"><summary>도보·노선·환승 순서</summary>${railParts(leg).map(p=>`<div>${railBadge(p)}<span><b>${esc(p.line)}</b><br>${esc(p.from)} → ${esc(p.to)} · ${distanceText(p.distanceM)}</span></div>`).join('')}</details><p class="geometry-note">${(part?railInfo(part)?.colorUnknown:leg.parts.some(p=>railInfo(p)?.colorUnknown))?'노선색 미확인 · ':''}${esc(TripData.geometry(part||leg.parts[0]).label)} · ${esc(part?.geometrySource||leg.note)}</p><div class="popup-links"><a href="${legDirectionsUrl(leg)}" target="_blank" rel="noopener">출구·출발시각 길찾기 ↗</a>${(leg.fare.sources||[]).slice(0,1).map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">운임 안내 ↗</a>`).join('')}</div>`;}
function applyTokyoData(base,tokyo){
 const arrival=base.days[0],original=arrival.variants[0];
 const prefix=original.stops.slice(0,8).map((s,i)=>({...s,uid:`d1-main-${i}`,id:`d1-main-${i}`}));
 for(const patch of tokyo.arrival.prefixDetails){Object.assign(prefix[patch.index],patch);delete prefix[patch.index].index;}
 const variant={...original,...tokyo.arrival.variant,stops:[...prefix,...tokyo.arrival.variant.stops],schedule:[...prefix.map(s=>[s.time,s.name,s.description]),...tokyo.arrival.variant.schedule]};
 Object.assign(arrival,tokyo.arrival.day,{variants:[variant],schedule:variant.schedule,rows:variant.schedule});
 base.days.splice(1,10,...tokyo.days);Object.assign(base.food,tokyo.food);
 base.nightRows=[...tokyo.nightRows,...base.nightRows.filter(r=>Number(r[0].split('/')[1])>=19)];
 base.version=tokyo.version;base.tokyoUpdatedAt=tokyo.updatedAt;base.otherRegionsVersion='2026-10-23';return base;
}
function applyWestData(base,west){
 const patch=new Map(west.days.map(d=>[d.n,d]));base.days=base.days.map(d=>patch.get(d.n)||d);
 Object.assign(base.food,west.food);base.nightRows=[...base.nightRows.filter(r=>Number(r[0].split('/')[1])<19||Number(r[0].split('/')[1])>27),...west.nightRows];
 base.westUpdatedAt=west.updatedAt;base.version=west.version;return base;
}
async function loadFlightRouteReferences(){try{return await TravelStore.readJson('flight-route-overrides.json?v='+TravelStore.VERSION,{timeout:6000,preferCache:true});}catch(_){return null;}}
function applyFlightRouteReferences(routes,payload){
 const distance=window.FlightPlayback?.core?.distance;
 if(!routes?.days||!Array.isArray(payload?.flights)||typeof distance!=='function')return routes;
 const point=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=85&&Math.abs(p[1])<=180;
 const references=payload.flights.filter(r=>r&&typeof r.id==='string'&&typeof r.flightNumber==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.referenceDate||'')&&Array.isArray(r.airportReferenceCoordinates)&&r.airportReferenceCoordinates.length===2&&r.airportReferenceCoordinates.every(point)&&Array.isArray(r.coords)&&r.coords.length>=2&&r.coords.every(point)&&Number.isFinite(r.distanceM)&&r.distanceM>0&&typeof r.geometrySource==='string'&&typeof r.geometryNotice==='string'&&['screen-reference','recorded-reference'].includes(r.flightTrack?.status)&&r.flightTrack.flightNumber===r.flightNumber&&r.flightTrack.referenceDate===r.referenceDate&&typeof r.flightTrack.sourceUrl==='string'&&/^https:\/\//.test(r.flightTrack.sourceUrl)&&distance(r.coords[0],r.airportReferenceCoordinates[0])<=10000&&distance(r.coords.at(-1),r.airportReferenceCoordinates[1])<=10000);
 for(const legs of Object.values(routes.days)){
  if(!Array.isArray(legs))continue;
  for(const leg of legs){
   if(!Array.isArray(leg?.parts))continue;
   const notices=[];let changed=false;
   for(const part of leg.parts){
    if(part?.mode!=='flight'||!Array.isArray(part.coords)||!point(part.coords[0])||!point(part.coords.at(-1)))continue;
    // Match public airport geometry only; schedule, fare, and flight selection stay in the itinerary.
    const matches=references.filter(r=>distance(part.coords[0],r.airportReferenceCoordinates[0])<=10000&&distance(part.coords.at(-1),r.airportReferenceCoordinates[1])<=10000);
    if(matches.length!==1)continue;
    const reference=matches[0];
    part.coords=reference.coords.map(p=>[p[0],p[1]]);part.distanceM=reference.distanceM;
    part.source=reference.flightTrack.sourceUrl;part.geometrySource=reference.geometrySource;part.flightTrack={...reference.flightTrack};
    notices.push(reference.geometryNotice);changed=true;
   }
   if(changed){
    if(leg.parts.every(p=>Number.isFinite(p?.distanceM))){leg.distanceM=Math.round(leg.parts.reduce((total,p)=>total+p.distanceM,0));leg.distanceLabel=`참고 항로 약 ${Math.round(leg.distanceM/1000).toLocaleString()} km`;}
    if(leg.travel&&typeof leg.travel==='object')leg.travel.geometryNotice=[...new Set(notices)].join(' ');
   }
  }
 }
 return routes;
}
function selectLeg(i){window.RouteLocation?.pauseFollow();hideRailHover();const leg=getLeg(i);if(!leg)return;pausePlay();window.FlightPlayback?.pause();map.stop();const coords=leg.parts.flatMap(p=>p.coords);map.fitBounds(L.latLngBounds(coords),{padding:[50,80],maxZoom:16,animate:false});highlightDirection(leg);const middle=coords[Math.floor(coords.length/2)];L.popup(DetailView.options('route-info-popup',{routeLegIndex:i,routeDay:leg.dayNumber,routeVariant:leg.variant,interactionSource:'user'})).setLatLng(middle).setContent(legHtml(leg)).openOn(map);}


const modesIn=stops=>[...new Set(stops.slice(1).map(s=>s.modeFromPrevious))];
const kindLabel=k=>({hotel:'숙소',sight:'관광',food:'식사',cafe:'카페',station:'역·환승',airport:'공항',port:'항구'}[k]||'방문');
function mapUrl(s){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.lat+','+s.lng)}`;}
function directionsUrl(a,b){let mode=b.modeFromPrevious==='walk'?'walking':b.modeFromPrevious==='taxi'?'driving':'transit';return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;}
function announce(t){const el=$('#toast');el.textContent=t;el.classList.add('visible');clearTimeout(announce.timer);announce.timer=setTimeout(()=>el.classList.remove('visible'),2500);}
function cleanDesc(s){return s.description.replace(/지도상 대표 지점\. 실제 출입구는 현장 안내를 확인한다\.?/g,'').replace(/지도점은 주소 기준점으로 실제 출입구와 다를 수 있다\.?/g,'').replace(/주소의 블록 대표 좌표이며 실제 매장 입구와 다를 수 있음\.?/g,'').trim();}

function renderDays(){
 const results=JourneyState.search(state.data.days,state.search,state.selectedVariantByDay,state.filter,state.routeData.days);
 if(state.search){
  $('#dayList').innerHTML=results.map((r,index)=>{const d=state.data.days.find(d=>d.n===r.day),v=d.variants.find(v=>v.id===r.variant);return `<button class="day-item search-result" data-search-result="${index}" data-result-day="${r.day}" data-result-variant="${esc(r.variant)}" data-place-id="${esc(r.placeId||'')}" aria-label="${esc(d.date+' '+(v.label||v.title)+' '+r.time+' '+r.label)}"><div class="day-date">${d.date.slice(3)}<small>JAN · ${d.weekday}</small></div><div><div class="day-caption">${esc(r.label)}</div><div class="day-city">${esc(r.time===d.date?d.date:d.date+' · '+r.time)}<br>${esc(v.label||v.title)}</div></div></button>`;}).join('')||'<div class="empty-search">검색한 일정이 없어요.<br>날짜나 장소 이름으로 찾아보세요.</div>';
  $$('#dayList [data-search-result]').forEach(b=>b.addEventListener('click',()=>{const r=results[Number(b.dataset.searchResult)];navigateScreen({day:r.day,variant:r.variant,view:'daily',placeId:r.placeId},{revealPlace:true});if(r.type==='leg'){selectLeg(r.legIndex);const card=$(`[data-leg="${r.legIndex}"]`);card?.classList.add('search-highlight');card?.scrollIntoView({block:'center',behavior:'instant'});}}));
 }else{
  const days=state.data.days.filter(d=>state.filter==='all'||d.group===state.filter||d.n===state.day);let prev='';
  $('#dayList').innerHTML=days.map(d=>{let h='';const v=d.variants.find(v=>v.id===JourneyState.chosen(d,state.selectedVariantByDay)),label=MapPlan.label(d,v);return h+`<button class="day-item ${d.n===state.day&&state.view==='daily'?'active':''}" data-day="${d.n}" aria-label="1월 ${d.date.slice(3)}일 ${esc(label.city+' · '+label.places)}" ${d.n===state.day&&state.view==='daily'?'aria-current="date"':''}><div class="day-date">${d.date.slice(3)}<small>JAN · ${d.weekday}</small></div><div><div class="day-caption">${esc(label.city)}</div><div class="day-city">${esc(label.places)}</div></div></button>`;}).join('');
  $$('#dayList [data-day]').forEach(b=>b.addEventListener('click',()=>setDay(Number(b.dataset.day))));
 }
 if(!state.search&&innerWidth<=740&&state.view==='daily'){const list=$('#dayList'),active=list.querySelector('.day-item.active');if(active){const a=active.getBoundingClientRect(),b=list.getBoundingClientRect();list.scrollLeft+=a.left-b.left-(b.width-a.width)/2;}}
 $$('#cityFilters button').forEach(b=>(b.classList.toggle('active',b.dataset.city===state.filter),b.setAttribute('aria-pressed',String(b.dataset.city===state.filter))));
}
function reservationWarningsHtml(v){return v.reservationWarnings?.length?`<section class="reservation-alert" role="status"><strong>예약 시각·연결 일정 확인 필요</strong><ul>${v.reservationWarnings.map(w=>`<li><b>${esc(w.name)}</b> · ${esc(w.message)}</li>`).join('')}</ul></section>`:'';}
function renderHeader(){
 $('.day-pagination').hidden=false;
 const d=getDay(),v=getVariant(),stops=v.stops,c=dailyCost(),last=stops.at(-1),ret=v.returnTarget||(last?.time||'');
 $('#dailyView').classList.toggle('active',state.view==='daily');$('#overviewView').classList.toggle('active',state.view==='overview');
 $('#nightBtn').setAttribute('aria-pressed',state.night);$('#nightBtn').disabled=state.view==='overview';$('#nightSetting').disabled=state.view==='overview';$('#nightSetting').setAttribute('aria-pressed',String(state.night));$('#dailyView').setAttribute('aria-pressed',String(state.view==='daily'));$('#overviewView').setAttribute('aria-pressed',String(state.view==='overview'));
 $('#mapTitle').innerHTML=`<div class="map-kicker">${esc(d.date)} ${d.weekday} · ${esc(MapPlan.label(d,v).city)}</div>`;
 $('#dayHeader').innerHTML=`<div class="detail-date-row"><span class="detail-date">2027.${d.date.replace('/','.')} · ${d.weekday}요일</span><span class="detail-badge">DAY ${String(d.n).padStart(2,'0')}</span></div><h2>${esc(v.title||d.shortTitle)}</h2>${d.variants.length>1?`<div class="variant-tabs" role="group" aria-label="${esc(d.date)} 일정 선택">${d.variants.map(a=>`<button data-variant="${a.id}" class="${state.variant===a.id?'active':''}" aria-pressed="${state.variant===a.id}">${esc(a.label||a.title||a.id)}</button>`).join('')}</div>`:''}<div class="day-glance"><div><small>숙소 복귀</small><strong>${esc(ret)}</strong></div><div><small>하루 시내·근교 교통</small><strong>${esc(costSummary())}</strong></div></div><div class="breakfast-note">${icon('coffee')} ${esc(d.breakfast||'아침: 편의점 간단식')}<span>${c.extras.map(l=>`${l.parts[0].mode==='flight'?'항공':'선박'} ${fareText(l.fare,l)} 별도`).join(' · ')}</span></div><details class="day-tools"><summary>교통비 계산·노선 보기</summary><p>성인 1인 편도 합계 · 2026.10 검색 기준. 여행일 운임 변경 가능.</p><p>정액 IC ${dailyCost(state.day,null,false).ic.toLocaleString()}엔 / 종이표 ${dailyCost(state.day,null,false).paper.toLocaleString()}엔${c.krw?' · 원화 정액 '+c.krw.toLocaleString()+'원':''}</p><p>${c.variableJPY.max?'변동 교통 예상 '+c.variableJPY.min.toLocaleString()+'~'+c.variableJPY.max.toLocaleString()+'엔 · 전체 예상 '+(c.ic+c.variableJPY.min).toLocaleString()+'~'+(c.ic+c.variableJPY.max).toLocaleString()+'엔':''}${c.unknown?' · 요금 미확인 '+c.unknown+'구간':''}${c.prepaid.JPY?' · 선결제 '+c.prepaid.JPY+'엔':''}</p>${hasDetailedRoutes()?railDayKey():''}${state.day<=11?passEditor():''}<a class="evidence-link" href="fare-evidence.json" target="_blank" rel="noopener">출발·도착역별 검색 근거 ↗</a></details>`;

 $$('#dayHeader [data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
 bindPass();
 $('#dayCounter').textContent=`${String(d.n).padStart(2,'0')} / 22`;$('#prevDay').disabled=!state.data.days.some(day=>day.n<d.n);$('#nextDay').disabled=!state.data.days.some(day=>day.n>d.n);
 $('#dayNote').innerHTML=(d.important?`<div class="day-note ${d.event?'fixed-event':''}"><strong>${icon(d.event?'star':'info')} ${d.event?'1월 23일 고정 행사':'오늘 기억할 것'}</strong>${esc(d.important)}</div>`:'')+reservationWarningsHtml(v);
}

function shortRoute(leg){const seen=new Set();return leg.parts.filter(p=>!['walk','transfer'].includes(p.mode)).filter(p=>{const info=railInfo(p),key=info?info.code+'|'+info.color:p.line;if(seen.has(key))return false;seen.add(key);return true;}).map(p=>p.line).join(' → ')||'도보';}
function renderStops(){
 const d=getDay(),v=getVariant(),stops=v.stops;let previousPeriod='';
 $('#stopList').innerHTML=stops.map((s,i)=>{
  const f=state.data.food[s.foodKey],m=MODE[s.modeFromPrevious]||MODE.walk;const hour=Number(s.time.match(/^(\d{1,2}):/)?.[1]);const period=Number.isFinite(hour)?hour<12?'오전':hour<18?'오후':'저녁':'';const section=period&&period!==previousPeriod?`<div class="timeline-period">${period}</div>`:'';if(period)previousPeriod=period;
  let leg='';const route=getLeg(i);const prev=stops[i-1],gap=prev&&s.start&&prev.end?TripData.minutes(s.start)-TripData.minutes(prev.end):0,plannedTravel=route?.durationMin||Number((route?.durationLabel||'').match(/(\d+)/)?.[1])||0;const buffer=gap-plannedTravel>=60?`<div class="schedule-buffer">${gap}분 간격 · 이동 및 ${['airport','port','station'].includes(s.kind)?'수속·승차 여유':'자유시간·주변 산책·대기·지연 흡수'} (새 방문지 추가 없음)</div>`:'';if(route&&route.distanceM<20&&route.fare.min===0){leg='';}else if(route){leg=`<button class="leg-route-button" data-leg="${i}" aria-label="${esc(route.from)}에서 ${esc(route.to)} 이동 상세">${serviceLogo(route.parts[0])||icon((MODE[s.modeFromPrevious]||MODE.rail).icon)}<span><strong>${esc(route.travel?route.travel.operator:shortRoute(route))}</strong>${railLegBadges(route)?`<span class="leg-line-badges">${railLegBadges(route)}</span>`:''}<small>${esc(route.distanceLabel||distanceText(route.distanceM))} · ${esc(route.durationLabel)} · <b>${esc(fareText(route.fare,route))}</b></small></span>${icon('info')}</button>${RailDepartures.keysFor(route).some(key=>!RailDepartures.validityFor(key,TripData.date(state.day)).usable)?`<p class="timetable-warning" data-warning-leg="${i}" role="status">여행일 시간표 갱신 필요 · 이동 상세에서 공식 안내 확인</p>`:''}`;}else if(i>0){const isTravel=['flight','ferry'].includes(s.modeFromPrevious);leg=`<div class="leg-row">${icon(m.icon)}<div class="leg-content"><span class="leg-mode">${m.label}</span>${esc(s.transportFromPrevious&&s.transportFromPrevious!==m.label?s.transportFromPrevious:'')}</div><a class="leg-direction" target="_blank" rel="noopener" href="${isTravel?mapUrl(s):directionsUrl(stops[i-1],s)}" aria-label="${esc(stops[i-1].name)}에서 ${esc(s.name)} ${isTravel?'도착 장소':'길찾기'}">${isTravel?'도착지':'길찾기'} ${icon('arrowUpRight')}</a></div>`;}
  return section+buffer+leg+`<div class="stop-row" id="stop-${i}"><div class="stop-card ${i===state.selected?'active':''} ${state.night&&isNight(s)?'night-focus':''}" data-stop="${i}" tabindex="0" role="button" aria-label="${i+1}. ${esc(s.name)} 지도에서 보기" aria-pressed="${i===state.selected}"><div class="stop-number">${i+1}</div><div class="stop-content"><div class="stop-time">${esc(s.time)}${s.reservationTiming?.applied?'<span class="reservation-time-pill">사용자 확인 시각</span>':''}${isNight(s)?'<span class="night-pill">노을·야경</span>':''}</div><div class="stop-name">${esc(stopLabel(s))}</div><div class="stop-desc">${esc(cleanDesc(s))}</div>${s.kind!=='hotel'?placeFacts(s):''}${s.details?`<details class="place-expand"><summary>방문·메뉴·예약 상세</summary>${detailHtml(s)}${f?`<div class="food-detail"><strong>${esc(f.budget)}</strong><br>${esc(f.order)}<br>${esc(f.hours)}</div>`:''}</details>`:''}<div class="stop-links"><a href="${mapUrl(s)}" target="_blank" rel="noopener" class="place-map">장소 보기 ${icon('arrowUpRight')}</a>${f?`<a href="${esc(f.url)}" target="_blank" rel="noopener">매장 안내 ${icon('arrowUpRight')}</a>`:''}</div></div></div></div>`;
 }).join('');
 $$('#stopList [data-stop]').forEach(el=>{el.addEventListener('click',e=>{if(e.target.closest('a,details'))return;selectStop(Number(el.dataset.stop),true,false);});el.addEventListener('keydown',e=>{if(e.target.closest('a,details'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStop(Number(el.dataset.stop),true,false);}});});
 $$('#stopList [data-leg]').forEach(b=>b.addEventListener('click',()=>selectLeg(Number(b.dataset.leg))));
 $('#routeDetails').innerHTML=`<details><summary>이동 메모·시간표 전체</summary><h3>${icon('rail')} 오늘의 이동 메모</h3>${(v.routes||d.routes).map(s=>`<p>${esc(s)}</p>`).join('')}<p>${esc(v.note||d.note)}</p><details class="full-schedule"><summary>시간표 전체 보기</summary>${v.stops.map(s=>[s.time,s.name,s.description]).map(r=>`<div class="schedule-row"><b>${esc(r[0])}</b><div><strong>${esc(r[1])}</strong><br>${esc(r[2])}</div></div>`).join('')}</details></details>`;
}

function initMap(){
 map=L.map('map',{zoomControl:false,scrollWheelZoom:true,zoomSnap:.25,center:[35.7,139.8],zoom:10,minZoom:3,maxZoom:19,preferCanvas:false});
 L.control.zoom({position:'topright'}).addTo(map);L.control.scale({imperial:false,position:'bottomright',maxWidth:90}).addTo(map);
 setTiles('gsi');routeLayer=L.layerGroup().addTo(map);map.on('zoomend',updateArrowAngles);initRailHover();RailDepartures.attach(map);DetailView.attach(map);window.addEventListener('resize',()=>map.invalidateSize());
 map.on('moveend zoomend',()=>{if(state.view!=='overview'||overviewRendering||DetailView.isOpen()||window.FlightPlayback?.isActive())return;cancelAnimationFrame(overviewMoveFrame);overviewMoveFrame=requestAnimationFrame(()=>{if(state.view==='overview'&&!DetailView.isOpen())renderOverviewMap(false);});});
 window.addEventListener('offline',()=>setTiles('offline',{temporary:true}));window.addEventListener('online',()=>setTiles(state.view==='overview'||state.day===1||state.day>=21?'world':'gsi',{force:true}));
}
function setTiles(provider,{temporary=false,force=false}={}){
 if(!temporary&&tilePreference!=='auto')provider=tilePreference;
 if(!navigator.onLine||provider==='offline'){tileProvider='offline';if(tiles){map.removeLayer(tiles);tiles=null;}OfflineMap.show(map);$('#tileError').classList.add('hidden');return;}
 OfflineMap.hide();
 if(tileProvider===provider&&tiles&&!force)return;tileProvider=provider;
 if(tiles)map.removeLayer(tiles);
 const defs={gsi:{url:'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',options:{minNativeZoom:5,maxNativeZoom:18,attribution:'出典: <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'}},world:{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',options:{maxNativeZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}},topo:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',options:{maxNativeZoom:17,subdomains:'abc',attribution:'© OpenStreetMap · SRTM · OpenTopoMap (CC-BY-SA)'}}};
 const def=defs[provider]||defs.world;let errors=0,switched=false;
 tiles=L.tileLayer(def.url,{maxZoom:19,...def.options}).addTo(map);
 tiles.on('tileload',()=>{if(!failedTileProviders.size)$('#tileError').classList.add('hidden');});
 tiles.on('tileerror',()=>{if(++errors<3||switched)return;switched=true;failedTileProviders.add(provider);$('#tileError').classList.remove('hidden');const next=['world','topo','gsi'].find(p=>p!==provider&&!failedTileProviders.has(p)&&(p!=='gsi'||(map.getCenter().lat>24&&map.getCenter().lng>122)));if(next){setTiles(next,{temporary:true});$('#tileError').firstChild.textContent='배경 요청 실패 · 다른 제공자로 전환했어요. 장소·일정은 계속 사용할 수 있어요. ';}else{setTiles('offline',{temporary:true});announce('연결이 불안정해 내장 간략 지도로 전환했어요.');}});
}
function popupHtml(s,i){const f=state.data.food[s.foodKey];return `<div class="popup-time">${i+1}. ${esc(s.time)} · ${kindLabel(s.kind)}</div><div class="popup-title">${esc(stopLabel(s))}</div>${placeFacts(s)}<div class="popup-address">${esc(s.address||s.area)}</div>${s.details?detailHtml(s,true):`<div class="popup-desc">${esc(cleanDesc(s))}</div>`}<div class="popup-links"><a href="${mapUrl(s)}" target="_blank" rel="noopener">장소 길찾기 ↗</a>${f?`<a href="${esc(f.url)}" target="_blank" rel="noopener">매장 안내 ↗</a>`:''}</div>`;}

function pathPoints(a,b){
 // These lines communicate visit order; they are intentionally not a navigation trace.
 if(!['flight','ferry'].includes(b.modeFromPrevious))return [[a.lat,a.lng],[b.lat,b.lng]];
 const points=[];for(let j=0;j<=20;j++){const t=j/20;points.push([a.lat+(b.lat-a.lat)*t+.11*Math.sin(Math.PI*t),a.lng+(b.lng-a.lng)*t]);}return points;
}
function arrowFor(points,color){
 let mid=Math.floor((points.length-1)/2),a,b,pos;
 if(points.length===2){a=points[0];b=points[1];pos=[a[0]+(b[0]-a[0])*.57,a[1]+(b[1]-a[1])*.57];}else{a=points[mid];b=points[mid+1];pos=b;}
 const marker=L.marker(pos,{interactive:false,keyboard:false,zIndexOffset:-500,icon:L.divIcon({className:'route-arrow-icon',html:`<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m5 4 7 5-7 5" fill="none" stroke="${color}" stroke-width="3.3" stroke-linejoin="round" stroke-linecap="round"/></svg>`,iconSize:[18,18],iconAnchor:[9,9]})}).addTo(routeLayer);arrows.push({marker,a,b});
}
function updateArrowAngles(){if(!map)return;arrows.forEach(x=>{const a=map.latLngToLayerPoint(x.a),b=map.latLngToLayerPoint(x.b),el=x.marker.getElement();if(el){const svg=el.querySelector('svg');svg.style.transform=`rotate(${Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}deg)`;svg.style.opacity=map.distance(x.a,x.b)<20?'0':'1';}});}
function highlightDirection(leg){for(const a of arrows)routeLayer.removeLayer(a.marker);arrows=[];if(!leg)return;const part=leg.parts.filter(p=>p.geometryAccuracy!=='schematic').sort((a,b)=>b.distanceM-a.distanceM)[0];if(part?.coords?.length>1){arrowFor(part.coords,railInfo(part)?.color||(MODE[part.mode]||MODE.rail).color);updateArrowAngles();}}
function renderMap(fit=true){
 if(window.FlightPlayback?.isActive())stopPlay();
 window.RouteLocation?.refresh();
 hideRailHover();railSymbolKeys.clear();railSymbolGroups.clear();map.closePopup();
 setTiles(state.view==='overview'||state.day===1||state.day>=21||window.RouteLocation?.isActive()?'world':'gsi');
 routeLayer.clearLayers();markers=[];arrows=[];legLines=[];stopGroups=[];
 if(state.view==='overview'){renderOverviewMap(fit);return;}
 const stops=getStops();
 for(let i=1;i<stops.length;i++){
  const a=stops[i-1],b=stops[i],m=MODE[b.modeFromPrevious]||MODE.walk;
  const detailed=getLeg(i);
  if(detailed){
   (window.TripPersonal?.displayParts(detailed)||railParts(detailed)).forEach(part=>{
    if(part.coords.length<2||part.distanceM<8)return;
    const color=railInfo(part)?.color||(part.mode==='transfer'?'#949e96':(MODE[part.mode]||MODE.rail).color);
    const style={color,weight:4.5,opacity:part.mode==='ferry'?1:part.geometryAccuracy==='schematic'?.6:state.night?.6:1,lineCap:'round',lineJoin:'round',dashArray:part.geometryAccuracy==='schematic'&&part.mode==='ferry'?'2 6':['flight','ferry'].includes(part.mode)?'9 7':part.mode==='transfer'?'3 5':null};
    L.polyline(part.coords,{color:'#fff',weight:8.5,opacity:.97,interactive:false}).addTo(routeLayer);
    const line=L.polyline(part.coords,style).addTo(routeLayer);
    const hit=L.polyline(part.coords,{weight:18,opacity:0,color,interactive:true}).addTo(routeLayer);
    hit.bindPopup(()=>legHtml(detailed,part),DetailView.options('route-info-popup',{routeLegIndex:i,routeDay:detailed.dayNumber,routeVariant:detailed.variant}));
    hit.on('mouseover',e=>{line.setStyle({weight:7,opacity:1});showRailHover(e,detailed,part);});
    hit.on('mousemove',positionRailHover);
    hit.on('mouseout',()=>{hideRailHover();line.setStyle({weight:i===state.selected?6:4.5,opacity:state.night?.6:1});});
    hit.on('click',()=>{hideRailHover();});
    legLines.push({line,index:i,color});addRailMapSymbol(part,detailed);
   });continue;
  }
  if(map.distance([a.lat,a.lng],[b.lat,b.lng])<15)continue;
  const points=pathPoints(a,b),style={color:m.color,weight:3.1,opacity:state.night?.45:.88,lineCap:'round',lineJoin:'round',dashArray:b.modeFromPrevious==='walk'?null:'7 7'};
  L.polyline(points,{color:'#fff',weight:6.7,opacity:.9,interactive:false}).addTo(routeLayer);
  const line=L.polyline(points,style).addTo(routeLayer);line.bindPopup(`<div class="popup-time">${m.label} · ${i} → ${i+1}</div><div class="popup-title">${esc(a.name)} → ${esc(b.name)}</div><div class="popup-desc">${esc(b.transportFromPrevious)}</div>${['flight','ferry'].includes(b.modeFromPrevious)?'':`<div class="popup-links"><a href="${directionsUrl(a,b)}" target="_blank" rel="noopener">실제 경로 길찾기 ↗</a></div>`}`);legLines.push({line,index:i,color:m.color});
 }
 const groups=new Map();stops.forEach((s,i)=>{const key=s.lat.toFixed(5)+','+s.lng.toFixed(5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
 groups.forEach(indices=>{
  const i=indices[0],s=stops[i];const marker=L.marker([s.lat,s.lng],{icon:markerIcon(indices),keyboard:true,alt:indices.map(i=>`${i+1}. ${stops[i].name}`).join(' / '),title:s.name,zIndexOffset:s.kind==='station'?0:100}).addTo(routeLayer);
  marker.bindTooltip(`${indices.map(i=>i+1).join('·')} · ${esc(stopLabel(s))}`,{direction:'top',offset:[0,-25],className:'stop-tooltip'});
  marker.on('click',()=>{let idx=indices[0];if(indices.includes(state.selected))idx=indices[(indices.indexOf(state.selected)+1)%indices.length];selectStop(idx,false,false,{source:'user'});marker.bindPopup(popupHtml(stops[idx],idx),DetailView.options('place-info-popup',{routeStopIndex:idx})).openPopup();});
  indices.forEach(idx=>markers[idx]=marker);stopGroups.push({indices,marker});
 });
 $('.map-legend').classList.toggle('line-colors-active',hasDetailedRoutes());$('.map-legend>span:nth-child(2)').innerHTML=hasDetailedRoutes()?'<i class="legend-line rail"></i>철도: 노선색·기호':'<i class="legend-line rail"></i>전철·버스';
 const flightLegs=(state.routeData?.days?.[`${state.day}-${getVariant().id}`]||[]).filter(l=>l?.parts.some(p=>p.mode==='flight'));
 $('.route-caution').textContent=hasDetailedRoutes()?'선·기호를 누르면 이동 상세가 열려요.'+(flightLegs.length?' 항공: '+[...new Set(flightLegs.map(l=>window.FlightPlayback?.geometryLabel(l)||'개략 항로'))].join(' · ')+'. 재생 화면에서 따라갈 수 있어요.':''):'이 지역은 기존 방문 순서 표시입니다. 실제 경로는 구간별 길찾기를 확인하세요.';
 if(fit)fitRoute([1,12,16,18].includes(getDay().n)&&hasDetailedRoutes());requestAnimationFrame(updateArrowAngles);
}
function markerIcon(indices){const stops=getStops(),first=stops[indices[0]],active=indices.includes(state.selected),night=state.night&&indices.some(i=>isNight(stops[i]));return L.divIcon({className:'route-marker',html:`<div class="pin-number ${first.kind} ${active?'active':''} ${night?'night':''}"><span>${indices[0]+1}</span>${indices.length>1?'<small class="repeat-place" title="같은 장소 재방문">↻</small>':''}</div>`,iconSize:[44,44],iconAnchor:[22,38]});}
function fitRoute(focus=false){
 map.stop();
 if(focus&&state.view==='overview'){const day=state.data.days.find(d=>d.n===(overviewContext?.day.n||overviewFocus||state.day)),variant=MapPlan.variant(day,state.selectedVariantByDay),local=variant.stops.filter(s=>['sight','cafe','food'].includes(s.kind));if(local.length){map.fitBounds(L.latLngBounds(local.map(s=>[s.lat,s.lng])),{padding:[55,70],maxZoom:14,animate:false});return;}}
 const stops=state.view==='overview'?overviewStops():getStops();let coords=stops.map(s=>[s.lat,s.lng]);
 if(state.view==='overview')coords.push(...overviewLegs().flatMap(l=>l.parts.flatMap(p=>p.coords)));
 if(!focus&&state.view==='daily'&&hasDetailedRoutes())coords.push(...(state.routeData.days[`${state.day}-${getVariant().id}`]||[]).filter(Boolean).flatMap(l=>l.parts.flatMap(p=>p.coords)));
 if(focus&&state.view==='daily'){
  let local=stops.filter(s=>['sight','food','cafe'].includes(s.kind));
  // Long-distance day trips should be explorable without the departure-city anchor.
  if(local.length>=2){let best=[];for(const a of local){const near=local.filter(b=>map.distance([a.lat,a.lng],[b.lat,b.lng])<22000);if(near.length>best.length)best=near;}if(best.length>=2)local=best;coords=local.map(s=>[s.lat,s.lng]);}
 }
 if(coords.length)map.fitBounds(L.latLngBounds(coords),{paddingTopLeft:[window.innerWidth<=740?25:42,window.innerWidth<=740?155:175],paddingBottomRight:[window.innerWidth<=740?25:42,window.innerWidth<=740?110:133],maxZoom:15,animate:false});updateArrowAngles();
}
function selectStop(index,fly=true,scroll=false,options={}){
 if(state.view!=='daily')return;if(options.source!=='auto'){pausePlay();window.FlightPlayback?.pause();}window.RouteLocation?.pauseFollow();const stops=getStops();if(index<0||index>=stops.length)return;state.selected=index;
 $$('.stop-card').forEach(el=>{const active=Number(el.dataset.stop)===index;el.classList.toggle('active',active);el.setAttribute('aria-pressed',active);});
 stopGroups.forEach(g=>{g.marker.setIcon(markerIcon(g.indices));g.marker.setZIndexOffset(g.indices.includes(index)?1000:100);});
 legLines.forEach(({line,index:i,color})=>line.setStyle({color,weight:i===index?6:4.5,opacity:state.night?(i===index?.95:.4):(i===index?1:.75)}));
 highlightDirection(getLeg(index));const s=stops[index];if(fly){const z=['airport','port'].includes(s.kind)?12:15;map.stop();map.setView([s.lat,s.lng],Math.max(map.getZoom(),z),{animate:false});if(options.source!=='auto'||!RouteUI.mobile())markers[index]?.bindPopup(popupHtml(s,index),DetailView.options('place-info-popup',{routeStopIndex:index,interactionSource:options.source||'user'})).openPopup();}
 if(scroll){const el=$(`#stop-${index}`),scroller=$('#itineraryScroll');if(window.innerWidth>1024&&el){scroller.scrollTo({top:Math.max(0,scroller.scrollTop+el.getBoundingClientRect().top-scroller.getBoundingClientRect().top-35),behavior:'smooth'});}else if(window.innerWidth<=1024&&el){el.scrollIntoView({behavior:'smooth',block:'center'});}}
 renderPlayback();
 if(options.history!==false)updateUrl('replace');
}
function renderPlayback(){
 const overview=state.view==='overview',running=!!state.playing&&!state.playing.paused;
 $('#previousStop').hidden=overview;$('#nextStop').hidden=overview;
 $('#previousStop').disabled=!overview&&state.selected<=0;$('#nextStop').disabled=!overview&&state.selected>=getStops().length-1;
 $('#playBtn').innerHTML=icon(running?'pause':'play')+'<span>'+(overview?'1일차부터 보기':running?'일시정지':state.playing?.paused?'계속 재생':'동선 따라가기')+'</span>';
 $('#playBtn').setAttribute('aria-pressed',String(running));window.dispatchEvent(new CustomEvent('routebook:playback',{detail:{active:!!state.playing,running}}));
 $('#routePlaybackStatus').textContent=!overview&&state.selected>=0?`${state.selected+1} / ${getStops().length} · ${getStops()[state.selected].name}`:'';
}
function pausePlay(){const run=state.playing;if(run&&!run.paused){run.paused=true;clearTimeout(run.timer);run.timer=null;renderPlayback();}}
function stopPlay(options={}){const run=state.playing;state.playing=null;if(run)clearTimeout(run.timer||run);if(!options.keepFlight)window.FlightPlayback?.stop({notify:false});if(state.data)renderPlayback();}
function startPlay(){
 if(state.playing?.paused){const run=state.playing;run.paused=false;DetailView.close();if(window.FlightPlayback?.isActive())window.FlightPlayback.resume();else run.tick();renderPlayback();return;}
 window.FlightPlayback?.stop({notify:false});DetailView.close();
 const run={timer:null,paused:false,nextIndex:state.selected===getStops().length-1?0:state.selected+1};state.playing=run;
 run.tick=()=>{
  if(state.playing!==run||run.paused)return;const n=run.nextIndex;
  if(n>=getStops().length){stopPlay();announce('오늘의 동선을 모두 둘러봤어요.');return;}
  run.nextIndex=n+1;const leg=getLeg(n);
  if(leg&&window.FlightPlayback?.canPlay(leg)){
   selectStop(n,false,false,{source:'auto'});
   const started=window.FlightPlayback.play(leg,{onComplete:()=>{if(state.playing===run&&!run.paused)run.timer=setTimeout(run.tick,800);},onCancel:()=>{if(state.playing===run)stopPlay({keepFlight:true});}});
   if(started)return;
  }
  selectStop(n,true,false,{source:'auto'});run.timer=setTimeout(run.tick,3300);
 };run.tick();renderPlayback();
}
function selectedPlaceId(){const i=state.selected;return i>=0?JourneyState.placeId(getDay(),getVariant(),getStops()[i],i):null;}
function screenSnapshot(){return {routebook:2,day:state.day,variant:state.variant,view:state.view,placeId:state.view==='daily'?selectedPlaceId():null,search:state.search,filter:state.filter,night:state.night,passEnabled:state.passEnabled,scroll:{itinerary:$('#itineraryScroll').scrollTop,days:$('#dayList').scrollTop,x:window.scrollX,y:window.scrollY}};}
function updateUrl(mode='replace'){
 const snapshot=screenSnapshot(),url=JourneyState.url(location.href,snapshot,state.data.days);
 if(mode==='push'&&url!==location.href)history.pushState(snapshot,'',url);else history.replaceState(snapshot,'',url);
}
function navigateScreen(target,options={}){
 if(!state.data)return;
 const generation=++screenGeneration,previous=screenSnapshot();
 if(options.history!=='none')history.replaceState(previous,'',JourneyState.url(location.href,previous,state.data.days));
 const d=state.data.days.find(d=>d.n===Number(target.day))||getDay();
 const variant=Object.hasOwn(target,'variant')?JourneyState.variant(d,target.variant):JourneyState.chosen(d,state.selectedVariantByDay);
 state.selectedVariantByDay[d.n]=variant;JourneyState.save(state.selectedVariantByDay,journeyStorage);
 window.RouteLocation?.pauseFollow();stopPlay();map.stop();
 state.day=d.n;state.variant=variant;state.view=target.view==='overview'?'overview':'daily';state.selected=-1;
 if(options.snapshot)state.night=!!options.snapshot.night;state.passEnabled=!!state.pass.enabled;
 if(options.snapshot){state.search=options.snapshot.search||'';state.filter=options.snapshot.filter||'all';$('#daySearch').value=state.search;}
 $('#itineraryScroll').scrollTop=0;
 if(state.view==='overview')renderOverview();else{renderDays();renderHeader();renderStops();renderMap();}renderPlayback();
 if(state.view==='daily'&&target.placeId){const stops=getStops(),index=stops.findIndex((stop,i)=>JourneyState.placeId(d,getVariant(),stop,i)===target.placeId);if(index>=0){selectStop(index,false,false,{history:false});const stop=stops[index];map.setView([stop.lat,stop.lng],15,{animate:false});markers[index]?.bindPopup(popupHtml(stop,index),DetailView.options('place-info-popup',{routeStopIndex:index,interactionSource:'restore'})).openPopup();}}
 if(options.history!=='none')updateUrl(options.history||'push');
 const snapshot=options.snapshot;
 requestAnimationFrame(()=>{
  if(generation!==screenGeneration)return;
  if(snapshot?.scroll){$('#itineraryScroll').scrollTop=snapshot.scroll.itinerary||0;$('#dayList').scrollTop=snapshot.scroll.days||0;window.scrollTo({left:snapshot.scroll.x||0,top:snapshot.scroll.y||0,behavior:'instant'});}
  else if(options.revealPlace&&state.selected>=0){const el=$(`#stop-${state.selected}`);if(window.innerWidth>1024&&el){const scroller=$('#itineraryScroll');scroller.scrollTop=Math.max(0,scroller.scrollTop+el.getBoundingClientRect().top-scroller.getBoundingClientRect().top-35);}else el?.scrollIntoView({block:'center',behavior:'instant'});}
  else if(options.scrollNav)$('#dayList .day-item.active')?.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});
  if(options.history!=='none')updateUrl('replace');
 });
}
function setDay(n,options={}){if(Number(n)===state.day&&state.view==='daily'&&!options.force)return;navigateScreen({day:Math.max(1,Math.min(22,n)),view:'daily'},options);}
function setVariant(id,options={}){if(id===state.variant&&state.view==='daily')return;navigateScreen({day:state.day,variant:id,view:'daily'},options);}
function showOverview(){if(state.view==='overview')return;navigateScreen({day:state.day,variant:state.variant,view:'overview'});}
function overviewStops(){return [
 {name:'월성로 132',lat:window.TripPersonal.HOME.lat,lng:window.TripPersonal.HOME.lng,modeFromPrevious:'walk',days:'1/8 출발',n:1},
 {name:'대구공항',lat:35.8941,lng:128.6589,modeFromPrevious:'taxi',days:'동대구 → 대구공항',n:1},
 {name:'도쿄',lat:35.7007,lng:139.774,modeFromPrevious:'flight',days:'1/8–19 · 11박',n:2},
 {name:'오사카',lat:34.6674,lng:135.501,modeFromPrevious:'flight',days:'1/19–25 · 6박 · 교토·나라·고베',n:12},
 {name:'후쿠오카',lat:33.5917,lng:130.4207,modeFromPrevious:'flight',days:'1/25–28 · 3박',n:18},
 {name:'부산',lat:35.1155,lng:129.0422,modeFromPrevious:'ferry',days:'1/28–29 · 1박',n:21},
 {name:'서대구',lat:35.8813666,lng:128.5417368,modeFromPrevious:'rail',days:'1/29 부산12:44 → 서대구13:47:30 정차 · 330편 현재표 참고',n:22}
 ];}
function overviewLegs(){return state.data.days.flatMap(d=>state.routeData.days[`${d.n}-${JourneyState.chosen(d,state.selectedVariantByDay)}`]||[]).filter(Boolean);}
function overviewCities(){return [{name:'대구',lat:window.TripPersonal.HOME.lat,lng:window.TripPersonal.HOME.lng,n:1},...overviewStops().filter(s=>['도쿄','오사카','후쿠오카','부산'].includes(s.name))];}
function renderOverviewPreview(focus){
 overviewContext=focus;
 if(!focus){
  const stays=['출국 · 귀가','1/8–19 · 11박','1/19–25 · 6박','1/25–28 · 3박','1/28–29 · 1박'];
  $('#stopList').innerHTML='<div class="overview-preview-intro">도시를 누르거나 지도를 확대해 보세요.</div>'+overviewCities().map((s,i)=>`<button type="button" class="overview-city-row" data-overview-city="${i}"><strong>${esc(s.name)}</strong><span>${stays[i]}</span>${icon('chevronRight')}</button>`).join('');
  $('#stopList').querySelectorAll('[data-overview-city]').forEach(button=>button.addEventListener('click',()=>{const city=overviewCities()[Number(button.dataset.overviewCity)];overviewFocus=city.n;map.setView([city.lat,city.lng],12,{animate:false});renderOverviewMap(false);}));return;
 }
 const {day,variant}=focus,label=MapPlan.label(day,variant);
 $('#stopList').innerHTML=`<div class="overview-preview-heading"><small>${esc(day.date+' · '+label.city)}</small><h3>${esc(label.places)}</h3><button type="button" class="outline-button" data-open-day="${day.n}">이 날짜 전체 일정 보기</button></div>`+variant.stops.map((s,i)=>`<button type="button" class="overview-stop-row" data-overview-place="${i}"><span>${i+1}</span><div><small>${esc(s.time)}</small><strong>${esc(stopLabel(s))}</strong></div>${icon('info')}</button>`).join('');
 $('#stopList').querySelector('[data-open-day]').addEventListener('click',()=>navigateScreen({day:day.n,variant:variant.id,view:'daily'}));
 $('#stopList').querySelectorAll('[data-overview-place]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.overviewPlace),s=variant.stops[i];map.panTo([s.lat,s.lng],{animate:false});L.popup(DetailView.options('place-info-popup',{routeStopIndex:i,routeDay:day.n,routeVariant:variant.id})).setLatLng([s.lat,s.lng]).setContent(withDayContext(day.n,variant.id,()=>popupHtml(s,i))).openOn(map);}));
}
function withDayContext(day,variant,render){const before={day:state.day,variant:state.variant};state.day=Number(day);state.variant=variant;try{return render();}finally{Object.assign(state,before);}}
function overviewLegHtml(leg,part){return withDayContext(leg.dayNumber,leg.variant,()=>legHtml(leg,part));}
function renderOverviewMap(fit=true){
 if(overviewRendering||state.view!=='overview')return;overviewRendering=true;
 try{
  hideRailHover();routeLayer.clearLayers();railSymbolKeys.clear();railSymbolGroups.clear();arrows=[];
  const detailed=!fit&&map.getZoom()>=10,stops=overviewCities(),legs=overviewLegs();
  const draw=(leg,part,local=false)=>{if(part.coords?.length<2)return;const color=railInfo(part)?.color||(MODE[part.mode]||MODE.rail).color,schematic=part.mode==='ferry'&&part.geometryAccuracy==='schematic';
   L.polyline(part.coords,{color:'#fff',weight:local?7:5,opacity:.9,interactive:false}).addTo(routeLayer);
   L.polyline(part.coords,{color,weight:schematic?2:local?4:3,opacity:local||!detailed?.9:.45,dashArray:part.mode==='ferry'?null:schematic?'2 6':part.mode==='flight'?'9 7':part.mode==='transfer'?'3 5':null,interactive:false}).addTo(routeLayer);
   const hit=L.polyline(part.coords,{weight:18,opacity:0}).addTo(routeLayer);hit.bindPopup(()=>overviewLegHtml(leg,part),symbolOptions(leg));
   hit.on('mouseover',e=>showRailHover(e,leg,part));hit.on('mousemove',positionRailHover);hit.on('mouseout',hideRailHover);if(local||!detailed)addRailMapSymbol(part,leg);
  };
  for(const leg of legs)for(const part of (window.TripPersonal?.displayParts(leg)||railParts(leg)))draw(leg,part);
  if(!detailed){
   renderOverviewPreview(null);
   $('#mapTitle').innerHTML='<div class="map-kicker">전체 여정</div><p class="overview-map-instruction">지도를 확대하면 해당 지역의 상세 일정이 나와요.</p>';
   stops.forEach(s=>{const mk=L.marker([s.lat,s.lng],{icon:L.divIcon({className:'route-marker city-marker',html:'<span class="city-map-dot"></span>',iconSize:[44,44],iconAnchor:[22,22]}),title:s.name,alt:s.name+' 지역 일정 확대'}).addTo(routeLayer);mk.bindTooltip(esc(s.name),{permanent:true,direction:'right',offset:[17,0],className:'stop-tooltip'});mk.on('click',()=>{overviewFocus=s.n;map.setView([s.lat,s.lng],12,{animate:false});renderOverviewMap(false);});});
   $('.route-caution').textContent='전체 22일 경로 · 항공·선박·우버 개략 경로 포함';
  }else{
   const b=map.getBounds(),context=MapPlan.context(state.data.days,state.selectedVariantByDay,{south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()},map.getCenter(),overviewFocus),focus=context.focus;renderOverviewPreview(focus);
   $('#mapTitle').innerHTML=`<div class="map-kicker">${focus?esc(MapPlan.label(focus.day,focus.variant).city):'이 지역에 일정이 없어요'}</div><div class="overview-day-chips" aria-label="지도 지역의 날짜">${context.visible.map(x=>`<button type="button" data-overview-day="${x.day.n}" aria-pressed="${x===focus}">${x.day.date.slice(3)}일</button>`).join('')}</div>${focus?`<small>${esc(focus.day.date+' · '+MapPlan.label(focus.day,focus.variant).places)}</small>`:''}`;
   $('#mapTitle').querySelectorAll('[data-overview-day]').forEach(button=>button.addEventListener('click',()=>{overviewFocus=Number(button.dataset.overviewDay);renderOverviewMap(false);}));
   if(focus){
    const {day,variant}=focus;
    // Every date's route is already plotted; focus only changes place pins.
    for(const group of MapPlan.groups(variant.stops)){
     const s=group.stop;if(!b.pad(.15).contains([s.lat,s.lng]))continue;const i=group.indices[0];
     const marker=L.marker([s.lat,s.lng],{icon:L.divIcon({className:'route-marker overview-place-marker',html:`<div class="pin-number ${s.kind}"><span>${i+1}</span>${group.indices.length>1?'<small class="repeat-place">↻</small>':''}</div>`,iconSize:[44,44],iconAnchor:[22,38]}),title:day.date+' '+stopLabel(s),alt:day.date+' '+stopLabel(s)}).addTo(routeLayer);
     marker.bindTooltip(esc(s.name),{direction:'top',offset:[0,-25],className:'stop-tooltip'});
     marker.bindPopup(()=>withDayContext(day.n,variant.id,()=>popupHtml(s,i)),DetailView.options('place-info-popup',{routeStopIndex:i,routeDay:day.n,routeVariant:variant.id}));
    }
    $('.route-caution').textContent='전체 22일 동선 · 선택 날짜의 장소 표시';
   }else $('.route-caution').textContent='이동하거나 지도를 축소해 다른 지역을 찾아보세요.';
  }
  if(fit)fitRoute();
 }finally{overviewRendering=false;}
}

function renderOverview({redraw=true,fit=true}={}){
 $('.day-pagination').hidden=true;
 window.RouteLocation?.pauseFollow();
 stopPlay();state.view='overview';renderDays();$('#dailyView').classList.remove('active');$('#overviewView').classList.add('active');$('#dailyView').setAttribute('aria-pressed','false');$('#overviewView').setAttribute('aria-pressed','true');$('#nightBtn').disabled=true;$('#nightSetting').disabled=true;
 $('#mapTitle').innerHTML='<div class="map-kicker"><span class="city-dot"></span>JAN 08 — JAN 29, 2027</div><h2>도쿄에서 시작해,<br>배로 돌아오는 여행.</h2><div class="map-route-subtitle">대구 → 도쿄 → 오사카 → 후쿠오카 → 부산</div><div class="map-card-stats"><span>'+icon('calendar')+'21박 22일</span><span>'+icon('flight')+'항공 3구간</span><span>'+icon('ferry')+'뉴 카멜리아호</span></div>';
 const baseline=JourneyState.totals(state.data.days,state.routeData.days),selected=JourneyState.totals(state.data.days,state.routeData.days,state.selectedVariantByDay,{pass:state.pass});
 const summary=(label,c)=>`<div class="trip-cost" data-summary="${label==='기본안 기준'?'baseline':'selected'}"><small>${label} · ${label==='기본안 기준'?'패스 미적용':FareCore.passWindow(state.pass).simulation?'시작 미설정 · 전체 합계 미적용':state.passEnabled?'설정한 유효시간 반영':'패스 미적용'}</small><strong>교통 ${c.transportJPY.toLocaleString()}엔${c.transportKRW?' + '+c.transportKRW.toLocaleString()+'원':''}</strong><p>관광·입장료 ${c.admissionMin.toLocaleString()}~${c.admissionMax.toLocaleString()}엔${c.admissionUnknown?' · 미확인 '+c.admissionUnknown+'곳':''}<br>변동 교통 ${c.transportVariableJPY.min.toLocaleString()}~${c.transportVariableJPY.max.toLocaleString()}엔 · 미확인 ${c.transportUnknown}구간 별도${c.passCost?'<br>패스 구매 '+c.passCost.toLocaleString()+'엔 별도':''}${c.prepaid.JPY?'<br>선결제 '+c.prepaid.JPY+'엔':''}</p><details class="category-costs"><summary>식음료·쇼핑 등 별도 예산</summary>${Object.entries(c.categories).filter(([kind])=>['food','cafe','drink','shopping'].includes(kind)).map(([kind,value])=>`<p>${({food:'식비',cafe:'카페',drink:'음료·시음',shopping:'쇼핑'})[kind]}: ${['JPY','KRW'].map(cur=>{const r=value[cur];return r.min+'~'+r.max+(cur==='JPY'?'엔':'원')+(r.unknown?' · 미확인'+r.unknown+'곳':'');}).join(' / ')}</p>`).join('')}</details></div>`;
 $('#dayHeader').innerHTML=`<div class="detail-date-row"><span class="detail-date">JAN 08 — JAN 29, 2027</span><span class="detail-badge">21박 22일</span></div><h2>전체 여정 한눈에</h2><p>날짜를 눌러 상세 일정으로. 항로에 마우스를 대면 선택편·시간·요금이 나와요.</p>`;
 $('#dayNote').innerHTML=`<details class="overview-budget"><summary>여행 예산·비용 비교</summary><div class="trip-cost-comparison">${summary('기본안 기준',baseline)}${summary('현재 선택 기준',selected)}</div><p class="summary-scope">교통은 시내·근교 및 한국 KTX 포함. 항공·선박·숙소·식음료 별도. 관광·입장료는 입장료·체험만 합산합니다. 식사·카페·음료·시음·쇼핑은 별도이며 중복 합산하지 않습니다.</p><div class="day-note fixed-event"><strong>1/23 나라 고정</strong>18:15 불꽃놀이 → 18:30 와카쿠사산 점화</div></details>`;
 renderOverviewPreview(overviewContext);
 $('#routeDetails').innerHTML=`<div class="airline-overview-strip" aria-label="선택한 항공사">${['trinity','jal','ana'].map(key=>airlineLogo({mode:'flight',line:key==='trinity'?'TW251':key.toUpperCase()})).join('')}</div><h3>항공·선박 별도 비용</h3><p>1/8 TW251 이전 견적311,300원(TripFlex 포함)<br>1/19 JAL 이전 견적12,090엔<br>1/25 ANA NH1189 이전 견적9,120엔<br>1/28 뉴 카멜리아호 현재 공시2등19,900엔(세금·연료·터미널 포함)</p><p>항공 견적은 현재 판매가가 아닙니다. 선박 연료·2027 운항, 택시 미터 별도. 부산→서대구 KTX 고속선 일반실16,300원(2026.9 공식표). 12:44 출발·13:47:30 정차330편 현재표 참고, 여행일 운행·좌석 재확인. 도쿄72시간권 적용 시 실제 이용 구간을 차감하고 구입비2,000엔을 더합니다.</p><a href="fare-evidence.json" target="_blank" class="evidence-link">구간별 운임·출처 전체 ↗</a>`;
 if(redraw)renderMap(fit);
}

function bindEvents(){
 window.addEventListener('routebook:online',()=>{refreshTrip();announce('연결 복구 · 새 일정 자료를 확인 중입니다.');});
 window.addEventListener('routebook:apply-trip-update',event=>applyTripUpdate(event.detail));
 window.addEventListener('routebook:reservation-change',handleReservationChange);
 window.addEventListener('routebook:reservation-alt',event=>{DetailView.close();navigateScreen({...event.detail,view:'daily'});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pausePlay();window.FlightPlayback?.pause();}});window.addEventListener('pagehide',()=>{pausePlay();window.FlightPlayback?.pause();});
 window.addEventListener('routebook:user-explore',()=>{pausePlay();window.FlightPlayback?.pause();});
 const mapContainer=map.getContainer(),exploreMap=event=>{if(!event.target.closest?.('[data-detail-play]'))RouteUI.userExplore();};mapContainer.addEventListener('pointerdown',exploreMap,{passive:true,capture:true});mapContainer.addEventListener('click',exploreMap,true);mapContainer.addEventListener('wheel',exploreMap,{passive:true,capture:true});mapContainer.addEventListener('keydown',exploreMap,true);map.on('dragstart',RouteUI.userExplore);
 window.addEventListener('routebook:detail-jump',event=>{const {itinerary,index,kind,day,variant}=event.detail;if(itinerary&&Number.isInteger(index)){if(day&&(state.day!==day||state.variant!==variant||state.view!=='daily'))navigateScreen({day,variant,view:'daily'});if(kind==='leg'){const el=$(`[data-leg="${index}"]`);el?.classList.add('search-highlight');if(innerWidth>1024&&el){const scroller=$('#itineraryScroll');scroller.scrollTop+=el.getBoundingClientRect().top-scroller.getBoundingClientRect().top-25;}else el?.scrollIntoView({block:'center',behavior:'instant'});}else selectStop(index,false,true,{source:'user'});}else $('#map').scrollIntoView({block:'center',behavior:'instant'});});
 document.addEventListener('click',event=>{const b=event.target.closest('[data-location-set]');if(!b)return;const day=Number(b.dataset.day),index=Number(b.dataset.locationSet);if(day!==state.day||state.view!=='daily'){navigateScreen({day,variant:b.dataset.variant,view:'daily'});}if(!window.RouteLocation?.isActive())window.RouteLocation?.start();window.RouteLocation?.selectLeg(index);announce('현재 이동 구간을 수동 선택했어요. 자동 모드로 되돌릴 수 있어요.');});
 $('#settingsBtn').addEventListener('click',()=>{RouteUI.showDialog($('#mapSettings'));$('#mapProvider').value=tilePreference;});$('#mapProvider').addEventListener('change',e=>{tilePreference=e.target.value;try{localStorage.setItem('routebook-map-provider',tilePreference);}catch(_){}failedTileProviders.clear();setTiles(tilePreference==='auto'?(state.day===1||state.day>=21?'world':'gsi'):tilePreference,{force:true});});$('#closeSettings').addEventListener('click',()=>{const dialog=$('#mapSettings');dialog.close();RouteUI.release(dialog);});$('#nightSetting').addEventListener('click',()=>$('#nightBtn').click());

 history.scrollRestoration='manual';
 $('.brand').addEventListener('click',event=>{event.preventDefault();navigateScreen({day:1,variant:'main',view:'daily'});});
 window.addEventListener('popstate',event=>{const target=JourneyState.read(location.href,state.data.days,state.selectedVariantByDay);navigateScreen(target,{history:'none',snapshot:event.state?.routebook===2?event.state:null});});
 window.addEventListener('pagehide',()=>{screenGeneration++;if(state.data)try{sessionStorage.setItem('routebook-screen-snapshot-v1',JSON.stringify({url:location.href,snapshot:screenSnapshot()}));}catch(_){} });
 $('#cityFilters').addEventListener('click',e=>{const b=e.target.closest('[data-city]');if(!b)return;state.filter=b.dataset.city;renderDays();updateUrl('replace');});$('#daySearch').addEventListener('input',e=>{state.search=e.target.value.trim();renderDays();updateUrl('replace');});
 $('#dailyView').addEventListener('click',()=>setDay(state.day));$('#overviewView').addEventListener('click',showOverview);
 $('#prevDay').addEventListener('click',()=>setDay(state.day-1,{scrollNav:true}));$('#nextDay').addEventListener('click',()=>setDay(state.day+1,{scrollNav:true}));
 $('#fitBtn').addEventListener('click',()=>{pausePlay();window.FlightPlayback?.pause();window.RouteLocation?.pauseFollow();map.closePopup();fitRoute();});$('#focusBtn').addEventListener('click',()=>{pausePlay();window.FlightPlayback?.pause();window.RouteLocation?.pauseFollow();map.closePopup();fitRoute(true);});
 $('#nightBtn').addEventListener('click',()=>{state.night=!state.night;$('#nightBtn').setAttribute('aria-pressed',state.night);$('#nightSetting').setAttribute('aria-pressed',state.night);preserveDetails(renderStops);renderMap(false);if(state.night){const ns=getStops().filter(isNight);if(ns.length)map.fitBounds(L.latLngBounds(ns.map(s=>[s.lat,s.lng])),{paddingTopLeft:[30,window.innerWidth<=740?155:175],paddingBottomRight:[30,window.innerWidth<=740?110:135],maxZoom:15});else announce('이 날은 이동·낮 산책 위주 일정이에요.');}else fitRoute();});
 $('#previousStop').addEventListener('click',()=>{pausePlay();selectStop(Math.max(0,state.selected-1));});$('#nextStop').addEventListener('click',()=>{pausePlay();selectStop(Math.min(getStops().length-1,state.selected+1));});
 $('#playBtn').addEventListener('click',()=>{if(state.view==='overview'){setDay(1);return;}if(state.playing&&!state.playing.paused){pausePlay();window.FlightPlayback?.pause();return;}startPlay();});
 $('#shareBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);announce('현재 날짜의 지도 링크를 복사했어요.');}catch{announce('주소창의 링크로 현재 날짜를 공유할 수 있어요.');}});
 $('#aboutBtn').addEventListener('click',()=>RouteUI.showDialog($('#aboutDialog')));$('#closeAbout').addEventListener('click',()=>{$('#aboutDialog').close();RouteUI.release($('#aboutDialog'));});$('#aboutDialog').addEventListener('click',e=>{if(e.target===$('#aboutDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){e.target.close();RouteUI.release(e.target);}}});
 $('#alternateTiles').addEventListener('click',()=>{failedTileProviders.clear();setTiles(tileProvider==='world'?'topo':'world',{temporary:true,force:true});});
 $('#retryTiles').addEventListener('click',()=>{const provider=tileProvider;failedTileProviders.clear();setTiles(provider,{force:true,temporary:true});$('#tileError').classList.add('hidden');});
 document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.target.closest('input,textarea,select,[contenteditable=true]')||RouteUI.hasLayer())return;if(e.key==='/'){e.preventDefault();$('#daySearch').focus();}else if(e.altKey&&e.shiftKey&&e.key==='ArrowRight'){e.preventDefault();setDay(state.day+1,{scrollNav:true});}else if(e.altKey&&e.shiftKey&&e.key==='ArrowLeft'){e.preventDefault();setDay(state.day-1,{scrollNav:true});}});
}

function focusRideProfile(key,station,selection={}){
 const preferred=`${state.day}-${getVariant().id}`;
 const selectedDays=Object.fromEntries(Object.entries(state.routeData.days).filter(([dayKey])=>{const [n,...id]=dayKey.split('-'),d=state.data.days.find(d=>d.n===Number(n));return d&&id.join('-')===JourneyState.chosen(d,state.selectedVariantByDay);}));
 const match=RideCore.itineraryMatch(selectedDays,key,selection.serviceDate,RailDepartures.keysFor,preferred);
 if(!match){announce(`${selection.serviceDate||'선택한 운행일'}에 현재 선택한 일정의 같은 승차 구간이 없어요. 일정 선택을 확인해 주세요.`);return false;}
 const {dayKey,leg}=match;
  const [n,...rest]=dayKey.split('-'),variant=rest.join('-');
  if(state.day!==Number(n)||getVariant().id!==variant||state.view!=='daily')navigateScreen({day:Number(n),variant,view:'daily'});
  window.RouteLocation?.pauseFollow();stopPlay();map.closePopup();
  const coords=leg.parts.filter(part=>RailDepartures.keyFor(leg,part)===key).flatMap(part=>part.coords||[]);
  if(Array.isArray(station?.coord)){map.setView(station.coord,14,{animate:false});L.popup({maxWidth:240}).setLatLng(station.coord).setContent(`<div class="popup-time">선택한 열차 · 시간표 기준</div><div class="popup-title">${esc(station.name)}</div><p>실제 현재 위치는 GPS와 현장 안내를 확인하세요.</p>`).openOn(map);}
  else if(coords.length)map.fitBounds(L.latLngBounds(coords),{padding:[45,60],maxZoom:15,animate:false});
  if(window.innerWidth<=740)$('#map').scrollIntoView({behavior:'smooth',block:'center'});return true;
}

function preparePersonalTrip(){
 ReservationCore.restore(state.data);TripData.prepare(state.data,state.routeData);
 ReservationCore.apply(state.data,state.routeData,ReservationUI.getRecords());TripData.prepare(state.data,state.routeData);
}
function handleReservationChange(){
 const detail=DetailView.context();pausePlay();window.FlightPlayback?.pause();preparePersonalTrip();
 if(state.view==='overview'){renderOverview({redraw:false});if(Number.isInteger(detail?.routeStopIndex)){const day=state.data.days.find(d=>d.n===detail.routeDay),v=day?.variants.find(v=>v.id===detail.routeVariant);if(v)DetailView.refreshContent(withDayContext(day.n,v.id,()=>popupHtml(v.stops[detail.routeStopIndex],detail.routeStopIndex)));}return;}
 preserveDetails(()=>{renderHeader();renderStops();});renderDays();
 if(Number.isInteger(detail?.routeStopIndex))DetailView.refreshContent(popupHtml(getStops()[detail.routeStopIndex],detail.routeStopIndex));
 else if(detail)DetailView.close();
}
function mergeTripFiles([base,tokyo,routes,west,westRoutes]){
 return window.TripPersonal.patch(TripData.merge(base,tokyo,west),{...routes,days:{...routes.days,...westRoutes.days}});
}
async function sourceSignature(trip){const bytes=new TextEncoder().encode(JSON.stringify([trip.data,trip.routes])),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function finalizeOfflineTrip(){const values=await Promise.all(tripFiles.map(file=>TravelStore.readCachedJson(file+'?v='+TravelStore.VERSION))),trip=mergeTripFiles(values);TripData.prepare(trip.data,trip.routes);for(const d of trip.data.days)for(const v of d.variants){if(trip.routes.days[`${d.n}-${v.id}`]?.length!==v.stops.length-1)throw Error('전체 일정 저장을 확인할 수 없습니다. 다시 저장해 주세요.');}const signature=await sourceSignature(trip),snapshot=await TravelStore.saveSnapshot(trip.data,trip.routes,signature,TravelStore.checkedAt(tripFiles.map(file=>file+'?v='+TravelStore.VERSION))||Date.now());if(signature!==tripSignature)TravelStore.offerSnapshot(snapshot);}
function validateTrip(trip){
 if(trip.data?.days?.length!==22)throw Error('incomplete itinerary');
 TripData.prepare(trip.data,trip.routes);
 for(const day of trip.data.days)for(const variant of day.variants){const legs=trip.routes.days[`${day.n}-${variant.id}`];if(!legs||legs.length!==variant.stops.length-1||legs.some(l=>!l?.parts?.length))throw Error('incomplete routes');}
}
function refreshTrip(){
 if(tripRefresh)return tripRefresh;
 tripRefresh=(async()=>{
  try{
   // Never combine fresh files with cache fallbacks into a supposedly fresh trip.
   const files=await Promise.all(tripFiles.map(f=>TravelStore.readJson(f+'?v='+TravelStore.VERSION,{networkOnly:true})));
   const trip=mergeTripFiles(files),signature=await sourceSignature(trip);validateTrip(trip);
   const snapshot=await TravelStore.saveSnapshot(trip.data,trip.routes,signature);
   if(signature===tripSignature)TravelStore.useSnapshot(snapshot);else TravelStore.offerSnapshot(snapshot);
  }catch(_){TravelStore.markStale();}
  finally{tripRefresh=null;}
 })();return tripRefresh;
}
function applyTripUpdate(snapshot){
 const screen=screenSnapshot();DetailView.close();stopPlay();
 state.data=snapshot.data;state.routeData=snapshot.routes;tripSignature=snapshot.sourceSignature;
 state.incompleteData=false;$('#overviewView').disabled=false;preparePersonalTrip();
 state.selectedVariantByDay=JourneyState.preferences(state.data.days,state.selectedVariantByDay);
 navigateScreen(screen,{history:'replace',snapshot:screen});TravelStore.useSnapshot(snapshot);
 announce('새 일정 자료를 적용했어요. 선택한 날짜와 탑승 기록을 유지합니다.');
}
async function main(){
 OfflinePack.configure({finalize:finalizeOfflineTrip});
 try{
 const stored=await TravelStore.snapshot();const saved=stored?window.TripPersonal.patch(stored.data,stored.routes):null;
 if(saved){state.data=saved.data;state.routeData=saved.routes;tripSignature=saved.sourceSignature||await sourceSignature({data:state.data,routes:state.routeData});TravelStore.useSnapshot(saved);}
 else{
  const results=await Promise.allSettled(tripFiles.map(f=>TravelStore.readJson(f+'?v='+TravelStore.VERSION)));
  const [base,tokyo,routes,west,westRoutes]=results.map(r=>r.status==='fulfilled'?r.value:null);
  if(base&&tokyo&&routes&&west&&westRoutes){const trip=mergeTripFiles([base,tokyo,routes,west,westRoutes]);tripSignature=await sourceSignature(trip);state.data=trip.data;state.routeData=trip.routes;TravelStore.useSnapshot(await TravelStore.saveSnapshot(state.data,state.routeData,tripSignature,TravelStore.checkedAt(tripFiles.map(f=>f+'?v='+TravelStore.VERSION))));}
  else{if(!base)throw Error('저장된 일정이 없어요. 처음에는 통신 연결이 필요합니다.');{const patched=window.TripPersonal.patch(TripData.merge(base,tokyo,west),{days:{...(routes?.days||{}),...(westRoutes?.days||{})}});state.data=patched.data;state.routeData=patched.routes;}state.incompleteData=true;state.data.days=state.data.days.filter(d=>(d.n<=11?!!tokyo:!!west));if(!state.data.days.length)throw Error('확인된 지역 일정이 없어요. 통신 연결 후 다시 열어 주세요.');state.day=state.data.days[0].n;announce('일부 지역 자료 연결 실패 · 확인된 날짜만 표시합니다. 연결 후 새로고침해 주세요.');}
  if(results.some(r=>r.status==='rejected'))TravelStore.markStale();
 }
 preparePersonalTrip();try{const pass=JSON.parse(localStorage.getItem('routebook-pass-v2')||'null');if(pass)state.pass={...state.pass,...pass};}catch(_){}state.passEnabled=!!state.pass.enabled;
 for(const [dayKey,legs] of Object.entries(state.routeData.days))for(const leg of legs)if(leg)leg.dayNumber=Number(dayKey.split('-')[0]);if(!window.L)throw Error('지도 구성 요소를 불러오지 못했어요.');initMap();bindEvents();window.FlightPlayback?.init({map,pauseLocation:()=>window.RouteLocation?.pauseFollow(),prepareMap:()=>{flightPreviousProvider=tileProvider;setTiles('world',{temporary:true});},restoreMap:()=>{if(flightPreviousProvider){const previous=flightPreviousProvider;flightPreviousProvider=null;setTiles(previous,{temporary:tilePreference==='auto'});}},revealMap:()=>$('#map').scrollIntoView({block:'center',behavior:'instant'}),onManualStart:stopPlay,onManualControl:()=>stopPlay({keepFlight:true})});window.addEventListener('routebook:location-start',stopPlay);window.RouteLocation?.init({map,context:()=>({day:getDay(),variant:getVariant(),view:state.view,legs:state.routeData.days[`${state.day}-${getVariant().id}`]||[]}),selectDay:setDay,prepareMap:()=>setTiles('world')});state.selectedVariantByDay=JourneyState.load(state.data.days,journeyStorage);const initial=JourneyState.read(location.href,state.data.days,state.selectedVariantByDay);let restoredScreen=history.state?.routebook===2?history.state:null;try{const savedScreen=JSON.parse(sessionStorage.getItem('routebook-screen-snapshot-v1')||'null');if(savedScreen?.url===location.href)restoredScreen=savedScreen.snapshot;}catch(_){}if(state.incompleteData){initial.view='daily';$('#overviewView').disabled=true;}navigateScreen(initial,{history:'replace',snapshot:restoredScreen});TravelStore.status();$('#mapLoading').classList.add('done');setTimeout(()=>$('#mapLoading').remove(),400);window.RideTracker?.init({map,context:()=>({day:getDay(),variant:getVariant(),legs:state.routeData.days[`${state.day}-${getVariant().id}`]||[]}),focusProfile:focusRideProfile});if(saved)refreshTrip();window.__routebook={state,map,getStops,setDay,setVariant,selectStop,selectLeg,showOverview,stopPlay,getLeg,dailyCost,rail:RailDepartures};loadFlightRouteReferences().then(references=>{if(references){applyFlightRouteReferences(state.routeData,references);preparePersonalTrip();if(!state.playing&&!DetailView.isOpen()&&!window.FlightPlayback?.isActive())renderMap(false);}});}
 catch(e){$('#mapLoading').innerHTML=`${icon('info')}<strong>${esc(e.message)}</strong><button class="outline-button" onclick="location.reload()">다시 불러오기</button>`;console.error(e);}
}
main();
