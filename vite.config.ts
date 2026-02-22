import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — rarely changes, maximises long-term caching
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Heavy AI SDK — lazy-loaded separately
          ai: ['@google/generative-ai'],
          // Framer Motion — large animation library
          motion: ['framer-motion'],
          // Supabase client
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    // Warn when any individual chunk exceeds 500 kB
    chunkSizeWarningLimit: 500,
  },
})
