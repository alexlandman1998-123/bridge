import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAdminMobileDashboardResponse } from './server/services/adminMobileDashboardApi.js'
import { createMissionControlResponse, writeNodeJsonResponse } from './server/services/hqMissionControlApi.js'
import { createPublicListingsResponse } from './server/services/publicListingsApi.js'

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

const APP_ACCESS_SHELL_FILES = [
  '/src/context/AuthSessionContext.jsx',
  '/src/context/OrganisationContext.jsx',
  '/src/context/WorkspaceContext.jsx',
  '/src/constants/appRoles.js',
  '/src/constants/membershipStatuses.js',
  '/src/constants/onboardingStatuses.js',
  '/src/constants/orgRoles.js',
  '/src/constants/systemRoles.js',
  '/src/constants/workspaceTypes.js',
  '/src/lib/demoIds.js',
  '/src/lib/devAuth.js',
  '/src/lib/envValidation.js',
  '/src/lib/featureFlags.js',
  '/src/lib/mobileAccess.js',
  '/src/lib/onboardingRouting.js',
  '/src/lib/pendingPartnerInvite.js',
  '/src/lib/performanceTrace.js',
  '/src/lib/resolveMobileAwareRedirect.js',
  '/src/lib/roles.js',
  '/src/lib/signupIntent.js',
  '/src/lib/supabaseClient.js',
]

const APP_API_COLOCATED_FILES = [
  '/src/lib/api.js',
  '/src/lib/settingsApi.js',
  '/src/services/workspaceResolutionService.js',
]

const ATTORNEY_WORKFLOW_FACT_FILES = [
  '/src/lib/buyerOnboardingFlow.js',
  '/src/lib/buyerOnboardingFlowContract.js',
  '/src/core/documents/conditionalPackDataRules.js',
  '/src/core/documents/documentPartyClassification.js',
  '/src/core/legal/legalRuleRegistry.js',
]

function appManualChunk(normalizedId) {
  if (!normalizedId.includes('/src/')) return undefined
  if (APP_API_COLOCATED_FILES.some((filePath) => normalizedId.endsWith(filePath))) return 'app-api'
  if (normalizedId.endsWith('/src/services/auditLogService.js')) return 'app-audit'
  if (normalizedId.endsWith('/src/services/agencyAuthorityService.js')) return 'app-agency-governance'
  if (normalizedId.includes('/src/services/onboarding/')) return 'app-onboarding'
  if (
    ATTORNEY_WORKFLOW_FACT_FILES.some((filePath) => normalizedId.endsWith(filePath)) ||
    normalizedId.includes('/src/services/attorneyWorkflow/') ||
    normalizedId.endsWith('/src/constants/attorneyPermissions.js') ||
    normalizedId.endsWith('/src/constants/attorneyUpdateTypes.js') ||
    normalizedId.endsWith('/src/constants/attorneyWorkflowStages.js') ||
    normalizedId.endsWith('/src/constants/attorneyWorkflowUsability.js')
  ) {
    return 'app-api'
  }
  if (APP_ACCESS_SHELL_FILES.some((filePath) => normalizedId.endsWith(filePath))) return 'app-access-shell'
  if (normalizedId.includes('/src/modules/commercial/utils/')) return 'app-commercial-shell'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), missionControlApiPlugin()],
  build: {
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')
          const appChunk = appManualChunk(normalizedId)
          if (appChunk) return appChunk
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
