'use strict';
// Drawing state only. Source itinerary, routes, fares, and GPS matching stay intact.
let routeAll=false,routeVisuals=[],overviewPlaceGroups=[],focusBeforeAll=null;
const focusedLegs=new Map();
function focusedContext(){
 const context=state.view==='overview'?overviewContext:{day:getDay(),variant:getVariant()};
 if(!context)return null;
 return {...context,key:context.day.n+'-'+context.variant.id,legs:state.routeData.days[context.day.n+'-'+context.variant.id]||[]};
}
function focusedIndex(context=focusedContext()){
 if(!context||context.variant.stops.length<2)return null;
 if(!focusedLegs.has(context.key)){
  let first=1;
  if(state.view==='overview'){
   const bounds=map.getBounds(),stops=context.variant.stops;
   const visible=stops.findIndex((s,i)=>i>0&&bounds.contains([s.lat,s.lng])&&bounds.contains([stops[i-1].lat,stops[i-1].lng]));
   if(visible>0)first=visible;
  }
  focusedLegs.set(context.key,first);
 }
 return Math.max(1,Math.min(context.variant.stops.length-1,focusedLegs.get(context.key)));
}
function routeVisual(layer,leg,index=leg?.legIndex){
 routeVisuals.push({layer,day:leg?.dayNumber||state.day,variant:leg?.variant||state.variant,index});return layer;
}
function focusedMatch(leg,context,index){return !!context&&leg.dayNumber===context.day.n&&leg.variant===context.variant.id&&leg.legIndex===index;}
function fitFocusedLeg(){
 const c=focusedContext(),i=focusedIndex(c);if(!c||i===null)return;
 const leg=c.legs[i-1],stops=c.variant.stops,coords=leg?.parts.flatMap(p=>p.coords)||[[stops[i-1].lat,stops[i-1].lng],[stops[i].lat,stops[i].lng]];
 if(coords.length)map.fitBounds(L.latLngBounds(coords),{paddingTopLeft:[50,105],paddingBottomRight:[50,165],maxZoom:16,animate:false});
}
function setFocusedLeg(index,{fit=false}={}){
 const c=focusedContext();if(!c)return;
 if(state.view==='overview')overviewFocus=c.day.n;
 focusedLegs.set(c.key,Math.max(1,Math.min(c.variant.stops.length-1,index)));applyRouteFocus();if(fit)fitFocusedLeg();
}
function applyRouteFocus(){
 const c=focusedContext(),index=focusedIndex(c);
 document.body.classList.toggle('route-all',routeAll);
 for(const item of routeVisuals){
  const chosen=!!c&&item.day===c.day.n&&item.variant===c.variant.id&&item.index===index;
  if(routeAll||chosen){if(!routeLayer.hasLayer(item.layer))routeLayer.addLayer(item.layer);}else routeLayer.removeLayer(item.layer);
  item.layer.getElement?.()?.setAttribute('data-focused-route',String(chosen));
  const node=item.layer.getElement?.();if(node){node.dataset.routeDay=item.day;node.dataset.routeVariant=item.variant;node.dataset.routeLeg=item.index;}
 }
 for(const group of railSymbolGroups.values()){
  const chosen=group.entries.some(e=>focusedMatch(e.leg,c,index));
  if(routeAll||chosen){if(!routeLayer.hasLayer(group.marker))routeLayer.addLayer(group.marker);}else routeLayer.removeLayer(group.marker);
 }
 const groups=state.view==='overview'?overviewPlaceGroups:stopGroups,stops=c?.variant.stops||[];
 for(const group of groups){
  const endpoints=group.indices.filter(i=>i===index-1||i===index),point=endpoints[0]??group.indices[0],stop=stops[point];if(!stop)continue;
  const el=group.marker.getElement();el?.classList.toggle('focus-muted',!routeAll&&!endpoints.length);el?.classList.toggle('focus-from',endpoints.includes(index-1));el?.classList.toggle('focus-to',endpoints.includes(index));
  const number=el?.querySelector('.pin-number>span');if(number)number.textContent=endpoints.length?endpoints.map(i=>i+1).join('→'):String(point+1);
  const label=stopLabel(stop),current=group.marker.getTooltip();
  if(!current||current.options.permanent!==!!endpoints.length||current.getContent()!==esc(label)){
   group.marker.unbindTooltip();group.marker.bindTooltip(esc(label),{permanent:!!endpoints.length,direction:endpoints.includes(index-1)?'left':'right',offset:[endpoints.includes(index-1)?-14:14,-17],className:'stop-tooltip focus-place-label'});
  }
 }
 const panel=$('#routeFocusPanel');panel.dataset.day=c?.day.n||'';panel.dataset.leg=index??'';
 $('#routeAllToggle').setAttribute('aria-pressed',String(routeAll));$('#routeAllToggle').textContent=routeAll?'전체 경로 끄기':'전체 경로';
 $('#routeLegPrevious').disabled=!c||index<=1;$('#routeLegNext').disabled=!c||index>=stops.length-1;
 $('#routeFocusDetail').disabled=!c;
 $('#routeFocusCount').textContent=c?`${c.day.date} · 이동 ${index} / ${stops.length-1} · 방문 ${index} → ${index+1}`:'전체 여정 · 도시를 누르거나 지도를 확대하세요';
 $('#routeFocusTitle').textContent=c?stopLabel(stops[index-1])+' → '+stopLabel(stops[index]):'지역을 고르면 한 구간씩 볼 수 있어요';
 const leg=c?.legs[index-1];$('#routeFocusMode').textContent=leg?`${leg.summary||''} · ${leg.durationLabel||distanceText(leg.distanceM)}`:'';
 // A single arrow belongs to the active movement; intermediate path pieces keep their true line colors.
 highlightDirection(leg);
}
function bindRouteFocus(){
 const move=delta=>{RouteUI.userExplore();DetailView.close();setFocusedLeg((focusedIndex()||1)+delta,{fit:true});};
 $('#routeLegPrevious').addEventListener('click',()=>move(-1));$('#routeLegNext').addEventListener('click',()=>move(1));
 $('#routeAllToggle').addEventListener('click',()=>{
  RouteUI.userExplore();DetailView.close();
  if(!routeAll)focusBeforeAll={center:map.getCenter(),zoom:map.getZoom(),view:state.view};
  routeAll=!routeAll;
  if(!routeAll&&state.view==='overview'&&focusBeforeAll?.view==='overview'){map.setView(focusBeforeAll.center,focusBeforeAll.zoom,{animate:false});renderOverviewMap(false);}
  applyRouteFocus();if(routeAll)fitRoute();else fitFocusedLeg();
 });
 $('#routeFocusDetail').addEventListener('click',()=>{
  const c=focusedContext(),i=focusedIndex(c),leg=c?.legs[i-1];if(!leg)return;RouteUI.userExplore();
  const part=(window.TripPersonal?.displayParts(leg)||leg.parts)[0],point=railMidpoint(part.coords);
  L.popup(symbolOptions(leg)).setLatLng(point).setContent(withDayContext(c.day.n,c.variant.id,()=>legHtml(leg))).openOn(map);
 });
 $('#routePlaybackStart').addEventListener('click',()=>{$('#mapSettings').close();RouteUI.release($('#mapSettings'));$('#playBtn').click();});
}
