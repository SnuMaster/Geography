(() => {
  'use strict';

  const MUNICIPALITY_URL = '../data/korea-municipalities-2018.topo.json';
  const PROVINCE_URL = '../data/korea-provinces-2018.topo.json';
  const REGION_PREFIX = /^(경기도|강원|경남|인천|울산)\s+/;
  const ENDING = /(특별자치시|특별시|광역시|시|군|구)$/;
  const DISTRICT_MODE_PREFIXES = {
    seoul: ['서울', '서울특별시'],
    daegu: ['대구', '대구광역시'],
    busan: ['부산', '부산광역시']
  };
  const BASE_STYLE = { color: '#91a4b2', weight: .7, opacity: .95, fillColor: '#f9fcfe', fillOpacity: .92 };
  const SELECTED_STYLE = { color: '#1769aa', weight: 2.25, opacity: 1, fillColor: '#b9dbf3', fillOpacity: .86 };
  const SEEN_STYLE = { color: '#5983a6', weight: 1.1, opacity: .95, fillColor: '#dbeaf6', fillOpacity: .62 };
  const OUT_OF_SCOPE_STYLE = { color: '#d5e0e7', weight: .35, opacity: .35, fillColor: '#f6f9fb', fillOpacity: .08 };
  const HOVER_STYLE = { color: '#1769aa', weight: 1.6, opacity: 1, fillColor: '#cfe8fa', fillOpacity: .76 };

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
  const labelsLayer = L.layerGroup().addTo(map);
  const municipalityRenderer = L.canvas({ pane: 'municipalityFill', padding: .25 });
  const municipalityBorderRenderer = L.canvas({ pane: 'municipalityBorder', padding: .25 });
  const provinceRenderer = L.canvas({ pane: 'provinceOutline', padding: .25 });

  let boundaryFeatures = [];
  let boundaryTopology = null;
  let boundaryTopologyObject = null;
  let topologyGeometryByCode = new Map();
  let activeFeatureItems = new Map();
  let itemBoundaryLayers = new Map();
  let mode = 'sigun';
  let selectedKey = null;
  let seenKeys = new Set();
  let labelsVisible = false;

  function normalise(value) {
    return String(value || '').normalize('NFC').trim().replace(/[\s·ㆍ\-‐‑–—]/g, '').toLowerCase();
  }

  function withoutPrefix(name) {
    return String(name || '').replace(REGION_PREFIX, '');
  }

  function shortName(entry) {
    return withoutPrefix(entry.name).replace(ENDING, '');
  }

  function displayAnswer(currentMode, entry) {
    if (entry.answerName) return entry.name;
    return DISTRICT_MODE_PREFIXES[currentMode] ? withoutPrefix(entry.name) : shortName(entry);
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

  function questionKey(currentMode, entry) {
    return currentMode + ':' + (entry.id || normalise(entry.name));
  }

  function currentItems() {
    return (QUIZ_DATA[mode] || []).map(entry => ({ entry, key: questionKey(mode, entry) }));
  }

  function specialSigunItemForCode(items, code) {
    const districtItem = items.find(item => item.entry.featureCodes?.includes(code));
    if (districtItem) return districtItem;
    let targetName = '';
    if (code.startsWith('23')) targetName = '인천광역시';
    else if (code.startsWith('24')) targetName = '광주광역시';
    else if (code.startsWith('25')) targetName = '대전광역시';
    else if (code.startsWith('26')) targetName = '울산광역시';
    else if (code === '29010') targetName = '세종특별자치시';
    return targetName ? items.find(item => item.entry.name === targetName) || null : null;
  }

  function resolveSigunGroupItem(items, groupCode, groupFeatures, groupCache) {
    if (groupCache.has(groupCode)) return groupCache.get(groupCode);
    const fixedNames = { '3240': '강원 고성군', '3834': '경남 고성군' };
    let item = fixedNames[groupCode]
      ? items.find(candidate => candidate.entry.name === fixedNames[groupCode]) || null
      : null;
    if (!item) {
      const names = new Set(groupFeatures.map(featureName));
      const candidates = items.filter(candidate => {
        const target = entryName(candidate.entry);
        return [...names].some(name => name === target || (target.endsWith('시') && name.startsWith(target)));
      });
      if (candidates.length === 1) item = candidates[0];
    }
    groupCache.set(groupCode, item);
    return item;
  }

  function resolveFeatureItem(items, feature, groupCache) {
    const code = featureCode(feature);
    if (!code || code.length !== 5) return null;
    if (mode === 'sigun') {
      const special = specialSigunItemForCode(items, code);
      if (special) return special;
      const groupCode = code.slice(0, 4);
      const groupFeatures = boundaryFeatures.filter(candidate => featureCode(candidate).slice(0, 4) === groupCode);
      return resolveSigunGroupItem(items, groupCode, groupFeatures, groupCache);
    }
    const permitted = mode === 'seoul'
      ? code.startsWith('11')
      : mode === 'busan'
        ? code.startsWith('21')
        : code.startsWith('22') || code === '37310';
    if (!permitted) return null;
    const name = featureName(feature);
    return items.find(item => entryName(item.entry) === name) || null;
  }

  function rebuildActiveFeatureItems() {
    activeFeatureItems = new Map();
    const items = currentItems();
    if (!boundaryFeatures.length) return { mapped: 0, total: items.length, unmapped: items.map(item => item.entry.name) };
    const groupCache = new Map();
    boundaryFeatures.forEach(feature => {
      const item = resolveFeatureItem(items, feature, groupCache);
      if (item) activeFeatureItems.set(feature, item);
    });
    const mappedKeys = new Set([...activeFeatureItems.values()].map(item => item.key));
    return {
      mapped: mappedKeys.size,
      total: items.length,
      unmapped: items.filter(item => !mappedKeys.has(item.key)).map(item => item.entry.name)
    };
  }

  function styleForItem(item) {
    if (!item) return { ...OUT_OF_SCOPE_STYLE, stroke: false };
    if (item.key === selectedKey) return { ...SELECTED_STYLE, stroke: false };
    if (seenKeys.has(item.key)) return { ...SEEN_STYLE, stroke: false };
    return { ...BASE_STYLE, stroke: false };
  }

  function applyMapStyles() {
    const items = new Map(currentItems().map(item => [item.key, item]));
    itemBoundaryLayers.forEach((layer, key) => {
      const item = items.get(key);
      if (item) layer.setStyle(styleForItem(item));
    });
  }

  function selectItem(item) {
    if (!item) return;
    selectedKey = item.key;
    seenKeys.add(item.key);
    $('answerCard').dataset.empty = 'false';
    $('answerKicker').textContent = QUIZ_TITLES[mode] || '행정구역';
    $('answerName').textContent = displayAnswer(mode, item.entry);
    $('answerFull').textContent = item.entry.name === displayAnswer(mode, item.entry)
      ? '정답을 확인했어.'
      : '전체 표기 · ' + item.entry.name;
    $('answerCounter').textContent = '확인 ' + seenKeys.size + ' / ' + currentItems().length + '개';
    applyMapStyles();
  }

  function bindItemLayer(layer, item) {
    layer.on('click', () => selectItem(item));
    layer.on('mouseover', () => layer.setStyle({ ...HOVER_STYLE, stroke: false }));
    layer.on('mouseout', () => layer.setStyle(styleForItem(item)));
  }

  function renderMunicipalityLayers() {
    municipalityFillLayer.clearLayers();
    municipalityBorderLayer.clearLayers();
    itemBoundaryLayers = new Map();
    if (!boundaryTopology || !boundaryTopologyObject) return;

    const items = currentItems();
    const geometriesByKey = new Map(items.map(item => [item.key, []]));
    const itemByKey = new Map(items.map(item => [item.key, item]));
    const keyByGeometry = new Map();

    activeFeatureItems.forEach((item, feature) => {
      const geometry = topologyGeometryByCode.get(featureCode(feature));
      if (!geometry || !geometriesByKey.has(item.key)) return;
      geometriesByKey.get(item.key).push(geometry);
      keyByGeometry.set(geometry, item.key);
    });

    items.forEach(item => {
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

  function renderLabels() {
    labelsLayer.clearLayers();
    if (!labelsVisible) return;
    currentItems().forEach(item => {
      const label = L.marker([item.entry.lat, item.entry.lng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: '<span class="answer-label">' + escapeHtml(displayAnswer(mode, item.entry)) + '</span>',
          iconSize: null,
          iconAnchor: [0, 0]
        })
      });
      label.addTo(labelsLayer);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[ch]);
  }

  function resetSelection() {
    selectedKey = null;
    seenKeys = new Set();
    $('answerCard').dataset.empty = 'true';
    $('answerKicker').textContent = '선택 없음';
    $('answerName').textContent = '지도에서 행정구역을 클릭해';
    $('answerFull').textContent = '클릭한 영역이 파란색으로 표시되고 여기에 정답이 나와.';
    $('answerCounter').textContent = '확인 0개';
    applyMapStyles();
  }

  function fitMapToMode() {
    const items = currentItems();
    if (mode === 'sigun') {
      map.fitBounds([[32.25, 124.0], [38.85, 131.25]], { padding: [18, 18], maxZoom: 7, animate: false });
      return;
    }
    const bounds = L.latLngBounds(items.map(item => [item.entry.lat, item.entry.lng]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(.22), { padding: [18, 18], maxZoom: 12, animate: false });
  }

  function setMode(nextMode) {
    mode = nextMode;
    selectedKey = null;
    seenKeys = new Set();
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    const mapping = rebuildActiveFeatureItems();
    renderMunicipalityLayers();
    renderLabels();
    resetSelection();
    $('mapStatus').textContent = mapping.unmapped.length
      ? '일부 경계가 답안과 연결되지 않았어. 새로고침해줘.'
      : '클릭 가능한 답지 · ' + mapping.mapped + '개 영역 연결됨';
    $('mapStatus').dataset.state = mapping.unmapped.length ? 'error' : '';
    requestAnimationFrame(() => {
      map.invalidateSize();
      fitMapToMode();
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
      String(geometry?.properties?.code || '').padStart(5, '0'), geometry
    ]));
    setMode(mode);
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
      loadMunicipalityBoundaries(), loadProvinceOutlines()
    ]);
    if (municipality.status === 'rejected') {
      console.warn('행정구역 지도 불러오기 실패:', municipality.reason);
      $('mapStatus').textContent = '경계 데이터를 못 불러왔어. 새로고침해줘.';
      $('mapStatus').dataset.state = 'error';
    } else if (provinces.status === 'rejected') {
      console.warn('시·도 경계 불러오기 실패:', provinces.reason);
      $('mapStatus').textContent = '답지는 클릭 가능해. 시·도 굵은 경계만 불러오지 못했어.';
      $('mapStatus').dataset.state = 'error';
    }
  }

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });
  $('toggleLabelsBtn').addEventListener('click', () => {
    labelsVisible = !labelsVisible;
    $('toggleLabelsBtn').textContent = labelsVisible ? '전체 이름 숨기기' : '전체 이름 보기';
    renderLabels();
  });
  $('resetBtn').addEventListener('click', resetSelection);

  loadMapData();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../../service-worker.js').catch(() => {});
})();
