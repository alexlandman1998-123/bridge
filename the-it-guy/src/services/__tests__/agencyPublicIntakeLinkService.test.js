import assert from 'node:assert/strict'
import {
  __agencyPublicIntakeLinkServiceTestUtils,
  buildAgencyAgentCardUrls,
  buildAgencyPublicIntakeUrls,
  listAgencyAgentCardLinks,
  loadAgencyAgentCardInsights,
  loadAgencyPublicIntakePerformance,
  saveAgencyAgentCardLink,
  saveAgencyPublicIntakeLink,
  suggestAgencyAgentCardSlug,
  suggestAgencyPublicIntakeSlug,
} from '../agencyPublicIntakeLinkService.js'

const {
  AGENT_DIGITAL_CARD_SURFACE,
  buildAgentCardPayload,
  buildAgentDigitalCardMetadata,
  buildPayload,
  createAgentCardInsightsSummary,
  createPerformanceSummary,
  isMissingTableError,
  normalizeAgentCardEventRow,
  normalizeEnabledIntents,
  normalizeLinkRow,
  normalizeSlug,
  normalizeSubmissionRow,
} = __agencyPublicIntakeLinkServiceTestUtils

assert.equal(normalizeSlug('Kingstons Atlantic! '), 'kingstons-atlantic')
assert.equal(suggestAgencyPublicIntakeSlug('AB'), 'agency-intake')
assert.equal(suggestAgencyAgentCardSlug({ organisationName: 'Kingstons', agentName: 'John Smith' }), 'kingstons-john-smith')
assert.deepEqual(normalizeEnabledIntents(['sell', 'buy', 'sell', 'unknown']), ['sell', 'buy'])
assert.deepEqual(normalizeEnabledIntents([]), ['buy', 'sell'])
assert.equal(isMissingTableError({ code: 'PGRST205', message: 'Could not find table agency_public_intake_links in schema cache' }), true)

const payload = buildPayload({
  organisationId: 'org-1',
  organisationName: 'Kingstons Atlantic',
  status: 'active',
  enabledIntents: ['buy'],
  sourceChannel: 'instagram',
  campaignCode: 'Winter Launch!',
})

assert.equal(payload.organisation_id, 'org-1')
assert.equal(payload.slug, 'kingstons-atlantic')
assert.equal(payload.status, 'active')
assert.equal(payload.source_channel, 'instagram')
assert.equal(payload.campaign_code, 'winter-launch')
assert.deepEqual(payload.enabled_intents, ['buy'])
assert.equal(payload.disabled_at, null)

const disabledPayload = buildPayload({
  organisationId: 'org-1',
  slug: 'kingstons',
  status: 'disabled',
})

assert.equal(disabledPayload.disabled_at.length > 10, true)

const urls = buildAgencyPublicIntakeUrls({ slug: 'kingstons', host: 'https://app.arch9.co.za/' })
assert.equal(urls.intakeUrl, 'https://app.arch9.co.za/intake/kingstons')
assert.equal(urls.buyerUrl, 'https://app.arch9.co.za/intake/kingstons?intent=buy&source=social')
assert.equal(urls.listingsUrl, 'https://app.arch9.co.za/bridge/buy?agencySlug=kingstons')

const cardUrls = buildAgencyAgentCardUrls({ slug: 'kingstons-john-smith', host: 'https://app.arch9.co.za/' })
assert.equal(cardUrls.cardUrl, 'https://app.arch9.co.za/card/kingstons-john-smith')
assert.equal(cardUrls.buyerUrl, 'https://app.arch9.co.za/intake/kingstons-john-smith?intent=buy&source=card')
assert.equal(cardUrls.listingsUrl, 'https://app.arch9.co.za/api/public/listings?cardSlug=kingstons-john-smith')

assert.deepEqual(normalizeLinkRow({
  id: 'link-1',
  organisation_id: 'org-1',
  slug: 'kingstons',
  status: 'active',
  is_primary: true,
  enabled_intents: ['buy', 'sell'],
  source_channel: 'website',
}), {
  id: 'link-1',
  organisationId: 'org-1',
  slug: 'kingstons',
  status: 'active',
  isPrimary: true,
  heading: '',
  introduction: '',
  buyerCtaLabel: '',
  sellerCtaLabel: '',
  enabledIntents: ['buy', 'sell'],
  leadSourceLabel: 'Public Intake',
  sourceChannel: 'website',
  campaignCode: '',
  defaultBranchId: '',
  defaultAssignedAgentId: '',
  privacyPolicyVersion: '',
  consentCopy: '',
  metadataJson: {},
  isAgentDigitalCard: false,
  agentDigitalCard: {},
  disabledAt: null,
  createdAt: null,
  updatedAt: null,
  schemaReady: true,
})

