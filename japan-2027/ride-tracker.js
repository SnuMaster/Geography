'use strict';
// A user-selected service, never an automatic identification of a physical train.
(function () {
  const STORE = 'routebook-boarded-train-v1';
  const profiles = globalThis.RailDepartureProfiles?.profiles || {};
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = selector => document.querySelector(selector);
  const clock = epoch => Number.isFinite(epoch) ? new Date(epoch + 32400000).toISOString().slice(11, 19) : '—';
  const time = epoch => Number.isFinite(epoch) ? DepartureCore.formatTime(epoch) : '—';
  const eventTime = epoch => Number.isFinite(epoch) ? clock(epoch).replace(/:00$/, '') : '—';
  const dateNow = () => RideCore.serviceDateForNow(Date.now());
  const labelFor = kind => kind === 'arrival' ? '도착' : kind === 'departure' ? '출발' : '정차';
  const trainName = train => [train.number, train.line || RailDepartures.typeLabel(train.type)].filter(Boolean).join(' · ') || '시간표 열차';
  let config, panel, body, mini, active = null, mode = 'picker', timer = null, pickerRequest = 0, lastFocus = null;
  let selectionEpoch=0,restoreState='idle',restoreTask=null,lastListTick=0;
  let selectedKey = '', selectedDate = '', schedules = null, trains = [], allDay = false, filter = '', savedMessage = '';

  function options(key) {
    const p = profiles[key];
    return {...RailDepartures.calendarOptions(key), fromName: p.from, toName: p.to};
  }
  function setStatus(message) {
    const node = $('#rideStatus');
    if (node) node.textContent = message;
  }
  function persist() {
    try {
      if (!active) { localStorage.removeItem(STORE); return; }
      const {key, train, delaySeconds, confirmedStopIndex, confirmedAt, confirmedEventKind, startedAt} = active;
      localStorage.setItem(STORE, JSON.stringify({version:1, key, trainId:train.id, serviceDate:train.serviceDate,
        departureAt:train.departureAt, delaySeconds, confirmedStopIndex, confirmedAt, confirmedEventKind, startedAt}));
    } catch (_) { /* Tracking continues when browser storage is unavailable. */ }
  }
  function restoreNotice(){
    const pending=restoreState==='loading',node=$('#rideRestoreStatus');
    if(node){node.hidden=!pending;node.textContent=pending?'기존 탑승 정보 복원 중…':'';}
    if(pending&&!active)$('#rideToggleLabel').textContent='탑승 정보 복원 중…';
    else if(!active)$('#rideToggleLabel').textContent='탑승 열차';
    const back=body?.querySelector('[data-ride-back]');if(back)back.hidden=!active;
  }
  function currentKeys() {
    return [...new Set((config?.context().legs || []).flatMap(leg => leg ? RailDepartures.keysFor(leg) : []))];
  }
  function selectOptions(key) {
    const current = currentKeys(), remaining = Object.keys(profiles).filter(k => !current.includes(k));
    const option = k => `<option value="${h(k)}"${k === key ? ' selected' : ''}>${h(profiles[k].line)} · ${h(profiles[k].from)} → ${h(profiles[k].to)}</option>`;
    return `${current.length ? `<optgroup label="${config.context().day.n}일차 철도 구간">${current.map(option).join('')}</optgroup>` : ''}<optgroup label="여행 전체 철도 구간">${remaining.map(option).join('')}</optgroup>`;
  }
  function showPanel() {
    RouteUI.userExplore();
    if(panel.hidden)lastFocus = document.activeElement;
    panel.hidden = false;
    $('#rideToggle').setAttribute('aria-expanded', 'true');
    document.body.classList.add('ride-panel-open');
    config.map.closePopup();
    RouteUI.open(panel,{opener:lastFocus,modal:false,close:hidePanel,fallback:()=>$('#rideToggle')});
    resume();
  }
  function hidePanel() {
    if (mode === 'loading') pickerRequest++;
    panel.hidden = true;
    $('#rideToggle').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('ride-panel-open');
    RouteUI.release(panel);syncMiniSpace();
    resume();
  }
  function pickerShell() {
    mode = 'picker';
    body.scrollTop = 0;
    const p = profiles[selectedKey];
    body.innerHTML = `<div class="ride-intro"><span class="ride-eyebrow">CHOOSE YOUR TRAIN</span><h2 id="ridePanelTitle">내가 탄 열차를 골라요</h2><p>출발 시각·행선지·열차번호를 현장 안내와 맞춰 선택하세요. 이미 출발한 열차도 고를 수 있어요.</p></div>
      <button type="button" class="ride-back" data-ride-back ${active?'':'hidden'}>← 추적 중인 열차로 돌아가기</button>
      <label class="ride-field">승차 구간<select id="rideProfile" aria-label="탑승할 철도 구간">${selectOptions(selectedKey)}</select></label>
      <div class="ride-picker-tools"><label class="ride-field">운행일<input id="rideDate" type="date" value="${h(selectedDate)}" aria-label="열차 운행일"></label><button type="button" class="ride-today" data-ride-today>지금 시간대</button></div>
      <label class="ride-field ride-search-label">열차 찾기<input id="rideSearch" type="search" value="${h(filter)}" placeholder="출발 시각 · 열차번호 · 행선지" aria-label="출발 시각 열차번호 행선지 검색" autocomplete="off"></label>
      <div class="ride-list-toolbar"><strong id="rideListCount">시간표를 불러오는 중…</strong><button type="button" id="rideAllDay" aria-pressed="${allDay}" data-ride-all>${allDay ? '지금 전후 보기' : '하루 전체 보기'}</button></div>
      <p class="ride-service-note">운행일은 오전 3시 기준이에요. 심야 00~02시대는 전날 운행일에서 확인하세요.</p>
      <div id="rideTrainList" class="ride-train-list" aria-busy="true"></div>
      <p id="rideStatus" class="ride-status" role="status" aria-live="polite">${h(savedMessage)}</p>
      <p class="ride-footnote">${h(p?.line || '')} · 시간표 기준 · 지연·운휴 자동 수신 없음</p>`;
  }
  function renderList() {
    if (mode !== 'picker') return;
    const list = $('#rideTrainList'), p = profiles[selectedKey], now = Date.now();
    if (!list) return;
    const validity=RailDepartures.validityFor(selectedKey,selectedDate);
    if(!validity.usable){list.setAttribute('aria-busy','false');$('#rideListCount').textContent='여행일 시간표 갱신 필요';list.innerHTML=`<div class="ride-empty timetable-warning">여행일 시간표 갱신 필요 · ${h(selectedDate)}<br>자료 확인 ${h(p.sourceDate)} · ${p.validUntil?'유효 종료 '+h(p.validUntil):'적용 범위 밖'}<br>확인되지 않은 열차 시각은 표시하지 않아요.</div>`;return;}
    lastListTick=now;
    const text = filter.trim().toLocaleLowerCase().replace(/\s/g, '');
    let visible = trains.filter(train => {
      const near = allDay || selectedDate !== dateNow() || (train.departureAt >= now - 3 * 3600000 && train.departureAt <= now + 90 * 60000)
        || (train.departureAt <= now && train.destinationAt >= now);
      const search = [train.number, train.numbers?.join(' '), train.destination, train.type, trainName(train), time(train.departureAt)].join(' ').toLocaleLowerCase().replace(/\s/g, '');
      return near && (!text || search.includes(text));
    });
    // In a current-time view, put currently running services first without hiding any selected-day trains.
    if (!allDay && selectedDate === dateNow()) {
      visible = [...visible].sort((a,b) => {
        const rank = t => {
          const end = t.destinationAt;
          return t.departureAt <= now && Number.isFinite(end) && end > now ? 0 : t.departureAt > now ? 1 : 2;
        };
        return rank(a)-rank(b) || (rank(a)===2 ? b.departureAt-a.departureAt : a.departureAt-b.departureAt);
      });
    }
    $('#rideListCount').textContent = `${visible.length}편 표시 · 운행일 전체 ${trains.length}편`;
    $('#rideAllDay').textContent = allDay ? '지금 전후 보기' : '하루 전체 보기';
    $('#rideAllDay').setAttribute('aria-pressed', String(allDay));
    list.setAttribute('aria-busy', 'false');
    if (!visible.length) {
      list.innerHTML = `<div class="ride-empty">${trains.length ? '조건에 맞는 열차가 없어요. 검색어를 바꾸거나 하루 전체를 확인해 주세요.' : h(p.unavailableReason || '이 운행일에 적용할 시간표가 없어요. 날짜와 공식 안내를 확인해 주세요.')}${p.officialTimetableUrl ? `<a href="${h(p.officialTimetableUrl)}" target="_blank" rel="noopener noreferrer">공식 시간표 ↗</a>` : ''}</div>`;
      return;
    }
    list.innerHTML = visible.map(train => {
      const index = trains.indexOf(train), terminal = train.destinationAt;
      const kind = labelFor(train.destinationEventKind);
      const state = RideCore.timeStatus(train,now);
      const partial = train.stopTimeBasis === 'partial' || !terminal;
      return `<article class="ride-train-option${active?.key===selectedKey&&active.train.uid===train.uid?' is-selected':''}" data-ride-option="${index}"><div class="ride-train-time"><strong>${time(train.departureAt)}</strong><small data-ride-train-state>${h(state)}</small></div><div class="ride-train-description"><strong>${h(trainName(train))}</strong><span>${h(train.destination || p.to)}행</span><small>${h(p.to)} ${kind} ${eventTime(terminal)}${partial ? ' · 일부 시각 미제공' : train.stopTimeBasis === 'estimated' ? ' · 소요시간 추정' : ''}</small></div><button type="button" class="ride-board-button" data-ride-board="${index}" aria-label="${h(time(train.departureAt)+' '+trainName(train)+' '+(train.destination||p.to)+'행 탑승 시작')}">탑승<br>시작</button></article>`;
    }).join('');
  }
  async function loadPicker(key, {resetSearch=false}={}) {
    if (!profiles[key]) return;
    selectedKey = key;
    if (!selectedDate) selectedDate = dateNow();
    if (resetSearch) filter = '';
    const token = ++pickerRequest;
    schedules = null; trains = [];
    pickerShell();restoreNotice();
    const data = await RailDepartures.getSchedule(key);
    if (token !== pickerRequest || mode !== 'picker') return;
    if (!data) {
      $('#rideTrainList').setAttribute('aria-busy','false');
      $('#rideTrainList').innerHTML = '<div class="ride-empty">시간표를 불러오지 못했어요.<button type="button" data-ride-retry>다시 불러오기</button></div>';
      $('#rideListCount').textContent = '시간표 연결 확인 필요';
      return;
    }
    schedules = data;
    trains = RideCore.trainsForDate(data, selectedDate, options(key));
    renderList();
  }
  async function open(key, serviceDate) {
    if (!config) return;
    showPanel();
    if(!key&&restoreState==='loading'&&!active){mode='restoring';body.innerHTML='<div class="ride-empty"><h2 id="ridePanelTitle">기존 탑승 정보 복원 중…</h2><p>저장된 열차와 시간 보정을 불러오고 있어요.</p><button type="button" data-ride-browse>전체 시간표 먼저 보기</button><button type="button" data-ride-finish>저장된 추적 종료</button></div>';restoreNotice();return;}
    if (!key && active) { renderTracking(); return; }
    selectedDate = serviceDate || dateNow(); allDay = false; filter = '';
    await loadPicker(key || currentKeys()[0] || Object.keys(profiles)[0]);
    $('#rideProfile')?.focus({preventScroll:true});
  }
  function start(key, train, restored) {
    if (!RideCore.isValidTrain(train) || !RailDepartures.validityFor(key,train.serviceDate).usable) { setStatus('선택한 열차의 시각 자료를 확인할 수 없어요.'); return; }
    selectionEpoch++;restoreState='idle';restoreNotice();
    active = {key, train, serviceDate:train.serviceDate, delaySeconds:0, confirmedStopIndex:null, confirmedAt:null, confirmedEventKind:null, startedAt:Date.now(), ...restored};
    pickerRequest++;
    persist();
    showPanel();
    renderTracking();
    $('#ridePanelTitle')?.focus({preventScroll:true});
  }
  async function board(key, id, serviceDate, departureAt) {
    if (!config || !profiles[key]) return;
    showPanel();
    selectedKey = key; selectedDate = serviceDate || dateNow();const boardingDate=selectedDate;
    const token = ++pickerRequest;
    mode = 'loading';
    body.innerHTML = '<div class="ride-empty" role="status">선택한 열차를 불러오는 중…</div>';
    const data = await RailDepartures.getSchedule(key);
    if (token !== pickerRequest) return;
    const records = data ? RideCore.trainsForDate(data, boardingDate, options(key)) : [];
    const train = records.find(t => t.id === id && (!Number.isFinite(departureAt) || t.departureAt === departureAt));
    if (train) start(key, train);
    else { await loadPicker(key); setStatus('선택한 열차를 다시 확인해 주세요. 목록에서 출발 시각을 고를 수 있어요.'); }
  }
  function renderTracking() {
    if (!active) return;
    mode = 'tracking';
    pickerRequest++;
    body.scrollTop = 0;
    const p = profiles[active.key], train = active.train;
    const basis = train.stopTimeBasis === 'estimated' ? '소요시간으로 추정' : train.stopTimeBasis === 'partial' ? '일부 시간표 제공' : '시간표로 계산';
    body.innerHTML = `<div class="ride-intro ride-onboard-intro"><span class="ride-eyebrow">YOUR SELECTED TRAIN</span><div class="ride-title-row"><h2 id="ridePanelTitle" tabindex="-1">${h(trainName(train))}</h2><span class="ride-basis">${basis}</span></div><p><b>${h(p.line)}</b><br>${h(p.from)} → ${h(p.to)} · ${h(train.destination||p.to)}행</p><div class="ride-service-id">${h(train.serviceDate)} 운행 · ${time(train.departureAt)} 출발</div></div>
      <div class="ride-hero"><small id="rideRemainingLabel">하차역 예정 시각까지</small><strong id="rideRemaining" role="timer" aria-live="off">—</strong><div class="ride-progress" role="progressbar" aria-label="시간표상 이동 진행률" aria-valuemin="0" aria-valuemax="100"><i id="rideProgressFill"></i></div><div class="ride-hero-meta"><span id="rideStopsLeft"></span><span id="rideDestinationTime"></span></div></div>
      <section class="ride-position" aria-label="현재 이동 상태"><div><small id="ridePositionLabel">시간표상 현재 위치</small><strong id="ridePosition">계산 중…</strong></div><div class="ride-next"><small>다음 역</small><strong id="rideNextStation">—</strong><span id="rideNextTime"></span></div></section>
      <p id="rideStatus" class="ride-status" role="status" aria-live="polite"></p>
      <div class="ride-gps-row"><span id="rideGpsState">GPS를 켜면 근처 역도 비교할 수 있어요.</span><button type="button" data-ride-gps>GPS 확인</button></div>
      <div class="ride-main-actions"><button type="button" data-ride-map>지도에서 보기</button><button type="button" data-ride-change>다른 열차 선택</button></div>
      <details class="ride-correction"><summary>현재 역·지연 시간 맞추기</summary><p>현장 안내와 다르면 도착한 역을 직접 확인하거나 시간을 보정하세요. 보정은 내가 고른 열차에만 적용돼요.</p><button type="button" class="ride-departed" data-ride-departed>지금 출발역에서 출발했어요</button><form id="rideDelayForm"><label>추가 시간 보정 <span><input id="rideDelay" type="number" min="-120" max="240" step="1" value="${active.delaySeconds/60}" aria-label="열차 추가 지연 시간 분"> 분</span></label><button type="submit">적용</button></form><small>늦으면 양수, 빠르면 음수 · 역 확인 뒤 추가 보정도 가능</small><button type="button" class="ride-reset" data-ride-reset>원래 시간표로 초기화</button></details>
      <details class="ride-stop-details" open><summary>정차역과 예정 시각 <span>${train.stops.length}개 역</span></summary><ol id="rideStopList" class="ride-stop-list">${train.stops.map((stop,index)=>`<li data-ride-stop-row="${index}"><span class="ride-stop-dot"></span><div><strong>${h(stop.name)}</strong>${stop.nameJa&&stop.nameJa!==stop.name?`<small>${h(stop.nameJa)}</small>`:''}<span data-ride-stop-time="${index}"></span></div><button type="button" data-ride-confirm="${index}" aria-label="현재 ${h(stop.name)}역 확인">이 역 확인</button></li>`).join('')}</ol></details>
      <div class="ride-data-note"><b>시간표에 따른 위치예요.</b> 지연·운휴는 자동으로 반영되지 않아요. 출발 시각만 제공된 역은 구간 이동으로 표시해요.${train.stopTimeNote?`<p>${h(train.stopTimeNote)}</p>`:''}</div>
      <div class="ride-footer"><span id="rideClock"></span><button type="button" class="ride-finish" data-ride-finish>하차 완료 · 추적 종료</button></div>
      <p class="ride-footnote">열차 선택과 시간 보정은 이 브라우저에 저장돼요. 새로고침해도 이어집니다. GPS 좌표는 저장하지 않아요.</p>`;
    RouteUI.ensureFocus(panel);paint(); resume();
  }
  function nearestGps(stops, now) {
    const fix = window.RouteLocation?.getFix?.();
    if (!fix) return {text:stops.some(stop=>Array.isArray(stop.coord))?'GPS를 켜면 근처 역도 비교할 수 있어요.':'GPS를 켜면 내 위치를 지도에서 볼 수 있어요.'};
    const age = now-fix.timestamp;
    if (age > 30000 || age < -5000) return {text:'GPS 갱신 대기 · 시간표 기준으로 표시 중'};
    if (fix.accuracy > 150) return {text:`GPS 오차 ±${Math.round(fix.accuracy)}m · 근처 역 판정 보류`};
    const candidates = stops.map((stop,index)=>({stop,index,distance:Array.isArray(stop.coord)?RouteMatch.distance([fix.lat,fix.lng],stop.coord):Infinity}));
    candidates.sort((a,b)=>a.distance-b.distance);
    const nearest = candidates[0];
    if (!nearest || !Number.isFinite(nearest.distance)) return {text:'이 구간의 역 좌표 미제공 · GPS 위치는 지도에서 확인하세요.'};
    if (!nearest || nearest.distance > 250+fix.accuracy) return {text:`GPS 수신 중 · 역 주변 아님 · 오차 ±${Math.round(fix.accuracy)}m`};
    return {text:`GPS 근처 역: ${nearest.stop.name} · 약 ${Math.round(nearest.distance)}m · 오차 ±${Math.round(fix.accuracy)}m`, ...nearest};
  }
  let miniHeight=0;
  function syncMiniSpace(){
    const shown=!!active&&!mini.hidden;document.body.classList.toggle('has-ride-mini',shown);
    if(shown){const height=mini.getBoundingClientRect().height;if(height>0)miniHeight=height;document.documentElement.style.setProperty('--ride-mini-clearance',RouteUICore.miniClearance(miniHeight||76)+'px');}
    else document.documentElement.style.setProperty('--ride-mini-clearance','0px');
  }
  function paint() {
    if(mode==='picker'&&!panel.hidden&&Date.now()-lastListTick>=30000){
      lastListTick=Date.now();
      body.querySelectorAll('[data-ride-option]').forEach(row=>{const train=trains[Number(row.dataset.rideOption)],status=row.querySelector('[data-ride-train-state]');if(train&&status)status.textContent=RideCore.timeStatus(train,lastListTick);});
    }
    if (!active) { mini.hidden=true;syncMiniSpace(); return; }
    const now=Date.now(), p=profiles[active.key], result=RideCore.progress(active.train, now, active);
    const destinationKind=labelFor(result.destinationEventKind);
    const waiting=result.phase==='waiting', ended=result.phase==='arrived';
    const remaining=waiting ? active.train.departureAt+(result.adjustmentSeconds||0)*1000-now : result.remainingMs;
    const remainingText=ended?'예정 시각 지남':Number.isFinite(remaining) ? DepartureCore.formatCountdown(remaining) : '시각 확인 필요';
    const position=result.confirmationPending?`${result.confirmation.stop.name}역 확인 완료 · 이후 위치 확인 필요`:result.currentStop?.name || (waiting ? `${p.from} 출발 전` : ended ? `${p.to} 예정 시각 지남 · 실제 위치 확인 필요` : result.positionKnown && result.previousStop && result.nextStop ? `${result.previousStop.name} → ${result.nextStop.name}` : result.confirmation ? `마지막 확인 · ${result.confirmation.stop.name}` : '중간 정차 시각 미제공');
    const message=result.confirmationPending?`${result.confirmation.stop.name}역 확인 완료 · 이후 위치 확인 필요`:ended?'하차역 예정 시각이 지났어요. 현장 위치를 확인하거나 지연 시간을 맞춰 주세요.':result.confirmation&&!result.confirmation.applied?`${result.confirmation.stop.name}역을 직접 확인했어요. 이 역의 시각이 없어 남은 시간을 자동 보정할 수 없어요.`:result.nextStopIndex===active.train.stops.length-1&&!waiting&&result.positionKnown?`다음은 하차역 ${p.to}입니다. 현장 안내를 확인해 주세요.`:active.confirmedAt?`직접 확인한 역과 시간 보정을 반영하고 있어요.`:active.train.stopTimeBasis==='partial'?'제공된 시각 구간만 계산하고 있어요. 현재 역을 직접 확인할 수 있어요.':'';
    mini.hidden=false;
    mini.innerHTML=`<span class="ride-mini-icon" aria-hidden="true">${typeof icon==='function'?icon('rail'):'●'}</span><span><strong>${h(p.to)} ${waiting?'탑승 예정':'방향'}</strong><small>${h(position)}</small></span><b>${h(remainingText)}</b><span aria-hidden="true">↗</span>`;
    mini.setAttribute('aria-label', `탑승 열차 열기 ${p.to} 방향 ${position} ${remainingText}`);
    $('#rideToggleLabel').textContent='탑승 추적 중';
    $('#rideToggle').classList.add('has-ride');syncMiniSpace();
    if (mode!=='tracking' || panel.hidden) return;
    $('#rideRemainingLabel').textContent=waiting?'출발까지':`하차역까지 · ${destinationKind} 예정 시각 기준`;
    $('#rideRemaining').textContent=remainingText;
    $('#rideDestinationTime').textContent=Number.isFinite(result.destinationAt)?`${p.to} ${eventTime(result.destinationAt)} ${destinationKind}`:'하차역 시각 미제공';
    $('#rideStopsLeft').textContent=Number.isFinite(result.remainingStops)&&(result.positionKnown||waiting||ended)?`${result.remainingStops}개 역 남음`:'현재 역 확인 필요';
    const percent=Number.isFinite(result.progressFraction)?Math.max(0,Math.min(100,result.progressFraction*100)):0;
    $('#rideProgressFill').style.width=`${percent}%`;
    $('.ride-progress').setAttribute('aria-valuenow',String(Math.round(percent)));
    $('#ridePositionLabel').textContent=result.confirmation&&!result.confirmation.applied?'마지막으로 직접 확인한 역':active.confirmedAt?'직접 확인한 시각으로 보정':active.train.stopTimeBasis==='estimated'?'소요시간으로 추정한 위치':'시간표상 현재 위치';
    $('#ridePosition').textContent=position;
    $('#rideNextStation').textContent=(result.positionKnown||waiting)?result.nextStop?.name||'—':ended?'—':'현재 역 확인 필요';
    $('#rideNextTime').textContent=result.nextEventAt&&(result.positionKnown||waiting)?`${eventTime(result.nextEventAt)} ${labelFor(result.nextEventKind)} 예정 · ${DepartureCore.formatCountdown(result.nextEventAt-now)}`:'';
    const status=$('#rideStatus'); if(status.textContent!==message)status.textContent=message;
    $('#rideGpsState').textContent=nearestGps(result.stops||active.train.stops,now).text;
    $('#rideClock').textContent=`${p.country==='KR'?'한국':'일본'} ${clock(now)} 기준`;
    (result.stops||active.train.stops).forEach((stop,index)=>{
      const node=$(`[data-ride-stop-time="${index}"]`), row=$(`[data-ride-stop-row="${index}"]`);
      if (!node || !row) return;
      const times=[];
      if(Number.isFinite(stop.arrivalAt))times.push(`${eventTime(stop.arrivalAt)} 도착`);
      if(Number.isFinite(stop.departureAt))times.push(`${eventTime(stop.departureAt)} 출발`);
      if(!times.length&&Number.isFinite(stop.timeAt))times.push(`${clock(stop.timeAt).replace(/:00$/,'')} 정차 예정`);
      node.textContent=times.join(' · ')||'시각 미제공';
      row.classList.toggle('is-current',index===result.currentStopIndex);
      row.classList.toggle('is-next',index===result.nextStopIndex);
      row.classList.toggle('is-passed',index<(result.nextStopIndex??0)&&index!==result.currentStopIndex);
    });
  }
  function resume() {
    clearInterval(timer); timer=null;
    if (!document.hidden && (active || !panel.hidden || restoreState==='loading')) { paint(); timer=setInterval(paint,1000); }
  }
  function finish() {
    selectionEpoch++;pickerRequest++;restoreState='idle';restoreNotice();active=null; persist(); mini.hidden=true;
    $('#rideToggle').classList.remove('has-ride'); $('#rideToggleLabel').textContent='탑승 열차';
    savedMessage='탑승 추적을 종료했어요.';
    hidePanel(); resume();
  }
  function confirmStop(index, eventKind=null) {
    if(!active || !Number.isInteger(index) || !active.train.stops[index])return;
    active.confirmedStopIndex=index;active.confirmedAt=Date.now();active.confirmedEventKind=eventKind;active.delaySeconds=0;
    persist(); renderTracking();
  }
  async function restore() {
    let saved;
    try {saved=JSON.parse(localStorage.getItem(STORE)||'null');}catch(_){return;}
    if(!saved)return;
    const valid=saved.version===1&&profiles[saved.key]&&typeof saved.trainId==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(saved.serviceDate)
      &&Number.isFinite(saved.departureAt)&&Number.isFinite(saved.startedAt)&&Number.isFinite(saved.delaySeconds)&&Math.abs(saved.delaySeconds)<=14400
      &&(saved.confirmedAt===null||Number.isFinite(saved.confirmedAt))&&(saved.confirmedStopIndex===null||Number.isInteger(saved.confirmedStopIndex))
      &&(saved.confirmedEventKind==null||saved.confirmedEventKind==='departure');
    if(!valid){savedMessage='저장된 탑승 정보를 확인할 수 없어요. 새 열차를 선택하거나 추적을 종료하세요.';return;}
    const epoch=selectionEpoch;restoreState='loading';restoreNotice();resume();
    try{
      const data=await RailDepartures.getSchedule(saved.key);
      if(epoch!==selectionEpoch)return;
      if(!data){savedMessage='기존 탑승 정보 복원 실패 · 시간표 연결을 다시 확인해 주세요.';restoreState='failed';return;}
      const train=RideCore.trainsForDate(data,saved.serviceDate,options(saved.key)).find(t=>t.id===saved.trainId&&t.departureAt===saved.departureAt);
      if(!train||!RideCore.isValidTrain(train)||saved.confirmedStopIndex!==null&&!train.stops[saved.confirmedStopIndex]){savedMessage='저장된 열차에 적용할 시간표가 없어요. 여행일 시간표 갱신 필요 여부를 확인하세요.';restoreState='failed';return;}
      active={key:saved.key,train,serviceDate:train.serviceDate,delaySeconds:saved.delaySeconds,confirmedStopIndex:saved.confirmedStopIndex,confirmedAt:saved.confirmedAt,confirmedEventKind:saved.confirmedEventKind||null,startedAt:saved.startedAt};
      restoreState='ready';
      if(mode==='restoring'&&!panel.hidden)renderTracking();else paint();
    }catch(_){if(epoch===selectionEpoch){restoreState='failed';savedMessage='기존 탑승 정보를 복원하지 못했어요. 다시 시도할 수 있어요.';}}
    finally{
      if(epoch===selectionEpoch){restoreNotice();if(restoreState==='failed'){if(mode==='restoring')body.innerHTML='<div class="ride-empty"><h2>복원 확인 필요</h2><p>'+h(savedMessage)+'</p><button type="button" data-ride-restore-retry>다시 복원</button><button type="button" data-ride-browse>전체 시간표 보기</button><button type="button" data-ride-finish>저장된 추적 종료</button></div>';else setStatus(savedMessage);}resume();}
    }
  }
  function bind() {
    panel.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.matches('[data-ride-close]'))hidePanel();
      else if(button.matches('[data-ride-browse]')){selectedDate=dateNow();loadPicker(currentKeys()[0]||Object.keys(profiles)[0]);}
      else if(button.matches('[data-ride-restore-retry]')){mode='restoring';restoreTask=restore();}
      else if(button.matches('[data-ride-board]'))start(selectedKey,trains[Number(button.dataset.rideBoard)]);
      else if(button.matches('[data-ride-all]')){allDay=!allDay;renderList();}
      else if(button.matches('[data-ride-today]')){selectedDate=dateNow();allDay=false;filter='';loadPicker(selectedKey);}
      else if(button.matches('[data-ride-retry]'))loadPicker(selectedKey);
      else if(button.matches('[data-ride-back]'))renderTracking();
      else if(button.matches('[data-ride-change]')){selectedDate=active.train.serviceDate;selectedKey=active.key;filter='';loadPicker(selectedKey);}
      else if(button.matches('[data-ride-finish]'))finish();
      else if(button.matches('[data-ride-departed]'))confirmStop(0,'departure');
      else if(button.matches('[data-ride-confirm]'))confirmStop(Number(button.dataset.rideConfirm));
      else if(button.matches('[data-ride-reset]')){active.delaySeconds=0;active.confirmedAt=null;active.confirmedStopIndex=null;active.confirmedEventKind=null;persist();renderTracking();}
      else if(button.matches('[data-ride-gps]')){if(!window.RouteLocation?.isActive())window.RouteLocation?.start();paint();}
      else if(button.matches('[data-ride-map]')){const result=RideCore.progress(active.train,Date.now(),active);const opened=config.focusProfile?.(active.key,result.currentStop||result.confirmation?.stop||result.nextStop,{serviceDate:active.train.serviceDate});if(opened)hidePanel();else setStatus(`${active.train.serviceDate} 일정에 같은 승차 구간이 없어요. 운행일을 확인해 주세요.`);}
    });
    panel.addEventListener('change',event=>{
      if(event.target.id==='rideProfile')loadPicker(event.target.value,{resetSearch:true});
      else if(event.target.id==='rideDate'){
        selectedDate=event.target.value;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))return;
        if(schedules){trains=RideCore.trainsForDate(schedules,selectedDate,options(selectedKey));renderList();}
      }
    });
    panel.addEventListener('input',event=>{if(event.target.id==='rideSearch'){filter=event.target.value;renderList();}});
    panel.addEventListener('submit',event=>{
      if(event.target.id!=='rideDelayForm')return;event.preventDefault();
      const minutes=Number($('#rideDelay').value);
      if(!Number.isFinite(minutes)||minutes < -120||minutes > 240)return;
      active.delaySeconds=Math.round(minutes*60);persist();paint();
    });

    document.addEventListener('visibilitychange',resume);
    window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;});
    window.addEventListener('pageshow',resume);
    window.addEventListener('routebook:location',paint);
  }
  function init(value) {
    config=value;
    panel=document.createElement('aside');panel.id='ridePanel';panel.className='ride-panel';panel.hidden=true;
    panel.setAttribute('aria-label','탑승 열차 선택과 추적');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');
    panel.innerHTML='<div class="ride-panel-top"><span><i></i>탑승 열차</span><button type="button" data-ride-close aria-label="탑승 패널 접기">×</button></div><p id="rideRestoreStatus" class="ride-restore-status" role="status" hidden></p><div id="rideBody" class="ride-body"></div>';
    document.body.appendChild(panel);body=$('#rideBody');
    mini=document.createElement('button');mini.type='button';mini.className='ride-mini';mini.hidden=true;mini.addEventListener('click',()=>open());document.body.appendChild(mini);new ResizeObserver(syncMiniSpace).observe(mini);
    $('#rideToggle').addEventListener('click',()=>panel.hidden?open():hidePanel());
    bind();restoreTask=restore();
  }
  window.RideTracker={init,open,board,finish};
})();
