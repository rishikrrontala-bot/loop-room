import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies the websocket to the Node server, so phones on the
// same wifi only ever need one host:port to join a room.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
