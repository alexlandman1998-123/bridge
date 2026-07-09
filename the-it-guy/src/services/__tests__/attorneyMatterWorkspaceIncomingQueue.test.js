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
  } = await server.ssrLoadModule('/src/services/attorneyMatterWorkspace.js')

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
    assert.deepEqual(workspace.tableRows.map((row) => row.matterId), ['tx-incoming'])
    assert.equal(workspace.tableRows[0].rowKind, 'incoming')
    assert.equal(workspace.tableRows[0].status, 'Awaiting Signed OTP')
    assert.equal(workspace.tableRows[0].statusKey, 'awaiting_signed_otp')
    assert.equal(workspace.tableRows[0].nextAction, 'Wait for signed OTP before legal handoff.')
    assert.equal(workspace.summary.incomingMatters, 1)
    assert.equal(workspace.summary.awaitingSignedOtp, 1)
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
    assert.equal(workspace.kpis[1].label, 'Awaiting Signed OTP')
  }

  console.log('attorneyMatterWorkspace incoming queue tests passed')
} finally {
  await server.close()
}
