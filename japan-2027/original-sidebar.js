'use strict';
// Mount the original itinerary once; its renderer, place IDs, route cards and storage remain authoritative.
(function(){
 const $=s=>document.querySelector(s);let api,budgetNode,budgetDay=null,budgetDirty=false;const budgetDrafts=new Map(),budgetField=s=>budgetNode.querySelector(s);
 function rememberBudget(){if(!budgetNode||budgetDay===null)return;budgetDrafts.set(budgetDay,{JPY:budgetField('#originalBudgetJPY').value,KRW:budgetField('#originalBudgetKRW').value,open:budgetNode.open,dirty:budgetDirty});}
 function refreshBudget(c,p){
  if(!budgetNode)return;const saved=p.dailyBudgets?.[c.day.n]||{};
  if(budgetDay!==c.day.n){rememberBudget();budgetDay=c.day.n;const draft=budgetDrafts.get(budgetDay);budgetField('#originalBudgetJPY').value=draft?.JPY??saved.JPY??'';budgetField('#originalBudgetKRW').value=draft?.KRW??saved.KRW??'';budgetDirty=!!draft?.dirty;budgetNode.open=!!draft?.open;budgetField('#originalBudgetStatus').textContent=budgetDirty?'입력 중 · 저장 버튼을 눌러 주세요.':'';}
  budgetField('#originalBudgetDay').textContent=c.day.date+' 예산';budgetField('#originalBudgetValue').textContent=['JPY','KRW'].filter(currency=>Object.hasOwn(saved,currency)).map(currency=>Number(saved[currency]).toLocaleString('ko-KR')+(currency==='JPY'?'엔':'원')).join(' · ')||'입력하기';
  const header=$('#dayHeader');if(header&&!header.contains(budgetNode))header.insertBefore(budgetNode,header.querySelector('.day-tools'));
 }
 function initBudget(){
  budgetNode=document.createElement('details');budgetNode.id='originalDayBudget';budgetNode.className='original-day-budget';budgetNode.innerHTML='<summary><span><b id="originalBudgetDay">오늘 예산</b><small>철도 요금 제외</small></span><strong id="originalBudgetValue">입력하기</strong></summary><form id="originalBudgetForm"><label>엔화 예산<input id="originalBudgetJPY" type="number" min="0" max="100000000" step="1" inputmode="numeric" placeholder="엔 (JPY)"></label><label>원화 예산<input id="originalBudgetKRW" type="number" min="0" max="100000000" step="1" inputmode="numeric" placeholder="원 (KRW)"></label><p>직접 입력한 날짜별 예산이에요. 전철·철도 요금은 별도이며 자동으로 더하지 않아요. 비워서 저장하면 해당 통화 예산을 지워요.</p><button type="submit">예산 저장</button><p id="originalBudgetStatus" role="status" aria-live="polite"></p></form>';
  const input=budgetNode.querySelector('form');input.oninput=()=>{budgetDirty=true;rememberBudget();budgetNode.querySelector('#originalBudgetStatus').textContent='입력 중 · 저장 버튼을 눌러 주세요.';};budgetNode.ontoggle=rememberBudget;
  input.onsubmit=event=>{event.preventDefault();try{const day=api.context().day.n,values=TravelAssistantCore.dayBudget(day,{JPY:budgetNode.querySelector('#originalBudgetJPY').value,KRW:budgetNode.querySelector('#originalBudgetKRW').value});const saved=TravelAssistant.updatePersonal(p=>{p.dailyBudgets??={};if(Object.keys(values).length)p.dailyBudgets[day]=values;else delete p.dailyBudgets[day];});budgetDirty=saved===false;rememberBudget();budgetField('#originalBudgetStatus').textContent=saved===false?'기기 저장에 실패했어요. 새로고침 전에 저장 공간을 확인하세요.':Object.keys(values).length?'이 날짜의 예산을 기기에 저장했어요.':'이 날짜의 예산을 지웠어요.';}catch(error){budgetField('#originalBudgetStatus').textContent=error.message;}};
 }
 function sidebar(open){document.body.classList.toggle('cc-sidebar-closed',!open);$('#ccSidebarToggle').setAttribute('aria-expanded',String(open));api.app.map.invalidateSize();}
 function railCard(leg,index){
  if(!RailDepartures.supported(leg.dayNumber||api?.app.state.day,leg))return '';
  const paid=leg.parts.filter(p=>['rail','metro','bus','taxi'].includes(p.mode)),quote=FareCore.quote(leg.fare,leg,fareOptions()),fareLabel=(paid.length>1?'전체 ':'')+(quote.passApplied?'패스 적용 요금':leg.fare?.currency==='JPY'&&leg.fare?.icYen!=null?'IC 요금':'요금');
  let board=RailDepartures.html(leg.dayNumber||api?.app.state.day,leg,null,{distanceLabel:'전체 거리',distance:distanceText(leg.distanceM),fareLabel,fare:fareText(leg.fare,leg)});
  const ktx=leg.parts.find(part=>part.lineId==='KORAIL.GyeongbuHSR');if(ktx)board=board.replace(/<span class="departure-station-code[^"]*"[^>]*>KTX<\/span>/,operatorLogo(ktx));
  return '<article class="itinerary-train-card" data-itinerary-train-leg="'+index+'" aria-label="'+esc(shortRoute(leg)+' 열차 정보')+'">'+board+'<p class="itinerary-train-basis">저장된 시간표 기준 · 실시간 지연 미반영</p><button type="button" class="itinerary-train-detail" data-leg="'+index+'">지도·열차 정보 보기 →</button></article>';
 }
 function refresh(){if(!api)return;const c=api.context(),p=api.personal();
  if(api.app.state.view==='daily')for(const card of document.querySelectorAll('#stopList .stop-card[data-stop]')){const stop=c.stops[Number(card.dataset.stop)];if(!stop)continue;card.dataset.originalPlace=stop.uid;const row=card.closest('.stop-row');let input=row.querySelector('[data-original-visit]');if(!input){const label=document.createElement('label');label.className='original-visit';input=document.createElement('input');input.type='checkbox';input.dataset.originalVisit=stop.uid;const text=document.createElement('span');text.className='cc-sr';text.textContent=api.name(stop)+' 방문 완료';input.setAttribute('aria-label',text.textContent);label.append(input,text);row.prepend(label);}const checked=!!p.visits[TravelAssistantCore.visitKey(c.day.n,c.variant.id,stop.uid)];input.checked=checked;row.classList.toggle('is-visited',checked);}
  RailDepartures.mountInline($('#stopList'));
  const photo=$('#kisekiHeroPhoto');if(photo)$('#dayHeader').style.setProperty('--original-photo','url('+JSON.stringify(photo.getAttribute('src'))+')');
  refreshBudget(c,p);
 }
 function init(value){if(api)return;api=value;document.body.classList.add('original-sidebar');initBudget();
  const parking=document.createElement('div');parking.id='originalLegacyControls';parking.hidden=true;document.body.append(parking);
  for(const id of ['tripPlanBtn','itineraryToggle','rideToggle','ccInstall','aboutBtn','shareBtn']){const node=$('#'+id);node.hidden=true;parking.append(node);}
  const plan=document.createElement('section');plan.className='original-plan-tools';plan.innerHTML='<h3>일정 조정</h3><p>원본 일정은 그대로 유지됩니다. 조정안은 확인한 뒤 별도로 적용합니다.</p>';plan.append($('#ccEdit'),$('#ccUndo'),$('#ccPlanStatus'));$('#shellInfo').append(plan);parking.append(document.querySelector('.cc-timeline-heading'),$('#ccTimeline'));
  $('#shellTabToday').textContent='원본 일정';const panel=$('#itineraryPanel');$('#itineraryScroll').prepend($('#dayHeader'));
  ItineraryDrawer.dock($('#shellToday'),{open:()=>{$('#shellTabToday').click();sidebar(true);},close:()=>sidebar(false),isOpen:()=>!document.body.classList.contains('cc-sidebar-closed')&&$('#shellTabToday').getAttribute('aria-selected')==='true'});
  $('#stopList').addEventListener('change',event=>{const input=event.target.closest('[data-original-visit]');if(!input)return;const c=api.context(),uid=input.dataset.originalVisit;if(api.app.state.view!=='daily'||!c.stops.some(s=>s.uid===uid))return;TravelAssistant.updatePersonal(p=>{p.visits[TravelAssistantCore.visitKey(c.day.n,c.variant.id,uid)]=input.checked;});refresh();});
  $('#stopList').addEventListener('click',event=>{if(event.target.closest('a,details,label,input'))return;const card=event.target.closest('[data-original-place]'),stop=card&&api.context().stops.find(s=>s.uid===card.dataset.originalPlace);if(stop&&stop.kind!=='home'&&matchMedia('(max-width:699px)').matches)sidebar(false);});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||RouteUI.hasLayer())return;const more=$('#shellMore');if(more?.open){event.preventDefault();event.stopImmediatePropagation();more.open=false;more.querySelector('summary').focus({preventScroll:true});return;}if(!document.body.classList.contains('cc-sidebar-closed')){event.preventDefault();event.stopImmediatePropagation();sidebar(false);$('#ccSidebarToggle').focus({preventScroll:true});}},true);
  new MutationObserver(refresh).observe($('#stopList'),{childList:true});new MutationObserver(refresh).observe($('#dayHeader'),{childList:true});$('#kisekiHeroPhoto')?.addEventListener('load',refresh);
  for(const name of ['routebook:state','routebook:personal-change','routebook:reservation-change'])window.addEventListener(name,refresh);
  // Keep required photo attribution available inside map settings, without an extra More menu entry.
  if($('#kisekiLegal'))$('#mapSettings').append($('#kisekiLegal'));refresh();
 }
 window.OriginalSidebar={init,refresh,railCard};
})();
