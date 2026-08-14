import assert from 'node:assert/strict'
import {
  buildAgentCardEventRow,
  normalizeAgentCardEventPayload,
  recordAgentCardEvent,
  validateAgentCardEventPayload,
} from '../services/publicAgentCardEventsApi.js'

const normalized = normalizeAgentCardEventPayload({
  slug: 'Kingstons-John-Smith',
  eventType: 'WhatsApp_Click',
  sourceChannel: 'qr',
  listingId: '44444444-4444-4444-8444-444444444444',
  metadata: {
    listingSlug: 'main-road-villa',
    pageUrl: 'https://app.arch9.co.za/card/kingstons-john-smith',
  },
})

assert.equal(normalized.slug, 'kingstons-john-smith')
assert.equal(normalized.eventType, 'whatsapp_click')
assert.equal(normalized.sourceChannel, 'qr')
assert.equal(normalized.listingId, '44444444-4444-4444-8444-444444444444')
assert.equal(normalized.listingSlug, 'main-road-villa')
assert.deepEqual(validateAgentCardEventPayload(normalized), {})
assert.equal(validateAgentCardEventPayload({ slug: '', eventType: 'unknown' }).slug, 'Agent card slug is required.')

const eventRow = buildAgentCardEventRow({
  link: {
    id: 'link-1',
    organisation_id: '11111111-1111-4111-8111-111111111111',
    slug: 'kingstons-john-smith',
    default_assigned_agent_id: '33333333-3333-4333-8333-333333333333',
    metadata_json: {
      surface: 'agent_digital_card',
      agentDigitalCard: {
        agent: { userId: '33333333-3333-4333-8333-333333333333' },
      },
    },
  },
  normalized,
  headers: {
    'user-agent': 'node-test',
    'x-forwarded-for': '203.0.113.10',
  },
})

assert.equal(eventRow.intake_link_id, 'link-1')
assert.equal(eventRow.organisation_id, '11111111-1111-4111-8111-111111111111')
assert.equal(eventRow.agent_user_id, '33333333-3333-4333-8333-333333333333')
assert.equal(eventRow.event_type, 'whatsapp_click')
assert.equal(eventRow.request_metadata_json.userAgent, 'node-test')
assert.equal(eventRow.request_metadata_json.ipHash.length, 48)

function createFakeClient() {
  const calls = []
  let insertedRow = null
  return {
    calls,
    get insertedRow() {
      return insertedRow
    },
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      if (table === 'agency_public_intake_links') {
        return {
          select(fields) {
            call.select = fields
            return this
          },
          eq(field, value) {
            call.filters.push(['eq', field, value])
            return this
          },
          is(field, value) {
            call.filters.push(['is', field, value])
            return this
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'link-1',
                organisation_id: '11111111-1111-4111-8111-111111111111',
                slug: 'kingstons-john-smith',
                status: 'active',
                default_assigned_agent_id: '33333333-3333-4333-8333-333333333333',
                metadata_json: { surface: 'agent_digital_card' },
              },
              error: null,
            })
          },
        }
      }
      return {
        insert(row) {
          insertedRow = row
          return this
        },
        select(fields) {
          call.select = fields
          return this
        },
        single() {
          return Promise.resolve({
            data: {
              id: 'event-1',
              created_at: '2026-08-14T08:00:00.000Z',
            },
            error: null,
          })
        },
      }
    },
  }
}

const fakeClient = createFakeClient()
const result = await recordAgentCardEvent(fakeClient, {
  payload: {
    slug: 'kingstons-john-smith',
    eventType: 'copy_link',
  },
  headers: { 'user-agent': 'node-test' },
})

assert.equal(result.accepted, true)
assert.equal(result.event.type, 'copy_link')
assert.equal(fakeClient.insertedRow.event_type, 'copy_link')
assert.equal(fakeClient.insertedRow.slug, 'kingstons-john-smith')
assert.deepEqual(
  fakeClient.calls[0].filters.slice(0, 3),
  [
    ['eq', 'slug', 'kingstons-john-smith'],
    ['eq', 'status', 'active'],
    ['is', 'disabled_at', null],
  ],
)

console.log('publicAgentCardEventsApi tests passed')
