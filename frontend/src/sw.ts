/// <reference lib="WebWorker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// ── App-Shell precachen (JS, CSS, HTML, Icons) ─────────────────────────────
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── API: NetworkFirst für strukturierte Daten ───────────────────────────────
// Staffeln, Episoden, Folgen: lieber immer frisch, Fallback auf Cache
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/produktionen') ||
    url.pathname.startsWith('/api/folgen') ||
    url.pathname.startsWith('/api/episoden'),
  new NetworkFirst({ cacheName: 'api-produktionen', networkTimeoutSeconds: 5 })
)

// Szenen & Stages: StaleWhileRevalidate — zeige Cache sofort, aktualisiere im Hintergrund
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/szenen') ||
    url.pathname.startsWith('/api/stages'),
  new StaleWhileRevalidate({ cacheName: 'api-szenen' })
)

// ── BroadcastChannel für Update-Kommunikation ──────────────────────────────
// Kanal wird auch in main.tsx und AppShell.tsx verwendet
const bc = new BroadcastChannel('sw-update')

self.addEventListener('install', () => {
  // Sofort aktivieren — kein Warten auf explizites skipWaiting.
  // Deploys werden dadurch sofort wirksam nach einem Reload.
  self.skipWaiting()
  bc.postMessage({ type: 'SW_WAITING' })
})

self.addEventListener('activate', (event) => {
  // Übernimm sofort alle offenen Tabs (wichtig nach erstem Install)
  event.waitUntil(self.clients.claim())
  bc.postMessage({ type: 'SW_ACTIVATED' })
})

self.addEventListener('message', (event) => {
  // Wird von main.tsx oder AppShell.tsx gesendet
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
