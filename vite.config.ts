import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'naisurf · 奶浪冲浪祭',
        short_name: 'naisurf',
        description: '和五位软乎乎的浪友冲过奶油海，躲障碍、甩奶鲨、挑战极限模式。',
        theme_color: '#fff3cc',
        background_color: '#fff3cc',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        lang: 'zh-CN',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: {
    environment: 'node'
  }
})
