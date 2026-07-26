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

  insert(payload) {
    this.mode = 'insert'
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

  maybeSingle() {
    const result = this.execute()
    return Promise.resolve({
      ...result,
      data: Array.isArray(result.data) ? result.data[0] || null : result.data || null,
    })
  }

  single() {
    const result = this.execute()
    return Promise.resolve({
      ...result,
      data: Array.isArray(result.data) ? result.data[0] || null : result.data || null,
    })
  }

  execute() {
    const rows = this.client.tables[this.table]
    if (!rows) {
      return {
        data: null,
        error: {
          code: '42p01',
          message: `relation "${this.table}" does not exist`,
        },
      }
    }

    if (this.mode === 'insert') {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const insertedRows = payloadRows.map((payload) => {
        const row = {
          id: `${this.table}-${rows.length + 1}`,
          ...payload,
        }
        rows.push(row)
        return { ...row }
      })
      return { data: insertedRows, error: null }
    }

    const matchedRows = rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value),
    )
    return { data: matchedRows.map((row) => ({ ...row })), error: null }
  }
}

function createNotificationClient() {
  const calls = []
  return {
    calls,
    tables: {
      profiles: [{
        id: 'att-bond-1',
        full_name: 'Nandi Bond',
        email: 'nandi@example.test',
      }],
      transaction_events: [],
      transaction_notifications: [],
    },
    auth: {
      async getUser() {
        return { data: { user: { id: 'manager-1' } }, error: null }
      },
    },
    async rpc(name, input) {
      calls.push({ name, input })
      return {
        data: {
          id: input.p_assignment_id,
          transaction_id: 'tx-assign-primary',
          attorney_firm_id: 'firm-1',
          attorney_user_id: input.p_attorney_user_id,
          attorney_role: 'bond_attorney',
          assignment_type: 'bond',
          firm_acceptance_status: 'accepted',
          staff_assignment_status: 'staff_assigned',
          allocation_state: 'staff_assigned',
          assignment_status: 'pending',
        },
        error: null,
      }
    },
    from(table) {
      return new FakeQuery(this, table)
    },
  }
}

try {
  const {
    assignAttorneyIncomingMatterPrimary,
    manageAttorneyFirmAllocation,
  } = await server.ssrLoadModule('/src/services/transferFirmAllocationService.js')

  const calls = []
  const client = {
    async rpc(name, input) {
      calls.push({ name, input })
      return {
        data: {
          id: input.p_assignment_id,
          transaction_id: 'tx-assign-primary',
          attorney_firm_id: 'firm-1',
          attorney_user_id: input.p_attorney_user_id,
          attorney_role: 'bond_attorney',
          assignment_type: 'bond',
          firm_acceptance_status: 'accepted',
          staff_assignment_status: 'staff_assigned',
          allocation_state: 'staff_assigned',
          assignment_status: 'pending',
        },
        error: null,
      }
    },
  }

  const result = await manageAttorneyFirmAllocation({
    assignmentId: 'assign-bond',
    action: 'assign_primary',
    attorneyUserId: 'att-bond-1',
    laneKey: 'bond',
  }, { client })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    name: 'bridge_manage_attorney_firm_allocation',
    input: {
      p_assignment_id: 'assign-bond',
      p_action: 'assign_primary',
      p_attorney_user_id: 'att-bond-1',
      p_reason: null,
    },
  })
  assert.equal(result.laneKey, 'bond')
  assert.equal(result.attorneyUserId, 'att-bond-1')
  assert.equal(result.allocationState, 'staff_assigned')

  await assert.rejects(
    () => manageAttorneyFirmAllocation({
      assignmentId: 'assign-transfer',
      action: 'assign_primary',
      laneKey: 'transfer',
    }, { client }),
    /choose a primary transfer attorney/i,
  )

  {
    const notificationClient = createNotificationClient()
    const wrapperResult = await assignAttorneyIncomingMatterPrimary({
      assignmentId: 'assign-bond',
      attorneyUserId: 'att-bond-1',
      laneKey: 'bond',
    }, { client: notificationClient })

    assert.equal(notificationClient.calls.length, 1)
    assert.equal(wrapperResult.allocation.attorneyUserId, 'att-bond-1')
    assert.equal(notificationClient.tables.transaction_events.length, 1)
    assert.equal(notificationClient.tables.transaction_events[0].event_type, 'AttorneyIncomingMatterPrimaryAssigned')
    assert.equal(notificationClient.tables.transaction_events[0].created_by, 'manager-1')
    assert.equal(notificationClient.tables.transaction_events[0].event_data.attorneyName, 'Nandi Bond')
    assert.equal(notificationClient.tables.transaction_notifications.length, 1)
    assert.equal(notificationClient.tables.transaction_notifications[0].user_id, 'att-bond-1')
    assert.equal(notificationClient.tables.transaction_notifications[0].notification_type, 'attorney_incoming_primary_assigned')
    assert.equal(notificationClient.tables.transaction_notifications[0].dedupe_key, 'attorney_primary_assigned:assign-bond:att-bond-1')
  }

  console.log('transferFirmAllocationService tests passed')
} finally {
  await server.close()
}
