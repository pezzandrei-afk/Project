const CACHE_NAME = 'scoreline-pwa-v1'
const APP_SHELL = ['/', '/manifest.json', '/scoreline-icon.svg']
const MAX_CACHED_ASSETS = 40

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shellResponse = await fetch('/')
    if (!shellResponse.ok) {
      throw new Error(`Could not cache app shell: ${shellResponse.status}`)
    }
    const shellHtml = await shellResponse.clone().text()
    const assets = [...shellHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
    await cache.put('/', shellResponse)
    await cache.addAll([...APP_SHELL.slice(1), ...assets])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('scoreline-pwa-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request)
      } catch {
        return (await caches.match('/')) ?? Response.error()
      }
    })())
    return
  }

  if (!url.pathname.startsWith('/assets/')) return

  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
        const keys = await cache.keys()
        const assetKeys = keys.filter((key) => new URL(key.url).pathname.startsWith('/assets/'))
        const expiredKeys = assetKeys.slice(0, Math.max(0, assetKeys.length - MAX_CACHED_ASSETS))
        await Promise.all(expiredKeys.map((key) => cache.delete(key)))
      }
      return response
    } catch {
      return (await caches.match(request)) ?? Response.error()
    }
  })())
})
