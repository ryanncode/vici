import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,worker.js}'],
        maximumFileSizeToCacheInBytes: 5000000 // 5MB to accommodate larger chunks
      },
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Vici Auto-Mixer',
        short_name: 'Vici',
        description: 'Autonomous virtual DJ web application',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    watch: {
      ignored: ['**/emsdk/**']
    }
  },
  optimizeDeps: {
    entries: ['index.html'],
    exclude: ['emsdk']
  }
})
