import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSellerOnboardingSigningAuditExport } from '../src/core/documents/sellerOnboardingSigningLifecycle.js'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const audit = buildSellerOnboardingSigningAuditExport({ signingSessions: [{ signer_name: 'Jane Seller', signer_email: 'JANE@example.test', status: 'signed', signing_group_id: 'group-1', selected_documents: ['fica', 'mandate'], signing_pack_version: 'seller_signing_pack_v1', signing_pack_digest: 'digest-1', signing_pack_frozen_at: '2026-09-19T10:00:00.000Z', signing_acknowledgements: { contract: 'seller_signing_acknowledgements_v1', electronicSignature: true, recordedAt: '2026-09-19T10:01:00.000Z', acceptedDocuments: { fica: true, mandate: true } }, document_progress: { mandate: { signedAt: '2026-09-19T10:01:00.000Z', signedName: 'Jane Seller', signature: 'not-exported' } }, token_hash: 'not-exported' }], replacements: [{ id: 'amendment-1', reason: 'Corrected ID number' }], correctionActivities: [{ id: 'correction-1', activity_type: 'seller_signing_pack_correction_actioned', metadata: { sourceRequestActivityId: 'request-1', signerEmail: 'not-exported' } }] })

assert.equal(audit.signatures[0].signerName, 'Jane Seller')
assert.deepEqual(audit.signatures[0].selectedDocuments, ['fica', 'mandate'])
assert.equal(audit.signatures[0].signingPackVersion, 'seller_signing_pack_v1')
assert.deepEqual(audit.signatures[0].acknowledgements.acceptedDocuments, { fica: true, mandate: true })
assert.equal(audit.signatures[0].acknowledgements.electronicSignature, true)
assert.equal(audit.signatures[0].documentProgress.mandate.signature, undefined)
assert.equal(JSON.stringify(audit).includes('not-exported'), false)
assert.equal(audit.replacements[0].reason, 'Corrected ID number')
assert.equal(audit.correctionActivities[0].sourceRequestActivityId, 'request-1')
assert.match(read('../supabase/functions/listing-mandate-signing/index.ts'), /private_listing_signing_pack_replacements/)
assert.match(read('../supabase/functions/listing-mandate-signing/index.ts'), /signing_acknowledgements/)
assert.match(read('../supabase/functions/listing-mandate-signing/index.ts'), /__acknowledgements/)
assert.match(read('../supabase/migrations/20260920102050_record_listing_seller_signing_acknowledgements_phase7.sql'), /signing_acknowledgements/)
assert.match(read('../supabase/migrations/20260920102050_record_listing_seller_signing_acknowledgements_phase7.sql'), /Confirm electronic signing before submitting/)
assert.match(read('src/pages/AgentListingDetail.jsx'), /Download audit/)
assert.match(read('src/pages/AgentListingDetail.jsx'), /Correction history/)
assert.match(read('src/pages/AgentListingDetail.jsx'), /buildSellerOnboardingSigningAuditExport/)

console.log('Seller signing audit export phase 7 checks passed.')
