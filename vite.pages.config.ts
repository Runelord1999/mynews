import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

// MYNEWS_API_BASE points the static reader at the Mynews API Worker.
// Leave it unset locally; GitHub Actions supplies it from a repository variable.
const apiBase = (process.env.MYNEWS_API_BASE ?? '').trim();

export default defineConfig({
  root: 'web',
  base: '/mynews/',
  plugins: [react()],
  publicDir: '../public',
  define: {__MYNEWS_API_BASE__: JSON.stringify(apiBase)},
  resolve: {alias: {'@': fileURLToPath(new URL('.', import.meta.url))}},
  build: {outDir: '../pages-dist', emptyOutDir: true},
});
