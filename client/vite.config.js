import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development, /api is proxied to the Express server so the frontend can
// use same-origin relative URLs (and SSE works without CORS headaches).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Cloud Agent previews and public tunnels (Cloudflare, ngrok, loca.lt).
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});

