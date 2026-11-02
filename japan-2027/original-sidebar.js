'use strict';
// Mount the original itinerary once; its renderer, place IDs, route cards and storage remain authoritative.
(function(){
 const $=s=>document.querySelector(s);let api;
 function sidebar(open){document.body.classList.toggle('cc-sidebar-closed',!open);$('#ccSidebarToggle').setAttribute('aria-expanded',String(open));api.app.map.invalidateSize();}
 function refresh(){if(!api)return;const c=api.context(),p=api.personal();
  if(api.app.state.view==='daily')for(const card of document.querySelectorAll('#stopList .stop-card[data-stop]')){const stop=c.stops[Number(card.dataset.stop)];if(!stop)continue;card.dataset.originalPlace=stop.uid;const row=card.closest('.stop-row');let input=row.querySelector('[data-original-visit]');if(!input){const label=document.createElement('label');label.className='original-visit';input=document.createElement('input');input.type='checkbox';input.dataset.originalVisit=stop.uid;const text=document.createElement('span');text.className='cc-sr';text.textContent=api.name(stop)+' 방문 완료';input.setAttribute('aria-label',text.textContent);label.append(input,text);row.prepend(label);}const checked=!!p.visits[TravelAssistantCore.visitKey(c.day.n,c.variant.id,stop.uid)];input.checked=checked;row.classList.toggle('is-visited',checked);}
  const photo=$('#kisekiHeroPhoto');if(photo)$('#dayHeader').style.setProperty('--original-photo','url('+JSON.stringify(photo.getAttribute('src'))+')');
 }
 function init(value){if(api)return;api=value;document.body.classList.add('original-sidebar');
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
 window.OriginalSidebar={init,refresh};
})();
