'use strict';
// Mount the original itinerary once; its renderer, place IDs, route cards and storage remain authoritative.
(function(){
 const $=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let api;const drafts=new Map();
 function expenseTarget(c,type,uid){
  if(type==='stop'){const stop=c.stops.find(s=>s.uid===uid);if(!stop||stop.kind==='home')return null;return {name:api.name(stop),currency:stop.lng<130&&stop.lat>34?'KRW':'JPY',category:stop.kind==='hotel'?'숙박비':stop.kind==='food'||stop.foodKey?'식비':stop.kind==='sight'?'입장료':'기타'};}
  const leg=c.legs.find(l=>l?.legId===uid);if(!leg||leg.parts.some(p=>['rail','metro'].includes(p.mode))||!leg.parts.some(p=>['bus','taxi','flight','ferry'].includes(p.mode))||CommandCore.privateLeg(leg,api.app.state.data.days))return null;
  return {name:leg.from+' → '+leg.to,currency:leg.fare?.currency==='KRW'?'KRW':'JPY',category:leg.parts.some(p=>p.mode==='flight')?'항공료':leg.parts.some(p=>p.mode==='ferry')?'선박료':'교통비'};
 }
 const refKey=(day,variant,type,uid)=>JSON.stringify([day,variant,type,uid]);
 function mountExpense(host,c,p,type,uid){
  const target=expenseTarget(c,type,uid);if(!target)return;const key=refKey(c.day.n,c.variant.id,type,uid),saved=p.expenses.find(e=>e.day===c.day.n&&e.itinerary?.variant===c.variant.id&&e.itinerary.type===type&&e.itinerary.uid===uid),draft=drafts.get(key);let form=host.querySelector(':scope > .itinerary-expense');
  if(!form){form=document.createElement('form');form.className='itinerary-expense';form.dataset.expenseType=type;form.dataset.expenseUid=uid;form.dataset.itineraryDay=c.day.n;form.dataset.expenseVariant=c.variant.id;form.setAttribute('aria-label',target.name+' 실제 비용');form.innerHTML='<label><span>실제 비용</span><input name="amount" type="number" min="0" max="100000000" step="1" inputmode="numeric" placeholder="금액 입력" aria-label="'+h(target.name)+' 실제 비용 금액"></label><label class="itinerary-currency"><span class="cc-sr">통화</span><select name="currency" aria-label="'+h(target.name)+' 실제 비용 통화"><option value="JPY">엔 (¥)</option><option value="KRW">원 (₩)</option></select></label><button type="submit">저장</button><p role="status" aria-live="polite"></p>';host.append(form);}
  if(document.activeElement?.closest('.itinerary-expense')!==form){form.elements.amount.value=draft?.amount??saved?.amount??'';form.elements.currency.value=draft?.currency??saved?.currency??target.currency;}
  form.querySelector('p').textContent=draft?'입력 중 · 저장해 주세요.':saved?'저장됨 · Expenses에 반영':'';
 }
 function refreshExpenses(c,p){if(api.app.state.view!=='daily')return;for(const card of document.querySelectorAll('#stopList .stop-card[data-stop]')){const stop=c.stops[Number(card.dataset.stop)];if(stop)mountExpense(card.closest('.stop-row'),c,p,'stop',stop.uid);}for(const row of document.querySelectorAll('#stopList [data-expense-leg]')){const leg=c.legs[Number(row.dataset.expenseLeg)-1];if(leg)mountExpense(row,c,p,'leg',leg.legId);}}
 function initExpenses(){
  const list=$('#stopList');list.addEventListener('input',event=>{const form=event.target.closest('.itinerary-expense');if(!form)return;drafts.set(refKey(Number(form.dataset.itineraryDay),form.dataset.expenseVariant,form.dataset.expenseType,form.dataset.expenseUid),{amount:form.elements.amount.value,currency:form.elements.currency.value});form.querySelector('p').textContent='입력 중 · 저장해 주세요.';});
  list.addEventListener('submit',event=>{const form=event.target.closest('.itinerary-expense');if(!form)return;event.preventDefault();const c=api.context(),type=form.dataset.expenseType,uid=form.dataset.expenseUid,target=expenseTarget(c,type,uid),key=refKey(c.day.n,c.variant.id,type,uid);if(!target||Number(form.dataset.itineraryDay)!==c.day.n||form.dataset.expenseVariant!==c.variant.id)return;
   try{const amount=form.elements.amount.value,items=TravelAssistantCore.itineraryExpense(api.personal().expenses,{day:c.day.n,variant:c.variant.id,type,uid},form.elements.currency.value,amount,target.category,target.name);drafts.delete(key);const saved=TravelAssistant.updatePersonal(p=>p.expenses=items);refresh();const current=[...list.querySelectorAll('.itinerary-expense')].find(f=>f.dataset.expenseType===type&&f.dataset.expenseUid===uid);if(current)current.querySelector('p').textContent=saved===false?'기기 저장 실패 · 새로고침 전에 저장 공간을 확인하세요.':amount===''?'이 항목의 실제 비용을 지웠어요.':'저장됨 · Expenses에 반영';}catch(error){form.querySelector('p').textContent=error.message;}
  });
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
  refreshExpenses(c,p);
 }
 function init(value){if(api)return;api=value;document.body.classList.add('original-sidebar');initExpenses();
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
