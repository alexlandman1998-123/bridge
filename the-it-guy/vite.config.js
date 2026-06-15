import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createMissionControlResponse, writeNodeJsonResponse } from './server/services/hqMissionControlApi.js'

function missionControlApiPlugin() {
  return {
    name: 'mission-control-api',
    configureServer(server) {
      server.middlewares.use('/api/hq/mission-control', async (request, response) => {
        const payload = await createMissionControlResponse({
          method: request.method,
          headers: request.headers,
        })
        writeNodeJsonResponse(response, payload)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), missionControlApiPlugin()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (!normalizedId.includes('node_modules')) return undefined
          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/') || normalizedId.includes('/react-router-dom/')) {
            return 'vendor-react'
          }
          if (normalizedId.includes('/@supabase/')) return 'vendor-supabase'
          if (normalizedId.includes('/html2pdf.js/src/')) return 'html2pdf-runtime'
          if (normalizedId.includes('/html2canvas/')) return 'vendor-html2canvas'
          if (normalizedId.includes('/jspdf/')) return 'vendor-jspdf'
          if (normalizedId.includes('/dompurify/')) return 'vendor-dompurify'
          if (normalizedId.includes('/fflate/')) return 'vendor-fflate'
          if (normalizedId.includes('/canvg/')) return 'vendor-canvg'
          if (normalizedId.includes('/pdfjs-dist/')) return 'vendor-pdf'
          if (normalizedId.includes('/lucide-react/')) return 'vendor-icons'
          if (normalizedId.includes('/motion/')) return 'vendor-motion'
          if (normalizedId.includes('/@radix-ui/') || normalizedId.includes('/cmdk/')) return 'vendor-ui'
          return undefined
        },
      },
    },
  },
})
