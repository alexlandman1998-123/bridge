import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  OTP_DATA_SOURCE_OWNERS,
  OTP_DOCUMENT_VARIANTS,
  OTP_ROUTE_DIMENSIONS,
  OTP_ROUTE_UNIVERSE_VERSION,
  OTP_SHARED_ROUTE_PACKS,
  buildOtpRouteUniverseAudit,
  normalizeOtpDocumentVariant,
  resolveOtpDocumentVariant,
} from '../src/core/documents/otpRouteUniverse.js'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveLegalDocumentScenarioProfile,
} from '../src/core/documents/legalDocumentScenarioProfile.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-route-universe-phase2'],
  'node scripts/otp-route-universe-phase2.test.mjs',
  'package.json should expose the OTP route universe Phase 2 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-route-universe-phase2'),
  'OTP vNext verification should include Phase 2 route universe checks.',
)

assert.equal(OTP_ROUTE_UNIVERSE_VERSION, 'otp_route_universe_phase2_v1')
assert.deepEqual(
  OTP_DOCUMENT_VARIANTS.map((variant) => variant.key),
  ['resale_existing_property', 'new_development'],
  'OTP should have exactly the two first-class Phase 2 variants.',
)
assert.ok(OTP_ROUTE_DIMENSIONS.documentVariant.includes('resale_existing_property'))
assert.ok(OTP_ROUTE_DIMENSIONS.documentVariant.includes('new_development'))
assert.ok(OTP_ROUTE_DIMENSIONS.buyerParty.includes('individual_customary_marriage'))
assert.ok(OTP_ROUTE_DIMENSIONS.buyerParty.includes('individual_islamic_marriage'))
assert.ok(OTP_ROUTE_DIMENSIONS.buyerParty.includes('foreign_purchaser'))
assert.ok(OTP_ROUTE_DIMENSIONS.sellerParty.includes('developer_seller'))
assert.ok(OTP_ROUTE_DIMENSIONS.propertyTitle.includes('new_development_unit'))
assert.ok(OTP_ROUTE_DIMENSIONS.finance.includes('subject_to_sale_of_purchaser_property'))
assert.ok(OTP_ROUTE_DIMENSIONS.occupation.includes('development_handover'))
assert.ok(OTP_ROUTE_DIMENSIONS.compliance.includes('nhbrc'))

for (const pack of [
  'buyer_co_purchaser_pack',
  'buyer_foreign_purchaser_pack',
  'developer_seller_pack',
  'property_new_development_unit_pack',
  'condition_subject_to_sale_pack',
  'disclosure_defects_pack',
  'transfer_conveyancer_pack',
  'route_aware_signature_pack',
]) {
  assert.ok(OTP_SHARED_ROUTE_PACKS.includes(pack), `shared route packs should include ${pack}`)
}

const ownersByKey = new Map(OTP_DATA_SOURCE_OWNERS.map((owner) => [owner.key, owner]))
assert.ok(ownersByKey.has('buyer_onboarding'))
assert.ok(ownersByKey.has('seller_onboarding'))
assert.ok(ownersByKey.has('development_setup'))
assert.ok(ownersByKey.has('development_unit_setup'))
assert.ok(ownersByKey.has('transaction_offer_terms'))
assert.ok(ownersByKey.has('conveyancer_transfer_assignment'))
assert.ok(ownersByKey.has('organisation_agent_settings'))
assert.ok(ownersByKey.has('legal_template_registry'))
assert.ok(ownersByKey.has('signing_runtime'))

assert.ok(
  ownersByKey.get('buyer_onboarding').mustNotOwn.includes('seller facts'),
  'buyer onboarding must not become the owner of seller facts.',
)
assert.ok(
  ownersByKey.get('buyer_onboarding').mustNotOwn.includes('conveyancer facts'),
  'buyer onboarding must not become the owner of conveyancer facts.',
)
assert.ok(
  ownersByKey.get('transaction_offer_terms').owns.includes('structured suspensive conditions'),
  'transaction offer terms should own structured suspensive conditions.',
)
assert.ok(
  ownersByKey.get('legal_template_registry').owns.includes('definitions'),
  'legal template registry should own definitions.',
)

assert.equal(normalizeOtpDocumentVariant('normal sale'), 'resale_existing_property')
assert.equal(normalizeOtpDocumentVariant('development_sale'), 'new_development')
assert.equal(resolveOtpDocumentVariant({ transaction: { transaction_type: 'off_plan' } }), 'new_development')
assert.equal(resolveOtpDocumentVariant({ property: { development_id: 'dev-123' } }), 'new_development')
assert.equal(resolveOtpDocumentVariant({ property: { title_type: 'full_title' } }), 'resale_existing_property')

const resaleProfile = resolveLegalDocumentScenarioProfile({
  packetType: 'otp',
  placeholders: {
    otp_document_variant: 'resale_existing_property',
    seller_entity_type: 'individual',
    seller_marital_status: 'single',
    buyer_entity_type: 'individual',
    buyer_marital_status: 'single',
    property_title_type: 'full_title',
    finance_type: 'cash',
  },
})
assert.equal(resaleProfile.otpDocumentVariant, 'resale_existing_property')
assert.equal(buildLegalDocumentScenarioPlaceholders(resaleProfile).otp_document_variant, 'resale_existing_property')

const developmentProfile = resolveLegalDocumentScenarioProfile({
  packetType: 'otp',
  transaction: { transaction_type: 'new_development' },
  placeholders: {
    seller_entity_type: 'company',
    buyer_entity_type: 'company',
    property_title_type: 'sectional_title',
    finance_type: 'bond',
  },
})
assert.equal(developmentProfile.otpDocumentVariant, 'new_development')

const audit = buildOtpRouteUniverseAudit({ checkedAt: '2026-08-02T00:00:00.000Z' })
assert.equal(audit.status, 'OTP_ROUTE_UNIVERSE_READY_FOR_INTAKE_DESIGN')
assert.equal(audit.mutatedData, false)
assert.equal(audit.variantOwnerGaps.length, 0)
assert.equal(audit.blockerCodes.length, 0)

console.log('OTP route universe Phase 2 contract passed.')

