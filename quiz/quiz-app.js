(() => {
  'use strict';

  const SUPABASE_URL = 'https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KUMRFC5dLAomRo9tiakqIg_0b3j0ELs';
  const supabaseClient = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

  const MUNICIPALITY_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json';
  const PROVINCE_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-topo-simple.json';
  const WRONG_ACTIONS_KEY = 'geography-quiz-wrong-actions-v2';
  const SHEET_DRAFT_KEY = 'geography-click-board-draft-v1:';
  const REGION_PREFIX = /^(경기도|강원|경남|인천|울산)\s+/;
  const ENDING = /(특별자치시|특별시|광역시|시|군|구)$/;
  const DISTRICT_MODE_PREFIXES = {
    seoul: ['서울', '서울특별시'],
    daegu: ['대구', '대구광역시'],
    busan: ['부산', '부산광역시']
  };
  const BASE_STYLE = { color: '#91a4b2', weight: .7, opacity: .92, fillColor: '#f9fcfe', fillOpacity: .9 };
  const VISITED_STYLE = { color: '#5983a6', weight: 1.1, opacity: .95, fillColor: '#dbeaf6', fillOpacity: .55 };
  const SELECTED_STYLE = { color: '#1769aa', weight: 2.25, opacity: 1, fillColor: '#b9dbf3', fillOpacity: .8 };
  const OUT_OF_SCOPE_STYLE = { color: '#d5e0e7', weight: .35, opacity: .35, fillColor: '#f6f9fb', fillOpacity: .1 };
  const HOVER_STYLE = { color: '#1769aa', weight: 1.7, opacity: 1, fillColor: '#cfe8fa', fillOpacity: .72 };
  const RESULT_STYLES = {
    correct: { color: '#167346', weight: 1.8, opacity: .98, fillColor: '#58bf82', fillOpacity: .5 },
    wrong: { color: '#c9443d', weight: 1.8, opacity: .98, fillColor: '#e9746b', fillOpacity: .5 },
    blank: { color: '#ad7d10', weight: 1.8, opacity: .98, fillColor: '#f4d579', fillOpacity: .58 }
  };

  const $ = id => document.getElementById(id);
  const { data: QUIZ_DATA, titles: QUIZ_TITLES } = window.GEOGRAPHY_QUIZ_DATA;
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([36.1, 127.7], 7);
  map.createPane('municipalityFill');
  map.getPane('municipalityFill').style.zIndex = '400';
  map.createPane('municipalityBorder');
  map.getPane('municipalityBorder').style.zIndex = '410';
  map.getPane('municipalityBorder').style.pointerEvents = 'none';
  map.createPane('provinceOutline');
  map.getPane('provinceOutline').style.zIndex = '450';
  map.getPane('provinceOutline').style.pointerEvents = 'none';
  const municipalityFillLayer = L.layerGroup().addTo(map);
  const municipalityBorderLayer = L.layerGroup().addTo(map);
  const provinceLayer = L.layerGroup().addTo(map);
  const municipalityRenderer = L.canvas({ pane: 'municipalityFill', padding: .25 });
  const municipalityBorderRenderer = L.canvas({ pane: 'municipalityBorder', padding: .25 });
  const provinceRenderer = L.canvas({ pane: 'provinceOutline', padding: .25 });

  let boundaryFeatures = [];
  let boundaryTopology = null;
  let boundaryTopologyObject = null;
  let topologyGeometryByCode = new Map();
  let itemBoundaryLayers = new Map();
  let activeFeatureItems = new Map();
  let municipalityReady = false;
  let currentUser = null;
  let wrongAnswers = new Map();
  let pendingWrongActions = loadPendingWrongActions();
  let wrongSyncInFlight = false;
  let state = { mode: 'sigun', source: 'all', sheet: null };

  function normalise(value) {
    return String(value || '').normalize('NFC').trim().replace(/[\s·ㆍ\-‐‑–—]/g, '').toLowerCase();
  }

  function withoutPrefix(name) {
    return String(name || '').replace(REGION_PREFIX, '');
  }

  function shortName(entry) {
    return withoutPrefix(entry.name).replace(ENDING, '');
  }

  function displayAnswer(mode, entry) {
    if (entry.answerName) return entry.name;
    return DISTRICT_MODE_PREFIXES[mode]
      ? withoutPrefix(entry.name)
      : shortName(entry);
  }

  function endingOf(entry) {
    const match = withoutPrefix(entry.name).match(ENDING);
    return match ? match[0] : '';
  }

  function acceptedAnswers(mode, entry) {
    const withoutSido = withoutPrefix(entry.name);
    const expected = entry.answerName || withoutSido;
    if (entry.requireEnding || DISTRICT_MODE_PREFIXES[mode]) {
      const answers = [expected, entry.name];
      if (DISTRICT_MODE_PREFIXES[mode]) {
        answers.push(...DISTRICT_MODE_PREFIXES[mode].map(prefix => prefix + expected));
      }
      return new Set(answers.map(normalise));
    }
    const short = shortName(entry);
    const ending = endingOf(entry);
    const answers = new Set([short, withoutSido, entry.name]);
    if (ending) answers.add(short + ending);
    if (ending === '특별시' || ending === '광역시' || ending === '특별자치시') answers.add(short + '시');
    return new Set([...answers].map(normalise));
  }

  function answerRule(mode, entry = null) {
    if (entry?.requireEnding) {
      return { placeholder: '예: 중구', detail: '서울·부산·대구는 구 또는 군을 꼭 붙여 적어.' };
    }
    if (mode === 'seoul') {
      return { placeholder: '예: 강남구', detail: '구를 꼭 붙여 적어.' };
    }
    if (mode === 'daegu' || mode === 'busan') {
      return { placeholder: '예: 달성군', detail: '구 또는 군을 꼭 붙여 적어.' };
    }
    return { placeholder: '예: 김제', detail: '전국은 시·군 단위야. 시·군은 생략해도 돼.' };
  }

  function questionKey(mode, entry) {
    return mode + ':' + (entry.id || normalise(entry.name));
  }

  function wrongMapKey(mode, key) {
    return mode + '\u0000' + key;
  }

  function actionId(action) {
    return action.userId + '\u0000' + action.quizMode + '\u0000' + action.questionKey;
  }

  function sheetDraftKey(mode, source) {
    return SHEET_DRAFT_KEY + mode + ':' + source;
  }

  function featureCode(feature) {
    return String(feature?.properties?.code || '').padStart(5, '0');
  }

  function featureName(feature) {
    return normalise(withoutPrefix(feature?.properties?.name || ''));
  }

  function entryName(entry) {
    return normalise(withoutPrefix(entry.name));
  }

  function loadPendingWrongActions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WRONG_ACTIONS_KEY));
      return Array.isArray(parsed) ? parsed.filter(action =>
        action &&
        typeof action.userId === 'string' &&
        typeof action.quizMode === 'string' &&
        typeof action.questionKey === 'string' &&
        typeof action.answerLabel === 'string' &&
        (action.state === 'wrong' || action.state === 'cleared') &&
        typeof action.stateChangedAt === 'string'
      ) : [];
    } catch {
      return [];
    }
  }

  function savePendingWrongActions() {
    try { localStorage.setItem(WRONG_ACTIONS_KEY, JSON.stringify(pendingWrongActions)); } catch {}
  }

  function loadSheetDraft(sheet) {
    try {
      const parsed = JSON.parse(localStorage.getItem(sheet.draftKey));
      const validKeys = new Set(sheet.items.map(item => item.key));
      const values = parsed && typeof parsed.answers === 'object' ? parsed.answers : {};
      Object.entries(values || {}).forEach(([key, value]) => {
        if (validKeys.has(key) && typeof value === 'string' && value.trim()) sheet.answers.set(key, value);
      });
      if (Array.isArray(parsed?.selected)) {
        parsed.selected.forEach(key => {
          if (validKeys.has(key)) sheet.selectedKeys.add(key);
        });
      }
      if (validKeys.has(parsed?.selectedKey)) sheet.selectedKey = parsed.selectedKey;
    } catch {}
  }

  function saveSheetDraft() {
    const sheet = state.sheet;
    if (!sheet) return;
    try {
      const answers = {};
      sheet.answers.forEach((value, key) => {
        if (String(value || '').trim()) answers[key] = value;
      });
      localStorage.setItem(sheet.draftKey, JSON.stringify({
        answers,
        selected: [...sheet.selectedKeys],
        selectedKey: sheet.selectedKey
      }));
    } catch {}
  }

  function clearSheetDraft(sheet) {
    try { localStorage.removeItem(sheet.draftKey); } catch {}
  }

  function setAuthStatus(message, status = '') {
    $('quizAuthStatus').textContent = message || '';
    $('quizAuthStatus').dataset.state = status;
  }

  function setMistakeStatus(message, status = '') {
    $('mistakeStatus').textContent = message || '';
    $('mistakeStatus').dataset.state = status;
  }

  function setBoardResult(message, status = '') {
    $('sheetResult').textContent = message || '';
    $('sheetResult').dataset.state = status;
  }

  function applyWrongRecord(record) {
    if (!record || !record.quiz_mode || !record.question_key) return;
    const key = wrongMapKey(record.quiz_mode, record.question_key);
    if (record.state === 'wrong') wrongAnswers.set(key, record);
    else wrongAnswers.delete(key);
  }

  function applyPendingActions(userId) {
    pendingWrongActions
      .filter(action => action.userId === userId)
      .sort((a, b) => Date.parse(a.stateChangedAt) - Date.parse(b.stateChangedAt))
      .forEach(action => applyWrongRecord({
        quiz_mode: action.quizMode,
        question_key: action.questionKey,
        answer_label: action.answerLabel,
        state: action.state,
        state_changed_at: action.stateChangedAt
      }));
  }

  function wrongEntriesForMode(mode) {
    return QUIZ_DATA[mode].filter(entry =>
      wrongAnswers.has(wrongMapKey(mode, questionKey(mode, entry)))
    );
  }

  function entriesFor(mode, source) {
    return source === 'mistakes' ? wrongEntriesForMode(mode) : QUIZ_DATA[mode];
  }

  function entryForQuestionKey(mode, key) {
    return QUIZ_DATA[mode]?.find(entry => questionKey(mode, entry) === key) || null;
  }

  function renderMistakeTools() {
    const hasUser = Boolean(currentUser);
    const allMistakes = [...wrongAnswers.values()]
      .filter(record => entryForQuestionKey(record.quiz_mode, record.question_key))
      .sort((a, b) => Date.parse(b.state_changed_at || 0) - Date.parse(a.state_changed_at || 0));
    const currentModeCount = wrongEntriesForMode(state.mode).length;
    const list = $('mistakeList');

    $('mistakeCount').textContent = hasUser
      ? '저장된 오답 ' + allMistakes.length + '개'
      : '로그인하면 저장돼';
    $('mistakePracticeBtn').disabled = !hasUser || currentModeCount === 0;
    $('mistakePracticeBtn').textContent = currentModeCount
      ? '현재 모드 오답 ' + currentModeCount + '개 지도 열기'
      : '현재 모드 오답 지도 열기';
    $('allPracticeBtn').hidden = state.source !== 'mistakes';

    list.replaceChildren();
    if (!hasUser || !allMistakes.length) {
      list.hidden = true;
      return;
    }

    allMistakes.forEach(record => {
      const item = document.createElement('li');
      item.className = 'mistake-item';
      const entry = entryForQuestionKey(record.quiz_mode, record.question_key);
      const answerLabel = entry ? displayAnswer(record.quiz_mode, entry) : record.answer_label;

      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = answerLabel;
      const detail = document.createElement('small');
      detail.textContent = (QUIZ_TITLES[record.quiz_mode] || record.quiz_mode) + ' · 아직 복습할 문제';
      copy.append(title, detail);

      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'mistake-clear';
      clear.textContent = '외웠음';
      clear.onclick = () => queueWrongActions([{
        quizMode: record.quiz_mode,
        questionKey: record.question_key,
        answerLabel,
        nextState: 'cleared'
      }]);

      item.append(copy, clear);
      list.append(item);
    });
    list.hidden = false;
  }

  function updateAuthUI() {
    const hasUser = Boolean(currentUser);
    $('quizLoggedOut').hidden = hasUser;
    $('quizLoggedIn').hidden = !hasUser;
    if (hasUser) $('quizAccountEmail').textContent = currentUser.email || '로그인한 계정';
    renderMistakeTools();
  }

  function queueWrongActions(actions) {
    if (!actions || !actions.length) return false;
    if (!currentUser) {
      setMistakeStatus('로그인하면 전체 채점의 오답을 계정에 저장해.', '');
      return false;
    }

    const changedAt = new Date().toISOString();
    const actionMap = new Map();
    actions.forEach(input => {
      if (!input || !input.quizMode || !input.questionKey || !input.answerLabel) return;
      const action = {
        userId: currentUser.id,
        quizMode: input.quizMode,
        questionKey: input.questionKey,
        answerLabel: input.answerLabel,
        state: input.nextState,
        stateChangedAt: changedAt
      };
      actionMap.set(actionId(action), action);
    });

    actionMap.forEach((action, id) => {
      const previousIndex = pendingWrongActions.findIndex(item => actionId(item) === id);
      if (previousIndex >= 0) pendingWrongActions[previousIndex] = action;
      else pendingWrongActions.push(action);
      applyWrongRecord({
        quiz_mode: action.quizMode,
        question_key: action.questionKey,
        answer_label: action.answerLabel,
        state: action.state,
        state_changed_at: action.stateChangedAt
      });
    });

    savePendingWrongActions();
    renderMistakeTools();
    setMistakeStatus(
      navigator.onLine === false ? '인터넷 연결 뒤 오답노트를 동기화할게.' : '오답노트를 저장하는 중…',
      ''
    );
    if (navigator.onLine !== false) void flushPendingWrongActions();
    return true;
  }

  async function flushPendingWrongActions() {
    if (!currentUser || !supabaseClient || wrongSyncInFlight || navigator.onLine === false) return;
    const userId = currentUser.id;
    wrongSyncInFlight = true;
    try {
      while (currentUser?.id === userId) {
        const actions = pendingWrongActions
          .filter(action => action.userId === userId)
          .sort((a, b) => Date.parse(a.stateChangedAt) - Date.parse(b.stateChangedAt))
          .slice(0, 250);
        if (!actions.length) break;

        const { data, error } = await supabaseClient.rpc('sync_quiz_wrong_answers', {
          p_actions: actions.map(action => ({
            quiz_mode: action.quizMode,
            question_key: action.questionKey,
            answer_label: action.answerLabel,
            state: action.state,
            state_changed_at: action.stateChangedAt
          }))
        });
        if (error) throw error;
        if (currentUser?.id !== userId) return;

        const sentIds = new Set(actions.map(actionId));
        pendingWrongActions = pendingWrongActions.filter(action => !sentIds.has(actionId(action)));
        (Array.isArray(data) ? data : data ? [data] : []).forEach(applyWrongRecord);
        savePendingWrongActions();
      }
      renderMistakeTools();
      setMistakeStatus('오답노트 동기화됨', 'success');
    } catch (error) {
      console.warn('오답노트 동기화 실패:', error?.message || error);
      setMistakeStatus('오답노트 동기화가 잠시 안 돼. 연결되면 다시 시도할게.', 'error');
    } finally {
      wrongSyncInFlight = false;
    }
  }

  async function loadMistakes({ quiet = false } = {}) {
    const userId = currentUser?.id;
    if (!userId || !supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('quiz_wrong_answers')
        .select('quiz_mode, question_key, answer_label, state, state_changed_at')
        .eq('user_id', userId)
        .eq('state', 'wrong')
        .order('state_changed_at', { ascending: false });
      if (error) throw error;
      if (currentUser?.id !== userId) return;

      wrongAnswers = new Map();
      (data || []).forEach(applyWrongRecord);
      applyPendingActions(userId);
      renderMistakeTools();
      if (!quiet) setMistakeStatus(wrongAnswers.size ? '오답노트를 불러왔어.' : '저장된 오답이 아직 없어.', 'success');
    } catch (error) {
      console.warn('오답노트 불러오기 실패:', error?.message || error);
      if (!quiet) setMistakeStatus('오답노트를 불러오지 못했어. 연결되면 다시 시도할게.', 'error');
    }
  }

  async function refreshMistakes({ quiet = false } = {}) {
    await flushPendingWrongActions();
    await loadMistakes({ quiet });
  }

  async function activateUser(session) {
    currentUser = session?.user || null;
    if (!currentUser) {
      wrongAnswers = new Map();
      updateAuthUI();
      setAuthStatus('');
      setMistakeStatus('로그인하면 전체 채점의 오답을 계정에 저장해.', '');
      return;
    }

    updateAuthUI();
    setAuthStatus('로그인됨 · 오답노트를 불러오는 중이야.', 'success');
    await refreshMistakes();
  }

  async function signIn() {
    if (!supabaseClient) {
      setAuthStatus('로그인 기능을 불러오지 못했어. 새로고침해줘.', 'error');
      return;
    }
    const email = $('quizEmail').value.trim();
    if (!email) {
      setAuthStatus('이메일 주소를 입력해줘.', 'error');
      return;
    }
    setAuthStatus('로그인 링크 전송 중…', '');
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      // 현재 도메인의 메인 화면으로 돌려보내면 메인과 퀴즈가 같은 로그인 세션을 공유해.
      options: { emailRedirectTo: new URL('../', window.location.href).href }
    });
    setAuthStatus(
      error
        ? '로그인 링크 전송 실패: ' + error.message
        : '메일 링크를 누르면 메인 페이지가 열려. 그다음 퀴즈로 다시 들어오면 같은 계정으로 바로 이어져.',
      error ? 'error' : 'success'
    );
  }

  async function signOut() {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) setAuthStatus('로그아웃 실패: ' + error.message, 'error');
  }

  function makeSheet(mode, source) {
    const sheet = {
      mode,
      source,
      items: entriesFor(mode, source).map(entry => ({ entry, key: questionKey(mode, entry) })),
      answers: new Map(),
      results: new Map(),
      selectedKeys: new Set(),
      selectedKey: null,
      wasGraded: false,
      dirty: false,
      draftKey: sheetDraftKey(mode, source)
    };
    loadSheetDraft(sheet);
    return sheet;
  }

  function currentSelectedItem() {
    const sheet = state.sheet;
    return sheet?.items.find(item => item.key === sheet.selectedKey) || null;
  }

  function filledCount(sheet) {
    return sheet.items.reduce((count, item) => count + (String(sheet.answers.get(item.key) || '').trim() ? 1 : 0), 0);
  }

  function resultCounts(sheet) {
    const counts = { correct: 0, wrong: 0, blank: 0 };
    sheet.items.forEach(item => {
      const result = sheet.results.get(item.key);
      if (result && counts[result] !== undefined) counts[result]++;
    });
    return counts;
  }

  function renderBoardSummary() {
    const sheet = state.sheet;
    if (!sheet) return;
    const total = sheet.items.length;
    const filled = filledCount(sheet);
    const selected = sheet.selectedKeys.size;
    $('selectionProgress').textContent = '선택 ' + selected + ' / ' + total;

    if (!sheet.wasGraded) {
      $('score').textContent = '작성 ' + filled + ' / ' + total;
      $('streak').textContent = '선택 ' + selected + ' / ' + total;
      return;
    }

    const counts = resultCounts(sheet);
    $('score').textContent = '정답 ' + counts.correct + ' / ' + total;
    $('streak').textContent = '오답 ' + (counts.wrong + counts.blank) + '개';
  }

  function renderBoardResult() {
    const sheet = state.sheet;
    if (!sheet || !sheet.items.length) {
      setBoardResult(sheet?.source === 'mistakes' ? '현재 모드의 오답을 전부 정리했어.' : '표시할 문제가 없어.', 'warning');
      return;
    }
    if (!sheet.wasGraded) {
      setBoardResult('', '');
      return;
    }
    if (sheet.dirty) {
      setBoardResult('수정한 답이 있어. 다시 전체 채점하기를 눌러 반영해.', 'warning');
      return;
    }

    const counts = resultCounts(sheet);
    const note = currentUser
      ? ' · 틀린 문제는 오답노트에 반영했어.'
      : ' · 로그인하면 틀린 문제를 오답노트에 저장할 수 있어.';
    setBoardResult(
      '정답 ' + counts.correct + ' / ' + sheet.items.length + ' · 오답 ' + counts.wrong + ' · 미입력 ' + counts.blank + note,
      counts.wrong || counts.blank ? 'warning' : 'success'
    );
  }

  function renderSelection({ preserveInput = false } = {}) {
    const sheet = state.sheet;
    const selected = currentSelectedItem();
    const rule = answerRule(sheet?.mode, selected?.entry);
    const card = $('selectionCard');
    const input = $('selectedAnswerInput');
    card.dataset.selected = String(Boolean(selected));

    if (!selected) {
      $('selectionTitle').textContent = '지도에서 행정구역을 클릭해';
      $('selectionHint').textContent = sheet?.source === 'mistakes'
        ? '지도에서 노란색·빨간색 영역을 눌러 오답만 다시 채워.'
        : rule.detail;
      input.disabled = true;
      if (!preserveInput) input.value = '';
      input.placeholder = '먼저 지도에서 지역을 클릭해';
      $('selectedAnswerStatus').textContent = '';
      $('selectedAnswerStatus').dataset.state = '';
      return;
    }

    $('selectionTitle').textContent = '선택한 지역의 답을 입력해';
    $('selectionHint').textContent = rule.detail + ' 입력 후 지도에서 다음 지역을 눌러 계속 채워.';
    input.disabled = false;
    if (!preserveInput) input.value = sheet.answers.get(selected.key) || '';
    input.placeholder = rule.placeholder;

    const result = sheet.wasGraded ? sheet.results.get(selected.key) : '';
    if (sheet.dirty && sheet.wasGraded) {
      $('selectedAnswerStatus').textContent = '답을 수정했어. 전체 채점하기를 다시 눌러.';
      $('selectedAnswerStatus').dataset.state = 'warning';
    } else if (result === 'correct') {
      $('selectedAnswerStatus').textContent = '정답';
      $('selectedAnswerStatus').dataset.state = 'success';
    } else if (result === 'wrong') {
      $('selectedAnswerStatus').textContent = '정답: ' + displayAnswer(sheet.mode, selected.entry);
      $('selectedAnswerStatus').dataset.state = 'warning';
    } else if (result === 'blank') {
      $('selectedAnswerStatus').textContent = '미입력 · 정답: ' + displayAnswer(sheet.mode, selected.entry);
      $('selectedAnswerStatus').dataset.state = 'warning';
    } else {
      $('selectedAnswerStatus').textContent = '입력 내용은 자동으로 임시 저장돼.';
      $('selectedAnswerStatus').dataset.state = '';
    }
  }

  function renderBoardControls() {
    const sheet = state.sheet;
    const hasItems = Boolean(sheet?.items.length);
    $('gradeBtn').disabled = !hasItems || !municipalityReady;
    $('clearSheetBtn').disabled = !hasItems || (!sheet.answers.size && !sheet.selectedKeys.size);
    $('gradeBtn').textContent = sheet?.wasGraded
      ? (sheet.dirty ? '수정한 답 다시 채점하기' : '전체 다시 채점하기')
      : '전체 채점하기';
  }

  function specialSigunItemForCode(sheet, code) {
    const districtItem = sheet.items.find(item => item.entry.featureCodes?.includes(code));
    if (districtItem) return districtItem;
    let targetName = '';
    if (code.startsWith('23')) targetName = '인천광역시';
    else if (code.startsWith('24')) targetName = '광주광역시';
    else if (code.startsWith('25')) targetName = '대전광역시';
    else if (code.startsWith('26')) targetName = '울산광역시';
    else if (code === '29010') targetName = '세종특별자치시';
    return targetName ? sheet.items.find(item => item.entry.name === targetName) || null : null;
  }

  function resolveSigunGroupItem(sheet, groupCode, groupFeatures, groupCache) {
    if (groupCache.has(groupCode)) return groupCache.get(groupCode);
    const fixedNames = {
      '3240': '강원 고성군',
      '3834': '경남 고성군'
    };
    let item = fixedNames[groupCode]
      ? sheet.items.find(candidate => candidate.entry.name === fixedNames[groupCode]) || null
      : null;

    if (!item) {
      const names = new Set(groupFeatures.map(featureName));
      const candidates = sheet.items.filter(candidate => {
        const target = entryName(candidate.entry);
        return [...names].some(name => name === target || (target.endsWith('시') && name.startsWith(target)));
      });
      if (candidates.length === 1) item = candidates[0];
    }
    groupCache.set(groupCode, item);
    return item;
  }

  function resolveFeatureItem(sheet, feature, groupCache) {
    const code = featureCode(feature);
    if (!code || code.length !== 5) return null;

    if (sheet.mode === 'sigun') {
      const special = specialSigunItemForCode(sheet, code);
      if (special) return special;
      const groupCode = code.slice(0, 4);
      const groupFeatures = boundaryFeatures.filter(candidate => featureCode(candidate).slice(0, 4) === groupCode);
      return resolveSigunGroupItem(sheet, groupCode, groupFeatures, groupCache);
    }

    const permitted = sheet.mode === 'seoul'
      ? code.startsWith('11')
      : sheet.mode === 'busan'
        ? code.startsWith('21')
        : code.startsWith('22') || code === '37310';
    if (!permitted) return null;
    const name = featureName(feature);
    return sheet.items.find(item => entryName(item.entry) === name) || null;
  }

  function rebuildActiveFeatureItems() {
    activeFeatureItems = new Map();
    const sheet = state.sheet;
    if (!sheet || !boundaryFeatures.length) return { mappedItems: new Set(), unmappedItems: [] };
    const groupCache = new Map();
    boundaryFeatures.forEach(feature => {
      const item = resolveFeatureItem(sheet, feature, groupCache);
      if (item) activeFeatureItems.set(feature, item);
    });

    const mappedItems = new Set([...activeFeatureItems.values()].map(item => item.key));
    const unmappedItems = sheet.items
      .filter(item => !mappedItems.has(item.key))
      .map(item => item.entry.name);
    console.info(
      '클릭형 행정구역 매핑: mode=' + sheet.mode +
      ', features=' + activeFeatureItems.size + '/' + boundaryFeatures.length +
      ', items=' + mappedItems.size + '/' + sheet.items.length
    );
    if (unmappedItems.length) {
      console.warn('클릭 가능한 경계를 찾지 못한 답안:', unmappedItems.join(', '));
    }
    return { mappedItems, unmappedItems };
  }

  function renderMappingStatus(mapping) {
    if (!boundaryFeatures.length || !mapping) return;
    if (mapping.unmappedItems.length) {
      $('mapStatus').textContent = '일부 경계가 답안과 연결되지 않았어. 새로고침해줘.';
      $('mapStatus').dataset.state = 'error';
      return;
    }
    $('mapStatus').textContent = '지명 없는 행정구역 지도 · 영역을 클릭해서 답 입력';
    $('mapStatus').dataset.state = '';
  }

  function styleForItem(item) {
    const sheet = state.sheet;
    if (!sheet || !item) return { ...OUT_OF_SCOPE_STYLE, stroke: false };
    const result = sheet.wasGraded ? sheet.results.get(item.key) : '';
    const style = result
      ? RESULT_STYLES[result]
      : item.key === sheet.selectedKey
        ? SELECTED_STYLE
        : sheet.selectedKeys.has(item.key) || sheet.answers.has(item.key)
          ? VISITED_STYLE
          : BASE_STYLE;
    return { ...style, stroke: false };
  }

  function applyMapStyles() {
    const sheet = state.sheet;
    if (!sheet) return;
    const itemsByKey = new Map(sheet.items.map(item => [item.key, item]));
    itemBoundaryLayers.forEach((layer, key) => {
      const item = itemsByKey.get(key);
      if (item) layer.setStyle(styleForItem(item));
    });
  }

  function bindItemLayer(layer, item) {
    layer.on('click', () => selectItem(item));
    layer.on('mouseover', () => {
      if (!state.sheet?.wasGraded) layer.setStyle({ ...HOVER_STYLE, stroke: false });
    });
    layer.on('mouseout', () => layer.setStyle(styleForItem(item)));
  }

  function renderMunicipalityLayers() {
    municipalityFillLayer.clearLayers();
    municipalityBorderLayer.clearLayers();
    itemBoundaryLayers = new Map();

    const sheet = state.sheet;
    if (!sheet || !boundaryTopology || !boundaryTopologyObject) return;

    const geometriesByKey = new Map(sheet.items.map(item => [item.key, []]));
    const itemByKey = new Map(sheet.items.map(item => [item.key, item]));
    const keyByGeometry = new Map();
    activeFeatureItems.forEach((item, feature) => {
      const geometry = topologyGeometryByCode.get(featureCode(feature));
      if (!geometry || !geometriesByKey.has(item.key)) return;
      geometriesByKey.get(item.key).push(geometry);
      keyByGeometry.set(geometry, item.key);
    });

    sheet.items.forEach(item => {
      const geometries = geometriesByKey.get(item.key) || [];
      if (!geometries.length) return;
      const feature = {
        type: 'Feature',
        properties: { answerKey: item.key },
        geometry: window.topojson.merge(boundaryTopology, geometries)
      };
      const itemLayer = L.geoJSON(feature, {
        renderer: municipalityRenderer,
        interactive: true,
        style: () => styleForItem(item)
      }).addTo(municipalityFillLayer);
      itemLayer.eachLayer(layer => bindItemLayer(layer, item));
      itemBoundaryLayers.set(item.key, itemLayer);
    });

    const boundaryMesh = window.topojson.mesh(boundaryTopology, boundaryTopologyObject, (a, b) => {
      if (a === b || !b) return true;
      return keyByGeometry.get(a) !== keyByGeometry.get(b);
    });
    L.geoJSON({ type: 'Feature', properties: {}, geometry: boundaryMesh }, {
      renderer: municipalityBorderRenderer,
      interactive: false,
      style: { color: '#91a4b2', weight: .7, opacity: .92, fill: false }
    }).addTo(municipalityBorderLayer);
  }

  function selectItem(item) {
    const sheet = state.sheet;
    if (!sheet || !item) return;
    sheet.selectedKeys.add(item.key);
    sheet.selectedKey = item.key;
    saveSheetDraft();
    renderBoardSummary();
    renderBoardControls();
    renderSelection();
    applyMapStyles();
    requestAnimationFrame(() => $('selectedAnswerInput').focus());
  }

  function onSelectedAnswerInput() {
    const sheet = state.sheet;
    const item = currentSelectedItem();
    if (!sheet || !item) return;
    const value = $('selectedAnswerInput').value;
    if (value.trim()) sheet.answers.set(item.key, value);
    else sheet.answers.delete(item.key);
    if (sheet.wasGraded) sheet.dirty = true;
    saveSheetDraft();
    renderBoardSummary();
    renderBoardControls();
    renderBoardResult();
    renderSelection({ preserveInput: true });
  }

  function gradeSheet() {
    const sheet = state.sheet;
    if (!sheet?.items.length) return;
    if (!municipalityReady) {
      setBoardResult('지도의 행정구역 경계를 불러오는 중이야. 잠시 뒤 다시 눌러줘.', 'warning');
      return;
    }
    const blanksBeforeGrading = sheet.items.length - filledCount(sheet);
    if (!sheet.wasGraded && blanksBeforeGrading > 0 && !window.confirm(
      blanksBeforeGrading + '개가 비어 있어. 빈칸도 오답으로 처리해서 채점할까?'
    )) return;

    const actions = [];
    sheet.items.forEach(item => {
      const typed = normalise(sheet.answers.get(item.key));
      const result = !typed
        ? 'blank'
        : acceptedAnswers(sheet.mode, item.entry).has(typed) ? 'correct' : 'wrong';
      sheet.results.set(item.key, result);

      const existingKey = wrongMapKey(sheet.mode, item.key);
      if (result === 'correct') {
        if (wrongAnswers.has(existingKey)) {
          actions.push({
            quizMode: sheet.mode,
            questionKey: item.key,
            answerLabel: displayAnswer(sheet.mode, item.entry),
            nextState: 'cleared'
          });
        }
      } else {
        actions.push({
          quizMode: sheet.mode,
          questionKey: item.key,
          answerLabel: displayAnswer(sheet.mode, item.entry),
          nextState: 'wrong'
        });
      }
    });

    sheet.wasGraded = true;
    sheet.dirty = false;
    saveSheetDraft();
    renderBoardSummary();
    renderBoardControls();
    renderBoardResult();
    renderSelection();
    applyMapStyles();

    if (actions.length) {
      queueWrongActions(actions);
    } else if (currentUser) {
      setMistakeStatus('이번 지도판의 오답은 없어.', 'success');
    } else {
      setMistakeStatus('로그인하면 전체 채점의 오답을 계정에 저장해.', '');
    }
  }

  function clearSheet() {
    const sheet = state.sheet;
    if (!sheet?.items.length) return;
    if ((sheet.answers.size || sheet.selectedKeys.size) && !window.confirm('이 지도판에 쓴 답과 선택 표시를 모두 지울까?')) return;
    sheet.answers.clear();
    sheet.results.clear();
    sheet.selectedKeys.clear();
    sheet.selectedKey = null;
    sheet.wasGraded = false;
    sheet.dirty = false;
    clearSheetDraft(sheet);
    renderBoardSummary();
    renderBoardControls();
    renderBoardResult();
    renderSelection();
    applyMapStyles();
  }

  function fitMapToSheet() {
    const sheet = state.sheet;
    if (!sheet?.items.length) return;
    if (sheet.mode === 'sigun') {
      map.fitBounds([[32.25, 124.0], [38.85, 131.25]], { padding: [18, 18], maxZoom: 7, animate: false });
      return;
    }
    const bounds = L.latLngBounds(sheet.items.map(item => [item.entry.lat, item.entry.lng]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(.22), { padding: [18, 18], maxZoom: 12, animate: false });
  }

  function startSheet(mode = state.mode, source = state.source) {
    state = { mode, source, sheet: makeSheet(mode, source) };
    updateModeButtons();
    const mapping = rebuildActiveFeatureItems();
    renderMunicipalityLayers();
    renderMappingStatus(mapping);
    renderMistakeTools();
    renderBoardSummary();
    renderBoardControls();
    renderBoardResult();
    renderSelection();
    applyMapStyles();
    requestAnimationFrame(() => {
      map.invalidateSize();
      fitMapToSheet();
    });
  }

  function updateModeButtons() {
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    });
  }

  async function loadMunicipalityBoundaries() {
    const response = await fetch(MUNICIPALITY_URL);
    if (!response.ok) throw new Error('시·군 경계 데이터 응답 오류');
    const topology = await response.json();
    const object = topology.objects && topology.objects.skorea_municipalities_2018_geo;
    if (!object || !window.topojson) throw new Error('시·군 경계 데이터 형식 오류');

    boundaryTopology = topology;
    boundaryTopologyObject = object;
    boundaryFeatures = window.topojson.feature(topology, object).features;
    topologyGeometryByCode = new Map((object.geometries || []).map(geometry => [
      String(geometry?.properties?.code || '').padStart(5, '0'),
      geometry
    ]));
    municipalityReady = true;
    const mapping = rebuildActiveFeatureItems();
    renderMunicipalityLayers();
    applyMapStyles();
    renderMappingStatus(mapping);
    renderBoardControls();
    requestAnimationFrame(() => {
      map.invalidateSize();
      fitMapToSheet();
    });
  }

  async function loadProvinceOutlines() {
    const response = await fetch(PROVINCE_URL);
    if (!response.ok) throw new Error('시·도 경계 데이터 응답 오류');
    const topology = await response.json();
    const object = topology.objects && topology.objects.skorea_provinces_2018_geo;
    if (!object || !window.topojson) throw new Error('시·도 경계 데이터 형식 오류');
    const features = window.topojson.feature(topology, object).features;
    L.geoJSON(features, {
      pane: 'provinceOutline',
      renderer: provinceRenderer,
      interactive: false,
      style: { color: '#173f68', weight: 2.45, opacity: .98, fill: false, fillOpacity: 0 }
    }).addTo(provinceLayer);
  }

  async function loadMapData() {
    const [municipality, provinces] = await Promise.allSettled([
      loadMunicipalityBoundaries(),
      loadProvinceOutlines()
    ]);
    if (municipality.status === 'rejected') {
      console.warn('시·군 지도 불러오기 실패:', municipality.reason);
      $('mapStatus').textContent = '경계 데이터를 못 불러왔어. 인터넷 연결 후 새로고침해줘.';
      $('mapStatus').dataset.state = 'error';
    } else if (provinces.status === 'rejected') {
      console.warn('시·도 경계 불러오기 실패:', provinces.reason);
      $('mapStatus').textContent = '시·군은 클릭할 수 있어. 시·도 진한 경계만 나중에 다시 불러올게.';
      $('mapStatus').dataset.state = 'error';
    }
  }

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.onclick = () => startSheet(button.dataset.mode, 'all');
  });
  $('gradeBtn').onclick = gradeSheet;
  $('clearSheetBtn').onclick = clearSheet;
  $('selectedAnswerInput').addEventListener('input', onSelectedAnswerInput);
  $('selectedAnswerInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('selectedAnswerStatus').textContent = '저장됨 · 지도에서 다음 지역을 클릭해.';
      $('selectedAnswerStatus').dataset.state = 'success';
      $('selectedAnswerInput').blur();
    }
  });
  $('mistakePracticeBtn').onclick = () => startSheet(state.mode, 'mistakes');
  $('allPracticeBtn').onclick = () => startSheet(state.mode, 'all');
  $('quizLoginBtn').onclick = signIn;
  $('quizLogoutBtn').onclick = signOut;

  window.addEventListener('online', () => {
    if (currentUser) void refreshMistakes();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) void refreshMistakes({ quiet: true });
  });
  window.setInterval(() => {
    if (!document.hidden && currentUser) void refreshMistakes({ quiet: true });
  }, 45000);

  startSheet();
  loadMapData();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../service-worker.js').catch(() => {});

  if (!supabaseClient) {
    setAuthStatus('로그인 기능을 불러오지 못했어. 새로고침해줘.', 'error');
  } else {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      void activateUser(session);
    });
    supabaseClient.auth.getSession()
      .then(({ data }) => activateUser(data.session))
      .catch(() => {
        setAuthStatus('로그인 상태를 확인하지 못했어. 새로고침해줘.', 'error');
      });
  }
})();
