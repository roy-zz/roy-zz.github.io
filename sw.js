// 화공안전 3차 도식 — 서비스워커 (오프라인 캐싱)
// 전략: app shell·콘텐츠는 stale-while-revalidate (캐시 즉시 반환 + 백그라운드 갱신)
const CACHE = 'viz-v2';
const CORE = [
  './', './index.html', './manifest.json', './search-index.json', './app.webmanifest', './icon.svg',
  'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js',
  'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
  'https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(u => c.add(u)));
    // manifest를 읽어 모든 토픽 .md 선캐시 → 최초 1회 방문 후 전체 오프라인
    try {
      const m = await (await fetch('manifest.json')).json();
      const files = m.categories.flatMap(x => (x.topics || []).map(t => t.file));
      await Promise.allSettled(files.map(u => c.add(u)));
    } catch (e) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    // ignoreSearch: SPA가 ?_=timestamp 캐시버스터를 붙여도 캐시 매칭되게
    const cached = await caches.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) {
        caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
      }
      return r;
    }).catch(() => null);
    return cached || (await net) || new Response('오프라인 — 캐시에 없는 자원입니다', { status: 503 });
  })());
});
