import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { validateSupabaseBrowserKey } from './src/config/productionValidation.js'
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

function releaseIntegrityPlugin() {
  let releaseId = 'local-unknown'

  return {
    name: 'arch9-release-integrity',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      releaseId = String(
        env.VITE_RELEASE_ID ||
        process.env.VITE_RELEASE_ID ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.GIT_COMMIT_SHA ||
        releaseId,
      ).trim() || 'local-unknown'
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
          generatedAt: new Date().toISOString(),
          criticalAssets: [...criticalFiles].sort(),
          listingDetailAssetDetected: seedFiles.some((fileName) => fileName.includes('AgentListingDetail')),
        }, null, 2)}\n`,
      })
    },
  }
}

function productionEnvironmentGuardPlugin() {
  return {
    name: 'arch9-production-environment-guard',
    configResolved(config) {
      const loadedEnv = loadEnv(config.mode, config.root, '')
      const env = { ...loadedEnv, ...process.env, MODE: config.mode }
      const deploymentEnvironment = String(env.VITE_APP_ENV || env.VITE_DEPLOY_ENV || env.VITE_VERCEL_ENV || env.VERCEL_ENV || '')
        .trim()
        .toLowerCase()
      const isProductionBuild = deploymentEnvironment === 'production'
      if (!isProductionBuild) return

      const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((name) => !String(env[name] || '').trim())
      const issues = []
      if (missing.length) {
        issues.push(`Missing required production environment variables: ${missing.join(', ')}.`)
      }

      if (!missing.includes('VITE_SUPABASE_ANON_KEY')) {
        const keyValidation = validateSupabaseBrowserKey(env.VITE_SUPABASE_ANON_KEY)
        if (!keyValidation.ok) issues.push(keyValidation.message)
      }

      if (!String(env.VITE_SUPABASE_ANON_KEY || '').trim() && String(env.VITE_SUPABASE_KEY || '').trim().startsWith('sb_publishable_')) {
        issues.push('Remove VITE_SUPABASE_KEY=sb_publishable_* from production; browser auth must use VITE_SUPABASE_ANON_KEY.')
      }

      if (issues.length) {
        throw new Error(`[PRODUCTION SAFETY] ${issues.join(' ')}`)
      }
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
  plugins: [productionEnvironmentGuardPlugin(), documentTitleFallbackPlugin(), releaseIntegrityPlugin(), react(), missionControlApiPlugin()],
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
