import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/tokens.css'
import './styles/app.css'

// ── Service Worker registrieren (nur in Production) ────────────────────────
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Falls beim Laden bereits ein neuer SW wartet → sofort melden
        if (reg.waiting) {
          window.dispatchEvent(new CustomEvent('sw-update-waiting'))
        }

        // Wenn ein SW-Update gefunden wird (neuer SW wird geladen)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            // Neuer SW ist installiert und wartet — aber nur wenn bereits ein
            // aktiver Controller existiert (= nicht beim ersten Install)
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              window.dispatchEvent(new CustomEvent('sw-update-waiting'))
            }
          })
        })
      })
      .catch((err) => {
        console.warn('[SW] Registrierung fehlgeschlagen:', err)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
