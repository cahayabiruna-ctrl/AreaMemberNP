const CACHE = 'dvteam-v2';
const ASSETS = ['./', 'index.html', 'dashboard.html', 'list.html', 'network.html', 'style.css', 'script.js', 'icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
