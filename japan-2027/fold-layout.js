'use strict';
// Adapt to the available CSS viewport, not a phone name or physical-pixel guess.
(function(){
 const $=s=>document.querySelector(s),panels=new Map(),cards=new Map();
 let previous='',focusSize=null,ready=false,scrollKey='';
 const mode=()=>innerWidth<700?'cover':innerWidth<=1100?'fold':'desktop';
 const editable=el=>el?.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,[contenteditable=true]');
 function sidebar(open){document.body.classList.toggle('cc-sidebar-closed',!open);$('#ccSidebarToggle')?.setAttribute('aria-expanded',String(open));}
 function card(expanded){document.body.classList.toggle('cc-card-collapsed',!expanded);const b=$('#foldCardToggle');if(b){b.setAttribute('aria-expanded',String(expanded));b.setAttribute('aria-label',expanded?'이동 정보 접기':'이동 정보 펼치기');b.textContent=expanded?'⌃':'⌄';}}
 function visual(){
  const v=window.visualViewport,el=document.activeElement,height=Math.max(1,v?.height||innerHeight),top=Math.max(0,v?.offsetTop||0),left=Math.max(0,v?.offsetLeft||0);
  const input=editable(el),sameWidth=focusSize&&Math.abs(innerWidth-focusSize.width)<80;
  const lost=Math.max(innerHeight-height-top,sameWidth?focusSize.height-innerHeight:0);
  const keyboard=!!input&&(v?.scale||1)<1.15&&(lost>110||height<420);
  document.body.dataset.keyboard=keyboard?'open':'closed';
  document.body.dataset.keyboardTarget=keyboard?(el.closest('#ccSidebar')?'itinerary':el.closest('.assistant-body')?'assistant-body':'composer'):'';
  const style=document.documentElement.style;style.setProperty('--viewport-height',height+'px');style.setProperty('--viewport-top',top+'px');style.setProperty('--viewport-left',left+'px');
  const key=keyboard?[el.id,height,top,innerWidth].join('|'):'';if(key!==scrollKey){scrollKey=key;if(key)requestAnimationFrame(()=>{if(document.activeElement!==el)return;const r=el.getBoundingClientRect();if(r.top<top+8||r.bottom>top+height-8)el.scrollIntoView({block:'nearest',inline:'nearest'});});}
 }
 function sync(){
  if(!ready)return;const current=mode();
  if(previous!==current){if(previous){panels.set(previous,!document.body.classList.contains('cc-sidebar-closed'));cards.set(previous,!document.body.classList.contains('cc-card-collapsed'));}document.body.dataset.viewport=current;sidebar(panels.has(current)?panels.get(current):current!=='cover');card(cards.has(current)?cards.get(current):current==='desktop');if(current==='desktop')$('.route-focus-summary').append($('#routeNavigationStart'));else $('.fold-card-bar').insertBefore($('#routeNavigationStart'),$('#foldCardToggle'));previous=current;}
  visual();refreshCard();
 }
 function refreshCard(){if(!ready)return;const source=$('#ccNext'),next=$('#foldNext');next.disabled=source.disabled;$('#foldNextName').textContent=$('#ccNextName').textContent;$('#routeNavigationStart').setAttribute('aria-label','선택한 이동 구간 길 안내');$('#routeNavigationStart').title=$('#routeFocusTitle').textContent;}
 function init(){
  if(ready)return;ready=true;const target=$('#shellContextCard'),bar=document.createElement('div');bar.className='fold-card-bar';bar.innerHTML='<button id="foldNext" type="button"><small>다음 방문</small><strong id="foldNextName"></strong></button><button id="foldCardToggle" type="button" aria-controls="ccNext routeFocusDetail routeFocusCount" aria-expanded="false" aria-label="이동 정보 펼치기">⌄</button>';target.prepend(bar);bar.insertBefore($('#routeNavigationStart'),$('#foldCardToggle'));
  $('#foldNext').onclick=()=>$('#ccNext').click();$('#foldCardToggle').onclick=()=>card($('#foldCardToggle').getAttribute('aria-expanded')!=='true');
  // Request cancellation remains reachable while the keyboard hides voice controls.
  $('#assistantPanel header>div').prepend($('#assistantCancel'));
  const tile=$('#tileError'),notice=document.createElement('dialog');notice.id='foldMapNoticeDialog';notice.setAttribute('aria-label','배경지도 연결 안내');notice.innerHTML='<header><strong>배경지도 연결 안내</strong><button id="foldMapNoticeClose" type="button" aria-label="지도 연결 안내 닫기">×</button></header><p>배경지도 통신이 불안정해도 장소와 저장된 경로는 사용할 수 있습니다. 지도 설정에서 내장 오프라인 지도를 선택할 수 있습니다.</p>';notice.append(tile);document.body.append(notice);
  const noticeButton=document.createElement('button');noticeButton.id='foldMapNotice';noticeButton.type='button';noticeButton.textContent='배경지도 연결 안내';noticeButton.hidden=true;$('#shellMore .shell-more-menu').append(noticeButton);noticeButton.onclick=()=>RouteUI.showDialog(notice);$('#foldMapNoticeClose').onclick=()=>{notice.close();RouteUI.release(notice);};
  const tileStatus=()=>{const failed=!tile.classList.contains('hidden');noticeButton.hidden=!failed;$('#shellMore').dataset.mapError=String(failed);$('#shellMore>summary').setAttribute('aria-label',failed?'보조 도구 · 배경지도 연결 확인 필요':'보조 도구');};new MutationObserver(tileStatus).observe(tile,{attributes:true,attributeFilter:['class']});tileStatus();
  document.addEventListener('focusin',e=>{if(editable(e.target)){if(!focusSize||document.body.dataset.keyboard!=='open'||Math.abs(innerWidth-focusSize.width)>=80)focusSize={width:innerWidth,height:innerHeight};visual();}});
  document.addEventListener('focusout',()=>requestAnimationFrame(()=>{if(!editable(document.activeElement))focusSize=null;visual();}));
  window.addEventListener('resize',sync,true);window.visualViewport?.addEventListener('resize',visual);window.visualViewport?.addEventListener('scroll',visual);
  window.addEventListener('routebook:route-focus',refreshCard);sync();
 }
 window.RouteViewport={init,sync,refreshCard,isDual:()=>mode()==='fold'};
})();
