import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSellerOnboardingSigningAuditExport } from '../src/core/documents/sellerOnboardingSigningLifecycle.js'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const audit = buildSellerOnboardingSigningAuditExport({ signingSessions: [{ signer_name: 'Jane Seller', signer_email: 'JANE@example.test', status: 'signed', signing_group_id: 'group-1', selected_documents: ['fica', 'mandate'], signing_pack_version: 'seller_signing_pack_v1', signing_pack_digest: 'digest-1', signing_pack_frozen_at: '2026-09-19T10:00:00.000Z' }], replacements: [{ id: 'amendment-1', reason: 'Corrected ID number' }] })

assert.equal(audit.signatures[0].signerName, 'Jane Seller')
assert.deepEqual(audit.signatures[0].selectedDocuments, ['fica', 'mandate'])
assert.equal(audit.signatures[0].signingPackVersion, 'seller_signing_pack_v1')
assert.equal(audit.replacements[0].reason, 'Corrected ID number')
assert.match(read('../supabase/functions/listing-mandate-signing/index.ts'), /private_listing_signing_pack_replacements/)
assert.match(read('src/pages/AgentListingDetail.jsx'), /Download audit/)
assert.match(read('src/pages/AgentListingDetail.jsx'), /Correction history/)
assert.match(read('src/pages/AgentListingDetail.jsx'), /buildSellerOnboardingSigningAuditExport/)

console.log('Seller signing audit export phase 7 checks passed.')
