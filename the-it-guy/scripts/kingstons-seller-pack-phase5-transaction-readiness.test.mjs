import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION,
  buildKingstonsSellerPackTransactionReadiness,
} from '../src/core/transactions/kingstonsSellerPackTransactionReadiness.js'
import { SELLER_BASE_PACK_COMPLETION_ROUTES } from '../src/lib/sellerBasePackContract.js'
import { buildSellerDocumentSourceOfTruth } from '../src/services/sellerDocumentRequirementsService.js'

const repoRoot = process.cwd()
const unitDetailPath = path.join(repoRoot, 'src/pages/UnitDetail.jsx')
const unitDetail = fs.readFileSync(unitDetailPath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

const healthy = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    {
      id: 'doc-1',
      name: 'Signed mandate.pdf',
      document_type: 'signed_mandate',
      source: 'seller_portal',
      source_document_id: 'listing-doc-1',
      status: 'approved',
    },
    {
      id: 'doc-2',
      name: 'Defect disclosure.pdf',
      document_type: 'signed_disclosure_form',
      source: 'seller_portal',
      source_document_id: 'listing-doc-2',
      status: 'uploaded',
    },
    {
      id: 'doc-3',
      name: 'Signed FICA declaration.pdf',
      document_type: 'signed_fica_declaration',
      source: 'seller_onboarding.fica_declaration',
      source_document_id: 'listing-doc-3',
      status: 'verified',
      completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK,
      supportingFicaDocumentsDynamic: true,
    },
  ],
})

assert.equal(healthy.version, KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION)
assert.equal(healthy.gate.status, 'pass')
assert.equal(healthy.gate.attorneyHandoffReady, true)
assert.equal(healthy.summary.ready, 3)
assert.equal(healthy.rows.every((row) => row.sourceDocumentId), true)
assert.equal(healthy.rows.find((row) => row.key === 'signed_fica_declaration')?.completionRoute, 'seller_onboarding_link_completed')
assert.equal(healthy.rows.find((row) => row.key === 'signed_fica_declaration')?.supportingFicaDocumentsDynamic, true)

const sourceOfTruthRows = buildSellerDocumentSourceOfTruth({
  listing: {
    id: 'listing-source-phase5',
    sellerOnboarding: {
      status: 'completed',
      formData: {
        sellerType: 'natural_person',
        propertyDisclosure: {
          generatedDocument: {
            id: 'disclosure-source-phase5',
            title: 'Property Condition Disclosure',
          },
        },
      },
    },
  },
  mandatePacket: {
    state: 'completed',
    packet: { id: 'packet-source-phase5', status: 'completed' },
    version: {
      id: 'version-source-phase5',
      final_signed_file_path: 'mandates/listing-source-phase5/signed-mandate.pdf',
      final_signed_file_name: 'Signed Mandate.pdf',
    },
  },
}).rows
const sourceOfTruthReadiness = buildKingstonsSellerPackTransactionReadiness({
  documents: sourceOfTruthRows,
})
assert.equal(sourceOfTruthReadiness.gate.status, 'pass')
assert.equal(
  sourceOfTruthReadiness.rows.find((row) => row.key === 'signed_fica_declaration')?.completionRoute,
  'seller_onboarding_link_completed',
)

const physicalWithContext = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    ...healthy.rows.slice(0, 2).map((row) => row.document),
    {
      id: 'doc-physical-fica',
      name: 'Signed FICA declaration.pdf',
      document_type: 'signed_fica_declaration',
      source: 'seller_portal',
      source_document_id: 'listing-doc-physical-fica',
      status: 'uploaded',
      completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT,
      uploadContext: {
        sellerType: 'juristic',
        contextCapturedAt: '2026-07-20T08:00:00.000Z',
      },
    },
  ],
})
assert.equal(physicalWithContext.gate.status, 'pass')
assert.equal(physicalWithContext.rows.find((row) => row.key === 'signed_fica_declaration')?.hasFicaDeclarationPhysicalUploadContext, true)

const physicalWithoutContext = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    ...healthy.rows.slice(0, 2).map((row) => row.document),
    {
      id: 'doc-physical-fica-no-context',
      name: 'Signed FICA declaration.pdf',
      document_type: 'signed_fica_declaration',
      source: 'seller_portal',
      source_document_id: 'listing-doc-physical-fica-no-context',
      status: 'uploaded',
      completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT,
    },
  ],
})
assert.equal(physicalWithoutContext.gate.status, 'blocked')
assert.equal(physicalWithoutContext.summary.attention, 1)
assert.equal(
  physicalWithoutContext.blockers.find((blocker) => blocker.documentKey === 'signed_fica_declaration')?.reason,
  'Physical FICA declaration upload is missing seller-context metadata.',
)

const missing = buildKingstonsSellerPackTransactionReadiness({
  documents: healthy.rows.slice(0, 2).map((row) => row.document),
})
assert.equal(missing.gate.status, 'blocked')
assert.equal(missing.gate.attorneyHandoffReady, false)
assert.equal(missing.summary.missing, 1)
assert.equal(missing.blockers.some((blocker) => blocker.documentKey === 'signed_fica_declaration'), true)

const attention = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    ...healthy.rows.slice(0, 2).map((row) => row.document),
    {
      id: 'doc-3',
      name: 'Signed FICA declaration.pdf',
      document_type: 'signed_fica_declaration',
      source: 'seller_portal',
      source_document_id: 'listing-doc-3',
      status: 'rejected',
    },
  ],
})
assert.equal(attention.gate.status, 'blocked')
assert.equal(attention.summary.attention, 1)
assert.equal(attention.rows.find((row) => row.key === 'signed_fica_declaration')?.state, 'attention')

const certificateDoesNotSatisfyFica = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    ...healthy.rows.slice(0, 2).map((row) => row.document),
    {
      id: 'doc-gas',
      name: 'Gas compliance certificate.pdf',
      document_type: 'gas_compliance_certificate',
      status: 'uploaded',
    },
  ],
})
assert.equal(certificateDoesNotSatisfyFica.gate.status, 'blocked')
assert.equal(certificateDoesNotSatisfyFica.rows.find((row) => row.key === 'signed_fica_declaration')?.state, 'missing')

assertIncludes(
  unitDetail,
  'buildKingstonsSellerPackTransactionReadiness',
  'Transaction workspace must build Seller Pack readiness from transaction documents.',
)
assertIncludes(
  unitDetail,
  'Signed Seller Pack',
  'Transaction Documents tab must render the Signed Seller Pack readiness panel.',
)
assertIncludes(
  unitDetail,
  'shouldShowSellerPackTransactionReadiness',
  'Seller Pack readiness panel must be scoped to listing-origin or Seller Pack transactions.',
)
assertIncludes(
  unitDetail,
  'sellerPackTransactionReadiness.gate.attorneyHandoffReady',
  'Phase 5 UI must expose the attorney handoff gate status.',
)
assertIncludes(
  unitDetail,
  'Completion route:',
  'Phase 5 UI must expose Seller Pack completion routes.',
)
assertIncludes(
  unitDetail,
  'FICA context:',
  'Phase 5 UI must expose physical FICA declaration context status.',
)

console.log('Kingstons seller pack phase 5 transaction readiness guard passed.')
