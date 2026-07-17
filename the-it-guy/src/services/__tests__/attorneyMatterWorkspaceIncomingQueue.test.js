import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildAttorneyMatterWorkspace,
    getAttorneyMatterActionHref,
  } = await server.ssrLoadModule('/src/services/attorneyMatterWorkspace.js')

  assert.equal(getAttorneyMatterActionHref({ matterId: 'tx-transfer' }, 'transfer'), '/transactions/tx-transfer/work/transfer')
  assert.equal(getAttorneyMatterActionHref({ matterId: 'tx-bond' }, 'bond'), '/transactions/tx-bond/work/bond-registration')
  assert.equal(getAttorneyMatterActionHref({ matterId: 'tx-cancellation' }, 'cancellation'), '/transactions/tx-cancellation/work/bond-cancellation')
  assert.equal(getAttorneyMatterActionHref({ matterId: 'tx-overview', actionHref: '/transactions/tx-overview' }, 'all'), '/transactions/tx-overview')

  const source = {
    firm: { id: 'firm-1', name: 'Arch9 Attorneys' },
    currentUser: { id: 'att-1' },
    availableFilters: {
      members: [
        { value: 'att-1', label: 'Sarah Conveyancer', role: 'transfer_attorney' },
      ],
    },
    matterQueue: [
      {
        assignmentId: 'active-assignment',
        matterId: 'tx-active',
        matterReference: 'ACTIVE-001',
        matterType: 'Transfer',
        propertyLabel: '10 Active Road',
        buyerName: 'Active Buyer',
        currentStage: 'Transfer',
        assignedAttorneyId: 'att-1',
        assignedAttorneyName: 'Sarah Conveyancer',
        status: 'On Track',
        flags: {},
      },
    ],
    incomingMatterSource: {
      summary: { totalIncoming: 1 },
    },
    incomingMatterQueue: [
      {
        id: 'allocation-awaiting-buyer',
        assignmentId: 'allocation-awaiting-buyer',
        matterId: 'listing:listing-1',
        privateListingId: 'listing-1',
        mandatePacketId: 'packet-1',
        rowKind: 'pre_instruction',
        isPreInstruction: true,
        reference: 'PL-MANDATE',
        status: 'awaiting_buyer',
        statusLabel: 'Awaiting Buyer',
        waitingOn: ['buyer'],
        waitingOnLabels: ['Buyer'],
        incomingSince: '2026-06-30T08:00:00.000Z',
        buyerName: 'Buyer not yet found',
        sellerName: 'Mandate Seller',
        property: '9 Mandate Avenue',
        purchasePrice: 2250000,
        documents: {},
        nextAction: 'Await a buyer before the formal transfer instruction is activated.',
        assignedAttorney: { id: 'firm-1', name: 'Arch9 Attorneys', initials: 'AA' },
        assignedSecretary: {},
        assignedAdminHandler: {},
        actionHref: '/legal-documents/packet-1',
      },
      {
        id: 'incoming-assignment',
        assignmentId: 'incoming-assignment',
        transactionId: 'tx-incoming',
        matterId: 'tx-incoming',
        reference: 'INCOMING-001',
        matterType: 'Transfer',
        status: 'awaiting_signed_otp',
        statusLabel: 'Awaiting Signed OTP',
        waitingOn: ['signed_otp', 'documents'],
        waitingOnLabels: ['Signed OTP', 'Documents'],
        incomingSince: '2026-07-01T08:00:00.000Z',
        incomingAgeDays: 8,
        buyerName: 'Incoming Buyer',
        sellerName: 'Incoming Seller',
        property: '1 Intake Street',
        development: 'Harbour View',
        unit: '101',
        phase: 'A',
        purchasePrice: 1500000,
        documents: {
          openCount: 1,
          reviewCount: 0,
          rejectedCount: 0,
        },
        nextAction: 'Wait for signed OTP before legal handoff.',
        assignedAttorney: {
          id: 'att-1',
          name: 'Sarah Conveyancer',
          initials: 'SC',
        },
        assignedSecretary: {
          id: '',
          name: '',
        },
        assignedAdminHandler: {
          id: '',
          name: '',
        },
        agent: 'Agent One',
        actionHref: '/transactions/tx-incoming',
      },
    ],
  }

  {
    const workspace = buildAttorneyMatterWorkspace(source, {
      view: 'active',
      pageSize: 20,
    })

    assert.equal(workspace.view.usesIncomingQueue, true)
    assert.deepEqual(workspace.tableRows.map((row) => row.matterId), ['listing:listing-1', 'tx-incoming'])
    assert.equal(workspace.tableRows[0].rowKind, 'pre_instruction')
    assert.equal(workspace.tableRows[0].status, 'Awaiting Buyer')
    assert.equal(workspace.tableRows[0].statusKey, 'awaiting_buyer')
    assert.equal(workspace.tableRows[0].nextAction, 'Await a buyer before the formal transfer instruction is activated.')
    assert.equal(workspace.summary.incomingMatters, 2)
    assert.equal(workspace.summary.awaitingBuyer, 1)
    assert.equal(workspace.summary.awaitingSignedOtp, 1)
    assert.equal(workspace.filters.statuses.some((option) => option.key === 'awaiting_buyer'), true)
    assert.equal(workspace.filters.statuses.some((option) => option.key === 'awaiting_signed_otp'), true)
    assert.equal(workspace.quickFilters.some((option) => option.key === 'awaiting_signed_otp'), true)
    assert.equal(workspace.quickFilters.some((option) => option.key === 'due_for_registration'), false)
    assert.equal(workspace.savedViews.some((view) => view.name.includes('Bond')), false)
  }

  {
    const workspace = buildAttorneyMatterWorkspace(source, {
      view: 'active',
      filters: { status: 'awaiting_signed_otp' },
      pageSize: 20,
    })

    assert.deepEqual(workspace.tableRows.map((row) => row.matterId), ['tx-incoming'])
  }

  {
    const workspace = buildAttorneyMatterWorkspace(source, {
      view: 'active',
      search: 'active buyer',
      pageSize: 20,
    })

    assert.equal(workspace.tableRows.length, 0, 'incoming view must not search the generic active matter queue')
  }

  {
    const workspace = buildAttorneyMatterWorkspace({
      ...source,
      incomingMatterSource: { summary: { totalIncoming: 0 } },
      incomingMatterQueue: [],
    }, {
      view: 'active',
      pageSize: 20,
    })

    assert.equal(workspace.tableRows.length, 0, 'empty incoming queue should not fall back to all active matters')
    assert.equal(workspace.pagination.totalRows, 0)
    assert.equal(workspace.summary.incomingMatters, 0)
    assert.equal(workspace.kpis[0].label, 'Incoming Matters')
    assert.equal(workspace.kpis[1].label, 'Awaiting Buyer')
  }

  console.log('attorneyMatterWorkspace incoming queue tests passed')
} finally {
  await server.close()
}
