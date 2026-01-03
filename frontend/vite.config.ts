import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate XRPL core library
          if (id.includes('node_modules/xrpl')) {
            return 'xrpl-core'
          }

          // Separate wallet integration libraries
          if (id.includes('node_modules/xumm-sdk')) {
            return 'wallet-integrations'
          }

          // Separate React ecosystem
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router')) {
            return 'react-vendor'
          }

          // Other vendor libraries remain in default vendor chunk
        }
      }
    },
    // Increase chunk size warning limit since we're intentionally creating larger vendor chunks
    chunkSizeWarningLimit: 600
  }
})
