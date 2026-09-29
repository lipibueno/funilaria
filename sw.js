// v2: a página sempre busca a versão nova quando há internet
const CACHE = 'funilaria-v2';
const ARQUIVOS = ['./', './index.html', './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('script.google.com') || req.url.includes('google')) return;
  const pagina = req.mode === 'navigate' || req.url.endsWith('.html') || req.url.endsWith('/');
  if (pagina){
    // rede primeiro: pega atualizações; sem internet, usa a cópia
    e.respondWith(fetch(req).then(res => {
      const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)).catch(()=>{});
    return res;
  })));
});
