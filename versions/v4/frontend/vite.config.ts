/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In local development the browser talks to http://localhost:5173 and Vite
// proxies /api/* and /health to the backend on :3000. In AWS the exact same
// relative URLs flow through the ALB — this proxy is the local stand-in for
// the load balancer (Stage 0 makes you break this on purpose).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
  },
});
