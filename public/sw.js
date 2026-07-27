// My Finance PWA Service Worker
const CACHE_NAME = 'my-finance-v1';

// 需要预缓存的静态资源路径
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon.svg',
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // 立即接管，不等旧 SW 关闭
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存策略
self.addEventListener('fetch', (event) => {
  // 跳过 API 请求（不缓存）
  if (event.request.url.includes('/api/')) {
    return;
  }

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 发起网络请求，同时尝试匹配缓存
      const fetchPromise = fetch(event.request)
        .then((response) => {
          // 只缓存成功的响应
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败时回退到缓存
          return cached || new Response('离线状态，请连接网络后重试', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });

      // 优先返回缓存（如果有），否则等网络
      return cached || fetchPromise;
    })
  );
});
