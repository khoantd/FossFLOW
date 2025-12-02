const CACHE_NAME = 'fossflow-v1';

// Get the base path from the service worker's location
const swPath = self.location.pathname;
const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);

const urlsToCache = [
  basePath,
  `${basePath}static/css/main.css`,
  `${basePath}static/js/bundle.js`,
  `${basePath}manifest.json`,
  `${basePath}favicon.ico`,
  `${basePath}logo192.png`,
  `${basePath}logo512.png`
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Check if this is a health check request to an external URL
  // Health checks are typically GET requests to external HTTP/HTTPS URLs
  const isExternalUrl = url.protocol === 'http:' || url.protocol === 'https:';
  const isSameOrigin = url.origin === self.location.origin;
  const isGetRequest = request.method === 'GET';
  
  // Check if it's a health check endpoint pattern (common health check paths)
  const healthCheckPaths = ['/health', '/healthz', '/status', '/api/health'];
  const isHealthCheckPath = healthCheckPaths.some(path => url.pathname.includes(path));
  
  // Also check if it's a request that might need proxying (external URL, GET request)
  // We'll proxy external GET requests that might be health checks
  const shouldProxy = isExternalUrl && !isSameOrigin && isGetRequest && 
    (isHealthCheckPath || request.headers.get('Accept')?.includes('application/json'));
  
  if (shouldProxy) {
    // Route through backend proxy
    const proxyUrl = `${self.location.origin}/api/proxy/health-check?url=${encodeURIComponent(request.url)}`;
    
    event.respondWith(
      fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })
        .then(proxyResponse => {
          if (!proxyResponse.ok) {
            // If proxy fails, fall back to direct fetch
            return fetch(request);
          }
          
          // Return the proxied response
          return proxyResponse;
        })
        .catch(() => {
          // If proxy request fails, fall back to direct fetch
          return fetch(request);
        })
    );
    return;
  }
  
  // Standard caching behavior for other requests
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});