import assert from 'node:assert/strict'
import {
  __agencyPublicIntakeLinkServiceTestUtils,
  buildAgencyPublicIntakeUrls,
  loadAgencyPublicIntakePerformance,
  saveAgencyPublicIntakeLink,
  suggestAgencyPublicIntakeSlug,
} from '../agencyPublicIntakeLinkService.js'

const {
  buildPayload,
  createPerformanceSummary,
  isMissingTableError,
  normalizeEnabledIntents,
  normalizeLinkRow,
  normalizeSlug,
  normalizeSubmissionRow,
} = __agencyPublicIntakeLinkServiceTestUtils

assert.equal(normalizeSlug('Kingstons Atlantic! '), 'kingstons-atlantic')
assert.equal(suggestAgencyPublicIntakeSlug('AB'), 'agency-intake')
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
  disabledAt: null,
  createdAt: null,
  updatedAt: null,
  schemaReady: true,
})

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

console.log('agencyPublicIntakeLinkService tests passed')
