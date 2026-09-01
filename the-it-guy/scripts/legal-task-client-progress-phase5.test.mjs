import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildClientLegalProgressModel } from '../src/core/clientPortal/clientLegalProgressModel.js'
import {
  filterClientVisibleActivity,
  normalizeClientActivityEvent,
} from '../src/services/clientPortalActivityFeedService.js'

const events = [
  {
    id: 'buyer-fica',
    type: 'AttorneyLaneClientVisibleUpdatePublished',
    visibility: 'client_visible',
    timestamp: '2026-09-01T08:00:00.000Z',
    metadata: {
      title: 'Buyer FICA received',
      description: 'The buyer identity documents were received and are being checked.',
      status: 'completed',
      workPacket: {
        laneKey: 'transfer',
        laneLabel: 'Transfer',
        clientAudience: ['buyer'],
        internalReason: 'Never show this internal reason',
        checklist: ['private checklist item'],
      },
      internalNote: 'Private attorney note',
    },
  },
  {
    id: 'seller-cancellation',
    type: 'AttorneyLaneClientVisibleUpdatePublished',
    visibility: 'client_visible',
    timestamp: '2026-09-01T09:00:00.000Z',
    metadata: {
      title: 'Cancellation figures requested',
      description: 'The cancellation attorney has requested settlement figures.',
      status: 'in_progress',
      workPacket: {
        laneKey: 'cancellation',
        laneLabel: 'Bond cancellation',
        clientAudience: ['seller'],
      },
    },
  },
  {
    id: 'bond-registration',
    type: 'AttorneyLaneClientVisibleUpdatePublished',
    visibility: 'client_visible',
    timestamp: '2026-08-31T09:00:00.000Z',
    metadata: {
      title: 'Bond documents prepared',
      description: 'The bond registration documents are being prepared.',
      status: 'in_progress',
      workPacket: {
        laneKey: 'bond',
        laneLabel: 'Bond registration',
        clientAudience: ['buyer', 'seller'],
      },
    },
  },
  {
    id: 'private-transfer-note',
    type: 'AttorneyLaneClientVisibleUpdatePublished',
    visibility: 'internal_only',
    timestamp: '2026-09-01T10:00:00.000Z',
    metadata: {
      title: 'Internal escalation',
      description: 'Private escalation detail',
      workPacket: { laneKey: 'transfer', clientAudience: ['buyer', 'seller'] },
    },
  },
]

const normalized = events.map(normalizeClientActivityEvent)
const buyerFeed = filterClientVisibleActivity(normalized, 'buyer')
const sellerFeed = filterClientVisibleActivity(normalized, 'seller')
const buyerModel = buildClientLegalProgressModel({ activityFeed: buyerFeed, clientRole: 'buyer' })
const sellerModel = buildClientLegalProgressModel({ activityFeed: sellerFeed, clientRole: 'seller' })

assert.equal(buyerModel.available, true)
assert.deepEqual(buyerModel.items.map((item) => item.id), ['buyer-fica', 'bond-registration'])
assert.equal(buyerModel.current.title, 'Buyer FICA received')
assert.equal(buyerModel.current.status, 'completed')

assert.equal(sellerModel.available, true)
assert.deepEqual(sellerModel.items.map((item) => item.id), ['seller-cancellation', 'bond-registration'])
assert.equal(sellerModel.current.lane, 'cancellation')
assert.equal(sellerModel.current.title, 'Cancellation figures requested')

const serializedModels = JSON.stringify({ buyerModel, sellerModel })
assert.doesNotMatch(serializedModels, /Never show this internal reason/)
assert.doesNotMatch(serializedModels, /private checklist item/)
assert.doesNotMatch(serializedModels, /Private attorney note/)
assert.doesNotMatch(serializedModels, /Internal escalation/)

const portalSource = readFileSync(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
assert.match(portalSource, /function ClientLegalProgressCard/)
assert.match(portalSource, /legalProgress=\{workspaceData\?\.legalProgress\}/)
assert.match(portalSource, /Recent legal progress/)

const workspaceSource = readFileSync(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
assert.match(workspaceSource, /buildClientLegalProgressModel\(\{ activityFeed, clientRole \}\)/)
assert.match(workspaceSource, /canViewPrivate: false/)

console.log('Legal task client progress Phase 5 checks passed.')

