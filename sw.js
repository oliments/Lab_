// Lab — offline support.
// The app files are fetched from the network first (so updates arrive),
// but if the network is slow or down, the saved copy opens instantly.
const CACHE = 'lab-v1';
const APP = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];
const TIMEOUT_MS = 3500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(p, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // the app itself: network first, saved copy if offline / slow
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const net = fetch(req).then(res => {
        if (res && res.ok) cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
        return res;
      });
      try {
        return await withTimeout(net, TIMEOUT_MS);
      } catch (err) {
        const hit = await cache.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true });
        if (hit) { net.catch(() => {}); return hit; }
        return net; // nothing saved yet — wait for the network
      }
    })());
    return;
  }

  // fonts and the zip library: use the saved copy, refresh it in the background
  if (/fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
