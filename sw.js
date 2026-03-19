// Service Worker for Jollibee Crew Scheduling System
// Caches static files for faster mobile loading

const CACHE_NAME = 'jollibee-crew-v17.0';
const urlsToCache = [
  '/',
  '/login.html',
  '/manager.html',
  '/crew.html',
  '/schedule.html',
  '/profiles.html',
  '/history.html',
  '/password.html',
  '/healthcard.html',
  '/healthcards-manager.html',
  '/css/styles.css',
  '/js/auth.js',
  '/js/manager.js',
  '/js/crew.js',
  '/js/schedule.js',
  '/js/history.js',
  '/js/firebase-config.js',
  '/js/healthcard.js',
  '/js/healthcards-manager.js',
  '/assets/jollibee-logo.png',
  '/assets/jollibee-logo-text.png'
];

// Install event - cache files
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.log('Service Worker: Cache failed', error);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Return cached version or fetch from network
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }
        
        // Fetch from network and cache for next time
        return fetch(event.request).then(function(response) {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone response for cache
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});