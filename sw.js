const CACHE_NAME = 'LinkMeir-v2'; // שיניתי ל-v2 כדי לכפות עדכון אצל המשתמשים
const urlsToCache = [
  './',
  './index.html',
  './icon.png',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// התקנה: שמירת הקבצים הסטטיים
self.addEventListener('install', event => {
  self.skipWaiting(); // מפעיל את ה-Service Worker החדש מיד
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
          console.log('Opened cache');
          return cache.addAll(urlsToCache);
      })
  );
});

// אקטיבציה: מחיקת קבצים ישנים (גרסאות קודמות)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// שליפת נתונים: אסטרטגיה חכמה
self.addEventListener('fetch', event => {
  // 1. אם זו בקשה ל-Firebase או Google APIs - אל תתערב (תן ל-SDK לטפל בזה)
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('google.com/identity')) {
      return;
  }

  // 2. עבור קובץ ה-HTML הראשי - תמיד נסה להביא מהרשת קודם (כדי לראות עדכונים)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('./index.html');
        })
    );
    return;
  }

  // 3. עבור כל שאר הקבצים (תמונות, פונטים) - נסה מה-Cache קודם (מהירות)
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // אם נמצא ב-Cache, תחזיר אותו
        if (response) {
          return response;
        }
        // אחרת, תוריד מהאינטרנט
        return fetch(event.request);
      })
  );
});
