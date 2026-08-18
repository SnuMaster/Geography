(() => {
  'use strict';

  const SUPABASE_URL = 'https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  const supabaseClient = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

  const BOUNDARY_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json';
  const WRONG_ACTIONS_KEY = 'geography-quiz-wrong-actions-v2';
  const SHEET_DRAFT_KEY = 'geography-quiz-sheet-draft-v2:';
  const REGION_PREFIX = /^(경기도|강원|경남|인천|울산)\s+/;
  const ENDING = /(특별자치시|특별시|광역시|시|군|구)$/;
  const BASE_STYLE = { color: '#5b6d79', weight: .72, opacity: .82, fillColor: '#f8fbfd', fillOpacity: .9 };
  const RESULT_STYLES = {
    correct: { color: '#167346', weight: 1.75, opacity: .96, fillColor: '#58bf82', fillOpacity: .44 },
    wrong: { color: '#c9443d', weight: 1.75, opacity: .96, fillColor: '#e9746b', fillOpacity: .44 },
    blank: { color: '#ad7d10', weight: 1.75, opacity: .96, fillColor: '#f4d579', fillOpacity: .52 }
  };

  const $ = id => document.getElementById(id);
  const { data: QUIZ_DATA, titles: QUIZ_TITLES } = window.GEOGRAPHY_QUIZ_DATA;
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([36.1, 127.7], 7);
  const boundaryLayer = L.layerGroup().addTo(map);
  const numberLayer = L.layerGroup().addTo(map);
  const canvasRenderer = L.canvas({ padding: .25 });

  let boundaryFeatures = [];
  let boundaryFeatureLayers = new Map();
  let featureMatches = new Map();
  let numberMarkers = new Map();
  let currentUser = null;
  let wrongAnswers = new Map();
  let pendingWrongActions = loadPendingWrongActions();
  let wrongSyncInFlight = false;
  let state = { mode: 'sigun', source: 'all', sheet: null };
  let sheetElements = new Map();

  function normalise(value) {
    return String(value || '').normalize('NFC').trim().replace(/[\s·ㆍ\-‐‑–—]/g, '').toLowerCase();
  }

  function withoutPrefix(name) {
    return String(name || '').replace(REGION_PREFIX, '');
  }

  function shortName(entry) {
    return withoutPrefix(entry.name).replace(ENDING, '');
  }

  function endingOf(entry) {
    const match = withoutPrefix(entry.name).match(ENDING);
    return match ? match[0] : '';
  }

  function acceptedAnswers(entry) {
    const withoutSido = withoutPrefix(entry.name);
    const short = shortName(entry);
    const ending = endingOf(entry);
    const answers = new Set([short, withoutSido, entry.name]);
    if (ending) answers.add(short + ending);
    if (ending === '특별시' || ending === '광역시' || ending === '특별자치시') answers.add(short + '시');
    return new Set([...answers].map(normalise));
  }

  function questionKey(mode, entry) {
    return mode + ':' + normalise(entry.name);
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
      const values = parsed && typeof parsed.answers === 'object' ? parsed.answers : {};
      const validKeys = new Set(sheet.items.map(item => item.key));
      Object.entries(values || {}).forEach(([key, value]) => {
        if (validKeys.has(key) && typeof value === 'string' && value.trim()) sheet.answers.set(key, value);
      });
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
      localStorage.setItem(sheet.draftKey, JSON.stringify({ answers }));
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

  function setSheetResult(message, status = '') {
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

  function renderMistakeTools() {
    const hasUser = Boolean(currentUser);
    const allMistakes = [...wrongAnswers.values()]
      .sort((a, b) => Date.parse(b.state_changed_at || 0) - Date.parse(a.state_changed_at || 0));
    const currentModeCount = wrongEntriesForMode(state.mode).length;
    const list = $('mistakeList');

    $('mistakeCount').textContent = hasUser
      ? '저장된 오답 ' + allMistakes.length + '개'
      : '로그인하면 저장돼';
    $('mistakePracticeBtn').disabled = !hasUser || currentModeCount === 0;
    $('mistakePracticeBtn').textContent = currentModeCount
      ? '현재 모드 오답 ' + currentModeCount + '개 답안지 만들기'
      : '현재 모드 오답 답안지 만들기';
    $('allPracticeBtn').hidden = state.source !== 'mistakes';

    list.replaceChildren();
    if (!hasUser || !allMistakes.length) {
      list.hidden = true;
      return;
    }

    allMistakes.forEach(record => {
      const item = document.createElement('li');
      item.className = 'mistake-item';

      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.answer_label;
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
        answerLabel: record.answer_label,
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
    const password = $('quizPassword').value;
    if (!email || !password) {
      setAuthStatus('이메일과 비밀번호를 둘 다 입력해줘.', 'error');
      return;
    }
    setAuthStatus('로그인 중…', '');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) setAuthStatus('로그인 실패: ' + error.message, 'error');
  }

  async function signUp() {
    if (!supabaseClient) {
      setAuthStatus('회원가입 기능을 불러오지 못했어. 새로고침해줘.', 'error');
      return;
    }
    const email = $('quizEmail').value.trim();
    const password = $('quizPassword').value;
    if (!email || !password) {
      setAuthStatus('이메일과 비밀번호를 둘 다 입력해줘.', 'error');
      return;
    }
    if (password.length < 6) {
      setAuthStatus('비밀번호는 6자 이상으로 만들어줘.', 'error');
      return;
    }
    setAuthStatus('회원가입 중…', '');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      setAuthStatus('회원가입 실패: ' + error.message, 'error');
      return;
    }
    setAuthStatus(
      data.session ? '회원가입 완료 · 오답노트를 동기화하는 중이야.' : '회원가입은 됐어. 이메일 확인 설정이 켜져 있으면 메일을 확인해줘.',
      'success'
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
      items: entriesFor(mode, source).map((entry, index) => ({
        no: index + 1,
        entry,
        key: questionKey(mode, entry)
      })),
      answers: new Map(),
      results: new Map(),
      wasGraded: false,
      dirty: false,
      draftKey: sheetDraftKey(mode, source)
    };
    loadSheetDraft(sheet);
    return sheet;
  }

  function resultCounts(sheet) {
    const counts = { correct: 0, wrong: 0, blank: 0 };
    sheet.items.forEach(item => {
      const result = sheet.results.get(item.key);
      if (result && counts[result] !== undefined) counts[result]++;
    });
    return counts;
  }

  function filledCount(sheet) {
    return sheet.items.reduce((count, item) => count + (String(sheet.answers.get(item.key) || '').trim() ? 1 : 0), 0);
  }

  function renderSheetSummary() {
    const sheet = state.sheet;
    if (!sheet) return;
    const total = sheet.items.length;
    const filled = filledCount(sheet);
    $('sheetProgress').textContent = '작성 ' + filled + ' / ' + total;

    if (!sheet.wasGraded) {
      $('score').textContent = '작성 ' + filled + ' / ' + total;
      $('streak').textContent = total ? '아직 미채점' : '문제 없음';
      return;
    }

    const counts = resultCounts(sheet);
    $('score').textContent = '정답 ' + counts.correct + ' / ' + total;
    $('streak').textContent = '오답 ' + (counts.wrong + counts.blank) + '개';
  }

  function renderSheetResult() {
    const sheet = state.sheet;
    if (!sheet || !sheet.items.length) {
      setSheetResult(sheet?.source === 'mistakes' ? '현재 모드의 오답을 전부 정리했어.' : '표시할 문제가 없어.', 'warning');
      return;
    }
    if (!sheet.wasGraded) {
      setSheetResult('', '');
      return;
    }

    const counts = resultCounts(sheet);
    if (sheet.dirty) {
      setSheetResult('수정한 답안이 있어. 다시 전체 채점하기를 눌러 반영해.', 'warning');
      return;
    }

    const note = currentUser
      ? ' · 틀린 문제는 오답노트에 반영했어.'
      : ' · 로그인하면 틀린 문제를 오답노트에 저장할 수 있어.';
    setSheetResult(
      '정답 ' + counts.correct + ' / ' + sheet.items.length + ' · 오답 ' + counts.wrong + ' · 미입력 ' + counts.blank + note,
      counts.wrong || counts.blank ? 'warning' : 'success'
    );
  }

  function renderSheetHeader() {
    const sheet = state.sheet;
    if (!sheet) return;
    const title = QUIZ_TITLES[sheet.mode] || sheet.mode;
    $('sheetTitle').textContent = sheet.source === 'mistakes'
      ? title + ' 오답 답안지'
      : title + ' 전체 빈칸 답안지';
    $('sheetDescription').textContent = sheet.items.length
      ? '지도 속 번호와 같은 빈칸을 모두 채운 뒤 전체 채점하기를 눌러.'
      : '현재 모드의 오답을 전부 정리했어. 전체 답안지로 다시 연습해봐.';
    $('gradeBtn').disabled = !sheet.items.length;
    $('clearSheetBtn').disabled = !sheet.items.length || !sheet.answers.size;
    $('gradeBtn').textContent = sheet.wasGraded
      ? (sheet.dirty ? '수정한 답안 다시 채점하기' : '전체 다시 채점하기')
      : '전체 채점하기';
  }

  function renderSheetRows() {
    const sheet = state.sheet;
    if (!sheet) return;
    sheet.items.forEach(item => {
      const elements = sheetElements.get(item.key);
      if (!elements) return;
      const result = sheet.results.get(item.key) || '';
      elements.row.dataset.result = result;
      if (result === 'correct') elements.correction.textContent = '정답';
      else if (result === 'wrong') elements.correction.textContent = '정답: ' + shortName(item.entry);
      else if (result === 'blank') elements.correction.textContent = '미입력 · 정답: ' + shortName(item.entry);
      else elements.correction.textContent = '';
    });
  }

  function updateSheetAfterInput() {
    const sheet = state.sheet;
    if (!sheet) return;
    if (sheet.wasGraded) sheet.dirty = true;
    saveSheetDraft();
    renderSheetHeader();
    renderSheetSummary();
    renderSheetResult();
  }

  function moveToNextInput(item) {
    const sheet = state.sheet;
    if (!sheet) return;
    const index = sheet.items.findIndex(candidate => candidate.key === item.key);
    const next = sheet.items[index + 1];
    if (next) {
      sheetElements.get(next.key)?.input.focus();
    } else {
      $('gradeBtn').focus();
    }
  }

  function focusSheetInput(key, scroll = false) {
    const elements = sheetElements.get(key);
    if (!elements) return;
    if (scroll) elements.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elements.input.focus({ preventScroll: !scroll });
  }

  function renderSheet() {
    const sheet = state.sheet;
    const root = $('answerSheet');
    sheetElements = new Map();
    root.replaceChildren();
    if (!sheet || !sheet.items.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-sheet';
      empty.textContent = sheet?.source === 'mistakes'
        ? '현재 모드의 오답이 없어. 전체 답안지로 돌아가면 새로 연습할 수 있어.'
        : '표시할 문제가 없어.';
      root.append(empty);
      renderSheetHeader();
      renderSheetSummary();
      renderSheetResult();
      return;
    }

    sheet.items.forEach(item => {
      const row = document.createElement('li');
      row.className = 'sheet-item';

      const label = document.createElement('label');
      label.htmlFor = 'sheet-answer-' + item.no;
      const number = document.createElement('span');
      number.className = 'sheet-number';
      number.textContent = String(item.no);
      const input = document.createElement('input');
      input.id = 'sheet-answer-' + item.no;
      input.type = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.placeholder = '이름';
      input.value = sheet.answers.get(item.key) || '';
      input.setAttribute('aria-label', item.no + '번 답안');
      input.addEventListener('input', () => {
        if (input.value.trim()) sheet.answers.set(item.key, input.value);
        else sheet.answers.delete(item.key);
        updateSheetAfterInput();
      });
      input.addEventListener('focus', () => showItemOnMap(item));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          moveToNextInput(item);
        }
      });
      label.append(number, input);

      const correction = document.createElement('small');
      correction.className = 'sheet-correction';
      correction.setAttribute('aria-live', 'polite');
      row.append(label, correction);
      root.append(row);
      sheetElements.set(item.key, { row, input, correction });
    });

    renderSheetHeader();
    renderSheetRows();
    renderSheetSummary();
    renderSheetResult();
  }

  function simpleBoundaryName(value) {
    return normalise(String(value || '').replace(REGION_PREFIX, ''));
  }

  function featureDistance(feature, entry) {
    const layer = boundaryFeatureLayers.get(feature);
    const bounds = layer?.getBounds ? layer.getBounds() : L.geoJSON(feature).getBounds();
    return bounds?.isValid?.() ? map.distance([entry.lat, entry.lng], bounds.getCenter()) : Number.POSITIVE_INFINITY;
  }

  function matchingFeatures(mode, entry) {
    const cacheKey = questionKey(mode, entry);
    if (featureMatches.has(cacheKey)) return featureMatches.get(cacheKey);

    const target = simpleBoundaryName(withoutPrefix(entry.name));
    const isCity = /시$/.test(withoutPrefix(entry.name));
    const exact = boundaryFeatures.filter(feature =>
      simpleBoundaryName(feature.properties && feature.properties.name) === target
    );
    let matches = exact;
    if (isCity) {
      const grouped = boundaryFeatures.filter(feature =>
        simpleBoundaryName(feature.properties && feature.properties.name).startsWith(target)
      );
      if (grouped.length) matches = grouped;
    }
    if (matches.length > 1 && !isCity) {
      matches = [matches.slice().sort((a, b) => featureDistance(a, entry) - featureDistance(b, entry))[0]];
    }
    featureMatches.set(cacheKey, matches);
    return matches;
  }

  function resetBoundaryStyles() {
    boundaryFeatureLayers.forEach(layer => layer.setStyle(BASE_STYLE));
  }

  function resultForItem(item) {
    return state.sheet?.wasGraded ? state.sheet.results.get(item.key) || '' : '';
  }

  function makeNumberIcon(number, result) {
    return L.divIcon({
      className: 'admin-number' + (result ? ' is-' + result : ''),
      html: String(number),
      iconSize: [27, 23],
      iconAnchor: [13, 12]
    });
  }

  function renderNumberMarkers() {
    const sheet = state.sheet;
    numberLayer.clearLayers();
    numberMarkers = new Map();
    if (!sheet) return;

    sheet.items.forEach(item => {
      const marker = L.marker([item.entry.lat, item.entry.lng], {
        icon: makeNumberIcon(item.no, resultForItem(item)),
        keyboard: false,
        title: item.no + '번'
      }).addTo(numberLayer);
      marker.on('click', () => focusSheetInput(item.key, true));
      numberMarkers.set(item.key, marker);
    });
  }

  function applyMapResults() {
    const sheet = state.sheet;
    resetBoundaryStyles();
    if (!sheet?.wasGraded) return;
    sheet.items.forEach(item => {
      const result = sheet.results.get(item.key);
      if (!result) return;
      matchingFeatures(sheet.mode, item.entry).forEach(feature => {
        boundaryFeatureLayers.get(feature)?.setStyle(RESULT_STYLES[result]);
      });
    });
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

  function renderSheetMap({ fit = false } = {}) {
    renderNumberMarkers();
    applyMapResults();
    if (fit) {
      requestAnimationFrame(() => {
        map.invalidateSize();
        fitMapToSheet();
      });
    }
  }

  function markFocusedNumber(key) {
    numberMarkers.forEach(marker => marker.getElement()?.classList.remove('is-focused'));
    const marker = numberMarkers.get(key);
    marker?.getElement()?.classList.add('is-focused');
  }

  function showItemOnMap(item) {
    const sheet = state.sheet;
    if (!sheet) return;
    markFocusedNumber(item.key);
    const layers = matchingFeatures(sheet.mode, item.entry)
      .map(feature => boundaryFeatureLayers.get(feature))
      .filter(Boolean);
    const group = layers.length ? L.featureGroup(layers) : null;
    const bounds = group?.getBounds();
    if (bounds?.isValid?.()) {
      map.fitBounds(bounds.pad(.4), { padding: [18, 18], maxZoom: sheet.mode === 'sigun' ? 10 : 13, animate: true });
    } else {
      map.flyTo([item.entry.lat, item.entry.lng], sheet.mode === 'sigun' ? 9 : 12, { animate: true });
    }
  }

  function gradeSheet() {
    const sheet = state.sheet;
    if (!sheet?.items.length) return;

    const actions = [];
    sheet.items.forEach(item => {
      const typed = normalise(sheet.answers.get(item.key));
      const result = !typed
        ? 'blank'
        : acceptedAnswers(item.entry).has(typed) ? 'correct' : 'wrong';
      sheet.results.set(item.key, result);

      const existingKey = wrongMapKey(sheet.mode, item.key);
      if (result === 'correct') {
        if (wrongAnswers.has(existingKey)) {
          actions.push({
            quizMode: sheet.mode,
            questionKey: item.key,
            answerLabel: shortName(item.entry),
            nextState: 'cleared'
          });
        }
      } else {
        actions.push({
          quizMode: sheet.mode,
          questionKey: item.key,
          answerLabel: shortName(item.entry),
          nextState: 'wrong'
        });
      }
    });

    sheet.wasGraded = true;
    sheet.dirty = false;
    saveSheetDraft();
    renderSheetHeader();
    renderSheetRows();
    renderSheetSummary();
    renderSheetResult();
    renderSheetMap();

    if (actions.length) {
      queueWrongActions(actions);
    } else if (currentUser) {
      setMistakeStatus('이번 답안지의 오답은 없어.', 'success');
    } else {
      setMistakeStatus('로그인하면 전체 채점의 오답을 계정에 저장해.', '');
    }
  }

  function clearSheet() {
    const sheet = state.sheet;
    if (!sheet?.items.length) return;
    if (sheet.answers.size && !window.confirm('이 답안지에 쓴 내용을 모두 지울까?')) return;
    sheet.answers.clear();
    sheet.results.clear();
    sheet.wasGraded = false;
    sheet.dirty = false;
    clearSheetDraft(sheet);
    renderSheet();
    renderSheetMap();
  }

  function startSheet(mode = state.mode, source = state.source) {
    state = { mode, source, sheet: makeSheet(mode, source) };
    updateModeButtons();
    renderMistakeTools();
    renderSheet();
    renderSheetMap({ fit: true });
  }

  function updateModeButtons() {
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    });
  }

  async function loadBoundaries() {
    try {
      const response = await fetch(BOUNDARY_URL);
      if (!response.ok) throw new Error('경계 데이터 응답 오류');
      const topology = await response.json();
      const object = topology.objects && topology.objects.skorea_municipalities_2018_geo;
      if (!object || !window.topojson) throw new Error('경계 데이터 형식 오류');

      boundaryFeatures = window.topojson.feature(topology, object).features;
      boundaryFeatureLayers = new Map();
      featureMatches = new Map();
      L.geoJSON(boundaryFeatures, {
        interactive: false,
        renderer: canvasRenderer,
        style: BASE_STYLE,
        onEachFeature(feature, layer) {
          boundaryFeatureLayers.set(feature, layer);
        }
      }).addTo(boundaryLayer);
      $('mapStatus').textContent = '이름 없는 시·군·구 경계 · 번호만 표시';
      $('mapStatus').dataset.state = '';
      renderSheetMap({ fit: true });
    } catch (error) {
      console.warn('경계 지도 불러오기 실패:', error?.message || error);
      $('mapStatus').textContent = '경계 데이터를 못 불러왔어. 번호 지도와 답안지는 계속 쓸 수 있어.';
      $('mapStatus').dataset.state = 'error';
    }
  }

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.onclick = () => startSheet(button.dataset.mode, 'all');
  });
  $('sheetForm').onsubmit = event => event.preventDefault();
  $('gradeBtn').onclick = gradeSheet;
  $('clearSheetBtn').onclick = clearSheet;
  $('mistakePracticeBtn').onclick = () => startSheet(state.mode, 'mistakes');
  $('allPracticeBtn').onclick = () => startSheet(state.mode, 'all');
  $('quizLoginBtn').onclick = signIn;
  $('quizSignupBtn').onclick = signUp;
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
  loadBoundaries();
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