const cardMetadata = buildAgentDigitalCardMetadata({
  agentUserId: '33333333-3333-4333-8333-333333333333',
  agentName: 'John Smith',
  agentEmail: 'john@kingstons.test',
  agentPhone: '082 123 4567',
  agentJobTitle: 'Property Practitioner',
})

assert.equal(cardMetadata.surface, AGENT_DIGITAL_CARD_SURFACE)
assert.equal(cardMetadata.agentDigitalCard.agent.userId, '33333333-3333-4333-8333-333333333333')
assert.equal(cardMetadata.agentDigitalCard.agent.name, 'John Smith')
assert.equal(cardMetadata.agentDigitalCard.features.vcf, true)

const agentCardPayload = buildAgentCardPayload({
  organisationId: 'org-1',
  organisationName: 'Kingstons',
  agentUserId: '33333333-3333-4333-8333-333333333333',
  agentName: 'John Smith',
  status: 'active',
})

assert.equal(agentCardPayload.organisation_id, 'org-1')
assert.equal(agentCardPayload.slug, 'kingstons-john-smith')
assert.equal(agentCardPayload.is_primary, false)
assert.equal(agentCardPayload.default_assigned_agent_id, '33333333-3333-4333-8333-333333333333')
assert.equal(agentCardPayload.lead_source_label, 'Agent Digital Card')
assert.equal(agentCardPayload.metadata_json.surface, AGENT_DIGITAL_CARD_SURFACE)

function createFakeClient() {
  const calls = []
  let savedPayload = null
  return {
    calls,
    get savedPayload() {
      return savedPayload
    },
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      return {
        select(fields) {
          call.select = fields
          return this
        },
        eq(field, value) {
          call.filters.push(['eq', field, value])
          return this
        },
        contains(field, value) {
          call.filters.push(['contains', field, value])
          return this
        },
        order(field, options) {
          call.filters.push(['order', field, options])
          return this
        },
        limit(value) {
          call.limit = value
          return Promise.resolve({ data: [], error: null })
        },
        insert(payloadToSave) {
          savedPayload = payloadToSave
          return this
        },
        single() {
          return Promise.resolve({
            data: {
              id: 'link-1',
              ...savedPayload,
              created_at: '2026-07-29T10:00:00.000Z',
              updated_at: '2026-07-29T10:00:00.000Z',
            },
            error: null,
          })
        },
      }
    },
  }
}

const fakeClient = createFakeClient()
const saveResult = await saveAgencyPublicIntakeLink({
  organisationId: 'org-1',
  organisationName: 'Kingstons Atlantic',
  status: 'active',
}, {
  client: fakeClient,
})

assert.equal(saveResult.link.slug, 'kingstons-atlantic')
assert.equal(saveResult.link.status, 'active')
assert.equal(fakeClient.savedPayload.organisation_id, 'org-1')

const fakeAgentCardClient = createFakeClient()
const agentCardSaveResult = await saveAgencyAgentCardLink({
  organisationId: 'org-1',
  organisationName: 'Kingstons',
  agentUserId: '33333333-3333-4333-8333-333333333333',
  agentName: 'John Smith',
  agentEmail: 'john@kingstons.test',
  status: 'active',
}, {
  client: fakeAgentCardClient,
})

assert.equal(agentCardSaveResult.link.slug, 'kingstons-john-smith')
assert.equal(agentCardSaveResult.link.isPrimary, false)
assert.equal(agentCardSaveResult.link.defaultAssignedAgentId, '33333333-3333-4333-8333-333333333333')
assert.equal(agentCardSaveResult.link.isAgentDigitalCard, true)
assert.equal(agentCardSaveResult.link.agentDigitalCard.agent.email, 'john@kingstons.test')
assert.deepEqual(
  fakeAgentCardClient.calls[0].filters.filter((filter) => filter[0] === 'eq'),
  [
    ['eq', 'organisation_id', 'org-1'],
    ['eq', 'is_primary', false],
    ['eq', 'default_assigned_agent_id', '33333333-3333-4333-8333-333333333333'],
  ],
)
assert.equal(fakeAgentCardClient.savedPayload.is_primary, false)
assert.equal(fakeAgentCardClient.savedPayload.lead_source_label, 'Agent Digital Card')

