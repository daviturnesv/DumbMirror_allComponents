/**
 * Service Worker para DumbMirror Remote Control PWA
 * Gerencia cache e funcionalidade offline
 */

console.log('[SW] 🟢 Service Worker CARREGADO! v1.4.0');

const CACHE_NAME = 'dumbmirror-remote-v1.4.0';
const RUNTIME_CACHE = 'dumbmirror-runtime-v1.4.0';

// Arquivos essenciais - APENAS os que REALMENTE EXISTEM
const STATIC_ASSETS = [
  '/remote.html',
  '/modules/MMM-Remote-Control/remote.css',
  '/modules/MMM-Remote-Control/remote.js',
  '/modules/MMM-Remote-Control/manifest.json',
  '/modules/MMM-Remote-Control/img/pwa-icon-192.png',
  '/modules/MMM-Remote-Control/img/pwa-icon-512.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] 🟢 INSTALANDO Service Worker v1.4.0...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache aberto, tentando adicionar arquivos...');
        // Adiciona arquivos um por um para identificar erros
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url)
              .then(() => console.log('[SW] ✅ Cached:', url))
              .catch(err => console.error('[SW] ❌ Erro ao cachear:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] 🟢 Instalação concluída!');
      })
      .catch((error) => {
        console.error('[SW] ❌ ERRO na instalação:', error);
      })
  );
  
  // Força o SW a se tornar ativo imediatamente
  console.log('[SW] 🟢 SkipWaiting chamado!');
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] 🟢 ATIVANDO Service Worker v1.4.0...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remove caches antigos
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] 🟢 Ativação concluída!');
    })
  );
  
  // Assume controle imediatamente
  return self.clients.claim();
});

// Intercepta requisições - ESTRATÉGIA SIMPLES: Network First
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignora requisições de outros domínios, websockets e chrome-extension
  if (url.origin !== location.origin || 
      url.protocol === 'ws:' || 
      url.protocol === 'wss:' ||
      url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Ignora POST, PUT, DELETE (só GET)
  if (request.method !== 'GET') {
    return;
  }
  
  console.log('[SW] Fetch interceptado:', url.pathname);
  
  // Estratégia: Network First (sempre tenta rede primeiro, cache como fallback)
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Se sucesso, clona e adiciona ao cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhar, tenta o cache
        console.log('[SW] Rede falhou, tentando cache para:', url.pathname);
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] ✅ Retornando do cache:', url.pathname);
            return cachedResponse;
          }
          console.log('[SW] ❌ Não encontrado no cache:', url.pathname);
          return new Response('Offline - recurso não disponível', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Listener para mensagens do cliente
self.addEventListener('message', (event) => {
  console.log('[SW] Mensagem recebida:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] 🟢 INSTALANDO Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache criado, adicionando arquivos estáticos...');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .catch((error) => {
        console.error('[SW] Erro ao criar cache:', error);
      })
  );
  
  // Força o SW a se tornar ativo imediatamente
  console.log('[SW] 🟢 SkipWaiting chamado!');
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] 🟢 ATIVANDO Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remove caches antigos
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Assume controle imediatamente
  return self.clients.claim();
});

// Intercepta requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignora requisições de outros domínios e websockets
  if (url.origin !== location.origin || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }
  
  // Estratégia: Network First para API, Cache First para assets
  if (url.pathname.startsWith('/api/')) {
    // Para API: tenta rede primeiro, se falhar usa cache
    event.respondWith(networkFirst(request));
  } else {
    // Para assets: usa cache primeiro, se não tiver busca na rede
    event.respondWith(cacheFirst(request));
  }
});

// Estratégia Cache First - para arquivos estáticos
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Retorna do cache e atualiza em background
    updateCache(request);
    return cachedResponse;
  }
  
  // Se não estiver no cache, busca da rede
  try {
    const networkResponse = await fetch(request);
    
    // Adiciona ao cache para próximas requisições
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Erro ao buscar da rede:', error);
    
    // Fallback para offline
    if (request.destination === 'document') {
      return caches.match('/remote.html');
    }
    
    // Retorna erro
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Estratégia Network First - para API e dados dinâmicos
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Salva no cache para uso offline
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Rede falhou, tentando cache...');
    
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Retorna erro JSON para API
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'Não foi possível conectar ao servidor'
    }), {
      status: 503,
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    });
  }
}

// Atualiza cache em background
async function updateCache(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse);
    }
  } catch (error) {
    // Ignora erros silenciosamente
  }
}

// Mensagens do cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

// Notifica clientes sobre atualizações
self.addEventListener('controllerchange', () => {
  console.log('[SW] Controller changed - nova versão ativa');
});

console.log('[SW] Service Worker carregado');
