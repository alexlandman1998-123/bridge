import externalWebsiteHandler from './api/integrations/v1/[...path].js'
import listingPublicationJobsHandler from './api/listings/publication-jobs.js'
import listingSyndicationAvailabilityHandler from './api/listings/syndication-availability.js'
import { createLocalRecruitmentIntakeResponse } from './server/services/recruitmentIntakeApi.js'
import { createHomeSeekersSignupResponse } from './server/services/homeSeekersRecruitmentSignupApi.js'
import { createRecruitmentApplicantSetupResponse } from './server/services/recruitmentApplicantSetupApi.js'
import { createSellerOnboardingBrandingResponse } from './server/services/sellerOnboardingBrandingApi.js'
import { handleRentalLandlordOnboarding, handlePublicRentalLandlordOnboarding } from './server/services/rentalLandlordOnboardingApi.js'
import { handlePublicRentalApplication } from './server/services/publicRentalApplicationApi.js'
import { handleRentalAgentDocumentUpload } from './server/services/rentalApplicationAgentDocumentApi.js'
import { defineConfig, loadEnv } from 'vite'
import { execFileSync } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createAdminMobileDashboardResponse } from './server/services/adminMobileDashboardApi.js'
import { createMissionControlResponse, writeNodeJsonResponse } from './server/services/hqMissionControlApi.js'
import { createBuyerOfferBrandingResponse } from './server/services/buyerOfferBrandingApi.js'
import { createPublicAgentCardEventsResponse } from './server/services/publicAgentCardEventsApi.js'
import { createPublicAgentCardImageResponse, createPublicAgentCardShareResponse, writeNodeTextResponse } from './server/services/publicAgentCardShareApi.js'
import { createPublicAgencyIntakeResponse } from './server/services/publicAgencyIntakeApi.js'
import { createPublicListingsResponse } from './server/services/publicListingsApi.js'
import { createProperty24ApiResponse } from './server/property24/api.js'
import { createPrivatePropertyApiResponse } from './server/private-property/api.js'
import { createMobileWebPushResponse } from './server/services/mobileWebPushApi.js'
import { handleAiCampaign } from './server/services/aiCampaignApi.js'

