import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Без кеша в браузере и с опросом файлов: на Windows сервер иногда не замечает правок
  // и отдаёт старые модули (из-за этого игра «зависала» на обработке года)
  server: {
    port: 5173,
    headers: { 'Cache-Control': 'no-store' },
    watch: { usePolling: true, interval: 300 },
  },
});
