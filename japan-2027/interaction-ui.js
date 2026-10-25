'use strict';
(function(){
 const stack=[],$=s=>document.querySelector(s),mobile=()=>matchMedia('(max-width:1024px)').matches;
 const focusables=el=>[...el.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);
 function userExplore(){window.dispatchEvent(new CustomEvent('routebook:user-explore',{detail:{source:'user'}}));}
 function release(el,{restore=true}={}){const index=stack.findIndex(e=>e.el===el);if(index<0)return;const entry=stack[index],wasTop=index===stack.length-1;stack.splice(index,1);document.body.classList.toggle('ui-overlay-open',stack.some(e=>e.modal));if(restore&&wasTop){const target=entry.opener?.isConnected?entry.opener:entry.fallback?.();target?.focus({preventScroll:true});}}
 function ensureFocus(el){if(!el.contains(document.activeElement)){const target=focusables(el)[0]||el;target.focus({preventScroll:true});}}
 function open(el,{close,opener=document.activeElement,modal=true,fallback}={}){if(stack.some(e=>e.el===el))return;stack.push({el,close,opener,modal,fallback});document.body.classList.toggle('ui-overlay-open',stack.some(e=>e.modal));el.tabIndex=-1;if(el.tagName==='DIALOG'&&!el.open)el.showModal();else el.hidden=false;ensureFocus(el);}
 function showDialog(el){userExplore();open(el,{close:()=>{el.close();release(el);}});}
 function top(){return stack.at(-1);}
 document.addEventListener('keydown',event=>{
  const entry=top();if(!entry)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();entry.close?.();return;}
  if(event.key==='Tab'&&entry.modal){const list=focusables(entry.el),first=list[0],last=list.at(-1);if(!first){event.preventDefault();entry.el.focus();}else if(event.shiftKey&&(!entry.el.contains(document.activeElement)||document.activeElement===first)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(!entry.el.contains(document.activeElement)||document.activeElement===last)){event.preventDefault();first.focus();}}
 },true);
 const resizeViewport=()=>document.documentElement.style.setProperty('--visual-height',(window.visualViewport?.height||window.innerHeight)+'px');
 window.visualViewport?.addEventListener('resize',resizeViewport);window.addEventListener('resize',resizeViewport);resizeViewport();
 window.RouteUI={open,release,ensureFocus,showDialog,userExplore,hasLayer:()=>!!top(),isTop:el=>top()?.el===el,mobile};
 document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('dialog').forEach(el=>{el.addEventListener('close',()=>{if(!el.open)release(el);});el.addEventListener('cancel',event=>{event.preventDefault();if(top()?.el===el)top().close?.();});});});

 let map,active=null,sheet,body,footer,closing=false,playbackState={active:false,running:false};
 function options(className,extra={}){return {maxWidth:340,maxHeight:map?RouteUICore.popupMaxHeight(map.getContainer().clientHeight,innerHeight):300,className,autoPan:!mobile(),autoPanPaddingTopLeft:[12,20],autoPanPaddingBottomRight:[12,105],...extra};}
 function closeDetail(){if(!active)return;closing=true;map.closePopup(active.popup);closing=false;}
 function actions(popup){const index=popup.options.routeStopIndex??popup.options.routeLegIndex;return `<button type="button" data-detail-itinerary${!Number.isInteger(index)?' hidden':''}>일정에서 보기</button><button type="button" data-detail-map>지도에서 보기</button><button type="button" data-detail-play ${playbackState.active?'':'hidden'}>${playbackState.running?'일시정지':'계속 재생'}</button>`;}
 function fitPopup(popup){
  if(mobile()||!popup.getElement()?.isConnected)return;
  map.stop();const rect=popup.getElement().getBoundingClientRect(),bounds=map.getContainer().getBoundingClientRect();
  const dx=Math.max(0,rect.right-(bounds.right-12))+Math.min(0,rect.left-(bounds.left+12));
  const dy=Math.max(0,rect.bottom-(bounds.bottom-105))+Math.min(0,rect.top-(bounds.top+20));
  if(Math.abs(dx)>.5||Math.abs(dy)>.5)map.panBy([dx,dy],{animate:false});
 }
 function popupOpened(event){
  const popup=event.popup,element=popup.getElement();if(!element)return;
  const source=popup.options.interactionSource||'user';if(source==='user')userExplore();
  const originalUpdate=popup.update;active={popup,element,opener:document.activeElement,originalUpdate};popup.update=function(){const result=originalUpdate.call(this);fitPopup(this);return result;};map.getContainer().closest('.map-panel').classList.add('detail-open');
  element.querySelectorAll('.detail-actions').forEach(el=>el.remove());
  if(mobile()){
   body.replaceChildren(element);element.classList.add('sheet-popup');footer.innerHTML=actions(popup);
   sheet.querySelector('[data-sheet-title]').textContent=element.querySelector('.popup-title')?.textContent||element.querySelector('.departure-stations')?.textContent||'이동 상세';
   RouteUI.open(sheet,{opener:active.opener,close:closeDetail,fallback:()=>$('#fitBtn')});body.scrollTop=0;
  }else{
   popup.options.maxHeight=RouteUICore.popupMaxHeight(map.getContainer().clientHeight,innerHeight);popup.update();
   const target=element.querySelector('.leaflet-popup-content');if(target){let content=popup.getContent();if(!content?.nodeType){content=document.createElement('div');while(target.firstChild)content.appendChild(target.firstChild);}content.insertAdjacentHTML('beforeend',`<div class="detail-actions">${actions(popup)}</div>`);popup.setContent(content);}
   active.toggle=()=>popup.update();element.addEventListener('toggle',active.toggle,true);
  }
 }
 function popupClosed(event){
  if(!active||active.popup!==event.popup)return;
  const wasSheet=sheet.open;active.popup.update=active.originalUpdate;if(active.toggle)active.element.removeEventListener('toggle',active.toggle,true);active=null;map.getContainer().closest('.map-panel').classList.remove('detail-open');
  if(wasSheet){sheet.close();RouteUI.release(sheet);body.replaceChildren();}
 }
 function detailClick(event){const button=event.target.closest('[data-detail-map],[data-detail-itinerary],[data-detail-play]');if(!button||!active)return;if(button.hasAttribute('data-detail-play')){$('#playBtn').click();return;}const index=active.popup.options.routeStopIndex??active.popup.options.routeLegIndex;const itinerary=button.hasAttribute('data-detail-itinerary');closeDetail();window.dispatchEvent(new CustomEvent('routebook:detail-jump',{detail:{itinerary,index}}));}
 function attach(value){map=value;sheet=document.createElement('dialog');sheet.id='detailSheet';sheet.setAttribute('aria-label','장소 및 이동 상세');sheet.innerHTML='<header class="detail-sheet-header"><strong data-sheet-title>이동 상세</strong><button type="button" data-sheet-close aria-label="상세 닫기">×</button></header><div class="detail-sheet-body"></div><footer class="detail-actions"></footer>';document.body.appendChild(sheet);body=sheet.querySelector('.detail-sheet-body');footer=sheet.querySelector('footer');sheet.querySelector('[data-sheet-close]').addEventListener('click',closeDetail);sheet.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});sheet.addEventListener('close',()=>{if(sheet.open)return;RouteUI.release(sheet);if(active&&!closing)closeDetail();});
  map.on('popupopen',popupOpened);map.on('popupclose',popupClosed);document.addEventListener('click',detailClick);
  const refresh=()=>{if(!active)return;if(mobile()!==sheet.open){closeDetail();return;}if(!mobile()){active.popup.options.maxHeight=RouteUICore.popupMaxHeight(map.getContainer().clientHeight,innerHeight);active.popup.update();}};
  window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);
 }
 window.addEventListener('routebook:playback',event=>{playbackState=event.detail;document.querySelectorAll('[data-detail-play]').forEach(button=>{button.hidden=!event.detail.active;button.textContent=event.detail.running?'일시정지':'계속 재생';});});
 window.DetailView={attach,options,close:closeDetail,isOpen:()=>!!active};
})();
