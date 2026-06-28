import assert from 'node:assert/strict'
import {
  buildClientPortalActivityFeedModel,
  filterClientVisibleActivity,
  getClientPortalActivityFeed,
} from '../src/services/clientPortalActivityFeedService.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const today = new Date()
today.setHours(0, 0, 0, 0)
const yesterday = new Date(today)
yesterday.setDate(today.getDate() - 1)
const tomorrow = new Date(today)
tomorrow.setDate(today.getDate() + 1)

test('filters internal discussion and event updates out of the client feed', () => {
  const visible = filterClientVisibleActivity([
    {
      id: 'visible-note',
      type: 'note_shared_with_client',
      visibility: 'client_visible',
      metadata: { audience: 'buyer' },
    },
    {
      id: 'internal-note',
      type: 'note_shared_with_client',
      is_client_visible: false,
      visibility: 'client_visible',
      metadata: { audience: 'buyer' },
    },
    {
      id: 'internal-event',
      type: 'finance_updated',
      visibility: 'internal_only',
      metadata: { audience: 'buyer' },
    },
  ], 'buyer')

  assert.deepEqual(visible.map((event) => event.id), ['visible-note'])
})

test('creates overdue and due-soon document reminders for buyer visible requirements', () => {
  const model = buildClientPortalActivityFeedModel({
    portalData: {
      lastUpdated: '2026-06-28T08:00:00.000Z',
      requiredDocuments: [
        {
          id: 'proof-of-funds',
          label: 'Proof of Funds',
          status: 'required',
          applies_to: 'buyer',
          due_date: yesterday.toISOString(),
          visibility: 'client_visible',
        },
        {
          id: 'seller-doc',
          label: 'Seller ID',
          status: 'required',
          applies_to: 'seller',
          due_date: yesterday.toISOString(),
          visibility: 'client_visible',
        },
      ],
      additionalDocumentRequests: [
        {
          id: 'bank-statements',
          title: 'Updated Bank Statements',
          status: 'requested',
          requested_from: 'buyer',
          due_date: tomorrow.toISOString(),
          visibility: 'client_visible',
        },
      ],
    },
  }, 'buyer')

  const reminderTypes = model.items
    .filter((event) => event.type.startsWith('document_reminder'))
    .map((event) => [event.relatedEntityId, event.type, event.dueStatus])

  assert.deepEqual(reminderTypes.sort(), [
    ['bank-statements', 'document_reminder_due', 'due_soon'],
    ['proof-of-funds', 'document_reminder_overdue', 'overdue'],
  ])
  assert.equal(model.summary.overdue, 1)
  assert.equal(model.summary.dueSoon, 1)
  assert.equal(model.summary.actionRequired >= 2, true)
})

test('adds buyer-only bond application updates for bond transactions', () => {
  const feed = getClientPortalActivityFeed({
    portalData: {
      lastUpdated: '2026-06-28T08:00:00.000Z',
      transaction: {
        id: 'tx-1',
        finance_type: 'bond',
        bond_application_status: 'not_started',
        updated_at: '2026-06-28T08:00:00.000Z',
      },
    },
  }, 'buyer')

  const bondEvent = feed.find((event) => event.type === 'bond_application_required')
  assert.equal(Boolean(bondEvent), true)
  assert.equal(bondEvent.topic, 'finance')
  assert.equal(bondEvent.requiresAttention, true)
  assert.equal(bondEvent.metadata.actionRoute, 'bond_application')

  const sellerFeed = getClientPortalActivityFeed({
    portalData: {
      transaction: {
        id: 'tx-1',
        finance_type: 'bond',
        bond_application_status: 'not_started',
      },
    },
  }, 'seller')

  assert.equal(sellerFeed.some((event) => event.type === 'bond_application_required'), false)
})

test('dedupes semantic duplicates and keeps grouped summary contract', () => {
  const model = buildClientPortalActivityFeedModel({
    portalData: {
      lastUpdated: '2026-06-28T08:00:00.000Z',
      requiredDocuments: [
        {
          id: 'buyer-id',
          label: 'Buyer ID',
          status: 'required',
          applies_to: 'buyer',
          visibility: 'client_visible',
          updated_at: '2026-06-27T08:00:00.000Z',
        },
      ],
      events: [
        {
          id: 'document-event',
          eventType: 'document_requested',
          visibility: 'client_visible',
          created_at: '2026-06-28T08:00:00.000Z',
          eventData: {
            title: 'Buyer ID',
            description: 'Please upload your ID document.',
            audience: 'buyer',
            visibility: 'client_visible',
          },
          relatedEntityType: 'required_document',
          relatedEntityId: 'buyer-id',
        },
      ],
    },
  }, 'buyer')

  const buyerIdEvents = model.items.filter((event) => event.relatedEntityId === 'buyer-id')
  assert.equal(buyerIdEvents.length, 1)
  assert.equal(model.grouped.length >= 1, true)
  assert.equal(model.summary.total, model.items.length)
  assert.equal(typeof model.summary.topics.documents, 'number')
})

console.log('client portal activity feed phase 6 tests passed')
