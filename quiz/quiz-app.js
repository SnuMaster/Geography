(() => {
  'use strict';

  const SUPABASE_URL = 'https://aplhddasduwtlxeejvnk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kUMRFC5dLAomRo9tiakqIg_Ob3j0ELs';
  const supabaseClient = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

  const BOUNDARY_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json';
  const $ = id => document.getElementById(id);
  const { data: QUIZ_DATA, titles: QUIZ_TITLES } = window.GEOGRAPHY_QUIZ_DATA;
  const STATS_KEY = 'geography-subjective-quiz-stats-v1';
  const WRONG_ACTIONS_KEY = 'geography-quiz-wrong-actions-v1';
  const REGION_PREFIX = /^(경기도|강원|경남|인천|울산)\s+/;
  const ENDING = /(특별자치시|특별시|광역시|시|군|구)$/;

  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([36.1, 127.7], 7);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);

  const boundaryLayer = L.layerGroup().addTo(map);
  const questionLayer = L.layerGroup().addTo(map);
  let boundaryFeatures = [];
  let state = { mode: 'sigun', answer: null, answered: false, source: 'all' };
  let stats = loadStats();
  let currentUser = null;
  let wrongAnswers = new Map();
  let pendingWrongActions = loadPendingWrongActions();
  let wrongSyncInFlight = false;

  function normalise(value) {
    return String(value || '').normalize('NFC').trim().replace(/[\s·ㆍ\-‐‑–—]/g, '').toLowerCase();
  }

  function withoutPrefix(name) {
    return String(name).replace(REGION_PREFIX, '');
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

  function loadStats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATS_KEY));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function modeStats(mode) {
    if (!stats[mode]) stats[mode] = { correct: 0, total: 0, streak: 0 };
    return stats[mode];
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
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

  function renderStats() {
    const current = modeStats(state.mode);
    $('score').textContent = '정답 ' + current.correct + ' / ' + current.total;
    $('streak').textContent = '연속 정답 ' + current.streak;
  }

  function updateModeButtons() {
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    });
  }

  function setAuthStatus(message, status = '') {
    $('quizAuthStatus').textContent = message || '';
    $('quizAuthStatus').dataset.state = status;
  }

  function setMistakeStatus(message, status = '') {
    $('mistakeStatus').textContent = message || '';
    $('mistakeStatus').dataset.state = status;
  }

  function applyWrongRecord(record) {
    if (!record || !record.quiz_mode || !record.question_key) return;
    const key = wrongMapKey(record.quiz_mode, record.question_key);
    if (record.state === 'wrong') {
      wrongAnswers.set(key, record);
    } else {
      wrongAnswers.delete(key);
    }
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
      ? '현재 모드 오답 ' + currentModeCount + '개 다시 풀기'
      : '현재 모드 오답 다시 풀기';
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
      clear.onclick = () => queueWrongAction({
        quizMode: record.quiz_mode,
        questionKey: record.question_key,
        answerLabel: record.answer_label,
        nextState: 'cleared'
      });

      item.append(copy, clear);
      list.append(item);
    });
    list.hidden = false;
  }

  function updateAuthUI() {
    const hasUser = Boolean(currentUser);
    $('quizLoggedOut').hidden = hasUser;
    $('quizLoggedIn').hidden = !hasUser;
    if (hasUser) {
      $('quizAccountEmail').textContent = currentUser.email || '로그인한 계정';
    }
    renderMistakeTools();
  }

  function queueWrongAction({ quizMode, questionKey: key, answerLabel, nextState }) {
    if (!currentUser) {
      setMistakeStatus('로그인하면 틀린 문제를 계정별 오답노트에 저장해.', '');
      return;
    }

    const action = {
      userId: currentUser.id,
      quizMode,
      questionKey: key,
      answerLabel,
      state: nextState,
      stateChangedAt: new Date().toISOString()
    };
    const id = actionId(action);
    const previousIndex = pendingWrongActions.findIndex(item => actionId(item) === id);
    if (previousIndex >= 0) pendingWrongActions[previousIndex] = action;
    else pendingWrongActions.push(action);

    savePendingWrongActions();
    applyWrongRecord({
      quiz_mode: quizMode,
      question_key: key,
      answer_label: answerLabel,
      state: nextState,
      state_changed_at: action.stateChangedAt
    });
    renderMistakeTools();
    setMistakeStatus(
      navigator.onLine === false ? '인터넷 연결 뒤 오답노트를 동기화할게.' : '오답노트를 저장하는 중…',
      ''
    );
    if (navigator.onLine !== false) void flushPendingWrongActions();
  }

  function queueMistakeForEntry(mode, entry, nextState) {
    queueWrongAction({
      quizMode: mode,
      questionKey: questionKey(mode, entry),
      answerLabel: shortName(entry),
      nextState
    });
  }

  async function flushPendingWrongActions() {
    if (!currentUser || !supabaseClient || wrongSyncInFlight || navigator.onLine === false) return;
    const userId = currentUser.id;
    const actions = pendingWrongActions
      .filter(action => action.userId === userId)
      .sort((a, b) => Date.parse(a.stateChangedAt) - Date.parse(b.stateChangedAt));
    if (!actions.length) return;

    wrongSyncInFlight = true;
    try {
      for (const action of actions) {
        const { data, error } = await supabaseClient.rpc('sync_quiz_wrong_answer', {
          p_quiz_mode: action.quizMode,
          p_question_key: action.questionKey,
          p_answer_label: action.answerLabel,
          p_state: action.state,
          p_state_changed_at: action.stateChangedAt
        });
        if (error) throw error;
        if (currentUser?.id !== userId) return;

        pendingWrongActions = pendingWrongActions.filter(item => actionId(item) !== actionId(action));
        const record = Array.isArray(data) ? data[0] : data;
        applyWrongRecord(record);
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
      if (!quiet) {
        setMistakeStatus(wrongAnswers.size ? '오답노트를 불러왔어.' : '저장된 오답이 아직 없어.', 'success');
      }
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
      setMistakeStatus('로그인하면 틀린 문제를 계정에 저장해.', '');
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

  function entriesFor(mode, source) {
    return source === 'mistakes' ? wrongEntriesForMode(mode) : QUIZ_DATA[mode];
  }

  function nextAnswer(mode, source) {
    const choices = entriesFor(mode, source);
    const pool = choices.filter(entry => entry !== state.answer);
    const usable = pool.length ? pool : choices;
    return usable.length ? usable[Math.floor(Math.random() * usable.length)] : null;
  }

  function setQuestionControlsDisabled(disabled) {
    $('answerInput').disabled = disabled;
    $('checkBtn').disabled = disabled;
    $('revealBtn').disabled = disabled;
  }

  function startQuestion(mode = state.mode, source = state.source) {
    const answer = nextAnswer(mode, source);
    state = { mode, answer, answered: false, source };
    updateModeButtons();
    renderStats();
    renderMistakeTools();
    const available = entriesFor(mode, source).length;

    $('questionNumber').textContent = source === 'mistakes'
      ? QUIZ_TITLES[mode] + ' · 오답 ' + available + '개'
      : QUIZ_TITLES[mode] + ' · ' + QUIZ_DATA[mode].length + '개';
    $('answerInput').value = '';
    $('feedback').textContent = '';
    $('feedback').dataset.state = '';
    $('nextBtn').hidden = true;

    if (!answer) {
      questionLayer.clearLayers();
      $('question').textContent = source === 'mistakes'
        ? '현재 모드의 오답을 전부 정리했어. 전체 문제로 다시 연습해봐.'
        : '출제할 문제를 찾지 못했어.';
      setQuestionControlsDisabled(true);
      return;
    }

    $('question').textContent = '빨간 점과 경계로 표시된 행정구역의 이름을 입력해.';
    setQuestionControlsDisabled(false);
    showQuestionOnMap(answer);
    requestAnimationFrame(() => $('answerInput').focus());
  }

  function simpleBoundaryName(value) {
    return normalise(String(value || '').replace(REGION_PREFIX, ''));
  }

  function featureDistance(feature, entry) {
    const bounds = L.geoJSON(feature).getBounds();
    return bounds.isValid() ? map.distance([entry.lat, entry.lng], bounds.getCenter()) : Number.POSITIVE_INFINITY;
  }

  function matchingFeatures(entry) {
    const target = simpleBoundaryName(withoutPrefix(entry.name));
    const isCity = /시$/.test(withoutPrefix(entry.name));
    const exact = boundaryFeatures.filter(feature => simpleBoundaryName(feature.properties && feature.properties.name) === target);
    if (isCity) {
      const grouped = boundaryFeatures.filter(feature => simpleBoundaryName(feature.properties && feature.properties.name).startsWith(target));
      if (grouped.length) return grouped;
    }
    if (!exact.length) return [];
    if (exact.length === 1) return exact;
    return [exact.slice().sort((a, b) => featureDistance(a, entry) - featureDistance(b, entry))[0]];
  }

  function showQuestionOnMap(entry) {
    if (!entry) return;
    questionLayer.clearLayers();
    const matched = matchingFeatures(entry);
    if (matched.length) {
      const highlight = L.geoJSON(matched, {
        interactive: false,
        style: { color: '#c83f3f', weight: 2.4, fillColor: '#e66a6a', fillOpacity: .32 }
      }).addTo(questionLayer);
      const bounds = highlight.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(.35), { maxZoom: state.mode === 'sigun' ? 10 : 13, animate: true });
    } else {
      map.setView([entry.lat, entry.lng], state.mode === 'sigun' ? 9 : 12, { animate: true });
    }
    L.circleMarker([entry.lat, entry.lng], {
      radius: 8, color: '#a82d2d', weight: 2, fillColor: '#e35d5d', fillOpacity: .95, interactive: false
    }).addTo(questionLayer);
  }

  function finishQuestion(kind) {
    const current = modeStats(state.mode);
    current.total++;
    if (kind === 'correct') {
      current.correct++;
      current.streak++;
    } else {
      current.streak = 0;
    }
    saveStats();
    renderStats();
    state.answered = true;
    setQuestionControlsDisabled(true);
    $('nextBtn').hidden = false;
  }

  function checkAnswer() {
    if (state.answered || !state.answer) return;
    const typed = normalise($('answerInput').value);
    if (!typed) {
      $('feedback').textContent = '답을 먼저 입력해.';
      $('feedback').dataset.state = 'hint';
      $('answerInput').focus();
      return;
    }

    const answeredEntry = state.answer;
    const answeredMode = state.mode;
    const wasMistakeReview = state.source === 'mistakes';
    const answer = shortName(answeredEntry);
    if (acceptedAnswers(answeredEntry).has(typed)) {
      $('feedback').textContent = '정답! ' + answer + '이야.';
      $('feedback').dataset.state = 'correct';
      finishQuestion('correct');
      if (wasMistakeReview) queueMistakeForEntry(answeredMode, answeredEntry, 'cleared');
    } else {
      $('feedback').textContent = '아쉬워. 정답은 ' + answer + '이야.';
      $('feedback').dataset.state = 'wrong';
      finishQuestion('wrong');
      queueMistakeForEntry(answeredMode, answeredEntry, 'wrong');
    }
  }

  function revealAnswer() {
    if (state.answered || !state.answer) return;
    const answeredEntry = state.answer;
    const answeredMode = state.mode;
    $('feedback').textContent = '정답은 ' + shortName(answeredEntry) + '이야. 오답노트에도 넣어뒀어.';
    $('feedback').dataset.state = 'hint';
    finishQuestion('wrong');
    queueMistakeForEntry(answeredMode, answeredEntry, 'wrong');
  }

  async function loadBoundaries() {
    try {
      const response = await fetch(BOUNDARY_URL);
      if (!response.ok) throw new Error('경계 데이터 응답 오류');
      const topology = await response.json();
      const object = topology.objects && topology.objects.skorea_municipalities_2018_geo;
      if (!object || !window.topojson) throw new Error('경계 데이터 형식 오류');
      boundaryFeatures = window.topojson.feature(topology, object).features;
      L.geoJSON(boundaryFeatures, {
        interactive: false,
        style: { color: '#5b6d79', weight: .72, opacity: .78, fillColor: '#f8fbfd', fillOpacity: .15 }
      }).addTo(boundaryLayer);
      $('mapStatus').textContent = '이름 없는 시·군·구 경계 지도';
      $('mapStatus').dataset.state = '';
      showQuestionOnMap(state.answer);
    } catch {
      $('mapStatus').textContent = '경계 데이터를 못 불러왔어. 지도 중심과 빨간 점으로 문제를 풀 수 있어.';
      $('mapStatus').dataset.state = 'error';
    }
  }

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.onclick = () => startQuestion(button.dataset.mode, 'all');
  });
  $('answerForm').onsubmit = event => { event.preventDefault(); checkAnswer(); };
  $('revealBtn').onclick = revealAnswer;
  $('nextBtn').onclick = () => startQuestion(state.mode, state.source);
  $('mistakePracticeBtn').onclick = () => startQuestion(state.mode, 'mistakes');
  $('allPracticeBtn').onclick = () => startQuestion(state.mode, 'all');
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

  startQuestion();
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

