import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'QuantDesk 360',
        short_name: 'QuantDesk',
        description: '台股即時與收盤資料終端',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,csv}']
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          drawer: [
            './src/drawer/index.js',
            './src/drawer/kline.js',
            './src/drawer/chip.js',
            './src/drawer/margin.js',
            './src/drawer/holders.js',
            './src/drawer/branches.js'
          ],
          tables: ['./src/tables.js'],
          ui: ['./src/ui.js']
        }
      }
    }
  }
});
