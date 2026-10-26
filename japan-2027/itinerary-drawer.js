'use strict';
(function(){
 const panel=document.getElementById('itineraryPanel'),toggle=document.getElementById('itineraryToggle'),closeButton=document.getElementById('itineraryClose');
 const compact=()=>matchMedia('(max-width:1024px)').matches;
 let opener=null;
 function resizeMap(){window.dispatchEvent(new Event('resize'));}
 function open({focus=true}={}){
  if(!panel.hidden)return;
  opener=document.activeElement;panel.hidden=false;document.body.classList.add('itinerary-open');toggle.setAttribute('aria-expanded','true');
  panel.setAttribute('role',compact()?'dialog':'region');if(compact())panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');
  RouteUI.open(panel,{opener,modal:compact(),close,fallback:()=>toggle});if(!focus)opener?.focus({preventScroll:true});resizeMap();
 }
 function close({restore=true}={}){
  if(panel.hidden)return;
  panel.hidden=true;document.body.classList.remove('itinerary-open');toggle.setAttribute('aria-expanded','false');RouteUI.release(panel,{restore});resizeMap();
 }
 toggle.addEventListener('click',()=>{RouteUI.userExplore();panel.hidden?open():close();});closeButton.addEventListener('click',()=>close());
 window.addEventListener('routebook:detail-jump',event=>{if(event.detail.itinerary)open();});
 // A selected detail takes the place of the list; returning to the itinerary reopens it.
 function attach(map){map.on('popupopen',()=>close());}
 window.addEventListener('resize',()=>{if(panel.hidden)return;const mode=compact()?'dialog':'region';if(panel.getAttribute('role')===mode)return;RouteUI.release(panel,{restore:false});panel.setAttribute('role',mode);if(compact())panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');RouteUI.open(panel,{opener,modal:compact(),close,fallback:()=>toggle});});
 window.ItineraryDrawer={open,close,attach,isOpen:()=>!panel.hidden};
})();
