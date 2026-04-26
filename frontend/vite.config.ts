/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'build', sourcemap: mode === 'development' },
  worker: { format: 'es' },
  test: { environment: 'jsdom', globals: true, setupFiles: ['vitest.setup.ts'] },
}));