function createFakeAgentCardListClient() {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      return {
        select(fields) {
          call.select = fields
          return this
        },
        eq(field, value) {
          call.filters.push(['eq', field, value])
          return this
        },
        contains(field, value) {
          call.filters.push(['contains', field, value])
          return this
        },
        order(field, options) {
          call.filters.push(['order', field, options])
          return this
        },
        limit(value) {
          call.limit = value
          return Promise.resolve({
            data: [
              {
                id: 'card-link-1',
                organisation_id: 'org-1',
                slug: 'kingstons-john-smith',
                status: 'active',
                is_primary: false,
                enabled_intents: ['buy', 'sell'],
                lead_source_label: 'Agent Digital Card',
                source_channel: 'qr',
                default_assigned_agent_id: '33333333-3333-4333-8333-333333333333',
                metadata_json: cardMetadata,
              },
            ],
            error: null,
          })
        },
      }
    },
  }
}

const fakeAgentCardListClient = createFakeAgentCardListClient()
const agentCards = await listAgencyAgentCardLinks({
  client: fakeAgentCardListClient,
  organisationId: 'org-1',
  status: 'active',
})
assert.equal(agentCards.links.length, 1)
assert.equal(agentCards.links[0].isAgentDigitalCard, true)
assert.deepEqual(
  fakeAgentCardListClient.calls[0].filters.slice(0, 4),
  [
    ['eq', 'organisation_id', 'org-1'],
    ['eq', 'is_primary', false],
    ['contains', 'metadata_json', { surface: AGENT_DIGITAL_CARD_SURFACE }],
    ['eq', 'status', 'active'],
  ],
)

const normalizedSubmission = normalizeSubmissionRow({
  id: 'submission-1',
  intake_link_id: 'link-1',
  organisation_id: 'org-1',
  lead_id: 'lead-1',
  intent: 'sell',
  status: 'accepted',
  source_channel: 'instagram',
  contact_name: 'Sam Seller',
  contact_email: 'sam@example.test',
  budget_min: null,
  budget_max: null,
  selected_listings_json: [],
  created_at: '2026-07-29T10:00:00.000Z',
})

assert.equal(normalizedSubmission.intent, 'sell')
assert.equal(normalizedSubmission.status, 'accepted')
assert.equal(normalizedSubmission.sourceChannel, 'instagram')

const normalizedCardEvent = normalizeAgentCardEventRow({
  id: 'event-1',
  intake_link_id: 'link-1',
  organisation_id: 'org-1',
  agent_user_id: 'agent-1',
  slug: 'kingstons-john-smith',
  event_type: 'whatsapp_click',
  source_channel: 'qr',
  listing_slug: 'main-road-villa',
  metadata_json: { placement: 'hero' },
  created_at: '2026-08-14T08:00:00.000Z',
})

assert.equal(normalizedCardEvent.eventType, 'whatsapp_click')
assert.equal(normalizedCardEvent.sourceChannel, 'qr')
assert.equal(normalizedCardEvent.metadataJson.placement, 'hero')

assert.deepEqual(createAgentCardInsightsSummary([
  normalizedCardEvent,
  normalizeAgentCardEventRow({
    id: 'event-2',
    intake_link_id: 'link-1',
    organisation_id: 'org-1',
    event_type: 'card_view',
  }),
  normalizeAgentCardEventRow({
    id: 'event-3',
    intake_link_id: 'link-2',
    organisation_id: 'org-1',
    event_type: 'seller_cta_click',
  }),
], [
  normalizedSubmission,
]).byIntakeLink['link-1'].whatsappClicks, 1)

