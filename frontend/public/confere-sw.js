/* MercadoFlow Confere — service worker (escopo /confere/).
 *
 * - Abre sem internet: guarda a casca do app (index.html e os arquivos de
 *   /assets, que têm hash no nome) e o leitor de código de barras (.wasm).
 * - A API nunca é guardada aqui: nota e conferência vivem no app (IndexedDB).
 * - "Compartilhar → Confere" no Android: recebe o XML e entrega à página.
 */
const SHELL = 'confere-shell-v1';
const SHARE = 'confere-share';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/confere/', '/confere-app/zxing_reader.wasm'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('confere-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Arquivo compartilhado pelo Android.
  if (req.method === 'POST' && url.pathname === '/confere/importar') {
    event.respondWith((async () => {
      const form = await req.formData();
      const file = form.get('xml');
      if (file) {
        const cache = await caches.open(SHARE);
        await cache.put('/confere-shared.xml', new Response(file, { headers: { 'Content-Type': 'text/xml' } }));
      }
      return Response.redirect('/confere/importar?compartilhado=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Navegação: rede primeiro (versão nova), casca guardada sem internet.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('/confere/', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('/confere/')) || Response.error();
      }
    })());
    return;
  }

  // Arquivos com hash e o .wasm: cache primeiro.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/confere-app/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
      return res;
    })());
  }
});
