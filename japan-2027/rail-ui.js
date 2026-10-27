'use strict';
const AIRLINE_BRANDS={
 trinity:{name:'트리니티항공',src:'assets/airlines/trinity.svg'},
 jal:{name:'JAL 일본항공',src:'assets/airlines/jal.svg'},
 ana:{name:'ANA 전일본공수',src:'assets/airlines/ana.svg'}
};
function airlineFor(part){if(part?.mode!=='flight')return null;const line=part.line||'';return /TW251|트리니티|Trinity/i.test(line)?'trinity':/\bJAL\b/.test(line)?'jal':/\bANA\b/.test(line)?'ana':null;}
function operatorLogo(part,extra=''){
 const isUber=part?.mode==='taxi',isKtx=part?.lineId==='KORAIL.GyeongbuHSR'||/KTX/.test(part?.line||'');
 if(!isUber&&!isKtx)return '';
 const type=isUber?'uber':'ktx',name=isUber?'Uber':'KTX';
 return '<img class="operator-logo operator-'+type+' '+extra+'" src="assets/operators/'+type+'.svg" alt="'+name+' 로고" width="72" height="27" decoding="async">';
}
function airlineLogo(part,extra=''){const key=airlineFor(part);if(!key)return '';const b=AIRLINE_BRANDS[key];return `<img class="airline-logo airline-${key} ${extra}" src="${b.src}" alt="${b.name} 로고" width="96" height="30" decoding="async">`;}
// Line letters follow the operators' published station-numbering maps.
// Colors are screen approximations of the line colors, not operator logos.
const RAIL_LINES={
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
 'Tobu.Tojo':{code:'TJ',color:'#004098',shape:'rounded'},
 'Enoden.Enoden':{code:'EN',color:'#009b6b',shape:'rounded'},
 'Fujikyu.Fujikyu':{code:'FJ',color:'#0068b7',shape:'rounded'},
 'Keisei.NaritaSkyAccess':{code:'KS',color:'#ff8620',shape:'rounded'},
 'Keisei.Main':{code:'KS',color:'#005aaa',shape:'rounded'}
};
Object.assign(RAIL_LINES,{"West.M": {"code": "M", "color": "#e5171f", "shape": "circle"}, "West.T": {"code": "T", "color": "#522886", "shape": "circle"}, "West.K": {"code": "K", "color": "#814721", "shape": "circle"}, "West.O": {"code": "O", "color": "#e80000", "shape": "square"}, "West.A": {"code": "A", "color": "#0072bc", "shape": "square"}, "West.D": {"code": "D", "color": "#a56750", "shape": "square"}, "West.E": {"code": "E", "color": "#878ddc", "shape": "square"}, "West.KH": {"code": "KH", "color": "#1d7b3b", "shape": "rounded"}, "West.HS": {"code": "HS", "color": "#1f64aa", "shape": "rounded"}, "West.KN-Namba": {"code": "A", "color": "#d51c2f", "shape": "rounded"}, "West.KN-Osaka": {"code": "A", "color": "#d51c2f", "shape": "rounded"}, "West.KN-Nara": {"code": "A", "color": "#d51c2f", "shape": "rounded"}, "West.HK-Arashi": {"code": "HK", "color": "#009944", "shape": "rounded"}, "West.HK-Kyoto": {"code": "HK", "color": "#009944", "shape": "rounded"}, "West.HK-Takara": {"code": "HK", "color": "#009944", "shape": "rounded"}, "West.FK": {"code": "K", "color": "#ee7d00", "shape": "circle"}, "West.FN": {"code": "N", "color": "#008b5a", "shape": "circle"}});
const railSectionCache=new WeakMap();
let railHoverCard=null,railSymbolKeys=new Set(),railSymbolGroups=new Map();
function railInfo(part){return RAIL_LINES[part.lineId]||null;}
function railBadge(part,extra=''){
 const info=railInfo(part);if(!info)return operatorLogo(part)||icon((MODE[part.mode]||MODE.rail).icon);
 if(info.code==='KTX')return operatorLogo(part,extra);return `<span class="rail-symbol ${info.shape} ${extra}" style="--rail-color:${info.color}" role="img" aria-label="${esc(info.code+' · '+part.line)}" title="${esc(info.code+' · '+part.line)}">${info.code}${info.colorUnknown?'<small class="line-color-unknown">노선색 미확인</small>':''}</span>`;
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
function uniqueRailParts(legs){const seen=new Set();return legs.filter(Boolean).flatMap(railParts).filter(p=>{const info=railInfo(p);if(!info)return false;const key=info.code+'|'+info.color;if(seen.has(key))return false;seen.add(key);return true;});}
function railLegBadges(leg){return uniqueRailParts([leg]).map(p=>railBadge(p)).join('');}
function railDayKey(){
 const legs=state.routeData?.days?.[`${state.day}-${getVariant().id}`]||[];
 return `<div class="day-line-key" aria-label="오늘 이용하는 철도 노선">${uniqueRailParts(legs).map(p=>`<span>${railBadge(p)}<span>${esc(p.line.replace(/ · .*/,''))}</span></span>`).join('')}</div>`;
}
function initRailHover(){
 railHoverCard=document.createElement('div');railHoverCard.id='railHoverCard';railHoverCard.className='rail-hover-card';railHoverCard.setAttribute('role','tooltip');railHoverCard.hidden=true;map.getContainer().appendChild(railHoverCard);
 map.on('movestart zoomstart click',hideRailHover);document.addEventListener('click',event=>{const b=event.target.closest('[data-route-direction]');if(!b)return;const group=railSymbolGroups.get(b.dataset.routeGroup),entry=group?.entries[Number(b.dataset.routeDirection)];if(!entry)return;map.closePopup();L.popup(symbolOptions(entry.leg)).setLatLng(group.point).setContent(directionHtml(group,entry)).openOn(map);});
}
function hideRailHover(){if(railHoverCard)railHoverCard.hidden=true;}
function railHoverHtml(leg,part){if(leg.travel)return `${airlineLogo(part,'airline-hover-logo')}<div class="rail-hover-heading">${icon(part.mode)}<strong>${esc(part.line)}</strong></div><div class="rail-hover-stations">${esc(leg.travel.depart)} <span>→</span> ${esc(leg.travel.arrive)}</div><div class="rail-hover-metrics"><div><small>소요시간</small><b>${esc(leg.durationLabel)}</b></div><div><small>${leg.fare.status==='selectedQuote'?'이전 선택 견적':'현재 공시 요금'}</small><b>${esc(fareText(leg.fare,leg))}</b></div></div><div class="rail-hover-footer">${leg.fare.status==='selectedQuote'?'현재 판매가·예약 확정 아님':'객실·연료·세금 변경 가능'}<br><span>${esc(part.mode==='flight'?(window.FlightPlayback?.geometryLabel(leg)||'개략 항로'):part.geometryAccuracy==='schematic'?'항만 연결 개략선':'해상 참고선')} · 클릭하면 상세</span></div>`;
 const walk=['walk','transfer'].includes(part.mode),fare=walk?'추가 0엔':fareText(leg.fare,leg);
 return `<div class="rail-hover-heading">${railBadge(part)}<strong>${esc(part.line)}</strong></div><div class="rail-hover-stations">${esc(part.from)} <span>→</span> ${esc(part.to)}</div><div class="rail-hover-metrics"><div><small>이동 거리</small><b>${distanceText(part.distanceM)}</b></div><div><small>${walk?'이 선의 요금':'전체 구간 운임'}</small><b>${esc(fare)}</b></div></div>${part.throughService?'<div class="rail-hover-through">직통 열차 · 색이 바뀌어도 계속 탑승</div>':''}<div class="rail-hover-footer">전체 이동 ${esc(leg.durationLabel)}<br><span>클릭하면 노선·환승 상세</span></div>`;
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
