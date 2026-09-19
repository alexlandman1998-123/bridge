import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS,
  buildSellerMandateAcknowledgementEvidence,
  getRequiredSellerMandateAcknowledgements,
} from '../src/core/documents/sellerMandateAcknowledgementPolicy.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const migration = await readFile(resolve(root, '../supabase/migrations/20260918201300_seller_mandate_terms_acknowledgements_phase2.sql'), 'utf8')
const termsPolicy = {
  organisationId: 'agency-1', version: 'agency-terms-v1', contentDigest: `sha256:${'b'.repeat(64)}`,
  effectiveAt: '2026-09-18T00:00:00.000Z', status: 'APPROVED', approvedBy: 'Counsel', approvedAt: '2026-09-18T10:00:00.000Z',
  privacyNoticeUrl: 'https://agency.example/privacy', paiaManualUrl: 'https://agency.example/paia',
  informationOfficerName: 'Privacy Officer', informationOfficerEmail: 'privacy@agency.example',
  sections: ['mandate_terms', 'privacy_notice_summary', 'paia_access_information', 'electronic_communications_and_signing', 'records_and_audit_trail'].map((key) => ({ key, body: key })),
}
const required = getRequiredSellerMandateAcknowledgements({ termsPolicy, isSecondarySigner: true, hasProposedTransferAttorney: true })
assert.deepEqual(required, [
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.termsAcceptance,
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.accuracyAndAuthority,
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.privacyAndPaiaNotice,
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.electronicCommunicationsAndSigning,
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.sharedInformationReview,
  SELLER_MANDATE_ACKNOWLEDGEMENT_KEYS.proposedTransferAttorney,
])
const accepted = Object.fromEntries(required.map((key) => [key, true]))
const evidence = buildSellerMandateAcknowledgementEvidence({ termsPolicy, accepted, signer: { name: 'Seller', email: 'SELLER@example.test' }, isSecondarySigner: true, hasProposedTransferAttorney: true })
assert.equal(evidence.termsVersion, 'agency-terms-v1')
assert.equal(evidence.signerEmail, 'seller@example.test')
assert.equal(evidence.acknowledgements.length, required.length)
assert.throws(() => buildSellerMandateAcknowledgementEvidence({ termsPolicy, accepted: {} }), /Required acknowledgements are missing/)
assert.match(migration, /private_listing_signing_acknowledgements/)
assert.match(migration, /unique \(signing_session_id, acknowledgement_key\)/)
assert.match(migration, /frozen terms version/)
assert.match(migration, /grant execute on function public\.bridge_record_private_listing_signing_acknowledgements[\s\S]*to service_role/)
assert.match(migration, /revoke all on table public\.private_listing_signing_acknowledgements from public, anon, authenticated/)

console.log('Seller mandate terms Phase 2 checks passed.')
