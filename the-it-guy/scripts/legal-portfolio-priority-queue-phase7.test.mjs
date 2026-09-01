import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalPortfolioPriorityQueueModel } from '../src/core/transactions/legalPortfolioPriorityQueueModel.js'

const now = new Date('2026-09-01T12:00:00.000Z')
const rows = [
  {
    matterId: 'critical-overdue',
    reference: 'TRF-001',
    property: '1 Main Road',
    matterType: 'Transfer',
    stage: { label: 'Rates and clearance' },
    nextAction: 'Resolve rates blocker',
    expectedDue: '2026-08-31T12:00:00.000Z',
    health: { key: 'critical', label: 'Critical' },
    assignedAttorney: { id: 'attorney-1', name: 'A Attorney' },
    status: 'Delayed',
    actionHref: '/transactions/critical-overdue',
  },
  {
    matterId: 'critical-unassigned',
    reference: 'BND-002',
    property: '2 Main Road',
    matterType: 'Bond',
    nextAction: 'Assign bond attorney',
    health: { key: 'critical', label: 'Critical' },
    assignedAttorney: { id: '', name: 'Unassigned' },
    status: 'Delayed',
    actionHref: '/transactions/critical-unassigned',
  },
  {
    matterId: 'attention-client',
    reference: 'CAN-003',
    property: '3 Main Road',
    matterType: 'Cancellation',
    nextAction: 'Follow up with seller',
    expectedDue: '2026-09-02T08:00:00.000Z',
    health: { key: 'attention', label: 'Attention' },
    assignedAttorney: { id: 'attorney-2', name: 'B Attorney' },
    clientActionRequired: true,
    status: 'Attention',
    actionHref: '/transactions/attention-client',
  },
  {
    matterId: 'attention-fourth',
    reference: 'TRF-004',
    property: '4 Main Road',
    nextAction: 'Review guarantees',
    health: { key: 'attention', label: 'Attention' },
    assignedAttorney: { id: 'attorney-3', name: 'C Attorney' },
    status: 'Attention',
    actionHref: '/transactions/attention-fourth',
  },
  {
    matterId: 'healthy',
    reference: 'TRF-005',
    health: { key: 'on_track', label: 'Active' },
    assignedAttorney: { id: 'attorney-4', name: 'D Attorney' },
    status: 'Active',
    actionHref: '/transactions/healthy',
  },
  {
    matterId: 'archived',
    reference: 'TRF-006',
    health: { key: 'critical', label: 'Critical' },
    assignedAttorney: { id: '', name: 'Unassigned' },
    status: 'Archived',
    actionHref: '/transactions/archived',
  },
]

const model = buildLegalPortfolioPriorityQueueModel({ rows, now, limit: 3 })
assert.equal(model.available, true)
assert.equal(model.totalAttention, 4)
assert.equal(model.criticalCount, 2)
assert.equal(model.overdueCount, 1)
assert.equal(model.unassignedCount, 1)
assert.equal(model.hiddenCount, 1)
assert.deepEqual(model.items.map((item) => item.id), ['critical-overdue', 'critical-unassigned', 'attention-client'])
assert.deepEqual(model.items[0].reasons, ['Critical matter', 'Past due'])
assert.ok(model.items[1].reasons.includes('Unassigned'))
assert.ok(model.items[2].reasons.includes('Client action outstanding'))
assert.equal(model.items.some((item) => item.id === 'healthy'), false)
assert.equal(model.items.some((item) => item.id === 'archived'), false)

const empty = buildLegalPortfolioPriorityQueueModel({ rows: [rows[4]], now })
assert.equal(empty.available, false)
assert.deepEqual(empty.items, [])

const pageSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /function LegalPortfolioPriorityQueue/)
assert.match(pageSource, /buildLegalPortfolioPriorityQueueModel/)
assert.match(pageSource, /Work next/)
assert.match(pageSource, /model\.items\.map/)
assert.match(pageSource, /!usesIncomingQueue/)

console.log('Legal portfolio Phase 7 priority queue checks passed.')

