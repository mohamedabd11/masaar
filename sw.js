// ══════════════════════════════════════════════════════════
// sw.js — Service Worker لدعم PWA والعمل بدون إنترنت
// ══════════════════════════════════════════════════════════

const CACHE_NAME    = 'masaar-v1';
const OFFLINE_URL   = './index.html';

// الملفات المحلية التي تُخزَّن في أول تشغيل
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './auth.js',
  './firebase.js',
  './reports.js',
  './exports.js',
  './users.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Install: تخزين الملفات الأساسية ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: حذف الكاش القديم ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: استراتيجية التخزين ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // تجاهل طلبات Firebase / Google APIs — تُدار بواسطة Firebase SDK
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('googleapis.com') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // السماح للمتصفح بمعالجتها مباشرة
  }

  // للملفات المحلية: Cache-First مع Fallback للشبكة
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            // تخزين نسخة جديدة من الملف
            if (response && response.status === 200 && response.type === 'basic') {
              const toCache = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
            }
            return response;
          })
          .catch(() => {
            // عند انقطاع الاتصال: إرجاع index.html للتنقل
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
    );
    return;
  }

  // للمكتبات الخارجية (CDN): Network-First مع Cache Fallback
  if (url.hostname.includes('cdnjs') || url.hostname.includes('fonts.googleapis')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

// ── Message: استقبال رسائل التحديث ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
