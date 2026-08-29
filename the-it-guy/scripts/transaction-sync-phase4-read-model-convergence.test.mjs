import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTransactionSyncReadModel,
  getAgentTransactionSyncReadModel,
  getAttorneyTransactionSyncReadModel,
  getBondOriginatorTransactionSyncReadModel,
  getBuyerTransactionSyncReadModel,
  getSellerTransactionSyncReadModel,
} from '../src/services/transactionSyncReadModelService.js'

const activityRows = [
  {
    id: 'buyer-client',
    canonical_event_type: 'ATTORNEY_CLIENT_UPDATE_ADDED',
    lane_key: 'attorney',
    visibility: 'client_visible',
    audience_json: ['buyer', 'agent', 'transfer_attorney'],
    title: 'Documents drafted',
    description: 'Draft documents are ready.',
    occurred_at: '2026-08-29T10:00:00Z',
  },
  {
    id: 'seller-client',
    canonical_event_type: 'TRANSFER_STAGE_UPDATED',
    lane_key: 'seller',
    visibility: 'client_visible',
    audience_json: ['seller', 'agent', 'transfer_attorney'],
    title: 'Transfer progressed',
    description: 'Transfer progressed.',
    occurred_at: '2026-08-29T11:00:00Z',
  },
  {
    id: 'professional',
    canonical_event_type: 'ORIGINATOR_PROGRESS_RECORDED',
    lane_key: 'bond_originator',
    visibility: 'professional_shared',
    audience_json: ['agent', 'transfer_attorney', 'bond_originator'],
    title: 'Bank assessment',
    description: 'Assessment in progress.',
    occurred_at: '2026-08-29T12:00:00Z',
  },
  {
    id: 'internal',
    canonical_event_type: 'ATTORNEY_INTERNAL_NOTE_ADDED',
    lane_key: 'attorney',
    visibility: 'internal',
    audience_json: ['transfer_attorney'],
    title: 'Internal legal note',
    description: 'Privileged detail.',
    occurred_at: '2026-08-29T13:00:00Z',
  },
]

function build(viewerRole) {
  return buildTransactionSyncReadModel({
    transactionId: 'tx-1',
    viewerRole,
    activityRows,
    refreshSignal: { version: 17, changed_at: '2026-08-29T13:00:00Z' },
    workflowReadModel: {
      mainStage: { key: 'XFER', label: 'Transfer' },
      detailedStage: { key: 'Transfer Initiated', label: 'Transfer Initiated' },
      lanes: [{ key: 'transfer', label: 'Transfer', status: 'in_progress' }],
      sharedProgress: [{ id: 'progress-1' }],
    },
  })
}

test('all five role adapters expose the shared reader', () => {
  assert.equal(typeof getBuyerTransactionSyncReadModel, 'function')
  assert.equal(typeof getSellerTransactionSyncReadModel, 'function')
  assert.equal(typeof getAgentTransactionSyncReadModel, 'function')
  assert.equal(typeof getBondOriginatorTransactionSyncReadModel, 'function')
  assert.equal(typeof getAttorneyTransactionSyncReadModel, 'function')
})

test('buyer and seller views are client-visible and audience-specific', () => {
  assert.deepEqual(build('buyer').activity.map((item) => item.id), ['buyer-client'])
  assert.deepEqual(build('seller').activity.map((item) => item.id), ['seller-client'])
})

test('professional viewers share projected events without leaking internal legal notes', () => {
  assert.deepEqual(build('agent').activity.map((item) => item.id), ['professional', 'seller-client', 'buyer-client'])
  assert.deepEqual(build('bond_originator').activity.map((item) => item.id), ['professional'])
})

test('attorney view receives attorney-scoped internal activity', () => {
  assert.deepEqual(build('attorney').activity.map((item) => item.id), ['internal', 'professional', 'seller-client', 'buyer-client'])
})

test('all views carry the same transaction version and lane snapshot', () => {
  for (const role of ['buyer', 'seller', 'agent', 'bond_originator', 'attorney']) {
    const model = build(role)
    assert.equal(model.version, 17)
    assert.equal(model.changedAt, '2026-08-29T13:00:00.000Z')
    assert.equal(model.lanes[0].key, 'transfer')
    assert.equal(model.stage.main.key, 'XFER')
  }
})

test('role workspaces are wired to the canonical transaction sync projection', async () => {
  const [syncReader, workflow, portal, activityFeed, attorney, originator, api] = await Promise.all([
    readFile(new URL('../src/services/transactionSyncReadModelService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/transactionWorkflowReadModelService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/clientPortalActivityFeedService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/bondOriginatorTransactionSyncService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  ])
  assert.match(syncReader, /getTransactionWorkflowReadModel/)
  assert.match(workflow, /getTransactionSyncReadModel/)
  assert.match(portal, /transactionSync: workflowReadModel\?\.transactionSync/)
  assert.match(activityFeed, /canonicalSyncEvents/)
  assert.match(attorney, /getAttorneyTransactionSyncReadModel/)
  assert.match(originator, /getBondOriginatorCanonicalTransactionWorkspace/)
  assert.match(api, /getAgentTransactionSyncReadModel/)
})
