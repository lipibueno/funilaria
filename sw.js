// v10: fotos novas ficam no aparelho e os ícones fazem parte do cache essencial.
// Ao subir uma alteração, troque o número do CACHE para limpar a cópia antiga.
const CACHE = 'funilaria-v10';

// Essenciais: se um destes falhar, a instalação falha mesmo (e aí é erro de verdade).
const ESSENCIAIS = ['./', './index.html', './manifest.json', './icone-192.png', './icone-512.png'];
// Extras: bom ter offline, mas não valem derrubar a instalação se o CDN estiver fora.
const EXTRAS = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ESSENCIAIS).then(() =>
        // um por um, sem atomicidade: o que não vier fica para depois
        Promise.all(EXTRAS.map(u => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // API e login nunca passam pelo cache
  if (req.method !== 'GET' ||
      req.url.includes('script.google.com') ||
      req.url.includes('accounts.google.com') ||
      req.url.includes('googleusercontent.com')) return;

  const pagina = req.mode === 'navigate' || req.url.endsWith('.html') || req.url.endsWith('/');
  if (pagina){
    // Rede primeiro, e sem passar pelo cache do navegador: o GitHub Pages manda
    // Cache-Control: max-age=600, e sem o no-cache a atualização só chegava depois
    // de 10 minutos. Com ele o navegador revalida pelo ETag, que é barato.
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copia = res.clone();
    caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    return res;
  })));
});
