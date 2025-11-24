// sw.js — VR Explorer Pro (atomic precache & auto-discover assets)
const VERSION = 'vr-explorer-pro-atomic-2025-10-24b';
const PRECACHE = `precache-${VERSION}`;
const TEMP = `temp-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const ASSET_ATTR_PATTERNS = [
  /<script[^>]+src=["']([^"']+)["']/gi,
  /<link[^>]+href=["']([^"']+)["']/gi,
  /<img[^>]+src=["']([^"']+)["']/gi,
  /<source[^>]+src=["']([^"']+)["']/gi,
  /<video[^>]+src=["']([^"']+)["']/gi,
  /src=["']([^"']+)["']/gi,
  /href=["']([^"']+)["']/gi
];

function isSameOrigin(urlString) {
  try {
    const u = new URL(urlString, self.location.href);
    return u.origin === self.location.origin;
  } catch {
    return false;
  }
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw, self.location.href);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function discoverAssetsFromHtml(htmlText) {
  const found = new Set();
  for (const rx of ASSET_ATTR_PATTERNS) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(htmlText)) !== null) {
      if (m[1]) {
        const norm = normalizeUrl(m[1]);
        if (norm && isSameOrigin(norm)) found.add(norm);
      }
    }
  }
  found.add(new URL('./', self.location.href).href);
  found.add(new URL('./index.html', self.location.href).href);
  found.add(new URL('./manifest.json', self.location.href).href);
  const swUrl = new URL('./sw.js', self.location.href).href;
  found.delete(swUrl);
  return Array.from(found);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const tempCache = await caches.open(TEMP);
    const indexUrl = new URL('./index.html', self.location.href).href;
    let indexResp;
    try {
      indexResp = await fetch(indexUrl, { cache: 'no-store' });
      if (!indexResp || !indexResp.ok) throw new Error('Failed to fetch index.html');
    } catch (err) {
      console.error('Install failed fetching index.html:', err);
      throw err;
    }

    const indexText = await indexResp.clone().text();
    await tempCache.put(indexUrl, indexResp.clone());

    const assets = discoverAssetsFromHtml(indexText);
    const toFetch = Array.from(new Set(assets));

    for (const assetUrl of toFetch) {
      try {
        if (assetUrl === new URL('./sw.js', self.location.href).href) continue;
        const resp = await fetch(assetUrl, { cache: 'no-store' });
        if (!resp || !resp.ok) throw new Error(`bad response ${resp && resp.status}`);
        await tempCache.put(assetUrl, resp.clone());
      } catch (err) {
        console.error('Install failed fetching asset:', assetUrl, err);
        throw err;
      }
    }

    const precache = await caches.open(PRECACHE);
    const oldKeys = await precache.keys();
    await Promise.all(oldKeys.map(k => precache.delete(k)));
    const tempKeys = await tempCache.keys();
    for (const req of tempKeys) {
      const r = await tempCache.match(req);
      if (r) await precache.put(req, r.clone());
    }
    await caches.delete(TEMP);
    console.log('Install complete — atomic precache built, version:', VERSION);
  })());
});

// ✅ Clean activation + cache purge for old versions
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (!key.includes(VERSION)) {
        console.log('Deleting old cache:', key);
        return caches.delete(key);
      }
    }));
    await self.clients.claim();
    console.log('Activated version:', VERSION);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const reqUrl = new URL(req.url);
  if (reqUrl.origin !== location.origin) return;

  event.respondWith((async () => {
    const precache = await caches.open(PRECACHE);
    const precached = await precache.match(req);
    if (precached) return precached;
    try {
      const networkResp = await fetch(req);
      if (networkResp && networkResp.ok) {
        const runtimeCache = await caches.open(RUNTIME);
        runtimeCache.put(req, networkResp.clone()).catch(() => {});
      }
      return networkResp;
    } catch {
      const runtimeCache = await caches.open(RUNTIME);
      const cachedRuntime = await runtimeCache.match(req);
      if (cachedRuntime) return cachedRuntime;
      if (req.mode === 'navigate') {
        const fallbackIndex = await precache.match(new URL('./index.html', self.location.href).href)
          || await precache.match(new URL('./', self.location.href).href);
        if (fallbackIndex) return fallbackIndex;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && (data.type === 'SKIP_WAITING' || data === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});
