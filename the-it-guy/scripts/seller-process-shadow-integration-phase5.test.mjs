import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import {
  buildSellerProcessShadowIntegration,
  listSellerProcessShadowIntegrationSurfaceKeys,
} from '../src/services/sellerProcessShadowIntegrationService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase5Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase5-shadow-integration.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const liveSourceFiles = [
  'src/services/agentLeadWorkspaceService.js',
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

const expectedSurfaceKeys = [
  'sellerLeadWorkspace',
  'mandateFlow',
  'listingWorkspace',
  'sellerDocumentCenter',
  'appointments',
  'activityTimeline',
  'notifications',
  'reportingDashboard',
  'partners',
]

const kingstonsProfile = {
  organisationSettings: {
    sellerProcess: {
      profile: 'kingstons_residential',
    },
  },
}

function assertNoLivePatch(payload, label) {
  assert.equal(payload.readOnly, true, `${label} should be read-only`)
  assert.equal(payload.shadowOnly, true, `${label} should be shadow-only`)
  assert.equal(payload.canWrite, false, `${label} should not write`)
  assert.equal(payload.canMutate, false, `${label} should not mutate`)
  assert.equal(payload.canReplaceJourney, false, `${label} should not replace journey`)
  assert.equal(payload.canApplyToRuntime, false, `${label} should not apply to runtime`)
  assert.equal(payload.journeyPatch, null, `${label} should not emit journey patch`)
  assert.equal(payload.readinessPatch, null, `${label} should not emit readiness patch`)
  assert.equal(payload.listingPatch, null, `${label} should not emit listing patch`)
}

function assertPartnerPayloadHidesInternalKeys(payload) {
  const serialized = JSON.stringify(payload)
  for (const key of internalKingstonsKeys) {
    assert.equal(serialized.includes(key), false, `partner payload must not expose ${key}`)
  }
}

{
  assert.deepEqual(listSellerProcessShadowIntegrationSurfaceKeys(), expectedSurfaceKeys)
}

{
  const integration = buildSellerProcessShadowIntegration({})
  assert.equal(integration.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(integration.mode, 'default')
  assert.equal(integration.readOnly, true)
  assert.equal(integration.shadowOnly, true)
  assert.equal(integration.canWrite, false)
  assert.equal(integration.canApplyToRuntime, false)
  assert.deepEqual(integration.surfaceKeys, expectedSurfaceKeys)
  assert.deepEqual(integration.sellerLeadWorkspace.completedProcessStageKeys, [])
  assert.deepEqual(integration.sellerLeadWorkspace.missingEvidenceKeys, [])
  assert.equal(JSON.stringify(integration).includes('valuation_presented'), false)
}

{
  const integration = buildSellerProcessShadowIntegration({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
  })
  assert.equal(integration.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(integration.mode, 'default')
}

{
  const integration = buildSellerProcessShadowIntegration({
    ...kingstonsProfile,
    activities: [{ activityType: 'seller_contact_call', status: 'completed' }],
    appointments: [
      { appointment_type: 'seller_valuation', status: 'completed' },
      { appointment_type: 'valuation_presentation', status: 'confirmed' },
    ],
    documents: [
      { document_type: 'valuation_document', status: 'uploaded', file_path: 'valuation.pdf' },
    ],
  })

  assert.equal(integration.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(integration.mode, 'shadow')
  assert.equal(integration.canApplyToRuntime, false)
  assert.equal(integration.sellerLeadWorkspace.currentProcessStageKey, 'valuation_presented')
  assert.equal(integration.sellerLeadWorkspace.currentDefaultStageKey, 'seller_onboarding_submitted')
  assert.equal(integration.sellerLeadWorkspace.missingEvidenceKeys.includes('valuation_presented'), true)
  assert.deepEqual(integration.mandateFlow.missingSellerPackEvidenceKeys, [
    'mandate_signed',
    'defects_form_signed',
    'fica_pack_signed',
  ])
  assert.equal(integration.mandateFlow.canFinalizeListing, false)
  assert.equal(integration.mandateFlow.canMarkMandateSigned, false)
  assert.equal(integration.listingWorkspace.canActivateListing, false)
  assert.equal(integration.listingWorkspace.canPublishListing, false)
  assert.equal(integration.appointments.canScheduleAutomatically, false)
  assert.deepEqual(integration.appointments.appointmentRequestDrafts, [])
  assert.equal(integration.activityTimeline.canWriteTimeline, false)
  assert.equal(integration.notifications.shouldSend, false)
  assert.equal(integration.notifications.shouldQueue, false)
  assert.equal(integration.reportingDashboard.internalOnly, true)

  for (const key of expectedSurfaceKeys.filter((surfaceKey) => surfaceKey !== 'partners')) {
    assertNoLivePatch(integration[key], key)
  }
  assertPartnerPayloadHidesInternalKeys(integration.partners)
}

{
  const integration = buildSellerProcessShadowIntegration({
    ...kingstonsProfile,
    lead: { status: 'contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
      { documentType: 'defects_disclosure_form', status: 'signed', file_path: 'defects.pdf' },
      { documentType: 'seller_fica_pack', status: 'uploaded', file_path: 'fica.pdf' },
    ],
    mandatePacketStatus: {
      packet: { id: 'packet-kingstons', status: 'completed' },
      signingSummary: { allSignersSigned: true },
    },
    listing: { id: 'listing-kingstons', listingStatus: 'created' },
  })

  assert.equal(integration.sellerLeadWorkspace.percent, 100)
  assert.equal(integration.reportingDashboard.percent, 100)
  assert.equal(integration.partners.attorneyFirm.ready, true)
  assert.equal(integration.partners.bondOriginator.ready, true)
  assertPartnerPayloadHidesInternalKeys(integration.partners)
  assert.equal(integration.notifications.notificationPatch, null)
  assert.deepEqual(integration.notifications.notificationDrafts, [])
}

{
  for (const file of liveSourceFiles) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.equal(
      source.includes('sellerProcessShadowIntegrationService'),
      false,
      `${file} must not consume Phase 5 shadow integration yet`,
    )
  }
  assert.match(phase5Doc, /read-only surface payloads/)
  assert.match(phase5Doc, /not wire those payloads into live app surfaces/)
  assert.match(phase5Doc, /partner payloads do not expose Kingston internal workflow keys/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-shadow-integration-phase5'],
    'node scripts/seller-process-shadow-integration-phase5.test.mjs',
  )
}

console.log('seller process shadow integration Phase 5 contract passed')
