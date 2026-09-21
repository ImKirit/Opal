import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = 'http://localhost:3130';

export default defineConfig({
  plugins: [react()],
  // Standard: Domain-Wurzel. Live laeuft Opal unter imkirit.dev/opal, dafuer baut
  // npm run build:live mit --base=/opal/ (muss zum Pfad in PUBLIC_URL des Servers passen).
  base: '/',
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': server,
      '/auth': server,
      '/socket.io': { target: server, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
