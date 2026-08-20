const APP_CACHE = 'geography-app-v27';
const TILE_CACHE = 'geography-map-tiles-v11';
const APP_SHELL = [
  './',
  './index.html',
  './username-auth.js',
  './public-tools.js',
  './admin.html',
  './admin.js',
  './admin-ops.js',
  './admin-extra.js',
  './quiz/',
  './quiz/index.html',
  './quiz/quiz-app.js',
  './quiz/quiz-app.js?v=20260818-adminscope-v2',
  './quiz/username-auth-override.js',
  './sigun-quiz.html',
  './quiz-data.js',
  './quiz-data.js?v=20260818-adminscope-v2',
  './quiz/data/korea-municipalities-2018.topo.json',
  './quiz/data/korea-provinces-2018.topo.json',
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
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  if (maxEntries) {
    const keys = await cache.keys();
    const excess = keys.length - maxEntries;
    if (excess > 0) await Promise.all(keys.slice(0, excess).map(key => cache.delete(key)));
  }
  return response;
}

async function cachedOrNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try { return cacheResponse(APP_CACHE, request, await fetch(request)); }
  catch { return new Response('오프라인 상태입니다. 인터넷에 연결한 뒤 다시 시도해 주세요.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}); }
}

function pageAuthScript(url) {
  const path = url.pathname;
  if (path.includes('/quiz/')) return '<script src="./username-auth-override.js?v=20260820-username-v7"></script>';
  if (path.endsWith('/sigun-quiz.html')) return '';
  if (path === '/' || path.endsWith('/Geography/') || path.endsWith('/Geography/index.html') || path === '/index.html') return '<script src="./username-auth.js?v=20260820-username-v7"></script>';
  return '';
}

async function injectAuthScript(response, requestUrl) {
  if (!response || !response.ok) return response;
  const scriptTag = pageAuthScript(requestUrl);
  if (!scriptTag) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes(scriptTag.split('?')[0].replace('<script src="', ''))) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const transformed = html.includes('</body>') ? html.replace('</body>', '  ' + scriptTag + '\n</body>') : html + scriptTag;
  const headers = new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(transformed,{status:response.status,statusText:response.statusText,headers});
}

async function navigationResponse(request) {
  const requestUrl = new URL(request.url);
  try { const response=await fetch(request,{cache:'no-store'}); return cacheResponse(APP_CACHE,request,await injectAuthScript(response,requestUrl)); }
  catch { const cached=(await caches.match(request))||(await caches.match('./'))||(await caches.match('./index.html')); return cached?injectAuthScript(cached,requestUrl):cached; }
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
