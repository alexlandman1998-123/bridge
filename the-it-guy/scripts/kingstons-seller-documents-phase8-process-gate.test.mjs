import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { evaluateSellerProcess } from '../src/services/sellerProcessEvaluationService.js'

const appRoot = process.cwd()
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const definitionSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessDefinitionService.js'), 'utf8')
const shadowSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessShadowIntegrationService.js'), 'utf8')
const evaluationSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessEvaluationService.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

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
  completionRoute = '',
  uploadContext,
  supportingFicaDocumentsDynamic = false,
} = {}) {
  const isFicaDeclaration = key === 'signed_fica_declaration'
  const resolvedCompletionRoute = completionRoute ||
    (isFicaDeclaration && sellerType ? 'physical_upload_with_context' : '')
  const resolvedUploadContext = uploadContext !== undefined
    ? uploadContext
    : isFicaDeclaration && sellerType
      ? { sellerType, contextCapturedAt: '2026-08-15T08:00:00.000Z' }
      : null
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
    seller_type: sellerType,
    completionRoute: resolvedCompletionRoute,
    completion_route: resolvedCompletionRoute,
    physicalUploadContextRequired: isFicaDeclaration && resolvedCompletionRoute !== 'seller_onboarding_link_completed',
    physical_upload_context_required: isFicaDeclaration && resolvedCompletionRoute !== 'seller_onboarding_link_completed',
    uploadContext: resolvedUploadContext,
    upload_context: resolvedUploadContext,
    ficaDeclarationContext: resolvedUploadContext,
    fica_declaration_context: resolvedUploadContext,
    supportingFicaDocumentsDynamic,
    supporting_fica_documents_dynamic: supportingFicaDocumentsDynamic,
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
      sellerPackDocument({ key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_fica_declaration', label: 'Signed FICA Declaration', sellerType: 'natural' }),
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
      sellerPackDocument({ key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_fica_declaration', label: 'Signed FICA Declaration', sellerType: 'natural' }),
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
  assert.equal(evaluation.currentStage.key, 'listing_ready')
  assert.equal(evaluation.completedStageKeys.includes('seller_pack_signed'), true)
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
      sellerPackDocument({ key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', sellerType: 'natural' }),
      sellerPackDocument({
        key: 'signed_fica_declaration',
        label: 'Signed FICA Declaration',
        sellerType: 'natural',
        completionRoute: 'physical_upload',
        uploadContext: null,
      }),
    ],
  })

  assert.equal(evaluation.evidence.fica_pack_signed.satisfied, false)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.satisfied, false)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.contextMissingCount, 1)
  assert.deepEqual(evaluation.evidence.seller_pack_readiness_complete.blockedReasons, [
    'Physical FICA declaration upload is missing seller-context metadata.',
  ])
  assert.equal(evaluation.currentStage.key, 'seller_pack_signed')
  assert.equal(evaluation.blockers.some((blocker) => blocker.id === 'missing_fica_pack_signed'), true)
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
            natural: { maritalSetup: 'unmarried' },
          },
        },
      },
    },
    documents: [
      ...baseContext.documents,
      sellerPackDocument({ key: 'signed_mandate', label: 'Signed Mandate', sellerType: 'natural' }),
      sellerPackDocument({ key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', sellerType: 'natural' }),
      sellerPackDocument({
        key: 'signed_fica_declaration',
        label: 'Signed FICA Declaration',
        sellerType: 'natural',
        completionRoute: 'physical_upload_with_context',
        uploadContext: {
          sellerType: 'natural',
          contextCapturedAt: '2026-08-15T08:00:00.000Z',
        },
      }),
    ],
  })

  assert.equal(evaluation.evidence.fica_pack_signed.satisfied, true)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.contextMissingCount, 0)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.satisfied, true)
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
      sellerPackDocument({ key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form', sellerType: 'natural' }),
      sellerPackDocument({
        key: 'signed_fica_declaration',
        label: 'Signed FICA Declaration',
        status: 'completed',
        storagePath: '',
        sellerType: 'natural',
        completionRoute: 'seller_onboarding_link_completed',
        supportingFicaDocumentsDynamic: true,
      }),
    ],
  })

  assert.equal(evaluation.evidence.fica_pack_signed.satisfied, true)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.satisfied, true)
  assert.equal(evaluation.evidence.seller_pack_readiness_complete.contextMissingCount, 0)
}

{
  const evaluation = evaluateSellerProcess({
    ...baseContext,
    documents: [
      ...baseContext.documents,
      sellerPackDocument({ key: 'signed_mandate', label: 'Signed Mandate' }),
      sellerPackDocument({ key: 'signed_disclosure_form', label: 'Signed Mandatory Disclosure / Defects Form' }),
      sellerPackDocument({ key: 'signed_fica_declaration', label: 'Signed FICA Declaration' }),
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
  definitionSource.includes('SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT') &&
    definitionSource.includes('SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK'),
  'Phase 8 should keep the FICA declaration process definition route-aware.',
)
assert.ok(
  evaluationSource.includes('sellerPackFicaDeclarationRequiresPhysicalContext') &&
    evaluationSource.includes('Physical FICA declaration upload is missing seller-context metadata.'),
  'Phase 8 should block process readiness when a physical FICA declaration upload lacks seller context.',
)
assert.equal(
  packageJson.scripts?.['test:kingstons-seller-documents-phase8-process-gate'],
  'node scripts/kingstons-seller-documents-phase8-process-gate.test.mjs',
  'Package scripts should expose the Phase 8 Seller Pack process gate guard.',
)
assert.ok(
  shadowSource.includes("'seller_pack_readiness_complete'"),
  'Phase 8 should surface the aggregate Seller Pack readiness key through the mandate-flow payload.',
)
assert.ok(
  agencyPipelineSource.includes('selectedLeadHasKingstonsPipelineSignal && !selectedKingstonsSellerPackSummary.complete') &&
    agencyPipelineSource.includes('Complete the Kingston Seller Pack before creating the listing. Still needed:'),
  'Phase 8 should stop the overview CTA from declaring Seller Pack complete before the dynamic readiness summary is complete.',
)

console.log('Kingstons seller documents Phase 8 process gate checks passed.')
