import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

class FakeQuery {
  constructor(client, table, mode = 'select') {
    this.client = client
    this.table = table
    this.mode = mode
    this.filters = []
    this.payload = null
  }

  select() {
    return this
  }

  update(payload) {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  eq(column, value) {
    this.filters.push({ column, value })
    return this
  }

  limit() {
    return this
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject)
  }

  execute() {
    if (this.client.missingTable) {
      return {
        data: null,
        error: {
          code: '42p01',
          message: `relation "${this.table}" does not exist`,
        },
      }
    }

    if (this.table !== 'transaction_attorney_assignments') {
      return { data: null, error: new Error(`Unexpected table ${this.table}`) }
    }

    const rows = this.client.rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value),
    )

    if (this.mode === 'update') {
      rows.forEach((row) => {
        Object.assign(row, this.payload)
        this.client.updates.push({ id: row.id, payload: { ...this.payload } })
      })
      return { data: rows.map((row) => ({ id: row.id })), error: null }
    }

    return { data: rows.map((row) => ({ ...row })), error: null }
  }
}

function createFakeClient(rows, options = {}) {
  return {
    rows: rows.map((row) => ({ ...row })),
    updates: [],
    missingTable: Boolean(options.missingTable),
    from(table) {
      return new FakeQuery(this, table)
    },
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    syncAttorneyIncomingInstructionStatus,
    __attorneyIncomingMatterInstructionSyncTestUtils,
  } = await server.ssrLoadModule('/src/services/attorneyIncomingMatterInstructionSync.js')

  {
    const rows = [
      {
        id: 'assign-transfer',
        transaction_id: 'tx-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'active',
      },
      {
        id: 'assign-bond',
        transaction_id: 'tx-1',
        assignment_type: 'bond',
        attorney_role: 'bond_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'active',
      },
      {
        id: 'assign-cancellation',
        transaction_id: 'tx-1',
        assignment_type: 'cancellation',
        attorney_role: 'cancellation_attorney',
        instruction_status: 'new_instruction',
        assignment_status: 'active',
      },
      {
        id: 'assign-accepted',
        transaction_id: 'tx-1',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'accepted',
        assignment_status: 'active',
      },
    ]
    const client = createFakeClient(rows)

    const result = await syncAttorneyIncomingInstructionStatus(client, {
      transactionId: 'tx-1',
      status: 'awaiting_signed_otp',
      occurredAt: '2026-07-09T08:00:00.000Z',
      source: 'buyer_onboarding_completed',
    })

    assert.equal(result.updatedCount, 1)
    assert.equal(result.skippedCount, 1)
    assert.deepEqual(client.updates.map((update) => update.id), ['assign-transfer'])
    assert.equal(client.rows.find((row) => row.id === 'assign-transfer').instruction_status, 'awaiting_signed_otp')
    assert.equal(client.rows.find((row) => row.id === 'assign-bond').instruction_status, 'new_instruction')
    assert.equal(client.rows.find((row) => row.id === 'assign-cancellation').instruction_status, 'new_instruction')
    assert.equal(client.rows.find((row) => row.id === 'assign-accepted').instruction_status, 'accepted')
  }

  {
    const client = createFakeClient([
      {
        id: 'assign-transfer',
        transaction_id: 'tx-2',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'awaiting_signed_otp',
        assignment_status: 'active',
      },
    ])

    const result = await syncAttorneyIncomingInstructionStatus(client, {
      transactionId: 'tx-2',
      status: 'ready_for_acceptance',
    })

    assert.equal(result.updatedCount, 1)
    assert.equal(client.rows[0].instruction_status, 'ready_for_acceptance')
  }

  {
    const client = createFakeClient([
      {
        id: 'assign-ready',
        transaction_id: 'tx-3',
        assignment_type: 'transfer',
        attorney_role: 'transfer_attorney',
        instruction_status: 'ready_for_acceptance',
        assignment_status: 'active',
      },
    ])

    const result = await syncAttorneyIncomingInstructionStatus(client, {
      transactionId: 'tx-3',
      status: 'awaiting_signed_otp',
    })

    assert.equal(result.updatedCount, 0)
    assert.equal(client.rows[0].instruction_status, 'ready_for_acceptance')
  }

  {
    const client = createFakeClient([], { missingTable: true })
    const result = await syncAttorneyIncomingInstructionStatus(client, {
      transactionId: 'tx-4',
      status: 'awaiting_signed_otp',
    })
    assert.equal(result.updatedCount, 0)
  }

  {
    assert.equal(
      __attorneyIncomingMatterInstructionSyncTestUtils.shouldSyncAttorneyIncomingInstruction(
        {
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'accepted',
          assignment_status: 'active',
        },
        'awaiting_signed_otp',
      ),
      false,
    )
    assert.equal(
      __attorneyIncomingMatterInstructionSyncTestUtils.shouldSyncAttorneyIncomingInstruction(
        {
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'awaiting_client_onboarding',
          assignment_status: 'active',
        },
        'awaiting_signed_otp',
      ),
      true,
    )
  }

  console.log('attorneyIncomingMatterInstructionSync tests passed')
} finally {
  await server.close()
}
