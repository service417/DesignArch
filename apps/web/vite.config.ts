import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * Proxy the API through the dev server so the browser sees one origin.
     *
     * This is not just CORS convenience: signed media URLs come back as paths
     * like /api/v1/media/file?..., and they only resolve if the app and the API
     * share an origin. Behind a reverse proxy in production the same holds.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
