import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import {
  buildSellerProcessPartnerProjection,
  buildSellerProcessProjectionBundle,
  buildSellerProcessSurfaceProjection,
} from '../src/services/sellerProcessProjectionService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase4Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase4-projection-boundary.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const sellerJourneySource = readFileSync(resolve(appRoot, 'src/services/sellerJourneyService.js'), 'utf8')
const sellerReadinessSource = readFileSync(resolve(appRoot, 'src/services/sellerReadinessService.js'), 'utf8')
const sellerRequirementSource = readFileSync(resolve(appRoot, 'src/lib/sellerDocumentRequirementEngine.js'), 'utf8')
const privateListingLifecycleSource = readFileSync(resolve(appRoot, 'src/lib/privateListingLifecycle.js'), 'utf8')

const kingstonsProfile = {
  organisationSettings: {
    sellerProcess: {
      profile: 'kingstons_residential',
    },
  },
}

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

function assertLiveSourceDoesNotImportProjection(source, label) {
  assert.equal(
    source.includes('sellerProcessProjectionService'),
    false,
    `${label} must not consume Phase 4 projection yet`,
  )
}

function assertPartnerProjectionHidesInternalKeys(projection) {
  const serialized = JSON.stringify(projection)
  for (const key of internalKingstonsKeys) {
    assert.equal(serialized.includes(key), false, `partner projection must not expose ${key}`)
  }
}

{
  const projection = buildSellerProcessSurfaceProjection({})
  assert.equal(projection.surface.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(projection.surface.mode, 'default')
  assert.equal(projection.surface.readOnly, true)
  assert.equal(projection.surface.canReplaceJourney, false)
  assert.equal(projection.surface.journeyPatch, null)
  assert.equal(projection.surface.readinessPatch, null)
  assert.deepEqual(projection.surface.completedProcessStageKeys, [])
  assert.deepEqual(projection.surface.missingEvidenceKeys, [])
  assert.equal(JSON.stringify(projection.surface).includes('valuation_presented'), false)
}

{
  const projection = buildSellerProcessSurfaceProjection({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
  })
  assert.equal(projection.surface.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(projection.evaluation.resolution.configured, false)
  assert.equal(projection.surface.mode, 'default')
}

{
  const projection = buildSellerProcessSurfaceProjection({
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
  assert.equal(projection.surface.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(projection.surface.mode, 'shadow')
  assert.equal(projection.surface.runtimeEnabled, false)
  assert.equal(projection.surface.canApplyToRuntime, false)
  assert.equal(projection.surface.canReplaceJourney, false)
  assert.equal(projection.surface.journeyPatch, null)
  assert.equal(projection.surface.readinessPatch, null)
  assert.equal(projection.surface.currentProcessStageKey, 'valuation_presented')
  assert.equal(projection.surface.currentDefaultStageKey, 'seller_onboarding_submitted')
  assert.deepEqual(projection.surface.completedProcessStageKeys, [
    'first_contact',
    'valuation_appointment_scheduled',
    'formal_valuation_completed',
    'valuation_presentation_scheduled',
  ])
  assert.equal(projection.surface.missingEvidenceKeys.includes('valuation_presented'), true)
  assert.equal(projection.reporting.internalOnly, true)
}

{
  const attorneyProjection = buildSellerProcessPartnerProjection({
    ...kingstonsProfile,
    appointments: [
      { appointment_type: 'seller_valuation', status: 'completed' },
    ],
  }, { partnerType: 'attorney_firm' })
  assert.equal(attorneyProjection.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(attorneyProjection.partnerType, 'attorney_firm')
  assert.equal(attorneyProjection.readOnly, true)
  assert.equal(attorneyProjection.ready, false)
  assert.equal(attorneyProjection.exposesInternalProcessStages, false)
  assert.equal(attorneyProjection.blockerCount > 0, true)
  assertPartnerProjectionHidesInternalKeys(attorneyProjection)
}

{
  const bundle = buildSellerProcessProjectionBundle({
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
  assert.equal(bundle.surface.mode, 'shadow')
  assert.equal(bundle.surface.percent, 100)
  assert.equal(bundle.surface.canReplaceJourney, false)
  assert.equal(bundle.partners.attorney_firm.ready, true)
  assert.equal(bundle.partners.bond_originator.ready, true)
  assertPartnerProjectionHidesInternalKeys(bundle.partners.attorney_firm)
  assertPartnerProjectionHidesInternalKeys(bundle.partners.bond_originator)
}

{
  assertLiveSourceDoesNotImportProjection(sellerJourneySource, 'sellerJourneyService')
  assertLiveSourceDoesNotImportProjection(sellerReadinessSource, 'sellerReadinessService')
  assertLiveSourceDoesNotImportProjection(sellerRequirementSource, 'sellerDocumentRequirementEngine')
  assertLiveSourceDoesNotImportProjection(privateListingLifecycleSource, 'privateListingLifecycle')
  assert.match(phase4Doc, /canReplaceJourney: false/)
  assert.match(phase4Doc, /partner projections hide internal Kingstons process keys/i)
  assert.match(phase4Doc, /not wired into dashboards in Phase 4/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-projection-phase4'],
    'node scripts/seller-process-projection-phase4.test.mjs',
  )
}

console.log('seller process projection Phase 4 contract passed')
