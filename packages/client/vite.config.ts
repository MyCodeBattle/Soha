import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_TARGET = 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/socket.io': {
        target: BACKEND_TARGET,
        ws: true,
      },
      '/api': {
        target: BACKEND_TARGET,
      },
    },
  },
});
