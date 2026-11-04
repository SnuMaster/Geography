'use strict';
// Presentation adapter: retains the existing chat, consent forms and personal stores.
(function(){
 const $=s=>document.querySelector(s),jp=(title,subtitle,number='')=>`<span class="concierge-number" aria-hidden="true">${number}</span><span class="concierge-label"><b lang="ja">${title}</b><small>${subtitle}</small></span><span class="concierge-chevron" aria-hidden="true">↗</span>`;
 let ready=false,setTools;
 function view(show){
  const panel=$('#assistantPanel'),split=show&&innerWidth>=1100;
  panel.dataset.tools=String(show);panel.dataset.split=String(split);
  $('#assistantChat').hidden=show&&!split;$('#assistantPanel .assistant-body').hidden=show&&!split;$('#assistantToolsPane').hidden=!show;$('#assistantPanel footer').hidden=show&&!split;
  $('#assistantPanel header>strong').innerHTML=show&&!split?'<span lang="ja">旅の道具</span><small class="concierge-title-ko" lang="ko">여행 도구</small>':'<span lang="ja">旅の案内人</span><small class="concierge-title-ko" lang="ko">여행 안내인</small>';
  const button=$('#assistantToolsButton');button.textContent=show?'チャット':'道具';button.setAttribute('aria-label',show?'채팅으로 돌아가기':'여행 도구 열기');button.setAttribute('aria-expanded',String(show));
  for(const b of document.querySelectorAll('[data-concierge-view]'))b.setAttribute('aria-pressed',String(b.dataset.conciergeView===(show?'tools':'chat')));
 }
 function openTool(label){
  const aliases={'기록':'assistantRecordTools','경비·준비물·저장 조정안':'assistantPreparation','경비·준비물':'assistantPreparation','방문 체크':'assistantRecordTools','방문 완료 체크':'assistantRecordTools','연결·개인정보·사용량':'assistantConnectionDetails','설정·사용량':'assistantConnectionDetails','읽어주기':'assistantAudioTools','일본어 표현·긴급 도움 (오프라인)':'assistantPhrases','사진 번역·티켓 분석':'assistantPhoto'};
  const target=document.getElementById(aliases[label]);if(!target)return false;
  setTools(true);const ancestors=[];for(let d=target.closest('details');d;d=d.parentElement?.closest('details'))ancestors.unshift(d);
  for(const d of ancestors)d.open=true;target.scrollIntoView({block:'nearest'});return true;
 }
 function init(options){
  if(ready)return;({setTools}=options);const panel=$('#assistantPanel'),body=panel.querySelector('.assistant-body'),extras=$('#assistantToolsPane'),grid=extras.querySelector('.assistant-tool-grid');
  panel.classList.remove('assistant-polished');panel.classList.add('assistant-concierge');panel.querySelector('.assistant-emblem')?.remove();
  const rail=document.createElement('nav');rail.className='concierge-rail';rail.setAttribute('aria-label','여행비서 메뉴');rail.innerHTML='<span class="concierge-wordmark">KISEKI</span><span class="concierge-vertical" lang="ja">旅の案内人</span><span class="concierge-sun" aria-hidden="true">◒</span><button type="button" data-concierge-view="chat" aria-label="여행 채팅"><span lang="ja">旅</span><small lang="ko">여행</small></button><button type="button" data-concierge-view="tools" aria-label="여행 도구"><span lang="ja">記録</span><small lang="ko">기록</small></button><button type="button" id="conciergeSettings" aria-label="설정·사용량"><span lang="ja">設定</span><small lang="ko">설정</small></button>';panel.prepend(rail);
  rail.querySelector('[data-concierge-view="tools"]').setAttribute('aria-label','여행 기록 열기');
  rail.onclick=e=>{const mode=e.target.closest('[data-concierge-view]');if(mode){if(mode.dataset.conciergeView==='tools')openTool('기록');else setTools(false);}if(e.target.closest('#conciergeSettings'))openTool('설정·사용량');};
  const close=$('#assistantClose');close.textContent='×';close.setAttribute('aria-label','여행비서 접기');
  const welcome=$('#assistantEmpty');welcome.replaceChildren();welcome.innerHTML='<strong lang="ja">今日の旅</strong><small class="concierge-title-ko" lang="ko">오늘의 여행</small>';welcome.setAttribute('aria-label','질문을 입력하거나 빠른 질문을 선택하세요');
  const labels={'다음 목적지':['次の目的地','다음 목적지'],'지금 길 안내':['道案内','길 안내'],'오늘 일정':['今日の予定','오늘 일정'],'일본어 번역':['翻訳','번역']};
  for(const b of $('#assistantChat .assistant-quick').children){const [title,ko]=labels[b.dataset.assistantQuick]||[];if(title){b.innerHTML=jp(title,ko);b.setAttribute('aria-label',ko);}}
  $('#assistantChat .assistant-quick').after(welcome);const models=$('#assistantModelControls');$('#assistantContext').after(models);
  const photo=$('#assistantPhoto').closest('details'),phrases=$('#assistantPhrases').closest('details'),visits=$('#assistantVisits').closest('details'),expenses=$('#assistantExpense').closest('details'),questions=$('#assistantExtraQuestions'),audio=$('#assistantAudioTools'),settings=$('#assistantConnectionDetails');
  photo.id='assistantPhotoTools';phrases.id='assistantEmergencyTools';visits.id='assistantVisitTools';expenses.id='assistantPersonalTools';for(const d of [photo,phrases,visits,expenses,questions,audio,settings])d.removeAttribute('name');
  const booking=document.createElement('details');booking.id='assistantBookingTools';booking.innerHTML='<summary></summary><div class="concierge-booking-actions"><button type="button" id="conciergeBookingOpen">예약 체크</button><button type="button" id="conciergeTicketOpen">티켓 사진 분석</button></div>';
  $('#assistantBookings').textContent='예약 체크';$('#assistantExpensesLink').textContent='날짜별 경비';
  const records=document.createElement('details');records.id='assistantRecordTools';records.innerHTML='<summary></summary><p id="conciergeProgress" role="status"></p><div class="concierge-record-actions"><button type="button" id="conciergeItineraryOpen">일정에서 방문 체크</button><button type="button" id="conciergeRecordsOpen">개인 기록 열기</button></div>';
  const legacy=document.createElement('div');legacy.id='conciergeLegacyEditors';legacy.hidden=true;legacy.append(visits,$('#assistantExpense'),$('#assistantBudget'),$('#assistantBookings'));panel.append(legacy);
  records.querySelector('.concierge-record-actions').prepend($('#assistantExpensesLink'));records.querySelector('.concierge-record-actions').before($('#assistantExpenses'));
  expenses.id='assistantPreparation';expenses.querySelector('summary').textContent='준비물 · 저장한 조정안';records.append(expenses);$('#assistantChat .assistant-quick').after(questions);extras.querySelector('.assistant-tool-shortcuts')?.remove();
  settings.append(audio);settings.querySelector('summary').innerHTML=jp('設定','설정 · 사용량');
  const groups=[[photo,'翻訳','일본어 · 사진 번역'],[booking,'予約','예약 · 티켓'],[records,'記録','경비 · 방문 기록'],[phrases,'緊急','긴급 도움말']];
  grid.replaceChildren();for(const [i,[detail,title,ko]]of groups.entries()){detail.classList.add('concierge-tool-row');detail.querySelector('summary').innerHTML=jp(title,ko,String(i+1).padStart(2,'0'));grid.append(detail);}
  const primary=[...groups.map(g=>g[0]),settings];for(const d of primary)d.addEventListener('toggle',()=>{if(d.open)for(const other of primary)if(other!==d)other.open=false;});
  const heading=document.createElement('div');heading.className='concierge-tools-heading';heading.innerHTML='<small>KISEKI CONCIERGE</small><h2 lang="ja">旅の道具</h2><div class="concierge-provider-brands" aria-hidden="true"><span><img src="assets/assistant/openai-white.svg" alt="">ChatGPT</span><span><img src="assets/assistant/claude.svg" alt="">Claude</span></div>';extras.prepend(heading);extras.append(settings);panel.append(extras);
  $('#conciergeBookingOpen').onclick=()=>$('#assistantBookings').click();$('#conciergeTicketOpen').onclick=()=>{$('#assistantImageMode').value='ticket';photo.open=true;photo.scrollIntoView({block:'nearest'});};
  $('#conciergeItineraryOpen').onclick=()=>{$('#assistantClose').click();if($('#ccSidebarToggle').getAttribute('aria-expanded')!=='true')$('#ccSidebarToggle').click();$('#shellTabToday').click();};$('#conciergeRecordsOpen').onclick=()=>{$('#assistantClose').click();$('#ccRecords').click();};
  const attach=document.createElement('button');attach.type='button';attach.id='assistantAttach';attach.setAttribute('aria-label','사진 번역·티켓 사진 선택');attach.innerHTML=icon('file');attach.onclick=()=>{setTools(true);photo.open=true;$('#assistantPhoto').click();};$('#assistantForm').insertBefore(attach,$('#assistantInput'));const usage=document.createElement('button');usage.id='assistantUsageToggle';usage.type='button';usage.textContent='모델 · 사용량';usage.onclick=()=>openTool('설정·사용량');panel.querySelector('footer').append(usage);
  const line=$('#assistantBudgetLine'),refresh=$('#assistantModelRefresh');models.append(refresh);settings.querySelector('summary').after(line);ready=true;
 }
 window.AssistantConcierge={init,view,openTool,get ready(){return ready;}};
})();
