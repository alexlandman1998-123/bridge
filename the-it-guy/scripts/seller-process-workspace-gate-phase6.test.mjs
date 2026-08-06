import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import {
  SELLER_PROCESS_SHADOW_WORKSPACE_KEY,
  attachSellerProcessShadowIntegration,
  buildSellerLeadWorkspaceShadowIntegration,
  shouldAttachSellerProcessShadowIntegration,
} from '../src/services/sellerProcessWorkspaceIntegrationService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase6Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase6-workspace-gate.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agentLeadWorkspaceSource = readFileSync(resolve(appRoot, 'src/services/agentLeadWorkspaceService.js'), 'utf8')

const liveNonWorkspaceSources = [
  'src/pages/AgentLeadsPage.jsx',
  'src/pages/LegalDocumentWorkspacePage.jsx',
  'src/services/privateListingService.js',
  'src/lib/sellerDocumentRequirementEngine.js',
  'src/services/sellerPortalAppointmentsService.js',
  'src/services/clientPortalNotificationsService.js',
  'src/services/principalDashboardService.js',
  'src/lib/privateListingLifecycle.js',
]

const internalKingstonsKeys = [
  'first_contact',
  'valuation_appointment_scheduled',
  'formal_valuation_completed',
  'valuation_presentation_scheduled',
  'valuation_presented',
  'seller_pack_signed',
  'defects_form_signed',
  'fica_pack_signed',
]

function assertPartnerPayloadHidesInternalKeys(payload) {
  const serialized = JSON.stringify(payload)
  for (const key of internalKingstonsKeys) {
    assert.equal(serialized.includes(key), false, `partner payload must not expose ${key}`)
  }
}

function assertReadOnlyShadow(payload) {
  assert.equal(payload.readOnly, true)
  assert.equal(payload.shadowOnly, true)
  assert.equal(payload.canWrite, false)
  assert.equal(payload.canApplyToRuntime, false)
  assert.equal(payload.sellerLeadWorkspace.canReplaceJourney, false)
  assert.equal(payload.mandateFlow.canFinalizeListing, false)
  assert.equal(payload.listingWorkspace.canActivateListing, false)
  assert.equal(payload.notifications.shouldSend, false)
}

{
  assert.equal(SELLER_PROCESS_SHADOW_WORKSPACE_KEY, 'sellerProcessShadowIntegration')
  assert.equal(shouldAttachSellerProcessShadowIntegration({}), false)
  assert.equal(shouldAttachSellerProcessShadowIntegration({ includeSellerProcessShadowIntegration: true }), true)
  assert.equal(shouldAttachSellerProcessShadowIntegration({ includeSellerProcessShadow: true }), true)
}

{
  const workspace = { row: { leadId: 'lead-default' }, appointments: [] }
  const attached = attachSellerProcessShadowIntegration(workspace, {}, {})
  assert.strictEqual(attached, workspace)
  assert.equal(SELLER_PROCESS_SHADOW_WORKSPACE_KEY in attached, false)
}

{
  const workspace = { row: { leadId: 'lead-default' }, appointments: [] }
  const attached = attachSellerProcessShadowIntegration(workspace, {
    row: { leadId: 'lead-default' },
  }, { includeSellerProcessShadowIntegration: true })
  assert.notStrictEqual(attached, workspace)
  assert.equal(attached[SELLER_PROCESS_SHADOW_WORKSPACE_KEY].profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(attached[SELLER_PROCESS_SHADOW_WORKSPACE_KEY].mode, 'default')
  assertReadOnlyShadow(attached[SELLER_PROCESS_SHADOW_WORKSPACE_KEY])
}

{
  const payload = buildSellerLeadWorkspaceShadowIntegration({
    organisation: {
      name: 'Kingstons Real Estate',
    },
    row: {
      leadId: 'lead-name-only',
      stage: 'Contacted',
    },
  })
  assert.equal(payload.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(payload.mode, 'default')
}

{
  const payload = buildSellerLeadWorkspaceShadowIntegration({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
    row: {
      leadId: 'lead-kingstons',
      status: 'contacted',
      mandatePacketId: 'packet-kingstons',
    },
    appointments: [
      { appointment_type: 'seller_valuation', status: 'completed' },
      { appointment_type: 'valuation_presentation', status: 'confirmed' },
    ],
    listings: [
      {
        id: 'listing-kingstons',
        mandatePacketId: 'packet-kingstons',
        listingStatus: 'created',
        documents: [
          { document_type: 'valuation_document', status: 'uploaded', file_path: 'valuation.pdf' },
        ],
      },
    ],
    documentPackets: [
      { id: 'packet-kingstons', packetType: 'mandate', status: 'sent' },
    ],
  })
  assert.equal(payload.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(payload.mode, 'shadow')
  assert.equal(payload.sellerLeadWorkspace.currentProcessStageKey, 'valuation_presented')
  assert.equal(payload.sellerLeadWorkspace.currentDefaultStageKey, 'seller_onboarding_submitted')
  assert.equal(payload.sellerDocumentCenter.missingDocumentEvidenceKeys.includes('defects_form_signed'), true)
  assert.equal(payload.sellerDocumentCenter.missingDocumentEvidenceKeys.includes('fica_pack_signed'), true)
  assertReadOnlyShadow(payload)
  assertPartnerPayloadHidesInternalKeys(payload.partners)
}

{
  assert.match(agentLeadWorkspaceSource, /includeSellerProcessShadowIntegration = false/)
  assert.match(agentLeadWorkspaceSource, /attachSellerProcessShadowIntegration/)
  assert.match(agentLeadWorkspaceSource, /sellerProcessProfile = ''/)
  assert.match(agentLeadWorkspaceSource, /organisationSettings = null/)
  assert.equal(
    agentLeadWorkspaceSource.includes('sellerProcessShadowIntegrationService'),
    false,
    'workspace fetch should use the gate helper, not the raw shadow service directly',
  )

  for (const file of liveNonWorkspaceSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.equal(
      source.includes('sellerProcessWorkspaceIntegrationService'),
      false,
      `${file} must not consume Phase 6 workspace gate yet`,
    )
  }

  assert.match(phase6Doc, /Default callers remain unchanged/)
  assert.match(phase6Doc, /default-off options/)
  assert.match(phase6Doc, /no UI page imports the workspace integration helper/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-workspace-gate-phase6'],
    'node scripts/seller-process-workspace-gate-phase6.test.mjs',
  )
}

console.log('seller process workspace gate Phase 6 contract passed')
