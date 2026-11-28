'use strict';
// Mount the original itinerary once; its renderer, place IDs, route cards and storage remain authoritative.
(function(){
 const $=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let api;const drafts=new Map(),editing=new Set();
 const costName=stop=>stop.privateLocation?'비공개 출발·도착지':api.name(stop);
 const localCurrency=stop=>stop.lng<130&&stop.lat>34?'KRW':'JPY';
 function expenseTarget(c,row){
  if(row.hasAttribute('data-itinerary-stop')){
   const stop=c.stops[Number(row.dataset.itineraryStop)];
   if(!stop)return null;
   const category=stop.kind==='hotel'?'숙박비':stop.kind==='food'||stop.foodKey?'식비':stop.kind==='sight'?'입장료':'기타';
   return {type:'stop',uid:stop.uid,name:costName(stop),currency:localCurrency(stop),category};
  }
  const index=Number(row.dataset.expenseLeg),from=c.stops[index-1],to=c.stops[index];
  if(!from||!to)return null;
  const leg=c.legs[index-1],modes=leg?.parts.map(part=>part.mode)||[to.modeFromPrevious];
  const currency=leg?.fare?.purchase?.currency||
   (leg?.fare?.currency==='KRW'||(localCurrency(from)==='KRW'&&localCurrency(to)==='KRW')?'KRW':'JPY');
  const category=modes.includes('flight')?'항공료':modes.includes('ferry')?'선박료':'교통비';
  return {type:'leg',uid:leg?.legId||'d'+c.day.n+'-'+c.variant.id+'-leg-'+index,name:costName(from)+' → '+costName(to),currency,category};
 }
 function itineraryContext(group){
  if(!group)return api.context();
  const {overviewTimetableDay,overviewTimetableVariant}=group.dataset,state=api.app.state;
  const day=state.data.days.find(d=>d.n===Number(overviewTimetableDay));
  const variant=day?.variants.find(v=>v.id===overviewTimetableVariant);
  if(!variant)return null;
  return {day,variant,stops:variant.stops,legs:state.routeData.days[day.n+'-'+variant.id]||[]};
 }
 const refKey=(day,variant,type,uid)=>JSON.stringify([day,variant,type,uid]);
 const formKey=form=>refKey(Number(form.dataset.itineraryDay),form.dataset.expenseVariant,form.dataset.expenseType,form.dataset.expenseUid);
 function mountExpense(host,c,p){
  const target=expenseTarget(c,host);
  if(!target)return;
  const {type,uid}=target,key=refKey(c.day.n,c.variant.id,type,uid);
  const saved=p.expenses.find(e=>e.day===c.day.n&&e.itinerary?.variant===c.variant.id&&e.itinerary.type===type&&e.itinerary.uid===uid);
  const draft=drafts.get(key);let form=host.querySelector(':scope > .itinerary-expense');
  if(!form){form=document.createElement('form');form.className='itinerary-expense';form.dataset.expenseType=type;form.dataset.expenseUid=uid;form.dataset.itineraryDay=c.day.n;form.dataset.expenseVariant=c.variant.id;form.setAttribute('aria-label',target.name+' 실제 비용');form.innerHTML='<div class="itinerary-expense-saved" hidden><span></span><button type="button" data-expense-edit>수정</button></div><label><span>실제 비용</span><input name="amount" type="number" min="0" max="100000000" step="1" inputmode="numeric" aria-label="'+h(target.name)+' 실제 비용 금액"></label><span class="itinerary-currency"></span><button type="submit">저장</button><button type="button" data-expense-cancel hidden>취소</button><p role="status" aria-live="polite"></p>';host.append(form);}
  if(document.activeElement?.closest('.itinerary-expense')!==form){form.elements.amount.value=draft?.amount??saved?.amount??'';}form.dataset.currency=draft?.currency??saved?.currency??target.currency;form.querySelector('.itinerary-currency').textContent=form.dataset.currency==='JPY'?'JP¥':form.dataset.currency;
  const compact=!!saved&&!draft&&!editing.has(key);form.classList.toggle('is-saved',compact);for(const node of form.querySelectorAll(':scope>label,:scope>.itinerary-currency,:scope>button[type=submit]'))node.hidden=compact;form.querySelector('.itinerary-expense-saved').hidden=!compact;form.querySelector('.itinerary-expense-saved>span').textContent=saved?Number(saved.amount).toLocaleString('ko-KR')+' '+(saved.currency==='JPY'?'JP¥':saved.currency):'';form.querySelector('[data-expense-cancel]').hidden=compact||!saved;form.querySelector('p').textContent=draft?'입력 중 · 저장해 주세요.':editing.has(key)?'빈칸으로 저장하면 이 비용을 지워요.':'';
 }
 function stationFare(host,c,stop){if(stop.kind!=='station')return;let row=host.querySelector(':scope>.itinerary-station-fare');if(!row){row=document.createElement('div');row.className='itinerary-station-fare';host.append(row);}const rail=l=>l?.parts.some(p=>['rail','metro'].includes(p.mode))&&!l.parts.some(p=>['flight','ferry','bus','taxi'].includes(p.mode))&&!CommandCore.privateLeg(l,api.app.state.data.days),out=c.legs.find(l=>l?.fromUid===stop.uid&&rail(l)),leg=out||c.legs.find(l=>l?.toUid===stop.uid&&rail(l));if(!leg){row.innerHTML='<small>철도 요금은 열차 구간에 자동 표시</small>';return;}if(leg.fare?.displayBlank===true){row.replaceChildren();return;}const items=FareCore.railItems([leg]),japan=leg.fare?.currency==='JPY',known=japan?items.length&&items.every(r=>Number.isFinite(r.icYen)):Number.isFinite(leg.fare?.min),amount=known?(japan?items.reduce((n,r)=>n+r.icYen,0):leg.fare.min):null;row.innerHTML='<span>'+(out?'출발':'도착')+' 구간 '+(japan?(items.some(r=>r.ticketRequired)?'IC·별도 티켓':'IC 기준'):'철도')+' 운임</span><strong>'+(amount===null?'확인 필요':amount.toLocaleString('ko-KR')+(japan?' JP¥':' KRW'))+'</strong><small>저장된 계획 · 자동 표시'+(items.some(r=>r.reservedSurchargeYen>0)?' · 특급·지정석 추가요금 포함':'')+'</small>';}
 function refreshExpenses(c,p){
  const list=$('#stopList');
  if(api.app.state.view==='daily'){
   for(const row of list.querySelectorAll('[data-itinerary-stop],[data-expense-leg]')){
    mountExpense(row,c,p);
    if(row.hasAttribute('data-itinerary-stop'))stationFare(row,c,c.stops[Number(row.dataset.itineraryStop)]);
   }
   return;
  }
  for(const group of list.querySelectorAll('.overview-timetable-day[open]')){
   const context=itineraryContext(group);
   if(context)for(const row of group.querySelectorAll('[data-itinerary-stop],[data-expense-leg]'))mountExpense(row,context,p);
  }
 }
 function initExpenses(){
  const list=$('#stopList');
  list.addEventListener('toggle',event=>{if(event.target.matches('.overview-timetable-day[open]'))refresh();},true);
  list.addEventListener('click',event=>{const button=event.target.closest('[data-expense-edit],[data-expense-cancel]');if(!button)return;event.stopPropagation();const form=button.closest('.itinerary-expense'),key=formKey(form);if(button.hasAttribute('data-expense-edit'))editing.add(key);else{editing.delete(key);drafts.delete(key);}refresh();form.querySelector(button.hasAttribute('data-expense-edit')?'input':'[data-expense-edit]').focus({preventScroll:true});});
  list.addEventListener('input',event=>{const form=event.target.closest('.itinerary-expense');if(!form)return;drafts.set(formKey(form),{amount:form.elements.amount.value,currency:form.dataset.currency});form.querySelector('p').textContent='입력 중 · 저장해 주세요.';});
  list.addEventListener('submit',event=>{
   const form=event.target.closest('.itinerary-expense');
   if(!form)return;
   event.preventDefault();
   const c=itineraryContext(form.closest('.overview-timetable-day'));
   const target=c&&expenseTarget(c,form.parentElement),key=formKey(form);
   if(!target||key!==refKey(c.day.n,c.variant.id,target.type,target.uid))return;
   const {name,category,type,uid}=target,ref={day:c.day.n,variant:c.variant.id,type,uid};
   const amount=form.elements.amount.value,currency=form.dataset.currency;
   try{
    const saved=TravelAssistant.updatePersonal(p=>{p.expenses=TravelAssistantCore.itineraryExpense(p.expenses,ref,currency,amount,category,name);});
    if(saved!==false){drafts.delete(key);editing.delete(key);}
    else{editing.add(key);drafts.set(key,{amount,currency});}
    refresh();
    form.querySelector('p').textContent=saved===false?'기기 저장 실패 · 새로고침 전에 저장 공간을 확인하세요.':amount===''?'이 항목의 실제 비용을 지웠어요.':'';
    if(saved!==false&&amount!=='')form.querySelector('[data-expense-edit]').focus({preventScroll:true});
   }catch(error){form.querySelector('p').textContent=error.message;}
  });
 }
 function sidebar(open){document.body.classList.toggle('cc-sidebar-closed',!open);$('#ccSidebarToggle').setAttribute('aria-expanded',String(open));api.app.map.invalidateSize();}
 function railCard(leg,index){
  const firstRail=leg.parts.find(p=>['rail','metro'].includes(p.mode));
  if(!firstRail)return '';
  const paid=leg.parts.filter(p=>['rail','metro','bus','taxi'].includes(p.mode)),quote=FareCore.quote(leg.fare,leg,fareOptions()),fareLabel=(paid.length>1?'전체 ':'')+(quote.passApplied?'패스 적용 요금':leg.fare?.currency==='JPY'&&leg.fare?.icYen!=null?'IC 요금':'요금');
  let board=RailDepartures.html(leg.dayNumber||api?.app.state.day,leg,null,{distanceLabel:'전체 거리',distance:distanceText(leg.distanceM),fareLabel,fare:fareText(leg.fare,leg),displayBlank:leg.fare?.displayBlank===true},true);
  const ktx=leg.parts.find(part=>part.lineId==='KORAIL.GyeongbuHSR');if(ktx)board=board.replace(/<span class="departure-station-code[^"]*"[^>]*>KTX<\/span>/,operatorLogo(ktx));
  const line=railInfo(firstRail),route=shortRoute(leg);
  const names=route.split(' → ').map((name,i)=>`<span class="itinerary-train-name">${i?'→ ':''}${h(name)}</span>`).join(' ');
  const mark=line?.code?.length<=4?`<span class="itinerary-line-code" style="--itinerary-line-color:${h(line.color)}">${h(line.code)}</span>`:icon('rail');
  return `<details class="itinerary-train-card" data-itinerary-train-leg="${index}" aria-label="${h(route)} 열차 정보">
   <summary class="itinerary-train-summary">
    <span class="itinerary-train-mark" aria-hidden="true">${mark}</span>
    <span class="itinerary-train-label"><strong>${names}</strong><small>${h(leg.durationLabel)}</small></span>
    <span class="cc-sr">열차 상세</span>
   </summary>
   ${board}
   ${railGoogleLink(leg)}
   <button type="button" class="itinerary-train-detail" data-leg="${index}">지도·열차 정보 보기</button>
  </details>`;
 }
 function refresh(){if(!api)return;const c=api.context(),p=api.personal();
  if(api.app.state.view==='daily')for(const card of document.querySelectorAll('#stopList .stop-card[data-stop]')){const stop=c.stops[Number(card.dataset.stop)];if(!stop)continue;card.dataset.originalPlace=stop.uid;const row=card.closest('.stop-row');let input=row.querySelector('[data-original-visit]');if(!input){const label=document.createElement('label');label.className='original-visit';input=document.createElement('input');input.type='checkbox';input.dataset.originalVisit=stop.uid;const text=document.createElement('span');text.className='cc-sr';text.textContent=api.name(stop)+' 방문 완료';input.setAttribute('aria-label',text.textContent);label.append(input,text);row.prepend(label);}const checked=!!p.visits[TravelAssistantCore.visitKey(c.day.n,c.variant.id,stop.uid)];input.checked=checked;row.classList.toggle('is-visited',checked);}
  RailDepartures.mountInline($('#stopList'));
  const photo=$('#kisekiHeroPhoto');if(photo)$('#dayHeader').style.setProperty('--original-photo','url('+JSON.stringify(photo.getAttribute('src'))+')');
  refreshExpenses(c,p);
 }
 function init(value){if(api)return;api=value;document.body.classList.add('original-sidebar');initExpenses();
  const parking=$('#originalLegacyControls');
  const plan=document.createElement('section');plan.className='original-plan-tools';plan.innerHTML='<h3>일정 조정</h3><p>원본 일정은 그대로 유지됩니다. 조정안은 확인한 뒤 별도로 적용합니다.</p>';plan.append($('#ccEdit'),$('#ccUndo'),$('#ccPlanStatus'));$('#shellInfo').append(plan);parking.append(document.querySelector('.cc-timeline-heading'),$('#ccTimeline'));
  $('#shellTabToday').textContent='원본 일정';const panel=$('#itineraryPanel');$('#itineraryScroll').prepend($('#dayHeader'));
  ItineraryDrawer.dock($('#shellToday'),{open:()=>{$('#shellTabToday').click();sidebar(true);},close:()=>sidebar(false),isOpen:()=>!document.body.classList.contains('cc-sidebar-closed')&&$('#shellTabToday').getAttribute('aria-selected')==='true'});
  $('#stopList').addEventListener('change',event=>{const input=event.target.closest('[data-original-visit]');if(!input)return;const c=api.context(),uid=input.dataset.originalVisit;if(api.app.state.view!=='daily'||!c.stops.some(s=>s.uid===uid))return;TravelAssistant.updatePersonal(p=>{p.visits[TravelAssistantCore.visitKey(c.day.n,c.variant.id,uid)]=input.checked;});refresh();});
  $('#stopList').addEventListener('click',event=>{if(event.target.closest('a,details,label,input'))return;const card=event.target.closest('[data-original-place]'),stop=card&&api.context().stops.find(s=>s.uid===card.dataset.originalPlace);if(stop&&stop.kind!=='home'&&matchMedia('(max-width:699px)').matches)sidebar(false);});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||RouteUI.hasLayer())return;if(!document.body.classList.contains('cc-sidebar-closed')){event.preventDefault();event.stopImmediatePropagation();sidebar(false);$('#ccSidebarToggle').focus({preventScroll:true});}},true);
  new MutationObserver(refresh).observe($('#stopList'),{childList:true});new MutationObserver(refresh).observe($('#dayHeader'),{childList:true});$('#kisekiHeroPhoto')?.addEventListener('load',refresh);
  for(const name of ['routebook:state','routebook:personal-change','routebook:reservation-change'])window.addEventListener(name,refresh);
  // Keep required photo attribution available inside map settings, without an extra More menu entry.
  if($('#kisekiLegal'))$('#mapSettings').append($('#kisekiLegal'));refresh();
 }
 window.OriginalSidebar={clearDrafts:()=>{drafts.clear();editing.clear();},init,refresh,railCard};
})();