assert.deepEqual(createPerformanceSummary([
  normalizedSubmission,
  normalizeSubmissionRow({
    id: 'submission-2',
    intake_link_id: 'link-1',
    organisation_id: 'org-1',
    intent: 'buy',
    status: 'failed',
    source_channel: 'facebook',
    contact_phone: '0821234567',
  }),
]), {
  total: 2,
  accepted: 1,
  failed: 1,
  needsReview: 1,
  duplicate: 0,
  spam: 0,
  buyer: 1,
  seller: 1,
  linkedLeads: 1,
  bySource: {
    instagram: 1,
    facebook: 1,
  },
})

function createFakePerformanceClient() {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      return {
        select(fields) {
          call.select = fields
          return this
        },
        eq(field, value) {
          call.filters.push(['eq', field, value])
          return this
        },
        gte(field, value) {
          call.filters.push(['gte', field, value])
          return this
        },
        order(field, options) {
          call.filters.push(['order', field, options])
          return this
        },
        limit(value) {
          call.limit = value
          return this
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: [
              {
                id: 'submission-1',
                intake_link_id: 'link-1',
                organisation_id: 'org-1',
                lead_id: 'lead-1',
                intent: 'sell',
                status: 'accepted',
                source_channel: 'instagram',
                contact_name: 'Sam Seller',
                contact_email: 'sam@example.test',
                selected_listings_json: [],
                created_at: '2026-07-29T10:00:00.000Z',
              },
            ],
            error: null,
          }).then(resolve, reject)
        },
      }
    },
  }
}

const performanceClient = createFakePerformanceClient()
const performanceResult = await loadAgencyPublicIntakePerformance({
  client: performanceClient,
  organisationId: 'org-1',
  intakeLinkId: 'link-1',
  windowDays: 30,
  limit: 12,
})

assert.equal(performanceResult.summary.total, 1)
assert.equal(performanceResult.summary.seller, 1)
assert.deepEqual(
  performanceClient.calls[0].filters.find((filter) => filter[0] === 'eq' && filter[1] === 'intake_link_id'),
  ['eq', 'intake_link_id', 'link-1'],
)

function createFakeAgentCardInsightsClient() {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      return {
        select(fields) {
          call.select = fields
          return this
        },
        eq(field, value) {
          call.filters.push(['eq', field, value])
          return this
        },
        gte(field, value) {
          call.filters.push(['gte', field, value])
          return this
        },
        order(field, options) {
          call.filters.push(['order', field, options])
          return this
        },
        limit(value) {
          call.limit = value
          return this
        },
        then(resolve, reject) {
          const data = table === 'agency_agent_card_events'
            ? [
                {
                  id: 'event-1',
                  intake_link_id: 'link-1',
                  organisation_id: 'org-1',
                  agent_user_id: 'agent-1',
                  slug: 'kingstons-john-smith',
                  event_type: 'card_view',
                  source_channel: 'card',
                  metadata_json: {},
                  created_at: '2026-08-14T08:00:00.000Z',
                },
                {
                  id: 'event-2',
                  intake_link_id: 'link-1',
                  organisation_id: 'org-1',
                  agent_user_id: 'agent-1',
                  slug: 'kingstons-john-smith',
                  event_type: 'email_click',
                  source_channel: 'card',
                  metadata_json: {},
                  created_at: '2026-08-14T08:01:00.000Z',
                },
              ]
            : [
                {
                  id: 'submission-1',
                  intake_link_id: 'link-1',
                  organisation_id: 'org-1',
                  lead_id: 'lead-1',
                  intent: 'buy',
                  status: 'accepted',
                  source_channel: 'card',
                  selected_listings_json: [],
                  created_at: '2026-08-14T08:02:00.000Z',
                },
              ]
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
    },
  }
}

const insightsClient = createFakeAgentCardInsightsClient()
const insightResult = await loadAgencyAgentCardInsights({
  client: insightsClient,
  organisationId: 'org-1',
  intakeLinkId: 'link-1',
  windowDays: 30,
})

assert.equal(insightResult.summary.views, 1)
assert.equal(insightResult.summary.contactClicks, 1)
assert.equal(insightResult.summary.emailClicks, 1)
assert.equal(insightResult.summary.buyerLeads, 1)
assert.equal(insightResult.summary.byIntakeLink['link-1'].totalLeads, 1)
assert.deepEqual(
  insightsClient.calls[0].filters.find((filter) => filter[0] === 'eq' && filter[1] === 'intake_link_id'),
  ['eq', 'intake_link_id', 'link-1'],
)

console.log('agencyPublicIntakeLinkService tests passed')
