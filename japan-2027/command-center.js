'use strict';
/* C dashboard enhancements. All trip, route, GPS and booking records remain owned by app.js. */
(function(){
 const $=s=>document.querySelector(s);
 const storeKey='routebook-command-visited-v1', sidebarKey='routebook-command-sidebar-v1';
 const getApp=()=>window.__routebook;
 let visited={},queued=false,lastOptionSignature='';
 try{const parsed=JSON.parse(localStorage.getItem(storeKey)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))visited=parsed;}catch(_){}
 const mobile=()=>matchMedia('(max-width:740px)').matches;
 const shell=document.body,layout=$('.app-layout'),toolbar=$('.workspace-toolbar'),sidebar=$('.days-sidebar');
 if(!toolbar||!sidebar||!layout)return;
 shell.classList.add('cc-shell');
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const toggle=el('button','cc-toggle');
 toggle.id='ccSidebarToggle';toggle.type='button';toggle.setAttribute('aria-controls','daySidebar');toggle.title='날짜별 일정 패널 열고 닫기';
 sidebar.id='daySidebar';
 toolbar.insertBefore(toggle,toolbar.firstChild);
 const jump=el('select','cc-day-jump');jump.id='ccDayJump';jump.setAttribute('aria-label','여행 날짜 바로 이동');
 toolbar.insertBefore(jump,$('.toolbar-right'));
 const toolbarStatus=el('span','cc-toolbar-status');
 const selectedLabel=el('b','cc-selected-label','선택일 확인 중');
 toolbarStatus.append(selectedLabel);toolbar.insertBefore(toolbarStatus,$('.toolbar-right'));
 const headerStatus=el('span','cc-current-date');headerStatus.id='ccCurrentDate';
 $('.trip-summary')?.append(headerStatus);
 const progress=el('div','cc-sidebar-progress');progress.innerHTML='<small>방문 완료 · 이 기기에만 저장</small><b id="ccProgressText">선택 날짜 확인 중</b><div class="cc-progress-track" role="progressbar" aria-label="선택 날짜 방문 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="ccProgressBar" style="width:0%"></span></div>';
 sidebar.insertBefore(progress,$('#dayList'));
 const mask=el('button','cc-sidebar-mask');mask.type='button';mask.setAttribute('aria-label','날짜별 일정 패널 닫기');
 layout.after(mask);
 let collapsed;
 try{const saved=localStorage.getItem(sidebarKey);collapsed=saved===null?mobile():saved==='true';}catch(_){collapsed=mobile();}
 function resizeMap(){window.dispatchEvent(new Event('resize'));}
 function setCollapsed(value,save=true){
  collapsed=Boolean(value);
  shell.classList.toggle('cc-sidebar-collapsed',collapsed);
  toggle.textContent=collapsed?'일정 열기':'일정 접기';
  toggle.setAttribute('aria-expanded',String(!collapsed));
  toggle.setAttribute('aria-label',collapsed?'일정 패널 열기':'일정 패널 닫기');
  if(save)try{localStorage.setItem(sidebarKey,String(collapsed));}catch(_){}
  resizeMap();setTimeout(resizeMap,260);
 }
 setCollapsed(collapsed,false);
 toggle.addEventListener('click',()=>setCollapsed(!collapsed));
 mask.addEventListener('click',()=>setCollapsed(true));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobile()&&!collapsed&&!(document.querySelector('dialog[open]')))setCollapsed(true);});
 jump.addEventListener('change',()=>{const a=getApp(),day=Number(jump.value);if(a?.state?.data?.days?.some(d=>d.n===day)){a.setDay(day);if(mobile())setCollapsed(true);}});
 function context(){
  const a=getApp(),s=a?.state;if(!s?.data?.days?.length)return null;
  const d=s.data.days.find(x=>x.n===s.day);if(!d)return null;
  const v=d.variants.find(x=>x.id===s.variant)||d.variants[0];
  return {a,s,d,v};
 }
 function stopKey(n,id,stop,i){return String(n)+'|'+String(id)+'|'+String(stop.uid||'index:'+i);}
 function totalFor(day,variant){
  if(!variant?.stops)return {total:0,done:0};
  return {total:variant.stops.length,done:variant.stops.reduce((count,s,i)=>count+(visited[stopKey(day,variant.id,s,i)]===true?1:0),0)};
 }
 function persist(){try{localStorage.setItem(storeKey,JSON.stringify(visited));return true;}catch(_){return false;}}
 function updateCounts(){
  const c=context();if(!c)return;
  const {total,done}=totalFor(c.d.n,c.v);
  const percentage=total?Math.round(done/total*100):0;
  const count=$('#ccProgressText'),bar=$('#ccProgressBar'),track=progress.querySelector('[role=progressbar]');
  if(count)count.textContent='DAY '+String(c.d.n).padStart(2,'0')+' · '+done+' / '+total+'곳 ('+percentage+'%)';
  if(bar)bar.style.width=percentage+'%';
  if(track)track.setAttribute('aria-valuenow',String(percentage));
  selectedLabel.textContent='DAY '+String(c.d.n).padStart(2,'0')+' · '+c.d.date+' ('+c.d.weekday+')';
  const now=new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit'});
  headerStatus.textContent=' · 현재 '+now+' JST';
 }
 function syncJump(){
  const c=context();if(!c)return;
  const signature=c.s.data.days.map(d=>d.n+':'+d.date).join('|');
  if(signature!==lastOptionSignature){
   jump.replaceChildren();
   for(const d of c.s.data.days){
    const o=document.createElement('option');o.value=String(d.n);
    const choice=d.variants.find(v=>v.id===c.s.selectedVariantByDay[d.n])||d.variants[0];
    const name=window.MapPlan?.label?.(d,choice)?.city||d.shortTitle||d.cityLabel||'';
    o.textContent='DAY '+String(d.n).padStart(2,'0')+' · '+d.date+' '+name;jump.append(o);
   }
   lastOptionSignature=signature;
  }
  jump.value=String(c.d.n);
 }
 function enhanceStops(){
  const c=context();if(!c)return;
  for(const row of document.querySelectorAll('#stopList .stop-row')){
   const card=row.querySelector('.stop-card[data-stop]');if(!card)continue;
   const index=Number(card.dataset.stop),stop=c.v.stops[index];if(!stop)continue;
   const key=stopKey(c.d.n,c.v.id,stop,index);
   let button=row.querySelector('.cc-stop-check');
   if(!button){
    button=el('button','cc-stop-check');button.type='button';button.title='방문 완료 체크';
    row.append(button);
    button.addEventListener('click',event=>{
     event.preventDefault();event.stopPropagation();
     const id=button.dataset.visitKey;if(!id)return;
     if(visited[id])delete visited[id];else visited[id]=true;
     if(!persist())button.title='브라우저 저장이 차단되어 현재 화면에서만 유지됩니다';
     enhanceStops();enhanceDays();updateCounts();
    });
   }
   button.dataset.visitKey=key;
   const done=visited[key]===true;
   button.setAttribute('aria-pressed',String(done));
   button.setAttribute('aria-label',String(index+1)+'번째 '+stop.name+' 방문 '+(done?'완료 취소':'완료 표시'));
   const caption=done?'✓':'○';if(button.textContent!==caption)button.textContent=caption;
   card.classList.toggle('cc-completed',done);
  }
 }
 function enhanceDays(){
  const c=context();if(!c)return;
  for(const button of document.querySelectorAll('#dayList .day-item[data-day]')){
   const n=Number(button.dataset.day),day=c.s.data.days.find(d=>d.n===n);
   if(!day)continue;
   const variant=day.variants.find(v=>v.id===c.s.selectedVariantByDay[n])||day.variants[0];
   const tally=totalFor(n,variant);
   let tick=button.querySelector('.cc-visit-tick');
   if(tally.done>0){
    if(!tick){tick=el('span','cc-visit-tick');button.querySelector('.day-caption')?.append(tick);}
    const label=tally.done+'/'+tally.total;
    if(tick&&tick.textContent!==label)tick.textContent=label;
   }else tick?.remove();
  }
 }
 function refresh(){syncJump();enhanceStops();enhanceDays();updateCounts();}
 function schedule(){
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;refresh();});
 }
 const stops=$('#stopList'),days=$('#dayList');
 if(stops)new MutationObserver(schedule).observe(stops,{childList:true,subtree:true});
 if(days)new MutationObserver(schedule).observe(days,{childList:true,subtree:true});
 window.addEventListener('popstate',schedule);
 window.addEventListener('routebook:trip-update-ready',schedule);
 window.addEventListener('routebook:online',schedule);
 window.addEventListener('resize',()=>{if(mobile()&&!collapsed&&!mask.isConnected)layout.after(mask);});
 window.RoutebookCommandCenter=Object.freeze({
  refresh:schedule,
  toggleSidebar:()=>setCollapsed(!collapsed),
  completed:()=>({...visited}),
  progress:()=>{const c=context();return c?totalFor(c.d.n,c.v):null;}
 });
 schedule();
})();
