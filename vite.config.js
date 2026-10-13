import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Демо для GitHub Pages собирает scripts/build-demo.mjs (mode=demo): серверный код
// Garden упаковывается в браузерный бандл и подключается как '@demo-server'.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react()],
    base: demo ? './' : '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@demo-entry': path.resolve(__dirname, demo ? './src/demo/boot.jsx' : './src/demo/boot-stub.js'),
        ...(demo ? { '@demo-server': path.resolve(__dirname, './.demo-build/server-bundle.js') } : {}),
      },
    },
    server: {
      port: 5173,
      proxy: { '/api': 'http://127.0.0.1:4173', '/uploads': 'http://127.0.0.1:4173' },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'public',
      emptyOutDir: true,
      sourcemap: false,
    },
    ...(demo ? { publicDir: false } : {}),
  };
});
