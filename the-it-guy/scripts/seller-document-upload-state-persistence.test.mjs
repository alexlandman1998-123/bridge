import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSellerDocumentRequirementRows,
  buildSellerDocumentSourceOfTruth,
  documentMatchesSellerRequirement,
} from '../src/services/sellerDocumentRequirementsService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const sellerPackStoragePolicyMigration = readFileSync(
  resolve(appRoot, '../supabase/migrations/20260817204613_kingstons_seller_pack_storage_policy_fix.sql'),
  'utf8',
)

assert.equal(
  packageJson.scripts?.['test:seller-document-upload-state-persistence'],
  'node scripts/seller-document-upload-state-persistence.test.mjs',
  'package.json should expose the seller document upload-state persistence regression.',
)

const requirement = {
  id: 'requirement-1',
  key: 'signed_fica_declaration',
  requirement_key: 'signed_fica_declaration',
  label: 'Signed FICA Declaration',
  requirement_name: 'Signed FICA Declaration',
  requirement_group: 'legal',
  status: 'required',
  is_required: true,
}

const uploadedDocument = {
  id: 'document-1',
  requirementId: 'requirement-1',
  requirement_id: 'requirement-1',
  document_type: 'signed_fica_form',
  category: 'legal',
  document_name: 'signed-fica.pdf',
  file_name: 'signed-fica.pdf',
  storage_path: 'kingstons-seller-pack/org/lead/signed_fica_form/signed-fica.pdf',
  status: 'uploaded',
  uploaded_at: '2026-08-10T10:00:00.000Z',
}

assert.equal(documentMatchesSellerRequirement(uploadedDocument, requirement), true)

const rows = buildSellerDocumentRequirementRows({
  listing: {
    id: 'listing-1',
    documents: [uploadedDocument],
  },
  documents: [],
  formData: {
    requiredDocuments: [requirement],
  },
})

const row = rows.find((candidate) => candidate.key === 'signed_fica_declaration')
assert.equal(row?.status, 'uploaded')
assert.equal(row?.statusLabel, 'Uploaded')
assert.equal(row?.uploadedFileName, 'signed-fica.pdf')
assert.equal(row?.uploadedAt, '2026-08-10T10:00:00.000Z')

const kingstonsValuationOnlySource = buildSellerDocumentSourceOfTruth({
  listing: {
    id: 'listing-kingstons-valuation-only',
    organisationId: 'kingstons',
    sellerProcessProfile: 'kingstons_residential',
    lifecycleStatus: 'seller_lead',
    rawEnquiryPayload: {
      kingstonsSellerPack: {
        documents: {
          valuation_document: {
            key: 'valuation_document',
            requirementKey: 'valuation_document',
            documentType: 'valuation_document',
            label: 'Formal Valuation Document',
            title: 'Formal Valuation Document',
            category: 'property',
            document_category: 'property',
            status: 'uploaded',
            storagePath: 'valuations/formal.pdf',
            url: 'https://example.test/formal.pdf',
          },
        },
      },
    },
  },
})

const valuationOnlyRows = new Map(kingstonsValuationOnlySource.rows.map((candidate) => [candidate.key, candidate]))
assert.equal(valuationOnlyRows.get('valuation_document')?.status, 'uploaded')
assert.equal(valuationOnlyRows.get('valuation_document')?.upload?.filePath, 'valuations/formal.pdf')
assert.equal(valuationOnlyRows.get('signed_disclosure_form')?.status, 'required')
assert.equal(valuationOnlyRows.get('signed_disclosure_form')?.hasUpload, false)
assert.equal(valuationOnlyRows.get('signed_disclosure_form')?.upload, null)

assert.match(agencyPipelineSource, /ensurePrivateListingDocumentRequirements\(/)
assert.match(agencyPipelineSource, /linkPrivateListingDocument\(linkedListingId/)
assert.match(agencyPipelineSource, /kingstons_seller_pack_upload_status_sync/)
assert.match(agencyPipelineSource, /\[canonicalRequirementKey\]: uploadedDocument/)
assert.match(agencyPipelineSource, /key === KINGSTONS_FORMAL_VALUATION_DOCUMENT\.key/)
assert.match(agencyPipelineSource, /KINGSTONS_SELLER_PACK_STORAGE_FOLDER = 'kingstons-seller-pack'/)
assert.match(
  sellerPackStoragePolicyMigration,
  /v_root in \('kingstons-formal-valuations', 'kingstons-seller-pack'\)/,
)
assert.match(
  sellerPackStoragePolicyMigration,
  /bridge_can_access_assignment\(v_organisation_id, v_assigned_agent_id, null\)/,
)

console.log('Seller document upload-state persistence regression passed.')
