const APP_CACHE = 'geography-app-v40';
const TILE_CACHE = 'geography-map-tiles-v11';
const APP_SHELL = [
  './',
  './index.html',
  './username-auth.js?v=20260821-username-v15',
  './public-tools.js?v=20260821-public-v7',
  './admin',
  './admin.js?v=20260820-admin-v4',
  './admin-ops.js?v=20260819-ops-v1',
  './admin-extra.js?v=20260820-extra-v1',
  './admin-power.js?v=20260820-power-v1',
  './quiz/',
  './quiz/quiz-app.js?v=20260824-hanriver-v1',
  './quiz/username-auth-override.js?v=20260821-username-v12',
  './quiz/answer/',
  './quiz/answer/index.html',
  './quiz/answer/answer.js?v=20260823-answer-v1',
  './sigun-quiz',
  './quiz-data.js?v=20260818-adminscope-v2',
  './quiz/data/korea-municipalities-2018.topo.json',
  './quiz/data/korea-provinces-2018.topo.json',
  './quiz/data/han-river-main-stem.geojson',
  './favicon.ico',
  './teacher-photo-v3.webp?v=20260816-1432',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];
const MAX_CACHED_TILES = 240;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(APP_SHELL.map(async url => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok || response.type === 'opaque') await cache.put(url, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, TILE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('geography-') && !keep.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheResponse(cacheName, request, response, maxEntries) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (maxEntries) {
      const keys = await cache.keys();
      const excess = keys.length - maxEntries;
      if (excess > 0) await Promise.all(keys.slice(0, excess).map(key => cache.delete(key)));
    }
  } catch (error) {
    console.warn('Cache write skipped:', error);
  }
  return response;
}

async function cachedOrNetwork(request) {
  const url = new URL(request.url);
  const networkFirst = url.origin === self.location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.html'));
  if (networkFirst) {
    try { return cacheResponse(APP_CACHE, request, await fetch(request, { cache: 'no-store' })); }
    catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response('오프라인 상태입니다. 인터넷에 연결한 뒤 다시 시도해 주세요.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  }
  const cached = await caches.match(request);
  if (cached) return cached;
  try { return cacheResponse(APP_CACHE, request, await fetch(request)); }
  catch { return new Response('오프라인 상태입니다. 인터넷에 연결한 뒤 다시 시도해 주세요.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}); }
}

async function navigationResponse(request) {
  try {
    return cacheResponse(APP_CACHE, request, await fetch(request, {cache:'no-store'}));
  } catch {
    return (await caches.match(request)) || (await caches.match('./')) || (await caches.match('./index.html'));
  }
}

async function mapTileResponse(request) {
  const cached=await caches.match(request);if(cached)return cached;
  try{return cacheResponse(TILE_CACHE,request,await fetch(request),MAX_CACHED_TILES);}catch{return new Response('',{status:504});}
}

self.addEventListener('fetch', event => {
  const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);
  if(request.mode==='navigate'){event.respondWith(navigationResponse(request));return;}
  if(url.hostname.endsWith('tile.openstreetmap.org')||url.hostname.endsWith('basemaps.cartocdn.com')){event.respondWith(mapTileResponse(request));return;}
  if(url.origin===self.location.origin||url.hostname==='cdn.jsdelivr.net'||url.hostname==='raw.githubusercontent.com')event.respondWith(cachedOrNetwork(request));
});