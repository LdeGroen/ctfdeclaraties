import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Van react-scripts naar Vite (10-11-2026), net als ctfcrm en ctfwebapp.
//
// De backend laat alleen de echte domeinen toe (CORS), dus vanaf localhost komt
// er niets binnen. Lokaal nalopen: zet VITE_API_URL=http://localhost:5173 in
// .env.local (of :4173 in .env.production.local voor `vite preview`); dan gaan
// /api en /auth via deze proxy.
const BACKEND = 'https://backend.cafetheaterfestival.nl'

const proxy = {
  '/api': { target: BACKEND, changeOrigin: true },
  '/auth': { target: BACKEND, changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',   // dezelfde map als react-scripts, zodat de rsync-stap blijft kloppen
    sourcemap: false,  // anders is de broncode publiek op te halen
  },
  server: { proxy },
  preview: { proxy },
})
