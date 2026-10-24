'use strict';
const ICON_PATHS={
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
const MODE={walk:{label:'도보',color:'#49765d',icon:'walk'},metro:{label:'지하철',color:'#477b95',icon:'rail'},rail:{label:'철도',color:'#477b95',icon:'rail'},bus:{label:'버스',color:'#477b95',icon:'bus'},taxi:{label:'택시',color:'#477b95',icon:'taxi'},flight:{label:'비행기',color:'#c97a4c',icon:'flight'},ferry:{label:'배',color:'#a67a5a',icon:'ferry'}};
const state={data:null,day:2,variant:'main',view:'daily',filter:'all',search:'',night:false,selected:-1,playing:null,routeData:null,passEnabled:false};
let tileProvider="";
let map, tiles, routeLayer, markers=[],legLines=[],stopGroups=[],arrows=[];
const isNight=s=>s.kind==='sight'&&/야경|조명|등불|네온|겨울 조명|밤거리|밤바다|노을/.test(s.name+' '+s.description);
const getDay=()=>state.data.days.find(d=>d.n===state.day);
const getVariant=()=>getDay().variants.find(v=>v.id===state.variant)||getDay().variants[0];
const getStops=()=>getVariant().stops;
const getLeg=i=>state.routeData?.days?.[`${state.day}-${getVariant().id}`]?.[i-1]||null;
const hasTokyoRoutes=()=>!!state.routeData?.days?.[`${state.day}-${getVariant().id}`];
const distanceText=m=>m>=1000?`${(m/1000).toFixed(1)} km`:`${Math.round(m)} m`;
const fareText=f=>{if(!f)return '요금 미정';if(state.passEnabled&&f.passEligible)return '패스 적용 · 추가 0엔';if(state.passEnabled&&f.passExtraMax<f.max){return `패스 외 ${f.passExtraMin===f.passExtraMax?f.passExtraMin.toLocaleString():f.passExtraMin.toLocaleString()+'~'+f.passExtraMax.toLocaleString()}엔`;}return f.label||`${f.min.toLocaleString()}~${f.max.toLocaleString()}엔`;};
function costText(s){const d=s.details;if(!d)return '';return d.costLabel||(d.costMin===0&&d.costMax===0?'무료':d.costMin===d.costMax?`${d.costMin.toLocaleString()}엔`:`${d.costMin.toLocaleString()}~${d.costMax.toLocaleString()}엔`);}
function placeFacts(s){const d=s.details;if(!d)return '';return `<div class="place-facts"><span>${icon('calendar')}체류 ${esc(d.stayLabel||d.typicalStayMin+'분')}</span><span>${icon('star')}${esc(costText(s))}</span></div>`;}
function detailHtml(s,popup=false){const d=s.details;if(!d)return '';const sources=(d.sources||[]).filter(Boolean);return `<div class="place-detail-content"><div class="detail-section"><b>특징</b><p>${esc(d.feature||cleanDesc(s))}</p></div><div class="detail-section"><b>할 것</b><ul>${(d.thingsToDo||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div><div class="detail-section"><b>비용</b><p>${esc(costText(s))}${d.costNote?` · ${esc(d.costNote)}`:''}</p></div>${d.reservationNote?`<div class="detail-section"><b>예약·방문 팁</b><p>${esc(d.reservationNote)}</p></div>`:''}${sources.length?`<div class="detail-source-links">${sources.slice(0,3).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">공식·참고 안내 ${i+1} ↗</a>`).join('')}</div>`:''}</div>`;}
function legHtml(leg,part=null){const walk=part&&['walk','transfer'].includes(part.mode);const partFare=walk?'도보·환승 추가 0엔':fareText(leg.fare);return `<div class="popup-time">${esc(part?.line||leg.summary)}</div><div class="popup-title">${esc(part?part.from:leg.from)} → ${esc(part?part.to:leg.to)}</div><div class="route-metrics"><span><small>${part?'선택한 선 거리':'전체 구간 거리'}</small><b>${distanceText(part?part.distanceM:leg.distanceM)}</b></span><span><small>${walk?'선택한 선 요금':'환승 포함 구간 총운임'}</small><b>${esc(partFare)}</b></span></div><div class="popup-desc">전체 이동 ${esc(leg.durationLabel)} · 총 ${distanceText(leg.distanceM)}<br>${esc(leg.summary)}</div>${part&&walk&&leg.fare.max>0?`<p class="route-fare-note">철도 포함 전체 구간 운임: ${esc(fareText(leg.fare))}</p>`:''}<p class="route-fare-note">${esc(leg.fare.basis)}${state.passEnabled?' · 72시간권 구입비 2,000엔 별도':''}</p><details class="route-part-list"><summary>도보·노선·환승 순서</summary>${leg.parts.map(p=>`<div>${icon((MODE[p.mode]||MODE.walk).icon)}<span><b>${esc(p.line)}</b><br>${esc(p.from)} → ${esc(p.to)} · ${distanceText(p.distanceM)}</span></div>`).join('')}</details><p class="geometry-note">${esc(part?.geometrySource||leg.note)}</p><div class="popup-links"><a href="${directionsUrl(getStops().find(s=>s.uid===leg.fromUid),getStops().find(s=>s.uid===leg.toUid))}" target="_blank" rel="noopener">출구·출발시각 길찾기 ↗</a>${(leg.fare.sources||[]).slice(0,1).map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">운임 안내 ↗</a>`).join('')}</div>`;}
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
function selectLeg(i){const leg=getLeg(i);if(!leg)return;stopPlay();const coords=leg.parts.flatMap(p=>p.coords);map.fitBounds(L.latLngBounds(coords),{padding:[50,80],maxZoom:16});const middle=coords[Math.floor(coords.length/2)];L.popup({maxWidth:340,maxHeight:390,className:'route-info-popup'}).setLatLng(middle).setContent(legHtml(leg)).openOn(map);}

const modesIn=stops=>[...new Set(stops.slice(1).map(s=>s.modeFromPrevious))];
const kindLabel=k=>({hotel:'숙소',sight:'관광',food:'식사',cafe:'카페',station:'역·환승',airport:'공항',port:'항구'}[k]||'방문');
function mapUrl(s){const f=state.data.food[s.foodKey];return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((f?.jp||s.jp||s.name)+' '+(s.address||s.area||''))}`;}
function directionsUrl(a,b){let mode=b.modeFromPrevious==='walk'?'walking':b.modeFromPrevious==='taxi'?'driving':'transit';return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;}
function announce(t){const el=$('#toast');el.textContent=t;el.classList.add('visible');clearTimeout(announce.timer);announce.timer=setTimeout(()=>el.classList.remove('visible'),2500);}
function cleanDesc(s){return s.description.replace(/지도상 대표 지점\. 실제 출입구는 현장 안내를 확인한다\.?/g,'').replace(/지도점은 주소 기준점으로 실제 출입구와 다를 수 있다\.?/g,'').replace(/주소의 블록 대표 좌표이며 실제 매장 입구와 다를 수 있음\.?/g,'').trim();}

function renderDays(){
 const days=state.data.days.filter(d=>(state.filter==='all'||d.group===state.filter)&&(state.search===''||[d.date,d.title,d.cityLabel,...d.variants.flatMap(v=>v.stops.map(s=>s.name))].join(' ').toLowerCase().includes(state.search.toLowerCase())));
 let prev='';$('#dayList').innerHTML=days.map(d=>{let h='';if(d.section!==prev){h=`<div class="list-label"><span>${esc(d.section)}</span><span>${d.section==='TOKYO'?'11 NIGHTS':d.section==='KANSAI'?'6 NIGHTS':d.section==='FUKUOKA'?'3 NIGHTS':'ON THE ROAD'}</span></div>`;prev=d.section;}return h+`<button class="day-item ${d.n===state.day&&state.view==='daily'?'active':''}" data-day="${d.n}" aria-label="1월 ${d.date.slice(3)}일 ${esc(d.title)}" ${d.n===state.day&&state.view==='daily'?'aria-current="date"':''}><div class="day-date">${d.date.slice(3)}<small>JAN · ${d.weekday}</small></div><div><div class="day-caption">${esc(d.shortTitle)}</div><div class="day-city">DAY ${String(d.n).padStart(2,'0')} · ${esc(d.cityLabel)}</div></div></button>`;}).join('')||'<div class="empty-search">검색한 일정이 없어요.<br>도시나 장소 이름으로 찾아보세요.</div>';
 $$('#dayList [data-day]').forEach(b=>b.addEventListener('click',()=>setDay(Number(b.dataset.day))));
 $$('#cityFilters button').forEach(b=>b.classList.toggle('active',b.dataset.city===state.filter));
}
function renderHeader(){
 const d=getDay(),v=getVariant(),stops=v.stops;
 $('#dailyView').classList.toggle('active',state.view==='daily');$('#overviewView').classList.toggle('active',state.view==='overview');
 $('#nightBtn').setAttribute('aria-pressed',state.night);$('#nightBtn').disabled=state.view==='overview';
 $('#mapTitle').innerHTML=`<div class="map-kicker"><span class="city-dot"></span>${esc(d.date.replace('/','.'))} ${d.weekday} <span> / </span>DAY ${String(d.n).padStart(2,'0')} <span> / </span>${esc(d.cityEn)}</div><h2>${esc(v.title||d.shortTitle)}</h2><div class="map-route-subtitle">${esc(v.summary||d.mapSummary)}</div><div class="map-card-stats"><span>${icon('pin')}${stops.length}개 지점</span><span>${icon('walk')}${esc(v.walk||d.walk)}</span><span>${icon('moon')}야경 ${stops.filter(isNight).length}곳</span></div>`;
 $('#dayHeader').innerHTML=`<div class="detail-date-row"><span class="detail-date">JAN ${d.date.slice(3)} · ${d.weekday}요일</span><span class="detail-badge">DAY ${String(d.n).padStart(2,'0')}</span></div><h2>${esc(v.title||d.shortTitle)}</h2><p>${esc(v.focus||d.focus)}</p>${d.variants.length>1?`<div class="variant-tabs" role="group" aria-label="${esc(d.date)} 일정 선택">${d.variants.map(a=>`<button data-variant="${a.id}" class="${state.variant===a.id?'active':''}" aria-pressed="${state.variant===a.id}">${esc(a.label||a.title||a.id)}</button>`).join('')}</div>`:''}${hasTokyoRoutes()?`<label class="pass-toggle"><input id="passToggle" type="checkbox" ${state.passEnabled?'checked':''}>도쿄 지하철 72시간권 적용<span>메트로·도에이 / 구입비 2,000엔 별도</span></label>`:''}`;
 $$('#dayHeader [data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
 $('#passToggle')?.addEventListener('change',e=>{state.passEnabled=e.target.checked;renderHeader();renderStops();renderMap(false);});
 $('#dayCounter').textContent=`${String(d.n).padStart(2,'0')} / 22`;$('#prevDay').disabled=d.n===1;$('#nextDay').disabled=d.n===22;
 $('#dayNote').innerHTML=d.important?`<div class="day-note"><strong>${icon('info')} 오늘 기억할 것</strong>${esc(d.important)}</div>`:'';
}
function renderStops(){
 const d=getDay(),v=getVariant(),stops=v.stops;
 $('#stopList').innerHTML=stops.map((s,i)=>{
  const f=state.data.food[s.foodKey],m=MODE[s.modeFromPrevious]||MODE.walk;
  let leg='';const route=getLeg(i);if(route){leg=`<button class="leg-route-button" data-leg="${i}" aria-label="${esc(route.from)}에서 ${esc(route.to)} 이동 상세">${icon((MODE[s.modeFromPrevious]||MODE.rail).icon)}<span><strong>${esc(route.summary)}</strong><small>${distanceText(route.distanceM)} · ${esc(route.durationLabel)} · <b>${esc(fareText(route.fare))}</b></small></span>${icon('info')}</button>`;}else if(i>0){const isTravel=['flight','ferry'].includes(s.modeFromPrevious);leg=`<div class="leg-row">${icon(m.icon)}<div class="leg-content"><span class="leg-mode">${m.label}</span>${esc(s.transportFromPrevious&&s.transportFromPrevious!==m.label?s.transportFromPrevious:'')}</div><a class="leg-direction" target="_blank" rel="noopener" href="${isTravel?mapUrl(s):directionsUrl(stops[i-1],s)}" aria-label="${esc(stops[i-1].name)}에서 ${esc(s.name)} ${isTravel?'도착 장소':'길찾기'}">${isTravel?'도착지':'길찾기'} ${icon('arrowUpRight')}</a></div>`;}
  return leg+`<div class="stop-row" id="stop-${i}"><div class="stop-card ${i===state.selected?'active':''} ${state.night&&isNight(s)?'night-focus':''}" data-stop="${i}" tabindex="0" role="button" aria-label="${i+1}. ${esc(s.name)} 지도에서 보기" aria-pressed="${i===state.selected}"><div class="stop-number">${i+1}</div><div class="stop-content"><div class="stop-time">${esc(s.time)}${isNight(s)?'<span class="night-pill">노을·야경</span>':''}</div><div class="stop-name">${esc(s.name)}</div><div class="stop-desc">${esc(cleanDesc(s))}</div>${placeFacts(s)}${s.details?`<details class="place-expand"><summary>특징·할 일·비용 자세히</summary>${detailHtml(s)}</details>`:''}<div class="stop-links"><a href="${mapUrl(s)}" target="_blank" rel="noopener" class="place-map">장소 보기 ${icon('arrowUpRight')}</a>${f?`<a href="${esc(f.url)}" target="_blank" rel="noopener">매장 안내 ${icon('arrowUpRight')}</a>`:''}</div>${f?`<div class="food-detail"><strong>${s.kind==='cafe'?'카페':'식사'} · ${esc(f.budget)}</strong><br>${esc(f.order)}<br><span>${esc(f.hours)}</span></div>`:''}</div></div></div>`;
 }).join('');
 $$('#stopList [data-stop]').forEach(el=>{el.addEventListener('click',e=>{if(e.target.closest('a,details'))return;selectStop(Number(el.dataset.stop),true,false);});el.addEventListener('keydown',e=>{if(e.target.closest('a,details'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStop(Number(el.dataset.stop),true,false);}});});
 $$('#stopList [data-leg]').forEach(b=>b.addEventListener('click',()=>selectLeg(Number(b.dataset.leg))));
 $('#routeDetails').innerHTML=`<h3>${icon('rail')} 오늘의 이동 메모</h3>${(v.routes||d.routes).map(s=>`<p>${esc(s)}</p>`).join('')}<p>${esc(v.note||d.note)}</p><details class="full-schedule"><summary>시간표 전체 보기</summary>${(v.schedule||d.schedule).map(r=>`<div class="schedule-row"><b>${esc(r[0])}</b><div><strong>${esc(r[1])}</strong><br>${esc(r[2])}</div></div>`).join('')}</details>`;
}

function initMap(){
 map=L.map('map',{zoomControl:false,scrollWheelZoom:true,zoomSnap:.25,minZoom:3,maxZoom:19,preferCanvas:false});
 L.control.zoom({position:'topright'}).addTo(map);L.control.scale({imperial:false,position:'bottomright',maxWidth:90}).addTo(map);
 setTiles('gsi');routeLayer=L.layerGroup().addTo(map);map.on('zoomend',updateArrowAngles);window.addEventListener('resize',()=>map.invalidateSize());
}
function setTiles(provider){
 if(tileProvider===provider&&tiles)return;tileProvider=provider;
 if(tiles)map.removeLayer(tiles);
 const gsi=provider==='gsi';
 tiles=L.tileLayer(gsi?'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png':'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,minNativeZoom:gsi?5:0,maxNativeZoom:gsi?18:19,attribution:gsi?'출처: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院 · 地理院タイル</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors':'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',crossOrigin:true});
 let errors=0;tiles.on('tileload',()=>{$('#tileError').classList.add('hidden');});tiles.on('tileerror',()=>{if(++errors>10)$('#tileError').classList.remove('hidden');});tiles.addTo(map);
}
function popupHtml(s,i){const f=state.data.food[s.foodKey];return `<div class="popup-time">${i+1}. ${esc(s.time)} · ${kindLabel(s.kind)}</div><div class="popup-title">${esc(s.name)}</div>${placeFacts(s)}<div class="popup-address">${esc(s.address||s.area)}</div>${s.details?detailHtml(s,true):`<div class="popup-desc">${esc(cleanDesc(s))}</div>`}<div class="popup-links"><a href="${mapUrl(s)}" target="_blank" rel="noopener">장소 길찾기 ↗</a>${f?`<a href="${esc(f.url)}" target="_blank" rel="noopener">매장 안내 ↗</a>`:''}</div>`;}

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
function renderMap(fit=true){
 map.closePopup();
 if(state.view==='daily')setTiles(state.day<=11?'gsi':'osm');
 routeLayer.clearLayers();markers=[];arrows=[];legLines=[];stopGroups=[];
 if(state.view==='overview'){renderOverviewMap();return;}
 const stops=getStops();
 for(let i=1;i<stops.length;i++){
  const a=stops[i-1],b=stops[i],m=MODE[b.modeFromPrevious]||MODE.walk;
  const detailed=getLeg(i);
  if(detailed){detailed.parts.forEach(part=>{if(part.coords.length<2||part.distanceM<8)return;const color=part.mode==='transfer'?'#949e96':(MODE[part.mode]||MODE.rail).color;const style={color,weight:3.5,opacity:state.night?.5:.95,lineCap:'round',lineJoin:'round',dashArray:part.mode==='transfer'?'3 5':null};L.polyline(part.coords,{color:'#fff',weight:7.5,opacity:.94,interactive:false}).addTo(routeLayer);const line=L.polyline(part.coords,style).addTo(routeLayer);const hit=L.polyline(part.coords,{weight:18,opacity:0,color,interactive:true}).addTo(routeLayer);const walk=['walk','transfer'].includes(part.mode);hit.bindTooltip(`<strong>${esc(part.line)}</strong><br>${esc(part.from)} → ${esc(part.to)}<br><b>${distanceText(part.distanceM)}</b> · ${walk?'추가 0엔':esc(fareText(detailed.fare))}${walk?'':' <small>(전체 구간)</small>'}<br><small>전체 이동 ${esc(detailed.durationLabel)} · 클릭하면 환승 상세</small>`,{sticky:true,direction:'top',offset:[0,-10],className:'route-hover-tooltip'});hit.bindPopup(()=>legHtml(detailed,part),{maxWidth:340,maxHeight:390,className:'route-info-popup'});hit.on('mouseover',()=>line.setStyle({weight:6,opacity:1}));hit.on('mouseout',()=>line.setStyle({weight:i===state.selected?5:3.5,opacity:state.night?.5:.95}));legLines.push({line,index:i,color});if(part.distanceM>300)arrowFor(part.coords,color);});continue;}
  if(map.distance([a.lat,a.lng],[b.lat,b.lng])<15)continue;
  const points=pathPoints(a,b),style={color:m.color,weight:3.1,opacity:state.night?.45:.88,lineCap:'round',lineJoin:'round',dashArray:b.modeFromPrevious==='walk'?null:'7 7'};
  L.polyline(points,{color:'#fff',weight:6.7,opacity:.9,interactive:false}).addTo(routeLayer);
  const line=L.polyline(points,style).addTo(routeLayer);line.bindPopup(`<div class="popup-time">${m.label} · ${i} → ${i+1}</div><div class="popup-title">${esc(a.name)} → ${esc(b.name)}</div><div class="popup-desc">${esc(b.transportFromPrevious)}</div>${['flight','ferry'].includes(b.modeFromPrevious)?'':`<div class="popup-links"><a href="${directionsUrl(a,b)}" target="_blank" rel="noopener">실제 경로 길찾기 ↗</a></div>`}`);legLines.push({line,index:i,color:m.color});arrowFor(points,m.color);
 }
 const groups=new Map();stops.forEach((s,i)=>{const key=s.lat.toFixed(5)+','+s.lng.toFixed(5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
 groups.forEach(indices=>{
  const i=indices[0],s=stops[i];const marker=L.marker([s.lat,s.lng],{icon:markerIcon(indices),keyboard:true,alt:indices.map(i=>`${i+1}. ${stops[i].name}`).join(' / '),title:s.name,zIndexOffset:s.kind==='station'?0:100}).addTo(routeLayer);
  marker.bindTooltip(`${indices.map(i=>i+1).join('·')} · ${esc(s.name)}`,{direction:'top',offset:[0,-25],className:'stop-tooltip'});
  marker.on('click',()=>{let idx=indices[0];if(indices.includes(state.selected))idx=indices[(indices.indexOf(state.selected)+1)%indices.length];selectStop(idx,false,true);marker.bindPopup(popupHtml(stops[idx],idx),{maxWidth:340,maxHeight:420,className:'place-info-popup'}).openPopup();});
  indices.forEach(idx=>markers[idx]=marker);stopGroups.push({indices,marker});
 });
 $('.route-caution').textContent=hasTokyoRoutes()?'선에 마우스를 올리거나 눌러 거리·예상 운임을 확인하세요. 역내 환승은 대표 연결입니다.':'이 지역은 기존 방문 순서 표시입니다. 실제 경로는 구간별 길찾기를 확인하세요.';
 if(fit)fitRoute(getDay().n===1&&hasTokyoRoutes());requestAnimationFrame(updateArrowAngles);
}
function markerIcon(indices){const stops=getStops(),first=stops[indices[0]],active=indices.includes(state.selected),night=state.night&&indices.some(i=>isNight(stops[i]));return L.divIcon({className:'route-marker',html:`<div class="pin-number ${first.kind} ${active?'active':''} ${night?'night':''}"><span>${indices.length>1?indices.map(i=>i+1).join('·'):indices[0]+1}</span></div>`,iconSize:[30,35],iconAnchor:[15,33]});}
function fitRoute(focus=false){
 map.stop();
 const stops=state.view==='overview'?overviewStops():getStops();let coords=stops.map(s=>[s.lat,s.lng]);
 if(!focus&&state.view==='daily'&&hasTokyoRoutes())coords.push(...(state.routeData.days[`${state.day}-${getVariant().id}`]||[]).filter(Boolean).flatMap(l=>l.parts.flatMap(p=>p.coords)));
 if(focus&&state.view==='daily'){
  let local=stops.filter(s=>['sight','food','cafe'].includes(s.kind));
  // Long-distance day trips should be explorable without the departure-city anchor.
  if(local.length>=2){let best=[];for(const a of local){const near=local.filter(b=>map.distance([a.lat,a.lng],[b.lat,b.lng])<22000);if(near.length>best.length)best=near;}if(best.length>=2)local=best;coords=local.map(s=>[s.lat,s.lng]);}
 }
 if(coords.length)map.fitBounds(L.latLngBounds(coords),{paddingTopLeft:[window.innerWidth<=740?25:42,window.innerWidth<=740?155:175],paddingBottomRight:[window.innerWidth<=740?25:42,window.innerWidth<=740?110:133],maxZoom:15,animate:false});updateArrowAngles();
}
function selectStop(index,fly=true,scroll=true){
 if(state.view!=='daily')return;const stops=getStops();if(index<0||index>=stops.length)return;state.selected=index;
 $$('.stop-card').forEach(el=>{const active=Number(el.dataset.stop)===index;el.classList.toggle('active',active);el.setAttribute('aria-pressed',active);});
 stopGroups.forEach(g=>{g.marker.setIcon(markerIcon(g.indices));g.marker.setZIndexOffset(g.indices.includes(index)?1000:100);});
 legLines.forEach(({line,index:i,color})=>line.setStyle({color,weight:i===index?5:3.1,opacity:state.night?(i===index?.95:.4):(i===index?1:.75)}));
 const s=stops[index];if(fly){const z=['airport','port'].includes(s.kind)?12:15;map.flyTo([s.lat,s.lng],Math.max(map.getZoom(),z),{duration:.65});markers[index]?.bindPopup(popupHtml(s,index),{maxWidth:340,maxHeight:420,className:'place-info-popup'}).openPopup();}
 if(scroll){const el=$(`#stop-${index}`),scroller=$('#itineraryScroll');if(window.innerWidth>740&&el){scroller.scrollTo({top:Math.max(0,el.offsetTop-scroller.offsetTop-35),behavior:'smooth'});}else if(window.innerWidth<=740&&el){el.scrollIntoView({behavior:'smooth',block:'center'});}}
 $('#playBtn').innerHTML=icon(state.playing?'pause':'play')+`<span>${state.playing?'재생 중':`${index+1} / ${stops.length} · 동선 보기`}</span>`;
}
function stopPlay(){if(state.playing)clearInterval(state.playing);state.playing=null;$('#playBtn').innerHTML=icon('play')+'<span>동선 따라가기</span>';}
function setDay(n,options={}){
 stopPlay();state.day=Math.max(1,Math.min(22,n));state.variant='main';state.view='daily';state.selected=-1;state.night=false;state.passEnabled=n>=9&&n<=11;$('#itineraryScroll').scrollTop=0;
 renderDays();renderHeader();renderStops();renderMap();updateUrl();
 if(options.scrollNav){$('#dayList .day-item.active')?.scrollIntoView({block:'nearest',inline:'center'});}
}
function setVariant(id){stopPlay();state.variant=id;state.selected=-1;renderHeader();renderStops();renderMap();updateUrl();}
function updateUrl(){const u=new URL(location.href);u.searchParams.set('day',state.day);if(state.variant!=='main')u.searchParams.set('variant',state.variant);else u.searchParams.delete('variant');if(state.view==='overview')u.searchParams.set('view','overview');else u.searchParams.delete('view');history.replaceState(null,'',u);try{localStorage.setItem('routebook-day',String(state.day));}catch{}}
function overviewStops(){return [
 {name:'동대구',lat:35.8797,lng:128.6283,modeFromPrevious:'walk',days:'1/8 출발 · 1/29 귀가',n:1},
 {name:'대구공항',lat:35.8941,lng:128.6589,modeFromPrevious:'taxi',days:'동대구 → 대구공항',n:1},
 {name:'도쿄',lat:35.7007,lng:139.774,modeFromPrevious:'flight',days:'1/8–19 · 11박',n:2},
 {name:'오사카',lat:34.6674,lng:135.501,modeFromPrevious:'flight',days:'1/19–25 · 6박 · 교토·나라·고베',n:12},
 {name:'후쿠오카',lat:33.5917,lng:130.4207,modeFromPrevious:'flight',days:'1/25–28 · 3박',n:18},
 {name:'부산',lat:35.1155,lng:129.0422,modeFromPrevious:'ferry',days:'1/28–29 · 1박',n:21},
 {name:'동대구',lat:35.8797,lng:128.6283,modeFromPrevious:'rail',days:'1/29 부산 → 동대구 기차',n:22}
 ];}
function renderOverviewMap(){const stops=overviewStops();for(let i=1;i<stops.length;i++){const a=stops[i-1],b=stops[i],color=MODE[b.modeFromPrevious].color,pts=pathPoints(a,b);L.polyline(pts,{color:'#fff',weight:7,opacity:.8,interactive:false}).addTo(routeLayer);L.polyline(pts,{color,weight:3.2,dashArray:'7 7',opacity:.9}).addTo(routeLayer);arrowFor(pts,color);}stops.slice(0,-1).forEach((s,i)=>{const mk=L.marker([s.lat,s.lng],{icon:L.divIcon({className:'route-marker',html:`<div class="pin-number ${i===1?'airport':''}"><span>${i+1}</span></div>`,iconSize:[30,35],iconAnchor:[15,33]})}).addTo(routeLayer);mk.bindTooltip(esc(s.name),{permanent:true,direction:'right',offset:[17,-14],className:'stop-tooltip'});mk.bindPopup(`<div class="popup-title">${esc(s.name)}</div><div class="popup-desc">${esc(s.days)}</div><div class="popup-links"><a href="?day=${s.n}">그날의 일정 보기 ↗</a></div>`);});fitRoute();}
function showOverview(){
 stopPlay();state.view='overview';renderDays();$('#dailyView').classList.remove('active');$('#overviewView').classList.add('active');$('#nightBtn').disabled=true;
 $('#mapTitle').innerHTML='<div class="map-kicker"><span class="city-dot"></span>JAN 08 — JAN 29, 2027</div><h2>도쿄에서 시작해,<br>배로 돌아오는 여행.</h2><div class="map-route-subtitle">대구 → 도쿄 → 오사카 → 후쿠오카 → 부산</div><div class="map-card-stats"><span>'+icon('calendar')+'21박 22일</span><span>'+icon('flight')+'항공 3구간</span><span>'+icon('ferry')+'뉴 카멜리아호</span></div>';
 $('#dayHeader').innerHTML='<div class="detail-date-row"><span class="detail-date">THE WHOLE JOURNEY</span><span class="detail-badge">JANUARY 2027</span></div><h2>겨울 여행, 전체 동선</h2><p>각 도시를 누르면 그곳에서의 첫날로 이동해요.</p>';
 $('#dayNote').innerHTML='';$('#stopList').innerHTML=`<div class="overview-stats">${[['22','여행 일수'],['21','숙박 일수'],['3','일본 내 거점'],['1','매일 카페 한 시간']].map(([a,b])=>`<div class="overview-stat"><strong>${a}</strong><span>${b}</span></div>`).join('')}</div>${[['도쿄','1/8–19 · 이리야 숙소 · 근교 3일',2],['오사카·교토·나라·고베','1/19–25 · 주오 오아시스',12],['후쿠오카','1/25–28 · 하카타 숙소 · 시내 중심',18],['부산·동대구','1/28–29 · 배로 입국 후 부산 1박',21]].map(([a,b,n])=>`<button class="overview-city" data-open-day="${n}"><span class="overview-city-dot"></span><span><strong>${a}</strong><small>${b}</small></span>${icon('chevronRight')}</button>`).join('')}`;
 $('#routeDetails').innerHTML='<h3>선택한 교통편</h3><p>1/8 대구 TW251 11:10–13:20 · 나리타T2<br>1/19 JAL 하네다 → 이타미 12:35–13:45<br>1/25 ANA NH1189 10:45–12:00<br>1/28 뉴 카멜리아호 정규 12:30–18:30<br>1/29 부산 → 동대구 열차, 점심 무렵</p><p>예약·결제는 미실행. 날짜별 실제 운항·편명과 최종 조건은 발권 전 확인하세요.</p>';
 $$('[data-open-day]').forEach(b=>b.addEventListener('click',()=>setDay(Number(b.dataset.openDay),{scrollNav:true})));renderMap();updateUrl();
}

function bindEvents(){
 $('#cityFilters').addEventListener('click',e=>{const b=e.target.closest('[data-city]');if(!b)return;state.filter=b.dataset.city;renderDays();});$('#daySearch').addEventListener('input',e=>{state.search=e.target.value.trim();renderDays();});
 $('#dailyView').addEventListener('click',()=>setDay(state.day));$('#overviewView').addEventListener('click',showOverview);
 $('#prevDay').addEventListener('click',()=>setDay(state.day-1,{scrollNav:true}));$('#nextDay').addEventListener('click',()=>setDay(state.day+1,{scrollNav:true}));
 $('#fitBtn').addEventListener('click',()=>{map.closePopup();fitRoute();});$('#focusBtn').addEventListener('click',()=>{map.closePopup();fitRoute(true);});
 $('#nightBtn').addEventListener('click',()=>{state.night=!state.night;$('#nightBtn').setAttribute('aria-pressed',state.night);renderStops();renderMap(false);if(state.night){const ns=getStops().filter(isNight);if(ns.length)map.fitBounds(L.latLngBounds(ns.map(s=>[s.lat,s.lng])),{paddingTopLeft:[30,window.innerWidth<=740?155:175],paddingBottomRight:[30,window.innerWidth<=740?110:135],maxZoom:15});else announce('이 날은 이동·낮 산책 위주 일정이에요.');}else fitRoute();});
 $('#previousStop').addEventListener('click',()=>{stopPlay();selectStop(Math.max(0,state.selected-1));});$('#nextStop').addEventListener('click',()=>{stopPlay();selectStop(Math.min(getStops().length-1,state.selected+1));});
 $('#playBtn').addEventListener('click',()=>{if(state.view==='overview'){setDay(1);return;}if(state.playing){stopPlay();return;}const tick=()=>{const n=state.selected+1;if(n>=getStops().length){stopPlay();announce('오늘의 동선을 모두 둘러봤어요.');return;}selectStop(n,true,window.innerWidth>740);};state.playing=setInterval(tick,3300);if(state.selected===getStops().length-1)state.selected=-1;tick();});
 $('#shareBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);announce('현재 날짜의 지도 링크를 복사했어요.');}catch{announce('주소창의 링크로 현재 날짜를 공유할 수 있어요.');}});
 $('#aboutBtn').addEventListener('click',()=>$('#aboutDialog').showModal());$('#closeAbout').addEventListener('click',()=>$('#aboutDialog').close());$('#aboutDialog').addEventListener('click',e=>{if(e.target===$('#aboutDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 $('#retryTiles').addEventListener('click',()=>{const provider=tileProvider;tileProvider='';setTiles(provider);$('#tileError').classList.add('hidden');});
 document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||$('#aboutDialog').open)return;if(e.key==='/'){e.preventDefault();$('#daySearch').focus();}else if(e.key==='ArrowRight'){e.preventDefault();setDay(state.day+1,{scrollNav:true});}else if(e.key==='ArrowLeft'){e.preventDefault();setDay(state.day-1,{scrollNav:true});}});
}

async function main(){
 try{const [response,tokyo,routes]=await Promise.all([fetch('data.json?v=20261023'),fetch('tokyo-data.json?v=20261024-tokyo'),fetch('tokyo-routes.json?v=20261024-tokyo')]);if(!response.ok||!tokyo.ok||!routes.ok)throw Error('일정·경로 데이터를 불러오지 못했어요.');state.data=applyTokyoData(await response.json(),await tokyo.json());state.routeData=await routes.json();if(!window.L)throw Error('지도 구성 요소를 불러오지 못했어요.');initMap();bindEvents();const q=new URLSearchParams(location.search);let n=Number(q.get('day'));if(!Number.isInteger(n)||n<1||n>22)n=2;setDay(n);if(getDay().variants.some(v=>v.id===q.get('variant')))setVariant(q.get('variant'));if(q.get('view')==='overview')showOverview();$('#mapLoading').classList.add('done');setTimeout(()=>$('#mapLoading').remove(),400);window.__routebook={state,map,getStops,setDay,setVariant,selectStop,selectLeg,showOverview,stopPlay,getLeg};}
 catch(e){$('#mapLoading').innerHTML=`${icon('info')}<strong>${esc(e.message)}</strong><button class="outline-button" onclick="location.reload()">다시 불러오기</button>`;console.error(e);}
}
main();
