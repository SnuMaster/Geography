'use strict';
const AIRLINE_BRANDS={
 trinity:{name:'트리니티항공',src:'assets/airlines/trinity.svg'},
 jal:{name:'JAL 일본항공',src:'assets/airlines/jal.svg'},
 ana:{name:'ANA 전일본공수',src:'assets/airlines/ana.svg'}
};
function airlineFor(part){if(part?.mode!=='flight')return null;const line=part.line||'';return /TW251|트리니티|Trinity/i.test(line)?'trinity':/\bJAL\b/.test(line)?'jal':/\bANA\b/.test(line)?'ana':null;}
function operatorLogo(part,extra=''){
 const isUber=part?.mode==='taxi',isKtx=part?.lineId==='KORAIL.GyeongbuHSR'||/KTX/.test(part?.line||''),isShinkansen=part?.lineId==='JR-Central.TokaidoShinkansen';
 if(!isUber&&!isKtx&&!isShinkansen)return '';
 const type=isUber?'uber':isKtx?'ktx':'shinkansen',name=isUber?'Uber':isKtx?'KTX':'신칸센';
 return '<img class="operator-logo operator-'+type+' '+extra+'" src="assets/operators/'+type+'.svg" alt="'+name+' 로고" width="72" height="27" decoding="async">';
}
function airlineLogo(part,extra=''){const key=airlineFor(part);if(!key)return '';const b=AIRLINE_BRANDS[key];return `<img class="airline-logo airline-${key} ${extra}" src="${b.src}" alt="${b.name} 로고" width="96" height="30" decoding="async">`;}
// Line letters follow the operators' published station-numbering maps.
// Colors are screen approximations of the line colors, not operator logos.
const RAIL_LINES={
 'Yurikamome.Yurikamome':{code:'U',color:'#27404e',shape:'rounded',source:'https://www.yurikamome.co.jp/'},
 'Minatomirai.Minatomirai':{code:'MM',color:'#09357f',shape:'rounded',source:'https://www.mm21railway.co.jp/global/english/info/pdf/map.pdf'},
 'JR-East.KeihinTohokuNegishi':{code:'JK',color:'#00b2e5',shape:'square',source:'https://www.jreast.co.jp/map/'},
 'JR-East.Ito':{code:'JT',color:'#f68b1e',shape:'square',source:'https://www.jreast.co.jp/map/'},
 'Tobu.TobuSkytree':{code:'TS',color:'#0f6cc3',shape:'rounded',source:'https://www.tobu.co.jp/railway/guide/route/'},
 'Tobu.Nikko':{code:'TN',color:'#ffa500',shape:'rounded',source:'https://www.tobu.co.jp/railway/guide/route/'},
 'OdakyuHakone.HakoneTozan':{code:'OH',color:'#f15a22',shape:'rounded',source:'https://www.hakonenavi.jp/transportation/routemap/'},
 'Hakone.Cable':{code:'OH',color:'#f15a22',shape:'rounded',vehicle:'cable',source:'https://www.hakonenavi.jp/transportation/routemap/'},
 'Hakone.Ropeway':{code:'OH',color:'#ec6d82',shape:'rounded',vehicle:'ropeway',source:'https://www.hakonenavi.jp/transportation/routemap/'},
 'TobuBus.Nikko.C':{code:'C',color:'#d96a24',shape:'rounded',vehicle:'bus',source:'https://www.tobu-bus.com/pc/area/nikko/'},
 'Atami.FuuaShuttle':{code:'FUUA',color:'#226b8e',shape:'rounded',vehicle:'bus',source:'https://www.atamibayresort.com/access/'},
 'JR-Central.TokaidoShinkansen':{code:'新幹線',color:'#0068b7',shape:'rounded',logo:true},
 'TokyoMonorail.HanedaAirport':{code:'MO',color:'#657078',shape:'rounded',colorUnknown:true},
 'KORAIL.GyeongbuHSR':{code:'KTX',color:'#0054a6',shape:'square'},
 'TokyoMetro.Ginza':{code:'G',color:'#ff9500',shape:'circle'},
 'TokyoMetro.Marunouchi':{code:'M',color:'#f62e36',shape:'circle'},
 'TokyoMetro.Hibiya':{code:'H',color:'#b5b5ac',shape:'circle'},
 'TokyoMetro.Tozai':{code:'T',color:'#009bbf',shape:'circle'},
 'TokyoMetro.Chiyoda':{code:'C',color:'#00bb85',shape:'circle'},
 'TokyoMetro.Yurakucho':{code:'Y',color:'#c1a470',shape:'circle'},
 'TokyoMetro.Hanzomon':{code:'Z',color:'#8f76d6',shape:'circle'},
 'TokyoMetro.Namboku':{code:'N',color:'#00ac9b',shape:'circle'},
 'TokyoMetro.Fukutoshin':{code:'F',color:'#9c5e31',shape:'circle'},
 'Toei.Asakusa':{code:'A',color:'#e85298',shape:'circle'},
 'Toei.Mita':{code:'I',color:'#0079c2',shape:'circle'},
 'Toei.Shinjuku':{code:'S',color:'#6cbb5a',shape:'circle'},
 'Toei.Oedo':{code:'E',color:'#b6007a',shape:'circle'},
 'JR-East.Yamanote':{code:'JY',color:'#80c342',shape:'square'},
 'JR-East.ChuoRapid':{code:'JC',color:'#f15a22',shape:'square'},
 'JR-East.Chuo':{code:'JC',color:'#f15a22',shape:'square'},
 'JR-East.Ome':{code:'JC',color:'#f15a22',shape:'square'},
 'JR-East.ChuoSobuLocal':{code:'JB',color:'#ffd400',shape:'square'},
 'JR-East.Takasaki':{code:'JU',color:'#f68b1e',shape:'square'},
 'JR-East.Tokaido':{code:'JT',color:'#f68b1e',shape:'square'},
 'JR-East.Yokosuka':{code:'JO',color:'#007ac1',shape:'square'},
 'Keio.Inokashira':{code:'IN',color:'#000088',shape:'rounded'},
 'Odakyu.Odawara':{code:'OH',color:'#2288cc',shape:'rounded'},
 'Tobu.Tojo':{code:'TJ',color:'#2d438c',shape:'rounded',markClass:'tobu-tojo',source:'https://www.tobu.co.jp/railway/guide/line/tojo_line.html'},
 'Enoden.Enoden':{code:'EN',color:'#009b6b',shape:'rounded'},
 'Fujikyu.Fujikyu':{code:'FJ',color:'#0068b7',shape:'rounded'},
 'Keisei.NaritaSkyAccess':{code:'KS',color:'#ff8620',shape:'rounded'},
 'Keisei.Main':{code:'KS',color:'#005aaa',shape:'rounded'}
};
Object.assign(RAIL_LINES,{"West.M": {"code": "M", "color": "#e5171f", "shape": "circle"}, "West.T": {"code": "T", "color": "#522886", "shape": "circle"}, "West.K": {"code": "K", "color": "#814721", "shape": "circle"}, "West.O": {"code": "O", "color": "#e80000", "shape": "square"}, "West.A": {"code": "A", "color": "#0072bc", "shape": "square"}, "West.D": {"code": "D", "color": "#a56750", "shape": "square"}, "West.E": {"code": "E", "color": "#878ddc", "shape": "square"}, "West.KH": {"code": "KH", "color": "#1d7b3b", "shape": "rounded"}, "West.HS": {"code": "HS", "color": "#1f64aa", "shape": "rounded"}, "West.KN-Namba": {"code": "A", "color": "#d51c2f", "shape": "rounded"}, "West.KN-Osaka": {"code": "A", "color": "#d51c2f", "shape": "rounded"}, "West.KN-Nara": {"code": "A", "color": "#d51c2f", "shape": "rounded"}, "West.HK-Arashi": {"code": "HK", "color": "#009944", "shape": "rounded"}, "West.HK-Kyoto": {"code": "HK", "color": "#009944", "shape": "rounded"}, "West.HK-Takara": {"code": "HK", "color": "#009944", "shape": "rounded"}, "West.FK": {"code": "K", "color": "#ee7d00", "shape": "circle"}, "West.FN": {"code": "N", "color": "#008b5a", "shape": "circle"}});
// Station numbers checked against the operators' station lists on 2026-11-05.
// https://www.tokyometro.jp/station/line_hibiya/index.html (also line_ginza, line_namboku)
// https://www.kotsu.metro.tokyo.jp/subway/timetable/index.html
// A number belongs to a station on a specific line, never to the whole station complex.
const METRO_STATION_NUMBERS={
 'TokyoMetro.Hibiya':[['H18','우에노','上野'],['H19','이리야','入谷'],['H09','긴자','銀座'],['H16','아키하바라','秋葉原'],['H17','나카오카치마치','仲御徒町'],['H22','기타센주','北千住'],['H01','나카메구로','中目黒'],['H04','롯폰기','六本木']],
 'TokyoMetro.Ginza':[['G09','긴자','銀座'],['G08','신바시','新橋'],['G01','시부야','渋谷'],['G16','우에노','上野']],
 'TokyoMetro.Namboku':[['N11','고라쿠엔','後楽園'],['N01','메구로','目黒']],
 'Toei.Shinjuku':[['S06','진보초','神保町'],['S09','바쿠로요코야마','馬喰横山'],['S11','모리시타','森下'],['S21','모토야와타','本八幡']],
 'Toei.Asakusa':[['A15','히가시니혼바시','東日本橋'],['A17','구라마에','蔵前'],['A16','아사쿠사바시','浅草橋']],
 'Toei.Oedo':[['E11','구라마에','蔵前'],['E13','모리시타','森下'],['E23','롯폰기','六本木'],['E07','가스가','春日']]
};
function metroStationCode(part){
 if(!/^(TokyoMetro|Toei)\./.test(part?.lineId||''))return null;
 const name=String(part.from||'').replace(/\([^)]*\)|（[^）]*）/g,'').trim(),ja=String(part.fromJa||'').replace(/駅$/,'').trim();
 const verified=METRO_STATION_NUMBERS[part.lineId]?.find(row=>row[1]===name||ja&&row[2]===ja);if(verified)return verified[0];
 // Reuse existing exact station codes for older itinerary variants, without guessing numbers.
 const prefix=railInfo(part)?.code,profiles=globalThis.RailDepartureProfiles?.profiles||{};
 const candidates=[part.fromCode,...Object.values(profiles).flatMap(p=>p.lineId===part.lineId?[p.from===part.from?p.fromCode:null,p.to===part.from?p.toCode:null]:[])];
 return candidates.find(code=>typeof code==='string'&&code.startsWith(prefix)&&/^[A-Z]\d{2}$/.test(code))||null;
}
const railSectionCache=new WeakMap();
let railHoverCard=null,railSymbolKeys=new Set(),railSymbolGroups=new Map();
function railInfo(part){return RAIL_LINES[part.lineId]||(part.mode==='bus'?{code:/레드라인|Red Line/i.test(part.line||'')?'RED':'BUS',color:/레드라인|Red Line/i.test(part.line||'')?'#c83d3d':'#477b95',shape:'rounded',vehicle:'bus'}:null);}
const TRANSIT_VEHICLES={bus:'<rect x="4" y="4" width="16" height="14" rx="3"/><path d="M4 10h16M8 18v3m8-3v3M8 14h.01M16 14h.01"/>',cable:'<path d="m3 20 18-8M5 14V5h11l4 3v8M5 10h14M10 5v11M3 23l18-8"/>',ropeway:'<path d="M2 3h20M12 3v5M5 11l3-3h8l3 3v10H5zM5 15h14M12 8v13"/>'};
function transitVehicleBadge(part,info,extra=''){return `<span class="rail-symbol transit-vehicle ${info.shape} vehicle-${info.vehicle} ${extra}" style="--rail-color:${info.color}" role="img" aria-label="${esc((info.vehicle==='bus'?'버스':info.vehicle==='cable'?'케이블카':'로프웨이')+' · '+part.line)}" title="${esc(part.line)}"><svg viewBox="0 0 24 24" aria-hidden="true">${TRANSIT_VEHICLES[info.vehicle]}</svg><small>${esc(info.code)}</small></span>`;}
function mapPartVisible(part){return !(part.mode==='transfer'&&(part.geometryAccuracy==='schematic'||/개략|대표.*연결|미확인/.test(part.geometrySource||'')));}
// Both strokes must share the same dash pattern: a solid casing turns a
// schematic connection into an apparently confirmed railway on the map.
function routeLineStyles(part,{overview=false,local=false,night=false}={}){
 const schematic=part.geometryAccuracy==='schematic',color=railInfo(part)?.color||(part.mode==='transfer'?'#949e96':(MODE[part.mode]||MODE.rail).color);
 const dashArray=schematic?'2 6':part.mode==='flight'?'9 7':part.mode==='transfer'?'3 5':null;
 const weight=schematic?2:overview?(local?4:3):4.5,opacity=schematic?.6:night?.6:1;
 return {line:{color,weight,opacity,lineCap:'round',lineJoin:'round',dashArray},casing:{color:'#fffdf8',weight:weight+3,opacity:schematic?.45:.9,dashArray,lineCap:'round',lineJoin:'round',interactive:false}};
}
function railBadge(part,extra=''){
 const info=railInfo(part);if(!info)return operatorLogo(part)||icon((MODE[part.mode]||MODE.rail).icon);
 if(info.vehicle)return transitVehicleBadge(part,info,extra);
 if(info.code==='KTX'||info.logo)return operatorLogo(part,extra);const stationCode=metroStationCode(part),code=stationCode||info.code;return `<span class="rail-symbol ${info.shape} ${info.markClass||''} ${stationCode?'metro-station-symbol':''} ${extra}" style="--rail-color:${info.color}" role="img" aria-label="${esc(code+' · '+part.line+(stationCode?' · 출발역 '+part.from:''))}" title="${esc(code+' · '+part.line+(stationCode?' · 출발역 '+part.from:''))}">${esc(code)}${info.colorUnknown?'<small class="line-color-unknown">노선색 미확인</small>':''}</span>`;
}
function railPathLength(coords){let total=0;for(let i=1;i<coords.length;i++)total+=L.latLng(coords[i-1]).distanceTo(L.latLng(coords[i]));return Math.round(total);}
function splitRailService(part){
 if(part.lineId!=='Special.Direct')return [part];
 if(railSectionCache.has(part))return railSectionCache.get(part);
 const fuji=part.line.includes('후지'),airport=part.line.includes('스카이라이너');
 if(!fuji&&!airport)return [part];
 const junction=fuji?[35.6129342,138.942183]:[35.75076,139.86726];
 let cut=1,best=Infinity;part.coords.forEach((p,i)=>{const d=L.latLng(p).distanceTo(L.latLng(junction));if(d<best){best=d;cut=i;}});
 const outbound=fuji?part.from.includes('신주쿠'):part.from.includes('나리타');
 let sections=fuji?[
  {lineId:'JR-East.ChuoRapid',line:'JR 주오선 · 후지회유',from:'신주쿠',to:'오쓰키'},
  {lineId:'Fujikyu.Fujikyu',line:'후지급행선 · 후지회유',from:'오쓰키',to:'가와구치코'}
 ]:[
  {lineId:'Keisei.NaritaSkyAccess',line:'나리타 스카이액세스 · 스카이라이너',from:part.from,to:'게이세이타카사고'},
  {lineId:'Keisei.Main',line:'게이세이 본선 · 스카이라이너',from:'게이세이타카사고',to:part.to}
 ];
 if(!outbound)sections=sections.reverse().map(s=>({...s,from:s.to,to:s.from}));
 const result=sections.map((s,i)=>{const coords=i===0?part.coords.slice(0,cut+1):part.coords.slice(cut);return {...part,...s,coords,distanceM:railPathLength(coords),throughService:part.line};});
 railSectionCache.set(part,result);return result;
}
function railParts(leg){return leg.parts.flatMap(splitRailService);}
function uniqueRailParts(legs){const seen=new Set();return legs.filter(Boolean).flatMap(railParts).filter(p=>{const info=railInfo(p);if(!info)return false;const key=info.code+'|'+info.color+'|'+(info.vehicle||'');if(seen.has(key))return false;seen.add(key);return true;});}
function railLegBadges(leg){return uniqueRailParts([leg]).map(p=>railBadge(p)).join('');}
function railDayKey(legs=state.routeData?.days?.[`${state.day}-${getVariant().id}`]||[]){
 return `<div class="day-line-key" aria-label="오늘 이용하는 교통 노선">${uniqueRailParts(legs).map(p=>`<span>${railBadge(p)}<span>${esc(p.line.replace(/ · .*/,''))}</span></span>`).join('')}</div>`;
}
function dailyRailFareLogos(row,legs){
 const leg=legs[row.legIndex-1];if(!leg)return '';
 const seen=new Set(),services=railParts({...leg,parts:leg.parts.filter(p=>['rail','metro'].includes(p.mode)&&(row.lineIds.length?row.lineIds.includes(p.lineId):row.lines.includes(p.line)))}).filter(p=>{const key=p.lineId||p.line;if(seen.has(key))return false;seen.add(key);return true;});
 return '<span class="daily-rail-logos">'+services.map(p=>railBadge(p)).join('')+'</span>';
}
function dailyRailFareHtml(){
 const legs=state.routeData?.days?.[`${state.day}-${getVariant().id}`]||[],items=FareCore.railItems(legs.map(l=>l&&window.CommandCore?.privateLeg(l,state.data.days)?null:l));
 if(!items.length)return '<p class="daily-rail-empty">이 날짜에 예정된 일본 철도 구간이 없습니다.</p>';
 const amount=n=>n===null?'IC 요금 확인 필요':n.toLocaleString('ko-KR')+' JP¥',total=items.reduce((sum,r)=>sum+(r.icYen??0),0),unknown=items.filter(r=>r.icYen===null).length;
 return `<section class="daily-rail-fares" aria-label="오늘 탑승 열차와 IC 요금"><p>성인 1인 · IC 운임 + 명시한 별도 티켓 · 패스 할인 미적용</p><ol>${items.map(r=>`<li data-rail-fare-leg="${r.legIndex}"><div><strong class="daily-rail-line">${dailyRailFareLogos(r,legs)}<span class="daily-rail-name">${esc(r.lines.join(' → ')||'철도')}</span></strong><span>${esc(TripPersonal.station(r.from,r.fromJa))} → ${esc(TripPersonal.station(r.to,r.toJa))}</span>${r.combined?'<small>환승 포함 · 중복 합산 없음</small>':''}${r.reservedSurchargeYen!=null?`<small>${r.baseTicketYen!=null?'승차권':'IC 기본'} ${esc(amount(r.baseTicketYen??r.baseIcYen))} + ${r.baseTicketYen!=null?'자유석 특급권':'특급·지정석권'} ${esc(amount(r.reservedSurchargeYen))}</small>`:''}${r.ticketRequired?`<small>${esc(r.ticketLabel||'별도 티켓 필요')}${r.baseIcYen!=null||r.baseTicketYen!=null?' · IC 잔액만으로 승차 불가':''}</small>`:''}<small>확인 ${esc(r.checkedAt||'필요')}</small>${r.sources.length?`<details class="daily-rail-evidence"><summary>요금 기준</summary>${r.fareBasis?`<small>${esc(r.fareBasis)}</small>`:''}${r.sources.map((s,i)=>`<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">근거 ${i+1} ↗</a>`).join(' · ')}</details>`:''}</div><b>${r.displayBlank?'':esc(amount(r.icYen))}</b></li>`).join('')}</ol><div class="daily-rail-total"><span>철도 합계 · 별도 티켓 포함${unknown?' · 미확인 '+unknown+'구간':''}</span><strong>${esc(amount(total))}</strong></div><p class="daily-rail-note">저장된 계획 운임 · 2027 여행 전 재확인</p></section>${state.day<=11?`<details class="daily-rail-pass"><summary>패스 비교 설정</summary>${passEditor()}</details>`:''}`;
}
function initRailHover(){
 railHoverCard=document.createElement('div');railHoverCard.id='railHoverCard';railHoverCard.className='rail-hover-card';railHoverCard.setAttribute('role','tooltip');railHoverCard.hidden=true;map.getContainer().appendChild(railHoverCard);
 map.on('movestart zoomstart click',hideRailHover);document.addEventListener('click',event=>{const b=event.target.closest('[data-route-direction]');if(!b)return;const group=railSymbolGroups.get(b.dataset.routeGroup),entry=group?.entries[Number(b.dataset.routeDirection)];if(!entry)return;map.closePopup();L.popup(symbolOptions(entry.leg)).setLatLng(group.point).setContent(directionHtml(group,entry)).openOn(map);});
}
function hideRailHover(){if(railHoverCard)railHoverCard.hidden=true;}
function railHoverHtml(leg,part){if(leg.travel)return `${airlineLogo(part,'airline-hover-logo')}<div class="rail-hover-heading">${icon(part.mode)}<strong>${esc(part.line)}</strong></div><div class="rail-hover-stations">${esc(leg.travel.depart)} <span>→</span> ${esc(leg.travel.arrive)}</div><div class="rail-hover-metrics"><div><small>소요시간</small><b>${esc(leg.durationLabel)}</b></div><div><small>${leg.fare.status==='selectedQuote'?'이전 선택 견적':'현재 공시 요금'}</small><b>${esc(fareText(leg.fare,leg))}</b></div></div><div class="rail-hover-footer">${leg.fare.status==='selectedQuote'?'현재 판매가·예약 확정 아님':'객실·연료·세금 변경 가능'}<br><span>${esc(part.mode==='flight'?(window.FlightPlayback?.geometryLabel(leg)||'개략 항로'):part.geometryAccuracy==='schematic'?'항만 연결 개략선':'해상 참고선')} · 클릭하면 상세</span></div>`;
 const walk=['walk','transfer'].includes(part.mode),fare=walk?'추가 0엔':fareText(leg.fare,leg);
 return `<div class="rail-hover-heading">${railBadge(part)}<strong>${esc(part.line)}</strong></div><div class="rail-hover-stations">${esc(stationLabel(part.from))} <span>→</span> ${esc(stationLabel(part.to))}</div><div class="rail-hover-metrics"><div><small>이동 거리</small><b>${distanceText(part.distanceM)}</b></div><div><small>${walk?'이 선의 요금':'전체 구간 운임'}</small><b>${esc(fare)}</b></div></div>${part.throughService?'<div class="rail-hover-through">직통 열차 · 색이 바뀌어도 계속 탑승</div>':''}<div class="rail-hover-footer">전체 이동 ${esc(leg.durationLabel)}<br><span>클릭하면 노선·환승 상세</span></div>`;
}
function positionRailHover(event){
 if(!railHoverCard||railHoverCard.hidden)return;
 const panel=map.getContainer(),p=event.containerPoint||map.latLngToContainerPoint(event.latlng),w=railHoverCard.offsetWidth,h=railHoverCard.offsetHeight;
 let x=p.x+18;if(x+w>panel.clientWidth-12)x=p.x-w-18;
 const y=p.y-h-16;
 railHoverCard.style.left=`${Math.max(12,Math.min(x,panel.clientWidth-w-12))}px`;
 railHoverCard.style.top=`${Math.max(12,Math.min(y,panel.clientHeight-h-12))}px`;
}
function showRailHover(event,leg,part){
 if(event.originalEvent?.pointerType==='touch')return;
 railHoverCard.innerHTML=railHoverHtml(leg,part);railHoverCard.hidden=false;positionRailHover(event);
}
function railMidpoint(coords,fraction=.5){
 const target=railPathLength(coords)*fraction;let travelled=0;
 for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],d=L.latLng(a).distanceTo(L.latLng(b));if(travelled+d>=target){const t=d?(target-travelled)/d:0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}travelled+=d;}
 return coords[Math.floor(coords.length/2)];
}
function symbolOptions(leg){return DetailView.options('route-info-popup',{routeLegIndex:leg.legIndex,routeDay:leg.dayNumber,routeVariant:leg.variant});}
function visibleDirectionEntries(group){if(typeof routeAll==='boolean'&&!routeAll){const c=focusedContext(),i=focusedIndex(c),entries=group.entries.filter(e=>focusedMatch(e.leg,c,i));if(entries.length)return entries;}return group.entries;}
function directionHtml(group,entry){const entries=visibleDirectionEntries(group);return (entries.length>1?`<fieldset class="direction-options"><legend>겹친 경로 · 이동 방향 선택</legend>${entries.map(e=>`<button type="button" data-route-group="${esc(group.key)}" data-route-direction="${group.entries.indexOf(e)}" aria-pressed="${e===entry}">${e.leg.dayNumber}일차 · ${esc(e.part.from)} → ${esc(e.part.to)}</button>`).join('')}</fieldset>`:'')+(typeof overviewLegHtml==='function'?overviewLegHtml(entry.leg,entry.part):legHtml(entry.leg,entry.part));}
function addRailMapSymbol(part,leg){
 if(part.suppressSymbol)return;
 const info=railInfo(part)||(['flight','ferry','taxi'].includes(part.mode)?{code:part.mode==='flight'?'항공':part.mode==='ferry'?'선박':'Uber',color:MODE[part.mode].color}:null);if(!info||part.distanceM<350)return;
 const point=railMidpoint(part.coords),groupKey=part.lineId+'|'+point.map(n=>n.toFixed(4)).join(','),entryKey=leg.legId+'|'+part.lineId+'|'+part.from+'|'+part.to;
 if(railSymbolKeys.has(entryKey))return;railSymbolKeys.add(entryKey);
 const existing=railSymbolGroups.get(groupKey);if(existing){existing.entries.push({part,leg});existing.marker.setTooltipContent?.(`${info.code} · ${existing.entries.length}개 이동 방향`);const el=existing.marker.getElement();if(el){el.setAttribute('aria-label',info.code+' '+part.line+' · 겹친 '+existing.entries.length+'개 이동 방향 선택');if(!el.querySelector('.route-direction-count'))el.insertAdjacentHTML('beforeend','<b class="route-direction-count">↔</b>');}return;}
 const group={key:groupKey,point,entries:[{part,leg}]};railSymbolGroups.set(groupKey,group);
 const compact=part.mode==='flight'?'항공':part.mode==='taxi'?'택시':part.mode==='ferry'?'배':info.code;
 const marker=L.marker(point,{icon:L.divIcon({className:'rail-map-symbol compact-route-symbol',html:railInfo(part)?railBadge(part):'<span class="compact-mode-symbol">'+esc(compact)+'</span>',iconSize:[44,44],iconAnchor:[22,22]}),keyboard:true,zIndexOffset:-800,title:info.code+' '+part.line+' · 이동 방향·상세',alt:info.code+' '+part.from+' → '+part.to}).addTo(routeLayer);group.marker=marker;marker.getElement()?.setAttribute('aria-label',info.code+' '+part.line+' '+part.from+' → '+part.to+' 이동 상세');
 marker.on('click',()=>{hideRailHover();const entry=visibleDirectionEntries(group)[0];L.popup(symbolOptions(entry.leg)).setLatLng(point).setContent(directionHtml(group,entry)).openOn(map);});
 marker.on('mouseover',e=>{const entry=visibleDirectionEntries(group)[0];showRailHover(e,entry.leg,entry.part);});marker.on('mousemove',positionRailHover);marker.on('mouseout',hideRailHover);
}
