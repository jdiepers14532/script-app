import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/staffeln\/[^/]+\/bloecke/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-bloecke' }
          },
          {
            urlPattern: /\/api\/folgen\/[^/]+\/[^/]+\/sendedatum/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-sendedatum' }
          },
          {
            urlPattern: /\/api\/staffeln/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-staffeln', networkTimeoutSeconds: 10 }
          },
          {
            urlPattern: /\/api\/episoden/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-episoden', networkTimeoutSeconds: 10 }
          },
          {
            urlPattern: /\/api\/szenen/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-szenen' }
          },
        ],
      },
      manifest: {
        name: 'Script – Serienwerft',
        short_name: 'Script',
        description: 'Drehbuch-Management für Serienwerft',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('@tiptap') ||
            id.includes('prosemirror') ||
            id.includes('y-prosemirror') ||
            id.includes('yjs') ||
            id.includes('@hocuspocus') ||
            id.includes('y-protocols') ||
            id.includes('lib0')
          ) {
            return 'editor'
          }
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3014',
        changeOrigin: true,
      }
    }
  }
})
