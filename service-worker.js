const APP_CACHE = 'geography-app-v17';
const TILE_CACHE = 'geography-map-tiles-v11';
const APP_SHELL = [
  './',
  './index.html',
  './quiz/',
  './quiz/index.html',
  './quiz/quiz-app.js',
  './quiz/quiz-app.js?v=20260818-clickboard-v5',
  './quiz-data.js',
  './sigun-quiz.html',
  './favicon.ico',
  './teacher-photo-v3.webp?v=20260816-1432',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json',
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-topo-simple.json',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];
const MAX_CACHED_TILES = 240;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);

    await Promise.allSettled(APP_SHELL.map(async url => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok || response.type === 'opaque') {
        await cache.put(url, response.clone());
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, TILE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('geography-') && !keep.has(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheResponse(cacheName, request, response, maxEntries) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());

  if (maxEntries) {
    const keys = await cache.keys();
    const excess = keys.length - maxEntries;
    if (excess > 0) {
      await Promise.all(keys.slice(0, excess).map(key => cache.delete(key)));
    }
  }

  return response;
}

async function cachedOrNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    return cacheResponse(APP_CACHE, request, response);
  } catch {
    return new Response('오프라인 상태입니다. 인터넷에 연결한 뒤 다시 시도해 주세요.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    return cacheResponse(APP_CACHE, request, response);
  } catch {
    return (await caches.match(request)) ||
      (await caches.match('./')) ||
      (await caches.match('./index.html'));
  }
}

async function mapTileResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    return cacheResponse(TILE_CACHE, request, response, MAX_CACHED_TILES);
  } catch {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.hostname.endsWith('basemaps.cartocdn.com')
  ) {
    event.respondWith(mapTileResponse(request));
    return;
  }

  if (
    url.origin === self.location.origin ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'raw.githubusercontent.com'
  ) {
    event.respondWith(cachedOrNetwork(request));
  }
});