import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createAdminMobileDashboardResponse } from './server/services/adminMobileDashboardApi.js'
import { createMissionControlResponse, writeNodeJsonResponse } from './server/services/hqMissionControlApi.js'
import { createPublicListingsResponse } from './server/services/publicListingsApi.js'

function documentTitleFallbackPlugin() {
  let documentTitle = 'Bridge Nine'

  return {
    name: 'document-title-fallback',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      documentTitle = String(env.VITE_DOCUMENT_TITLE || process.env.VITE_DOCUMENT_TITLE || documentTitle).trim() || 'Bridge Nine'
    },
    transformIndexHtml(html) {
      return html.replaceAll('%VITE_DOCUMENT_TITLE%', documentTitle)
    },
  }
}

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
      server.middlewares.use('/api/admin/mobile-dashboard', async (request, response) => {
        const payload = await createAdminMobileDashboardResponse({
          method: request.method,
          headers: request.headers,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/public/listings', async (request, response) => {
        const payload = await createPublicListingsResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
        })
        writeNodeJsonResponse(response, payload)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [documentTitleFallbackPlugin(), react(), missionControlApiPlugin()],
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
