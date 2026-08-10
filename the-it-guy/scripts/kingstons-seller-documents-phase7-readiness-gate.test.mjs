import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = process.cwd()
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

function assertSourceIncludes(token, message) {
  assert.ok(agencyPipelineSource.includes(token), message)
}

assertSourceIncludes(
  'function buildKingstonsSellerPackBaselineDocumentRows',
  'Phase 7 should preserve the three baseline Seller Pack cards separately from generated readiness rows.',
)
assertSourceIncludes(
  'function buildKingstonsSellerPackDocumentRows(lead = {}, {',
  'Phase 7 should build Seller Pack readiness rows from lead/listing/journey context.',
)
assertSourceIncludes(
  'isKingstonsGeneratedSellerPackRequirementRow',
  'Phase 7 should identify generated ownership-driven FICA and authority rows.',
)
assertSourceIncludes(
  'selectedKingstonsSellerPackGeneratedRows',
  'Phase 7 should expose generated legal-path requirements in the overview UI.',
)
assertSourceIncludes(
  'Generated from captured seller details',
  'Phase 7 overview should explain why generated requirements appear.',
)
assertSourceIncludes(
  'buildKingstonsSellerPackListingRequirementRows(documentRows)',
  'Phase 7 listing handoff should create listing requirements from the full readiness row set.',
)
assertSourceIncludes(
  'kingstons_seller_lead_pack_phase7_readiness_gate',
  'Phase 7 listing handoff should carry an explicit readiness-gate marker.',
)
assertSourceIncludes(
  "documentRequirementSection || documentRow.document_requirement_section",
  'Phase 7 metadata should route generated FICA and authority documents by source section.',
)
assertSourceIncludes(
  'authority_documents',
  'Phase 7 handoff should recognise authority document requirements.',
)
assertSourceIncludes(
  'seller_identity_fica',
  'Phase 7 handoff should recognise ownership-driven FICA requirements.',
)
assertSourceIncludes(
  "handleKingstonsSellerPackUpload(documentKey, event, documentRow)",
  'Phase 7 generated overview rows should upload through the existing Seller Pack upload path.',
)

console.log('Kingstons seller documents Phase 7 readiness gate checks passed.')
