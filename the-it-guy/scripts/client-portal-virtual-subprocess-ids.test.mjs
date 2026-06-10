import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const TRANSACTION_ID = '11111111-1111-4111-8111-111111111111'
const TRANSFER_SUBPROCESS_ID = '22222222-2222-4222-8222-222222222222'

const capturedSubprocessStepFilters = []

class FakeQuery {
  constructor(table) {
    this.table = table
  }

  select() {
    return this
  }

  eq() {
    return this
  }

  in(column, values = []) {
    if (this.table === 'transaction_subprocess_steps' && column === 'subprocess_id') {
      capturedSubprocessStepFilters.push([...values])
    }
    return this
  }

  maybeSingle() {
    if (this.table === 'transactions') {
      return Promise.resolve({
        data: {
          id: TRANSACTION_ID,
          finance_type: 'cash',
          stage: 'Reserved',
          current_main_stage: 'DEP',
          property_type: 'freehold',
        },
        error: null,
      })
    }

    return Promise.resolve({ data: null, error: null })
  }

  order() {
    if (this.table === 'transaction_subprocesses') {
      return Promise.resolve({
        data: [
          {
            id: TRANSFER_SUBPROCESS_ID,
            transaction_id: TRANSACTION_ID,
            process_type: 'transfer',
            owner_type: 'attorney',
            status: 'not_started',
            created_at: '2026-06-10T00:00:00.000Z',
            updated_at: '2026-06-10T00:00:00.000Z',
          },
        ],
        error: null,
      })
    }

    if (this.table === 'transaction_subprocess_steps') {
      return Promise.resolve({
        data: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            subprocess_id: TRANSFER_SUBPROCESS_ID,
            step_key: 'fica_received',
            step_label: 'FICA Received',
            status: 'not_started',
            completed_at: null,
            comment: null,
            owner_type: 'attorney',
            sort_order: 1,
            created_at: '2026-06-10T00:00:00.000Z',
            updated_at: '2026-06-10T00:00:00.000Z',
          },
        ],
        error: null,
      })
    }

    return Promise.resolve({ data: [], error: null })
  }

  limit() {
    if (this.table === 'transaction_attorney_assignments') {
      return Promise.resolve({ data: [], error: null })
    }

    return Promise.resolve({ data: [], error: null })
  }
}

const fakeClient = {
  from(table) {
    return new FakeQuery(table)
  },
}

try {
  const { ensureTransactionSubprocesses } = await server.ssrLoadModule('/src/lib/api.js')
  const subprocesses = await ensureTransactionSubprocesses(fakeClient, TRANSACTION_ID, { createIfMissing: false })

  assert.deepEqual(
    capturedSubprocessStepFilters,
    [[TRANSFER_SUBPROCESS_ID]],
    'virtual subprocess ids must not be passed to transaction_subprocess_steps UUID filters',
  )

  const finance = subprocesses.find((item) => item.process_type === 'finance')
  assert.ok(finance, 'missing finance subprocess should still be represented as a virtual client-side process')
  assert.equal(finance.id, `virtual-${TRANSACTION_ID}-finance`)
  assert.ok(finance.steps.length > 0, 'virtual finance subprocess should still get virtual display steps')
  assert.ok(
    finance.steps.every((step) => String(step.id || '').startsWith(`virtual-${finance.id}-`)),
    'virtual finance steps should remain client-side virtual rows',
  )

  console.log('client portal virtual subprocess id tests passed')
} finally {
  await server.close()
}
