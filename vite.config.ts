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
      manifest: {
        name: 'naisurf · 奶浪冲浪祭',
        short_name: 'naisurf',
        description: '和五位奶系角色一起冲浪，甩开猎奇奶怪的像素伪 3D 小游戏。',
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: {
    environment: 'node'
  }
})
