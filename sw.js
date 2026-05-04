/* WOLF．DIARY — Service Worker (network-first) */
const CACHE = 'wolf-diary-v2';
const PRECACHE = ['/', '/index.html', '/app.js', '/style.css', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Supabase、字型、CDN 永遠走網路，不快取
  const url = e.request.url;
  if (url.includes('supabase.co') || url.includes('fonts.googleapis') ||
      url.includes('fonts.gstatic') || url.includes('jsdelivr') ||
      url.includes('cdnjs.cloudflare')) return;

  // 其餘資源：網路優先，失敗才用快取（確保每次重整都拿最新版）
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