function documentTitleFallbackPlugin() {
  const fallbackDocumentTitle = 'Arch9 | Platform'
  let documentTitle = fallbackDocumentTitle

  return {
    name: 'document-title-fallback',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      documentTitle = String(env.VITE_DOCUMENT_TITLE || process.env.VITE_DOCUMENT_TITLE || fallbackDocumentTitle).trim() || fallbackDocumentTitle
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

function resolveLocalGitCommitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: dirname(fileURLToPath(import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
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
        gitCommitSha: process.env.GIT_COMMIT_SHA || resolveLocalGitCommitSha(),
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
    configureServer(server) {
      server.middlewares.use('/release-manifest.json', (request, response) => {
        const method = String(request.method || 'GET').toUpperCase()
        if (method !== 'GET' && method !== 'HEAD') {
          response.statusCode = 405
          response.setHeader('Allow', 'GET, HEAD')
          response.setHeader('Cache-Control', 'no-store')
          response.end()
          return
        }

        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        if (method === 'HEAD') {
          response.end()
          return
        }
        response.end(`${JSON.stringify({
          version: 1,
          releaseId,
          supabaseOrigin,
          generatedAt: new Date().toISOString(),
          criticalAssets: [],
          listingDetailAssetDetected: false,
          dev: true,
        }, null, 2)}\n`)
      })
    },
    generateBundle(_outputOptions, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
      const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
      const emittedFiles = new Set(Object.keys(bundle))
      const seedFiles = chunks
        .filter((chunk) => chunk.isEntry || chunk.fileName.includes('AgentListingDetail'))
        .map((chunk) => chunk.fileName)
      const criticalFiles = new Set()
      const visit = (fileName) => {
        if (!fileName || criticalFiles.has(fileName)) return
        const chunk = chunksByFileName.get(fileName)
        // Rollup can retain an obsolete dynamic-import reference while it
        // finalises chunks. Never publish a name that this build did not emit:
        // the browser's stale-chunk recovery uses this manifest to decide
        // whether to wait for an asset or reload the app shell.
        if (!chunk && !emittedFiles.has(fileName)) return
        criticalFiles.add(fileName)
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
    async writeBundle(outputOptions) {
      const outputDirectory = outputOptions.dir
      if (!outputDirectory) return
      const manifestPath = resolve(outputDirectory, 'release-manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      const presentAssets = await Promise.all(manifest.criticalAssets.map(async (fileName) => {
        try {
          await access(resolve(outputDirectory, fileName))
          return fileName
        } catch {
          return null
        }
      }))
      manifest.criticalAssets = presentAssets.filter(Boolean)
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    },
  }
}

function missionControlApiPlugin() {
  return {
    name: 'mission-control-api',
    configureServer(server) {
      server.middlewares.use('/api/listings/publication-jobs', (request, response) => {
        const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env }
        return listingPublicationJobsHandler(request, response, { ...env, SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL })
      })
      server.middlewares.use('/api/listings/syndication-availability', (request, response) => {
        const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env }
        return listingSyndicationAvailabilityHandler(request, response, { ...env, SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL })
      })
      server.middlewares.use('/api/integrations/v1', (request, response) => {
        request.url = `/api/integrations/v1${request.url}`
        return externalWebsiteHandler(request, response)
      })
      // Local previews must not create live applications or analytics records.
      server.middlewares.use('/api/public/recruitment-intake', async (request, response) => {
        const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env }
        try {
          const chunks = []; let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 24000) return writeNodeJsonResponse(response, { status: 413, body: { error: 'Application is too large.' } })
            chunks.push(chunk)
          }
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          writeNodeJsonResponse(response, await createLocalRecruitmentIntakeResponse({ method: request.method, headers: request.headers, body, env: { ...env, SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL } }))
        } catch { writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid application request.' } }) }
      })
      server.middlewares.use('/api/recruitment/applicant-profile', async (request, response) => {
        try {
          const chunks = []; let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 16000) return writeNodeJsonResponse(response, { status: 413, body: { error: 'Applicant request is too large.' } })
            chunks.push(chunk)
          }
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          writeNodeJsonResponse(response, await createRecruitmentApplicantSetupResponse({ method: request.method, headers: request.headers, body, preview: true }))
        } catch { writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid applicant request.' } }) }
      })
      server.middlewares.use('/api/home-seekers/recruitment', async (request, response) => {
        try {
          const chunks = []; let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 16000) return writeNodeJsonResponse(response, { status: 413, body: { error: 'Recruitment request is too large.' } })
            chunks.push(chunk)
          }
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          writeNodeJsonResponse(response, await createHomeSeekersSignupResponse({ method: request.method, headers: request.headers, body, preview: true }))
        } catch { writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid recruitment request.' } }) }
      })
      // Preview the same published stock as the public website without loading
      // production credentials or enabling writes against its database.
      server.middlewares.use('/api/home-seekers/site', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (request.method !== 'GET') return writeNodeJsonResponse(response, {
          status: 405, headers: { Allow: 'GET' }, body: { error: 'method_not_allowed' },
        })
        try {
          const upstream = await fetch('https://www.homeseeker.co.za/api/home-seekers/site', {
            signal: AbortSignal.timeout(20000),
          })
          if (!upstream.ok) throw new Error('Public listing feed unavailable.')
          const data = await upstream.json()
          if (!Array.isArray(data.listings)) throw new Error('Invalid public listing feed.')
          writeNodeJsonResponse(response, {
            status: 200, headers: { 'Cache-Control': 'no-store' }, body: { listings: data.listings },
          })
        } catch (error) {
          console.warn('[home-seekers-local-feed] read failed', { name: error?.name, code: error?.cause?.code })
          writeNodeJsonResponse(response, {
            status: 503, headers: { 'Cache-Control': 'no-store' },
            body: { error: 'Website listings are temporarily unavailable.' },
          })
        }
      })
      server.middlewares.use('/api/home-seekers/applications', (_request, response) => writeNodeJsonResponse(response, { status: 503, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Applications are not enabled in this local preview. Your answers have not been sent.' } }))
      server.middlewares.use('/api/home-seekers/analytics', (_request, response) => { response.statusCode = 204; response.end() })
      for (const [path, handler] of [['/api/public/rental-application', handlePublicRentalApplication], ['/api/rentals/application-documents', handleRentalAgentDocumentUpload], ['/api/rentals/landlord-onboarding', handleRentalLandlordOnboarding], ['/api/public/rental-landlord-onboarding', handlePublicRentalLandlordOnboarding]]) {
        server.middlewares.use(path, async (request, response) => {
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'private, no-store')
          const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env }
          try {
            const chunks = []; let size = 0
            for await (const chunk of request) {
              size += chunk.length
              if (size > 12 * 1024 * 1024) { writeNodeJsonResponse(response, { status: 413, body: { error: 'Upload is too large.' } }); return }
              chunks.push(chunk)
            }
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
            writeNodeJsonResponse(response, await handler({ method: request.method, headers: request.headers, body: request.method === 'GET' ? Object.fromEntries(new URL(request.url, 'http://localhost').searchParams) : body, env }))
          } catch { writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid application request.' } }) }
        })
      }
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
      server.middlewares.use('/api/mobile/push', async (request, response) => {
        // Local browsing must not register devices or send notifications against hosted data.
        if (request.method !== 'GET') return writeNodeJsonResponse(response, {
          status: 503, body: { message: 'Use the deployed Arch9 app to enable notifications and send a test.' },
        })
        const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env }
        writeNodeJsonResponse(response, await createMobileWebPushResponse({ method: request.method, headers: request.headers, env }))
      })
      server.middlewares.use('/api/marketing/ai-campaign', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        try {
          const chunks = []; let size = 0;
          for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 18000) throw new Error('Request too large'); chunks.push(Buffer.from(chunk)); }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env };
          const target = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
          if (['generate', 'business_generate', 'crm_follow_up_generate'].includes(body.action) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(target)) return writeNodeJsonResponse(response, { status: 503, body: { error: 'Local previews use mocked generation or a local Supabase database. Use an approved deployment for managed AI.' } });
          writeNodeJsonResponse(response, await handleAiCampaign({ method: request.method, headers: request.headers, body, env }));
        } catch { writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid campaign request.' } }); }
      })
      server.middlewares.use('/api/public/listings', async (request, response) => {
        const payload = await createPublicListingsResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/public/seller-onboarding-branding', async (request, response) => {
        const env = { ...loadEnv(server.config.mode, server.config.root, ''), ...process.env }
        const payload = await createSellerOnboardingBrandingResponse({
          env: { ...env, SUPABASE_URL: env.VITE_SUPABASE_URL },
          method: request.method,
          url: request.url,
          headers: request.headers,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/public/buyer-offer-branding', async (request, response) => {
        const payload = await createBuyerOfferBrandingResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/public/agency-intake', async (request, response) => {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : null
        const payload = await createPublicAgencyIntakeResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/public/agent-card-events', async (request, response) => {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : null
        const payload = await createPublicAgentCardEventsResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/public/agent-card-share', async (request, response) => {
        writeNodeTextResponse(response, await createPublicAgentCardShareResponse({ method: request.method, url: request.url, headers: request.headers }))
      })
      server.middlewares.use('/api/public/agent-card-image', async (request, response) => {
        writeNodeTextResponse(response, await createPublicAgentCardImageResponse({ method: request.method, url: request.url, headers: request.headers }))
      })
      server.middlewares.use('/share/card/', async (request, response) => {
        const slug = String(request.url || '').split('?')[0].replace(/^\/+/, '').split('/')[0]
        writeNodeTextResponse(response, await createPublicAgentCardShareResponse({ method: request.method, url: `/api/public/agent-card-share?slug=${encodeURIComponent(slug)}`, headers: request.headers }))
      })
      server.middlewares.use('/api/property24', async (request, response) => {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : null
        const payload = await createProperty24ApiResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body,
        })
        writeNodeJsonResponse(response, payload)
      })
      server.middlewares.use('/api/private-property', async (request, response) => {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : null
        const payload = await createPrivatePropertyApiResponse({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body,
        })
        writeNodeJsonResponse(response, payload)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Test optimization must not replace dependencies used by a running dev server.
  cacheDir: process.env.VITEST || process.argv.some((arg) => /\.test\.[cm]?[jt]sx?$/.test(arg))
    ? 'node_modules/.vite-vitest'
    : 'node_modules/.vite-dev',
  // Shared Edge/editor code resolves the parser from this app's pinned package.
  resolve: { dedupe: ['parse5'] },
  plugins: [documentTitleFallbackPlugin(), releaseIntegrityPlugin(), react(), missionControlApiPlugin()],
  // Saved HTML previews can reference disposable Vite cache files.
  optimizeDeps: {
    entries: ['index.html', 'home-seekers.html'],
    // Keep React's renderer ready before a lazy setup page first requests it.
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        chunkFileNames(chunkInfo) {
          // Some browser privacy/content filters match the generic "Sidebar"
          // asset name. The primary shell must remain loadable in those
          // browsers, so give only this lazy navigation chunk a neutral URL.
          if (chunkInfo.name === 'Sidebar') return 'assets/navigation-shell-[hash].js'
          return 'assets/[name]-[hash].js'
        },
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          if (normalizedId.includes('vite/preload-helper') || normalizedId.includes('commonjsHelpers.js')) {
            return 'vendor-runtime'
          }
          // Reuse the same permission registry across the shell and lazy workspaces.
          if (normalizedId.endsWith('/src/auth/permissions/permissionRegistry.js')) return 'permission-registry'
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
