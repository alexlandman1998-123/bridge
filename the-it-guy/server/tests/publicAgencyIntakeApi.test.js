import assert from 'node:assert/strict'
import {
  buildAgencyPublicIntakeAutomationEvent,
  buildAgencyPublicIntakeCrmRows,
  buildAgencyPublicIntakeLeadAcknowledgementPayload,
  buildAgencyPublicIntakeContract,
  buildPublicIntakeSupervisorLeadOperationsPayload,
  createPublicAgencyIntakeResponse,
  normalizeAgencyIntakeSlug,
  resolveAgencyPublicIntakeSlugCandidates,
  selectPublicIntakeFallbackOwner,
  validateAgencyIntakeSubmission,
} from '../services/publicAgencyIntakeApi.js'

assert.equal(normalizeAgencyIntakeSlug(' Kingstons-Atlantic '), 'kingstons-atlantic')
assert.deepEqual(
  resolveAgencyPublicIntakeSlugCandidates(' Kingstons '),
  ['kingstons', 'kingstons-real-estate'],
  'legacy Kingstons intake links should resolve through the active canonical slug',
)

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
    metadata_json: {
      surface: 'agent_digital_card',
      version: 1,
      agentDigitalCard: {
        agent: {
          userId: '33333333-3333-4333-8333-333333333333',
          name: 'John Smith',
          email: 'john@kingstons.test',
          phone: '082 123 4567',
          jobTitle: 'Property Practitioner',
        },
        features: { vcf: true, qr: true, listings: true, leadCapture: true },
      },
    },
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
assert.equal(contract.cardUrl, 'https://app.arch9.co.za/card/kingstons-atlantic')
assert.equal(contract.card.enabled, true)
assert.equal(contract.card.agent.name, 'John Smith')
assert.equal(contract.card.agent.email, 'john@kingstons.test')
assert.equal(contract.card.features.vcf, true)
assert.equal(contract.agency.name, 'Kingstons Atlantic')
assert.deepEqual(contract.intake.enabledIntents, ['buy', 'sell'])
assert.equal(contract.intake.privacyPolicyVersion, 'privacy-v2')
assert.equal(contract.config.buyer.budgetRequired, true)
assert.equal(contract.organisation_id, undefined)
assert.equal(contract.agency.organisationId, undefined)

const liveAgentContract = buildAgencyPublicIntakeContract({
  host: 'https://app.arch9.co.za/',
  link: {
    slug: 'kingstons-atlantic',
    enabled_intents: ['buy', 'sell'],
    metadata_json: {
      surface: 'agent_digital_card',
      version: 1,
      agentDigitalCard: {
        agent: {
          userId: '33333333-3333-4333-8333-333333333333',
          name: 'Snapshot Agent',
          email: 'snapshot@kingstons.test',
          phone: '082 000 0000',
          jobTitle: 'Agent',
          avatarUrl: '',
        },
        features: { listings: true },
      },
    },
  },
  organisation: { name: 'Kingstons Realty' },
  agent: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'john@kingstons.test',
    first_name: 'John',
    last_name: 'Smith',
    phone_number: '082 123 4567',
    title: 'Principal',
    avatar_url: 'https://cdn.example.com/current-profile.jpg',
  },
})

assert.equal(liveAgentContract.card.agent.name, 'John Smith')
assert.equal(liveAgentContract.card.agent.email, 'john@kingstons.test')
assert.equal(liveAgentContract.card.agent.phone, '082 123 4567')
assert.equal(liveAgentContract.card.agent.jobTitle, 'Principal')
assert.equal(liveAgentContract.card.agent.avatarUrl, 'https://cdn.example.com/current-profile.jpg')

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
    selected_listings_json: [{ id: '44444444-4444-4444-8444-444444444444', title: 'Bedfordview family home', askingPrice: 2450000 }],
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

const listingCardSubmission = validateAgencyIntakeSubmission({
  slug: 'kingstons-atlantic',
  intent: 'buy',
  idempotencyKey: 'listing-card-enquiry-0001',
  contact: {
    firstName: 'Mila',
    lastName: 'Mokoena',
    email: 'mila@example.com',
    phone: '082 987 6543',
  },
  selectedListings: [{
    id: '44444444-4444-4444-8444-444444444444',
    slug: 'bedfordview-family-home',
    title: 'Bedfordview family home',
    askingPrice: 2450000,
  }],
  sourceChannel: 'card',
  privacyConsent: true,
  privacyPolicyVersion: 'privacy-v2',
}, {
  slug: 'kingstons-atlantic',
  enabled_intents: ['buy', 'sell'],
})

