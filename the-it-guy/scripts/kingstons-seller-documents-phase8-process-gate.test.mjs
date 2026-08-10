import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { evaluateSellerProcess } from '../src/services/sellerProcessEvaluationService.js'

const appRoot = process.cwd()
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const definitionSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessDefinitionService.js'), 'utf8')
const shadowSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessShadowIntegrationService.js'), 'utf8')

const kingstonsProfile = {
  organisationSettings: {
    sellerProcess: {
      profile: 'kingstons_residential',
    },
  },
}

const baseContext = {
  ...kingstonsProfile,
  activities: [{ activityType: 'seller_contact_call', status: 'completed' }],
  appointments: [
    { appointmentType: 'seller_valuation', status: 'completed' },
    { appointmentType: 'valuation_presentation', status: 'completed' },
  ],
  documents: [
    { key: 'valuation_document', documentType: 'valuation_document', status: 'uploaded', storagePath: 'valuations/formal.pdf' },
  ],
}

function sellerPackDocument({
  key,
  label = key,
  section = '',
  status = 'uploaded',
  storagePath = `seller-pack/${key}.pdf`,
  sellerType = '',
} = {}) {
  return {
    key,
    requirementKey: key,
    documentType: key,
    label,
    title: label,
    source: 'kingstons_seller_pack',
    required: true,
    status,
    storagePath,
    sellerType,
    requirementLane: section ? 'ownership_driven' : '',
    documentRequirementSection: section,
  }
}

{
  const evaluation = evaluateSellerProcess({
    ...baseContext,
    lead: {
      rawEnquiryPayload: {
        kingstonsSellerPack: {
          sellerType: 'natural',
          legalPath: { sellerType: 'natural' },
        },
      },
    },
    documents: [
      ...baseContext.documents,
      sellerPackDocument({ key: 'signed_mandate', label: 'Signed Mandate', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_defect_form', label: 'Signed Defect Form', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_fica_form', label: 'Signed FICA Form', sellerType: 'natural' }),
      sellerPackDocument({
        key: 'owner_fica_alexander_landman',
        label: 'Owner FICA: Alexander Landman',
        section: 'seller_identity_fica',
        status: 'required',
        storagePath: '',
      }),
    ],
  })

  assert.equal(evaluation.evidence.mandate_signed.satisfied, true)
  assert.equal(evaluation.evidence.defects_form_signed.satisfied, true)
  assert.equal(evaluation.evidence.fica_pack_signed.satisfied, true)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.satisfied, false)
  assert.equal(evaluation.currentStage.key, 'seller_pack_signed')
  assert.equal(evaluation.blockers.some((blocker) => blocker.id === 'missing_seller_pack_readiness_complete'), true)
}

{
  const evaluation = evaluateSellerProcess({
    ...baseContext,
    lead: {
      rawEnquiryPayload: {
        kingstonsSellerPack: {
          sellerType: 'natural',
          legalPath: {
            sellerType: 'natural',
            natural: { maritalSetup: 'in_community' },
          },
        },
      },
    },
    documents: [
      ...baseContext.documents,
      sellerPackDocument({ key: 'signed_mandate', label: 'Signed Mandate', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_defect_form', label: 'Signed Defect Form', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_fica_form', label: 'Signed FICA Form', sellerType: 'natural' }),
      sellerPackDocument({
        key: 'owner_fica_alexander_landman',
        label: 'Owner FICA: Alexander Landman',
        section: 'seller_identity_fica',
      }),
      sellerPackDocument({
        key: 'spouse_consent',
        label: 'Spouse Consent',
        section: 'authority_documents',
      }),
    ],
  })

  assert.equal(evaluation.evidence.seller_pack_readiness_complete.satisfied, true)
  assert.equal(evaluation.currentStage.key, 'listing_terms_confirmed')
  assert.equal(evaluation.completedStageKeys.includes('seller_pack_signed'), true)
}

{
  const evaluation = evaluateSellerProcess({
    ...baseContext,
    documents: [
      ...baseContext.documents,
      sellerPackDocument({ key: 'signed_mandate', label: 'Signed Mandate' }),
      sellerPackDocument({ key: 'signed_defect_form', label: 'Signed Defect Form' }),
      sellerPackDocument({ key: 'signed_fica_form', label: 'Signed FICA Form' }),
    ],
  })

  assert.equal(evaluation.evidence.seller_pack_readiness_complete.satisfied, false)
  assert.equal(evaluation.currentStage.key, 'seller_pack_signed')
}

assert.ok(
  definitionSource.includes('seller_pack_readiness_complete') &&
    definitionSource.includes('requiresAllSellerPackDocuments: true'),
  'Phase 8 should define an aggregate Seller Pack readiness evidence gate.',
)
assert.ok(
  shadowSource.includes("'seller_pack_readiness_complete'"),
  'Phase 8 should surface the aggregate Seller Pack readiness key through the mandate-flow payload.',
)
assert.ok(
  agencyPipelineSource.includes('selectedKingstonsSellerPackSummary.complete') &&
    agencyPipelineSource.includes('Finish the full Seller Pack readiness checklist before listing'),
  'Phase 8 should stop the overview CTA from declaring Seller Pack complete before the dynamic readiness summary is complete.',
)

console.log('Kingstons seller documents Phase 8 process gate checks passed.')
