import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Без кеша в браузере: иначе после правок иногда подхватываются старые модули
  server: { port: 5173, headers: { 'Cache-Control': 'no-store' } },
});
