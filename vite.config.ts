import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Aurora Dashboard',
        short_name: 'Aurora',
        description: 'Beautiful local-first AI dashboard',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: '192x192 512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://api.open-meteo.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'open-meteo', expiration: { maxAgeSeconds: 60 * 30 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5174', changeOrigin: true },
    },
  },
});
