import assert from 'node:assert/strict'
import {
  buildAgencyPublicIntakeAutomationEvent,
  buildAgencyPublicIntakeCrmRows,
  buildAgencyPublicIntakeContract,
  createPublicAgencyIntakeResponse,
  normalizeAgencyIntakeSlug,
  validateAgencyIntakeSubmission,
} from '../services/publicAgencyIntakeApi.js'

assert.equal(normalizeAgencyIntakeSlug(' Kingstons-Atlantic '), 'kingstons-atlantic')

const contract = buildAgencyPublicIntakeContract({
  host: 'https://app.arch9.co.za/',
  link: {
    slug: 'kingstons-atlantic',
    heading: 'Find your next move',
    introduction: 'Tell us what you need.',
    enabled_intents: ['SELL', 'buy', 'buy'],
    privacy_policy_version: 'privacy-v2',
    buyer_config_json: { budgetRequired: true },
    seller_config_json: { valuationRequired: true },
    listing_match_config_json: { maxListings: 12 },
    attribution_config_json: { defaultCampaign: 'instagram-july' },
    updated_at: '2026-07-29T10:00:00.000Z',
  },
  organisation: {
    id: 'hidden-org-id',
    name: 'Kingstons Realty',
  },
  branding: {
    agencyName: 'Kingstons Atlantic',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColour: '#064537',
    contactEmail: 'hello@kingstons.test',
    social: { instagram: 'https://instagram.example/kingstons' },
  },
})

assert.equal(contract.slug, 'kingstons-atlantic')
assert.equal(contract.intakeUrl, 'https://app.arch9.co.za/intake/kingstons-atlantic')
assert.equal(contract.agency.name, 'Kingstons Atlantic')
assert.deepEqual(contract.intake.enabledIntents, ['buy', 'sell'])
assert.equal(contract.intake.privacyPolicyVersion, 'privacy-v2')
assert.equal(contract.config.buyer.budgetRequired, true)
assert.equal(contract.organisation_id, undefined)
assert.equal(contract.agency.organisationId, undefined)

const validSubmission = validateAgencyIntakeSubmission({
  slug: 'kingstons-atlantic',
  intent: 'buy',
  idempotencyKey: 'buyer-intake-0001',
  contact: {
    name: 'Avery Buyer',
    email: 'avery@example.com',
  },
  requirement: {
    budgetMin: 1500000,
    budgetMax: 2500000,
  },
  selectedListings: ['modern-home-abc123'],
  privacyConsent: true,
  privacyPolicyVersion: 'privacy-v2',
}, {
  slug: 'kingstons-atlantic',
  enabled_intents: ['buy', 'sell'],
})

assert.deepEqual(validSubmission.errors, {})
assert.equal(validSubmission.normalized.intent, 'buy')
assert.equal(validSubmission.normalized.contactEmail, 'avery@example.com')
assert.equal(validSubmission.normalized.selectedListings[0].slug, 'modern-home-abc123')

const buyerCrmRows = buildAgencyPublicIntakeCrmRows({
  nowIso: '2026-07-29T10:00:00.000Z',
  link: {
    organisation_id: '11111111-1111-4111-8111-111111111111',
    lead_source_label: 'Public Intake',
    source_channel: 'website',
    default_branch_id: '22222222-2222-4222-8222-222222222222',
    default_assigned_agent_id: '33333333-3333-4333-8333-333333333333',
  },
  submission: {
    idempotency_key: 'buyer-intake-0001',
    contact_name: 'Avery Buyer',
    contact_email: 'avery@example.com',
    budget_min: 1500000,
    budget_max: 2500000,
    selected_listings_json: [{ id: '44444444-4444-4444-8444-444444444444' }],
    payload_json: { message: 'Looking in Bedfordview' },
  },
  normalized: {
    ...validSubmission.normalized,
    requirement: {
      areas: 'Bedfordview, Edenvale',
      propertyType: 'House',
      bedroomsMin: 3,
      financeStatus: 'pre_approved',
      timeline: '1_3_months',
    },
  },
})

assert.equal(buyerCrmRows.contactRow.first_name, 'Avery')
assert.equal(buyerCrmRows.contactRow.last_name, 'Buyer')
assert.equal(buyerCrmRows.leadRow.lead_category, 'buyer')
assert.equal(buyerCrmRows.leadRow.lead_source, 'Public Intake')
assert.equal(buyerCrmRows.leadRow.branch_id, '22222222-2222-4222-8222-222222222222')
assert.equal(buyerCrmRows.leadRow.assigned_agent_id, '33333333-3333-4333-8333-333333333333')
assert.equal(buyerCrmRows.leadRow.enquired_listing_id, '44444444-4444-4444-8444-444444444444')
assert.deepEqual(buyerCrmRows.requirementRow.areas, ['Bedfordview', 'Edenvale'])
assert.deepEqual(buyerCrmRows.requirementRow.property_types, ['House'])
assert.equal(buyerCrmRows.requirementRow.finance_status, 'pre_approved')
assert.equal(buyerCrmRows.requirementRow.timeline, '0_3_months')

