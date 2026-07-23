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

function escapeHtmlAttribute(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function resolveReleaseId({ viteReleaseId, vercelCommitSha, gitCommitSha, fallback = 'local-unknown' } = {}) {
  const configured = String(viteReleaseId || '').trim()
  const vercel = String(vercelCommitSha || '').trim()
  // A preview attestation binds the public release marker to Vercel's source
  // commit. A caller may set VITE_RELEASE_ID for non-Vercel builds, but it may
  // never relabel a Vercel deployment as a different source revision.
  if (configured && vercel && configured.toLowerCase() !== vercel.toLowerCase()) {
    throw new Error('VITE_RELEASE_ID must match VERCEL_GIT_COMMIT_SHA for a Vercel deployment.')
  }
  return configured || vercel || String(gitCommitSha || '').trim() || fallback
}

function releaseIntegrityPlugin() {
  let releaseId = 'local-unknown'
  let supabaseOrigin = null

  return {
    name: 'arch9-release-integrity',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      releaseId = resolveReleaseId({
        viteReleaseId: env.VITE_RELEASE_ID || process.env.VITE_RELEASE_ID,
        vercelCommitSha: process.env.VERCEL_GIT_COMMIT_SHA,
        gitCommitSha: process.env.GIT_COMMIT_SHA,
        fallback: releaseId,
      })
      const configuredSupabaseUrl = String(env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
      try {
        const parsed = new URL(configuredSupabaseUrl)
        supabaseOrigin = parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password
          ? parsed.origin
          : null
      } catch {
        supabaseOrigin = null
      }
    },
    transformIndexHtml(html) {
      const marker = `<meta name="arch9-release" content="${escapeHtmlAttribute(releaseId)}" />`
      return html.replace('</head>', `    ${marker}\n  </head>`)
    },
    generateBundle(_outputOptions, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
      const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
      const seedFiles = chunks
        .filter((chunk) => chunk.isEntry || chunk.fileName.includes('AgentListingDetail'))
        .map((chunk) => chunk.fileName)
      const criticalFiles = new Set()
      const visit = (fileName) => {
        if (!fileName || criticalFiles.has(fileName)) return
        criticalFiles.add(fileName)
        const chunk = chunksByFileName.get(fileName)
        if (!chunk) return
        for (const importedFile of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) visit(importedFile)
        for (const cssFile of chunk.viteMetadata?.importedCss || []) criticalFiles.add(cssFile)
      }
      seedFiles.forEach(visit)

      this.emitFile({
        type: 'asset',
        fileName: 'release-manifest.json',
        source: `${JSON.stringify({
          version: 1,
          releaseId,
          // VITE_* values are already public browser configuration. Recording
          // the canonical origin lets a staging preview attestation prove the
          // compiled bundle targets its declared Supabase environment.
          supabaseOrigin,
          generatedAt: new Date().toISOString(),
          criticalAssets: [...criticalFiles].sort(),
          listingDetailAssetDetected: seedFiles.some((fileName) => fileName.includes('AgentListingDetail')),
        }, null, 2)}\n`,
      })
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
  plugins: [documentTitleFallbackPlugin(), releaseIntegrityPlugin(), react(), missionControlApiPlugin()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (normalizedId.includes('vite/preload-helper') || normalizedId.includes('commonjsHelpers.js')) {
            return 'vendor-runtime'
          }
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