assert.deepEqual(listingCardSubmission.errors, {})
assert.equal(listingCardSubmission.normalized.contactName, 'Mila Mokoena')
assert.equal(listingCardSubmission.normalized.contactEmail, 'mila@example.com')
assert.equal(listingCardSubmission.normalized.contactPhone, '082 987 6543')
assert.equal(listingCardSubmission.normalized.sourceChannel, 'website')
assert.equal(listingCardSubmission.normalized.metadata.originalSourceChannel, 'card')
assert.equal(listingCardSubmission.normalized.selectedListings[0].title, 'Bedfordview family home')

const listingCardCrmRows = buildAgencyPublicIntakeCrmRows({
  nowIso: '2026-07-29T10:00:00.000Z',
  link: {
    organisation_id: '11111111-1111-4111-8111-111111111111',
    lead_source_label: 'Agent Digital Card',
    source_channel: 'card',
    default_branch_id: '22222222-2222-4222-8222-222222222222',
    default_assigned_agent_id: '33333333-3333-4333-8333-333333333333',
  },
  submission: {
    id: '99999999-9999-4999-8999-999999999999',
    idempotency_key: 'listing-card-enquiry-0001',
    contact_name: 'Mila Mokoena',
    contact_email: 'mila@example.com',
    contact_phone: '082 987 6543',
    selected_listings_json: listingCardSubmission.normalized.selectedListings,
    payload_json: { message: '' },
  },
  normalized: listingCardSubmission.normalized,
})

assert.equal(listingCardCrmRows.contactRow.first_name, 'Mila')
assert.equal(listingCardCrmRows.contactRow.last_name, 'Mokoena')
assert.equal(listingCardCrmRows.leadRow.lead_category, 'buyer')
assert.equal(listingCardCrmRows.leadRow.lead_source, 'Agent Digital Card')
assert.equal(listingCardCrmRows.leadRow.source_channel, 'website')
assert.equal(listingCardCrmRows.leadRow.assigned_agent_id, '33333333-3333-4333-8333-333333333333')
assert.equal(listingCardCrmRows.leadRow.enquired_listing_id, '44444444-4444-4444-8444-444444444444')
assert.equal(listingCardCrmRows.requirementRow.budget_min, null)
assert.equal(listingCardCrmRows.requirementRow.budget_max, null)
assert.equal(listingCardCrmRows.requirementRow.status, 'active')

const listingCardAcknowledgementPayload = buildAgencyPublicIntakeLeadAcknowledgementPayload({
  rows: listingCardCrmRows,
  submission: {
    id: '99999999-9999-4999-8999-999999999999',
    idempotency_key: 'listing-card-enquiry-0001',
    contact_name: 'Mila Mokoena',
    contact_email: 'mila@example.com',
    selected_listings_json: listingCardSubmission.normalized.selectedListings,
    payload_json: { message: '' },
  },
  normalized: listingCardSubmission.normalized,
  link: {
    metadata_json: {
      agentDigitalCard: {
        agent: {
          name: 'John Smith',
          email: 'john@kingstons.test',
          phone: '082 123 4567',
          jobTitle: 'Property Practitioner',
          avatarUrl: 'https://cdn.example.com/john.jpg',
        },
      },
    },
  },
  basePayload: {
    leadName: 'Mila Mokoena',
    leadEmail: 'mila@example.com',
    leadSource: 'Agent Digital Card',
    propertyLabel: 'Bedfordview family home',
  },
  dedupeSeed: 'listing-card-enquiry-0001',
})

assert.equal(listingCardAcknowledgementPayload.type, 'property_enquiry_acknowledgement')
assert.equal(listingCardAcknowledgementPayload.to, 'mila@example.com')
assert.equal(listingCardAcknowledgementPayload.recipientName, 'Mila Mokoena')
assert.equal(listingCardAcknowledgementPayload.agentName, 'John Smith')
assert.equal(listingCardAcknowledgementPayload.agentEmail, 'john@kingstons.test')
assert.equal(listingCardAcknowledgementPayload.agentPhone, '082 123 4567')
assert.equal(listingCardAcknowledgementPayload.originalMessage, 'Property enquiry: Bedfordview family home')
assert.equal(listingCardAcknowledgementPayload.idempotencyKey, 'lead-ack:listing-card-enquiry-0001:mila@example.com')

