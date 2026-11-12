import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to Spring Boot, so no CORS setup is needed during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
  },
});
