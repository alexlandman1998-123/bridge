import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSellerDocumentRequirementRows,
  documentMatchesSellerRequirement,
} from '../src/services/sellerDocumentRequirementsService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const agentLeadsSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const privateListingServiceSource = readFileSync(resolve(appRoot, 'src/services/privateListingService.js'), 'utf8')
const clientPortalSource = readFileSync(resolve(appRoot, 'src/pages/ClientPortal.jsx'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:seller-document-upload-state-persistence'],
  'node scripts/seller-document-upload-state-persistence.test.mjs',
  'package.json should expose the seller document upload-state persistence regression.',
)

const requirement = {
  id: 'requirement-1',
  key: 'signed_fica_form',
  requirement_key: 'signed_fica_form',
  label: 'Signed FICA Form',
  requirement_name: 'Signed FICA Form',
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

const row = rows.find((candidate) => candidate.key === 'signed_fica_form')
assert.equal(row?.status, 'uploaded')
assert.equal(row?.statusLabel, 'Uploaded')
assert.equal(row?.uploadedFileName, 'signed-fica.pdf')
assert.equal(row?.uploadedAt, '2026-08-10T10:00:00.000Z')

assert.match(agencyPipelineSource, /ensurePrivateListingDocumentRequirements\(/)
assert.match(agencyPipelineSource, /linkPrivateListingDocument\(linkedListingId/)
assert.match(agencyPipelineSource, /kingstons_seller_pack_upload_status_sync/)
assert.match(agencyPipelineSource, /\[canonicalRequirementKey\]: uploadedDocument/)
assert.match(agentLeadsSource, /sellerDocumentSupportsAgentUpload\(document\)/)
assert.match(agentLeadsSource, /Agent upload on behalf of seller/)
assert.match(agentLeadsSource, /uploadPrivateListingDocument\(listingId, file/)
assert.match(agentLeadsSource, /requirementId,\s*\n\s*requirementKey,/)
assert.match(agentLeadsSource, /visibility: normalizeText\(document\.visibility\) \|\| 'seller_visible'/)
assert.match(privateListingServiceSource, /getSellerRequiredDocuments/)
assert.match(privateListingServiceSource, /buildSellerPortalUploadRequirementCandidates\(listing, context\)/)
assert.match(privateListingServiceSource, /portalVisibleSlot \? true : requirement\.is_required !== false/)
assert.match(clientPortalSource, /setDocumentActionError\(message\)/)

console.log('Seller document upload-state persistence regression passed.')