const fallbackOwner = selectPublicIntakeFallbackOwner([
  {
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    role: 'branch_manager',
    branch_id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
  },
  {
    user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    role: 'Principal / Owner',
    branch_id: '',
    status: 'active',
  },
  {
    user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    role: 'admin',
    branch_id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
  },
], { branchId: '22222222-2222-4222-8222-222222222222' })

assert.equal(fallbackOwner.user_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')

const branchScopedFallbackOwner = selectPublicIntakeFallbackOwner([
  {
    user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    role: 'principal',
    branch_id: '99999999-9999-4999-8999-999999999999',
    status: 'active',
  },
  {
    user_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    role: 'principal',
    branch_id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
  },
], { branchId: '22222222-2222-4222-8222-222222222222' })

assert.equal(branchScopedFallbackOwner.user_id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')

const supervisorNotificationPayload = buildPublicIntakeSupervisorLeadOperationsPayload({
  basePayload: {
    organisationId: '11111111-1111-4111-8111-111111111111',
    leadId: buyerCrmRows.leadId,
    assignedUserId: fallbackOwner.user_id,
    leadName: 'Avery Buyer',
    leadSource: 'Public Intake',
    actionLink: 'https://app.arch9.co.za/agency/leads/example',
  },
  supervisor: {
    ...fallbackOwner,
    first_name: 'Priya',
    last_name: 'Principal',
    email: 'principal@example.com',
  },
  dedupeSeed: 'buyer-intake-0001',
})

assert.equal(supervisorNotificationPayload.type, 'new_enquiry_unassigned_manager')
assert.equal(supervisorNotificationPayload.to, 'principal@example.com')
assert.equal(supervisorNotificationPayload.recipientName, 'Priya Principal')
assert.equal(supervisorNotificationPayload.recipientRole, 'principal')
assert.equal(supervisorNotificationPayload.subject, 'New lead needs assignment')
assert.equal(supervisorNotificationPayload.message, 'Avery Buyer is ready for review. Please assign it to the right agent for follow-up.')
assert.equal(supervisorNotificationPayload.assignedAgentName, '')
assert.equal(supervisorNotificationPayload.idempotencyKey, `lead-ops:buyer-intake-0001:fallback-supervisor:${fallbackOwner.user_id}`)

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
    selected_listings_json: [{ id: '44444444-4444-4444-8444-444444444444', title: 'Bedfordview family home', askingPrice: 2450000 }],
    request_metadata_json: { pageUrl: 'https://app.arch9.co.za/intake/kingstons-atlantic?intent=buy' },
    payload_json: {
      message: 'Looking in Bedfordview',
      context: { referrer: 'https://kingstons.example/listings' },
    },
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
assert.deepEqual(buyerAutomationEvent.payload_json.selectedListings, [
  {
    id: '',
    slug: 'modern-home-abc123',
    title: '',
    askingPrice: null,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    slug: '',
    title: 'Bedfordview family home',
    askingPrice: 2450000,
  },
])
assert.deepEqual(buyerAutomationEvent.payload_json.listingInterestIds, ['77777777-7777-4777-8777-777777777777'])
assert.deepEqual(buyerAutomationEvent.payload_json.buyerRequirement.areas, ['Bedfordview', 'Edenvale'])
assert.equal(buyerAutomationEvent.payload_json.buyerRequirement.propertyType, 'House')
assert.equal(buyerAutomationEvent.payload_json.buyerRequirement.bedroomsMin, 3)
assert.equal(buyerAutomationEvent.payload_json.buyerRequirement.financeStatus, 'pre_approved')
assert.equal(buyerAutomationEvent.payload_json.pageUrl, 'https://app.arch9.co.za/intake/kingstons-atlantic?intent=buy')
assert.equal(buyerAutomationEvent.payload_json.referrer, 'https://kingstons.example/listings')
assert.equal(buyerAutomationEvent.payload_json.taskId, '66666666-6666-4666-8666-666666666666')
assert.equal(buyerAutomationEvent.payload_json.requirementId, null)
assert.equal(buyerAutomationEvent.metadata_json.handoffRequired, true)
assert.deepEqual(buyerAutomationEvent.metadata_json.listingInterestIds, ['77777777-7777-4777-8777-777777777777'])
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
