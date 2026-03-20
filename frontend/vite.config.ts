import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // All data and files are served directly from Supabase — no backend proxy needed.
  },
})
