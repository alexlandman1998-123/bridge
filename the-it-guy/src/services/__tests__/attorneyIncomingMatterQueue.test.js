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
    buildAttorneyIncomingMatterQueueFromSources,
    __attorneyIncomingMatterQueueTestUtils,
  } = await server.ssrLoadModule('/src/services/attorneyIncomingMatterQueue.js')

  const source = {
    firm: { id: 'firm-1', name: 'Arch9 Attorneys' },
    currentUser: { id: 'att-1', email: 'attorney@example.com' },
    assignments: [
      {
        id: 'assign-awaiting-otp',
        transaction_id: 'tx-awaiting-otp',
        attorney_firm_id: 'firm-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'pending',
        primary_attorney_id: 'att-1',
        assigned_at: '2026-07-01T08:00:00.000Z',
      },
      {
        id: 'assign-docs',
        transaction_id: 'tx-docs',
        attorney_firm_id: 'firm-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'pending',
        primary_attorney_id: 'att-2',
        assigned_at: '2026-07-02T08:00:00.000Z',
      },
      {
        id: 'assign-ready',
        transaction_id: 'tx-ready',
        attorney_firm_id: 'firm-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'pending',
        primary_attorney_id: 'att-1',
        assigned_at: '2026-07-03T08:00:00.000Z',
      },
      {
        id: 'assign-pre',
        transaction_id: 'tx-pre',
        attorney_firm_id: 'firm-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'awaiting_client_onboarding',
        assignment_status: 'pending',
        primary_attorney_id: 'att-1',
        assigned_at: '2026-07-04T08:00:00.000Z',
      },
      {
        id: 'assign-accepted',
        transaction_id: 'tx-accepted',
        attorney_firm_id: 'firm-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'accepted',
        assignment_status: 'active',
        primary_attorney_id: 'att-1',
        assigned_at: '2026-07-05T08:00:00.000Z',
      },
      {
        id: 'assign-bond',
        transaction_id: 'tx-bond',
        attorney_firm_id: 'firm-1',
        assignment_type: 'bond',
        attorney_role: 'bond_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'pending',
        primary_attorney_id: 'att-1',
        assigned_at: '2026-07-06T08:00:00.000Z',
      },
      {
        id: 'assign-cancellation',
        transaction_id: 'tx-cancellation',
        attorney_firm_id: 'firm-1',
        assignment_type: 'cancellation',
        instruction_status: 'new_instruction',
        assignment_status: 'pending',
        primary_attorney_id: 'att-1',
        assigned_at: '2026-07-07T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-awaiting-otp',
        buyer_id: 'buyer-1',
        unit_id: 'unit-1',
        transaction_reference: 'TRF-OTP',
        property_address_line_1: '1 Ocean Road',
        suburb: 'Sea Point',
        onboarding_status: 'submitted',
        external_onboarding_submitted_at: '2026-07-01T09:00:00.000Z',
        seller_name: 'Seller One',
        is_active: true,
      },
      {
        id: 'tx-docs',
        buyer_id: 'buyer-2',
        unit_id: 'unit-2',
        transaction_reference: 'TRF-DOCS',
        property_address_line_1: '2 Forest Lane',
        suburb: 'Rosebank',
        onboarding_status: 'signed_otp_received',
        current_main_stage: 'ATTY',
        seller_name: 'Seller Two',
        is_active: true,
      },
      {
        id: 'tx-ready',
        buyer_id: 'buyer-3',
        unit_id: 'unit-3',
        transaction_reference: 'TRF-READY',
        property_address_line_1: '3 Hill Street',
        suburb: 'Claremont',
        onboarding_status: 'signed_otp_received',
        current_main_stage: 'ATTY',
        seller_name: 'Seller Three',
        is_active: true,
      },
      {
        id: 'tx-pre',
        buyer_id: 'buyer-4',
        unit_id: 'unit-4',
        transaction_reference: 'TRF-PRE',
        property_address_line_1: '4 Valley Road',
        suburb: 'Sandton',
        onboarding_status: 'in_progress',
        seller_name: 'Seller Four',
        is_active: true,
      },
      {
        id: 'tx-accepted',
        buyer_id: 'buyer-5',
        unit_id: 'unit-5',
        transaction_reference: 'TRF-ACTIVE',
        property_address_line_1: '5 Main Road',
        suburb: 'Morningside',
        onboarding_status: 'submitted',
        seller_name: 'Seller Five',
        is_active: true,
      },
      {
        id: 'tx-bond',
        buyer_id: 'buyer-6',
        transaction_reference: 'BOND-1',
        onboarding_status: 'submitted',
        is_active: true,
      },
      {
        id: 'tx-cancellation',
        buyer_id: 'buyer-7',
        transaction_reference: 'CANCEL-1',
        onboarding_status: 'submitted',
        is_active: true,
      },
    ],
    onboardingRows: [
      {
        id: 'onboarding-awaiting-otp',
        transaction_id: 'tx-awaiting-otp',
        status: 'submitted',
        submitted_at: '2026-07-01T09:00:00.000Z',
      },
      {
        id: 'onboarding-pre',
        transaction_id: 'tx-pre',
        status: 'in_progress',
      },
    ],
    documentRequests: [
      {
        id: 'doc-awaiting-fica',
        transaction_id: 'tx-awaiting-otp',
        title: 'Buyer FICA',
        status: 'requested',
      },
      {
        id: 'doc-review-address',
        transaction_id: 'tx-docs',
        title: 'Proof of address',
        status: 'uploaded',
      },
    ],
    buyers: [
      { id: 'buyer-1', name: 'Anele Buyer', email: 'anele@example.com' },
      { id: 'buyer-2', name: 'Nomsa Buyer', email: 'nomsa@example.com' },
      { id: 'buyer-3', name: 'Sipho Buyer', email: 'sipho@example.com' },
      { id: 'buyer-4', name: 'Leila Buyer', email: 'leila@example.com' },
      { id: 'buyer-5', name: 'Musa Buyer', email: 'musa@example.com' },
    ],
    units: [
      { id: 'unit-1', development_id: 'dev-1', unit_number: '101' },
      { id: 'unit-2', development_id: 'dev-1', unit_number: '102' },
      { id: 'unit-3', development_id: 'dev-2', unit_number: '201' },
      { id: 'unit-4', development_id: 'dev-2', unit_number: '202' },
      { id: 'unit-5', development_id: 'dev-3', unit_number: '301' },
    ],
    developments: [
      { id: 'dev-1', name: 'Harbour View' },
      { id: 'dev-2', name: 'Forest Quarter' },
      { id: 'dev-3', name: 'Central Place' },
    ],
    profiles: [
      { id: 'att-1', full_name: 'Sarah Conveyancer', email: 'sarah@example.com' },
      { id: 'att-2', full_name: 'John Transfer', email: 'john@example.com' },
    ],
  }

  {
    const queue = buildAttorneyIncomingMatterQueueFromSources(source, { pageSize: 20 })
    assert.deepEqual(queue.rows.map((row) => row.id), ['assign-awaiting-otp', 'assign-docs', 'assign-ready'])
    assert.deepEqual(queue.allRows.map((row) => row.id), [
      'assign-awaiting-otp',
      'assign-docs',
      'assign-ready',
      'assign-pre',
      'assign-accepted',
    ])
    assert.equal(queue.summary.totalIncoming, 3)
    assert.equal(queue.summary.allTransferInstructions, 5)
    assert.equal(queue.summary.awaitingSignedOtp, 1)
    assert.equal(queue.summary.awaitingDocuments, 1)
    assert.equal(queue.summary.readyForAcceptance, 1)
    assert.equal(queue.summary.documentBlockers, 2)
    assert.deepEqual(queue.rows[0].waitingOn, ['signed_otp', 'documents'])
    assert.equal(queue.rows[1].documents.reviewCount, 1)
    assert.equal(queue.rows[2].nextAction, 'Accept the transfer instruction.')
  }

  {
    const queue = buildAttorneyIncomingMatterQueueFromSources(source, { includePreIncoming: true, pageSize: 20 })
    assert(queue.rows.some((row) => row.id === 'assign-pre'))
    assert(!queue.rows.some((row) => row.id === 'assign-accepted'))
  }

  {
    const queue = buildAttorneyIncomingMatterQueueFromSources(source, { includeClosed: true, pageSize: 20 })
    assert(queue.rows.some((row) => row.id === 'assign-accepted'))
    assert(!queue.rows.some((row) => row.id === 'assign-pre'))
  }

  {
    const queue = buildAttorneyIncomingMatterQueueFromSources(source, { search: 'nomsa', pageSize: 20 })
    assert.deepEqual(queue.rows.map((row) => row.id), ['assign-docs'])
  }

  {
    const normalized = __attorneyIncomingMatterQueueTestUtils.normalizeAssignment({
      id: 'assign-legacy-cancellation',
      transaction_id: 'tx-cancellation',
      assignment_type: 'cancellation',
    })
    assert.equal(normalized.attorney_role, 'cancellation_attorney')
  }

  {
    const missingAssignmentStatus = {
      code: '42703',
      message: 'column transaction_attorney_assignments.assignment_status does not exist',
    }
    assert.equal(__attorneyIncomingMatterQueueTestUtils.errorMentionsColumn(missingAssignmentStatus, 'assignment_status'), true)
    assert.equal(__attorneyIncomingMatterQueueTestUtils.errorMentionsColumn(missingAssignmentStatus, 'id'), false)
  }

  console.log('attorneyIncomingMatterQueue tests passed')
} finally {
  await server.close()
}