const buyerAutomationEvent = buildAgencyPublicIntakeAutomationEvent({
  rows: {
    ...buyerCrmRows,
    activity: { activity_id: '55555555-5555-4555-8555-555555555555' },
    task: { task_id: '66666666-6666-4666-8666-666666666666' },
    listingInterests: [{ interest_id: '77777777-7777-4777-8777-777777777777' }],
  },
  submission: {
    id: '88888888-8888-4888-8888-888888888888',
    idempotency_key: 'buyer-intake-0001',
    contact_name: 'Avery Buyer',
    contact_email: 'avery@example.com',
    budget_min: 1500000,
    budget_max: 2500000,
    source_channel: 'website',
    campaign_code: 'instagram-july',
    payload_json: { message: 'Looking in Bedfordview' },
  },
  normalized: {
    ...validSubmission.normalized,
    contactName: 'Avery Buyer',
    sourceChannel: 'website',
    campaignCode: 'instagram-july',
  },
})

assert.equal(buyerAutomationEvent.automation_key, 'agency_public_intake_received')
assert.equal(buyerAutomationEvent.organisation_id, '11111111-1111-4111-8111-111111111111')
assert.equal(buyerAutomationEvent.branch_id, '22222222-2222-4222-8222-222222222222')
assert.equal(buyerAutomationEvent.assigned_user_id, '33333333-3333-4333-8333-333333333333')
assert.equal(buyerAutomationEvent.lead_id, buyerCrmRows.leadId)
assert.equal(buyerAutomationEvent.listing_id, '44444444-4444-4444-8444-444444444444')
assert.equal(buyerAutomationEvent.trigger_type, 'system_event')
assert.equal(buyerAutomationEvent.channel, 'in_app')
assert.equal(buyerAutomationEvent.status, 'prepared')
assert.equal(buyerAutomationEvent.recipient_role, 'agent')
assert.equal(buyerAutomationEvent.subject, 'Buyer public intake received')
assert.equal(buyerAutomationEvent.dedupe_key, 'agency_public_intake:88888888-8888-4888-8888-888888888888:agent_handoff')
assert.equal(buyerAutomationEvent.payload_json.communicationType, 'agency_public_intake_received')
assert.equal(buyerAutomationEvent.payload_json.campaignCode, 'instagram-july')
assert.deepEqual(buyerAutomationEvent.payload_json.selectedListingIds, ['44444444-4444-4444-8444-444444444444'])
assert.deepEqual(buyerAutomationEvent.payload_json.listingInterestIds, ['77777777-7777-4777-8777-777777777777'])
assert.equal(buyerAutomationEvent.payload_json.taskId, '66666666-6666-4666-8666-666666666666')
assert.equal(buyerAutomationEvent.metadata_json.handoffRequired, true)
assert.equal(buyerAutomationEvent.metadata_json.phase, 'agency_public_intake_phase8')

const sellerCrmRows = buildAgencyPublicIntakeCrmRows({
  nowIso: '2026-07-29T10:00:00.000Z',
  link: {
    organisation_id: '11111111-1111-4111-8111-111111111111',
    lead_source_label: 'Instagram Campaign',
    source_channel: 'instagram',
  },
  submission: {
    idempotency_key: 'seller-intake-0001',
    contact_name: 'Sam Seller',
    contact_phone: '082 123 4567',
    payload_json: { message: 'Please call in the afternoon' },
  },
  normalized: {
    intent: 'sell',
    contactName: 'Sam Seller',
    contactPhone: '082 123 4567',
    sourceChannel: 'instagram',
    seller: {
      propertyAddress: '12 Ocean View Road',
      suburb: 'Sea Point',
      propertyType: 'Apartment',
      estimatedValue: 4200000,
    },
  },
})

assert.equal(sellerCrmRows.requirementRow, null)
assert.equal(sellerCrmRows.leadRow.lead_category, 'seller')
assert.equal(sellerCrmRows.leadRow.lead_source, 'Instagram Campaign')
assert.equal(sellerCrmRows.leadRow.seller_property_address, '12 Ocean View Road')
assert.equal(sellerCrmRows.leadRow.area_interest, 'Sea Point')
assert.equal(sellerCrmRows.leadRow.estimated_value, 4200000)

const invalidSubmission = validateAgencyIntakeSubmission({
  intent: 'sell',
  idempotencyKey: 'short',
  contact: { name: 'Sam Seller', email: 'not-an-email' },
  privacyConsent: false,
}, {
  enabled_intents: ['buy'],
})

assert.equal(invalidSubmission.errors.intent, 'This enquiry type is not available for this agency link.')
assert.equal(invalidSubmission.errors.idempotencyKey, 'A valid idempotency key is required.')
assert.equal(invalidSubmission.errors.email, 'Enter a valid email address.')
assert.equal(invalidSubmission.errors.privacyConsent, 'Privacy consent is required.')

const optionsResponse = await createPublicAgencyIntakeResponse({ method: 'OPTIONS' })
assert.equal(optionsResponse.status, 204)
assert.equal(optionsResponse.headers['Access-Control-Allow-Methods'], 'GET, HEAD, POST, OPTIONS')

const methodResponse = await createPublicAgencyIntakeResponse({ method: 'PATCH' })
assert.equal(methodResponse.status, 405)
assert.equal(methodResponse.body.error, 'method_not_allowed')

const missingSlugResponse = await createPublicAgencyIntakeResponse({ method: 'GET', url: '/api/public/agency-intake' })
assert.equal(missingSlugResponse.status, 400)
assert.equal(missingSlugResponse.body.error, 'slug_required')

const honeypotResponse = await createPublicAgencyIntakeResponse({
  method: 'POST',
  url: '/api/public/agency-intake?slug=kingstons-atlantic',
  body: { website: 'https://spam.example', slug: 'kingstons-atlantic' },
})
assert.equal(honeypotResponse.status, 200)
assert.equal(honeypotResponse.body.skipped, true)

console.log('publicAgencyIntakeApi tests passed')
