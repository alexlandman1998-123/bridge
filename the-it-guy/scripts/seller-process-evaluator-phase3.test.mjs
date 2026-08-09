import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import { evaluateSellerProcess } from '../src/services/sellerProcessEvaluationService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase3Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase3-evaluator-boundary.md'), 'utf8')
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

function assertLiveSourceDoesNotImportEvaluator(source, label) {
  assert.equal(
    source.includes('sellerProcessEvaluationService'),
    false,
    `${label} must not consume Phase 3 evaluator yet`,
  )
}

{
  const evaluation = evaluateSellerProcess({})
  assert.equal(evaluation.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(evaluation.canApplyToRuntime, false)
  assert.equal(JSON.stringify(evaluation).includes('valuation_document'), false)
  assert.equal(JSON.stringify(evaluation).includes('defects_form_signed'), false)
  assert.equal(JSON.stringify(evaluation).includes('fica_pack_signed'), false)
}

{
  const evaluation = evaluateSellerProcess({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
  })
  assert.equal(evaluation.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(evaluation.resolution.configured, false)
  assert.equal(evaluation.canApplyToRuntime, false)
}

{
  const evaluation = evaluateSellerProcess({
    lead: {
      organisation_id: 'ec19d0a6-bcba-4eef-aa72-9972de88204d',
      stage: 'Contacted',
    },
  })
  assert.equal(evaluation.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(evaluation.resolution.organisationScoped, true)
  assert.equal(evaluation.currentStage.key, 'valuation_appointment_scheduled')
  assert.deepEqual(evaluation.completedStageKeys, ['first_contact'])
}

{
  const evaluation = evaluateSellerProcess({
    ...kingstonsProfile,
    activities: [{ activityType: 'seller_contact_call', status: 'completed' }],
    appointments: [
      { appointment_type: 'seller_valuation', status: 'scheduled' },
      { appointment_type: 'valuation_presentation', status: 'confirmed' },
    ],
    documents: [
      { document_type: 'valuation_document', status: 'uploaded', storage_path: 'valuations/valuation.pdf' },
    ],
  })

  assert.equal(evaluation.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(evaluation.runtimeEnabled, false)
  assert.equal(evaluation.canApplyToRuntime, false)
  assert.equal(evaluation.currentStage.key, 'seller_pack_signed')
  assert.deepEqual(evaluation.completedStageKeys, [
    'first_contact',
    'valuation_appointment_scheduled',
    'formal_valuation_completed',
    'valuation_presentation_scheduled',
  ])
  assert.equal(evaluation.evidence.seller_contacted.satisfied, true)
  assert.equal(evaluation.evidence.valuation_appointment_scheduled.satisfied, true)
  assert.equal(evaluation.evidence.valuation_document_uploaded.satisfied, true)
  assert.equal(evaluation.evidence.valuation_presentation_scheduled.satisfied, true)
  assert.equal(evaluation.evidence.mandate_signed.satisfied, false)
  assert.equal(evaluation.blockers.some((blocker) => blocker.id === 'missing_mandate_signed'), true)
  assert.equal(evaluation.partnerReadiness.every((handoff) => handoff.ready === false), true)
}

{
  const evaluation = evaluateSellerProcess({
    ...kingstonsProfile,
    lead: {
      stage: 'Contacted',
      rawEnquiryPayload: {
        kingstonsListingTerms: {
          commissionConfirmed: true,
          transferAttorneyNominated: true,
          commission: { type: 'percentage', percentage: 5, confirmed: true },
          transferAttorney: { companyName: 'Kingstons Conveyancers', email: 'transfers@example.test', nominated: true },
        },
      },
    },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'https://example.test/valuation.pdf' },
      { documentType: 'defects_disclosure_form', status: 'signed', file_path: 'seller/defects.pdf' },
      { documentType: 'seller_fica_pack', status: 'uploaded', file_path: 'seller/fica.pdf' },
    ],
    mandatePacketStatus: {
      packet: { id: 'packet-kingstons', status: 'completed' },
      signingSummary: { allSignersSigned: true },
    },
    listing: {
      id: 'listing-kingstons',
      listingStatus: 'created',
    },
  })

  assert.equal(evaluation.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(evaluation.currentStage.key, 'listing_ready')
  assert.deepEqual(evaluation.completedStageKeys, [
    'first_contact',
    'valuation_appointment_scheduled',
    'formal_valuation_completed',
    'valuation_presentation_scheduled',
    'seller_pack_signed',
    'listing_terms_confirmed',
    'listing_ready',
  ])
  assert.equal(evaluation.blockers.length, 0)
  assert.equal(evaluation.summary.percent, 100)
  assert.equal(evaluation.partnerReadiness.every((handoff) => handoff.ready === true), true)
  assert.equal(evaluation.canApplyToRuntime, false)
}

{
  const evaluation = evaluateSellerProcess({
    sellerProcessProfile: 'kingstons',
    activities: [{ type: 'email', status: 'completed' }],
    appointments: [
      { type: 'seller_valuation', status: 'completed' },
      { type: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { type: 'valuation_document', status: 'completed' },
      { type: 'manual_mandate_evidence', status: 'uploaded', storage_path: 'manual/mandate.pdf' },
      { type: 'defects_form', status: 'uploaded', storage_path: 'manual/defects.pdf' },
      { type: 'fica_pack', status: 'uploaded', storage_path: 'manual/fica.pdf' },
    ],
    listing: {
      listingId: 'listing-manual-evidence',
      status: 'draft',
      commission: { type: 'percentage', percentage: 5 },
      rolePlayers: { transferAttorney: { companyName: 'Kingstons Conveyancers' } },
    },
  })
  assert.equal(evaluation.evidence.mandate_signed.satisfied, true)
  assert.equal(evaluation.evidence.defects_form_signed.satisfied, true)
  assert.equal(evaluation.evidence.fica_pack_signed.satisfied, true)
  assert.equal(evaluation.summary.percent, 100)
  assert.equal(evaluation.canApplyToRuntime, false)
}

{
  assertLiveSourceDoesNotImportEvaluator(sellerJourneySource, 'sellerJourneyService')
  assertLiveSourceDoesNotImportEvaluator(sellerReadinessSource, 'sellerReadinessService')
  assertLiveSourceDoesNotImportEvaluator(sellerRequirementSource, 'sellerDocumentRequirementEngine')
  assertLiveSourceDoesNotImportEvaluator(privateListingLifecycleSource, 'privateListingLifecycle')
  assert.match(phase3Doc, /Runtime Lock/)
  assert.match(phase3Doc, /canApplyToRuntime: false/)
  assert.match(phase3Doc, /does not advance the default private listing lifecycle/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-evaluator-phase3'],
    'node scripts/seller-process-evaluator-phase3.test.mjs',
  )
}

console.log('seller process evaluator Phase 3 contract passed')
