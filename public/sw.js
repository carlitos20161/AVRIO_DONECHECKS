// Use timestamp-based cache name that changes on each deployment
// Force update by changing version number
const CACHE_VERSION = 'v2.0.4-force-refresh';
const CACHE_NAME = `newchecks-${CACHE_VERSION}`;
const VERSION_CHECK_INTERVAL = 60000; // Check every minute

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker...');
  // Skip waiting so the new service worker activates immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  event.waitUntil(
    Promise.all([
      // Clean up ALL old caches aggressively
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete ALL caches that aren't the current one
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients immediately
      self.clients.claim()
    ]).then(() => {
      // Force reload all clients to get fresh content
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FORCE_RELOAD' });
        });
      });
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Don't cache version.json - always fetch fresh
  if (event.request.url.includes('version.json')) {
    event.respondWith(fetch(event.request).catch((error) => {
      console.warn('[SW] Failed to fetch version.json:', error);
      return new Response(JSON.stringify({ error: 'Network request failed' }), {
        status: 408,
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Don't cache:
  // - API calls (/api/)
  // - WebSocket connections (ws://, wss://)
  // - Service worker itself
  // - POST requests or chrome-extension URLs
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://') ||
      url.pathname.startsWith('/api/') ||
      url.protocol === 'ws:' ||
      url.protocol === 'wss:' ||
      url.pathname.includes('sw.js') ||
      url.pathname.includes('service-worker')) {
    event.respondWith(fetch(event.request).catch((error) => {
      console.warn('[SW] Failed to fetch:', event.request.url, error);
      return new Response(JSON.stringify({ error: 'Network request failed' }), {
        status: 408,
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Don't cache critical files - always fetch fresh:
  // - JavaScript files (.js, .js.map)
  // - HTML files (index.html, root path)
  // - CSS files (.css) - to ensure styles update
  if (url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.js.map') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/' ||
      url.pathname.endsWith('.css')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses only (but not critical files)
        if (response.status === 200 && event.request.method === 'GET' && 
            !url.pathname.endsWith('.js') && 
            !url.pathname.endsWith('.js.map') &&
            !url.pathname.endsWith('.html') &&
            url.pathname !== '/' &&
            !url.pathname.endsWith('.css')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch((error) => {
              // Silently ignore cache errors (e.g., for POST requests or unsupported schemes)
              console.error('[SW] Failed to cache request:', error);
            });
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache (but not for critical files)
        if (url.pathname.endsWith('.js') || 
            url.pathname.endsWith('.js.map') ||
            url.pathname.endsWith('.html') ||
            url.pathname === '/' ||
            url.pathname.endsWith('.css')) {
          return new Response('Offline', { status: 503 });
        }
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline', { status: 503 });
        });
      })
  );
});

// Listen for messages from the page to check for updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 