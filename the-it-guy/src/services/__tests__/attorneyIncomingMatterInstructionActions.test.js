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

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject)
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

    const matchedRows = rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value),
    )

    if (this.mode === 'update') {
      const missingPayloadColumn = Object.keys(this.payload || {}).find((key) => this.client.missingColumns.has(`${this.table}.${key}`))
      if (missingPayloadColumn) {
        return {
          data: null,
          error: {
            code: '42703',
            message: `column "${missingPayloadColumn}" of relation "${this.table}" does not exist`,
          },
        }
      }

      matchedRows.forEach((row) => {
        Object.assign(row, this.payload)
        this.client.updates.push({ table: this.table, id: row.id, payload: { ...this.payload } })
      })
      return { data: matchedRows.map((row) => ({ ...row })), error: null }
    }

    if (this.mode === 'insert') {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const missingPayloadColumn = payloadRows
        .flatMap((payload) => Object.keys(payload || {}))
        .find((key) => this.client.missingColumns.has(`${this.table}.${key}`))
      if (missingPayloadColumn) {
        return {
          data: null,
          error: {
            code: '42703',
            message: `column "${missingPayloadColumn}" of relation "${this.table}" does not exist`,
          },
        }
      }

      if (this.table === 'transaction_events' && this.client.allowedTransactionEventTypes) {
        const disallowedEventType = payloadRows.find((payload) => !this.client.allowedTransactionEventTypes.has(payload?.event_type))
        if (disallowedEventType) {
          return {
            data: null,
            error: {
              code: '23514',
              message: 'new row for relation "transaction_events" violates check constraint "transaction_events_event_type_check"',
              details: `Failing row contains (${disallowedEventType.event_type}).`,
            },
          }
        }
      }

      const insertedRows = payloadRows.map((payload) => {
        const row = {
          id: `${this.table}-${rows.length + 1}`,
          ...payload,
        }
        rows.push(row)
        this.client.inserts.push({ table: this.table, payload: { ...payload }, row: { ...row } })
        return { ...row }
      })
      return { data: insertedRows, error: null }
    }

    return { data: matchedRows.map((row) => ({ ...row })), error: null }
  }
}

function createFakeClient({
  assignments = [],
  transactions = [],
  transactionEvents = [],
  includeTransactionEvents = true,
  actorUserId = 'actor-1',
  missingColumns = [],
  allowedTransactionEventTypes = null,
} = {}) {
  return {
    tables: {
      transaction_attorney_assignments: assignments.map((row) => ({ ...row })),
      transactions: transactions.map((row) => ({ ...row })),
      ...(includeTransactionEvents ? { transaction_events: transactionEvents.map((row) => ({ ...row })) } : {}),
    },
    missingColumns: new Set(missingColumns),
    allowedTransactionEventTypes: allowedTransactionEventTypes ? new Set(allowedTransactionEventTypes) : null,
    updates: [],
    inserts: [],
    auth: {
      async getUser() {
        return { data: { user: { id: actorUserId } }, error: null }
      },
    },
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
    acceptAttorneyIncomingInstruction,
    declineAttorneyIncomingInstruction,
    __attorneyIncomingMatterInstructionActionsTestUtils,
  } = await server.ssrLoadModule('/src/services/attorneyIncomingMatterInstructionActions.js')

  {
    const client = createFakeClient({
      actorUserId: 'attorney-user-1',
      assignments: [
        {
          id: 'assign-ready',
          transaction_id: 'tx-ready',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'ready_for_acceptance',
          assignment_status: 'active',
          status: 'active',
        },
      ],
      transactions: [{ id: 'tx-ready', current_main_stage: 'OTP' }],
    })

    const result = await acceptAttorneyIncomingInstruction(client, {
      assignmentId: 'assign-ready',
      acceptedAt: '2026-07-09T07:30:00.000Z',
    })

    const assignment = client.tables.transaction_attorney_assignments[0]
    const transaction = client.tables.transactions[0]
    assert.equal(result.status, 'accepted')
    assert.equal(result.alreadyAccepted, false)
    assert.equal(result.actionHref, '/transactions/tx-ready')
    assert.equal(assignment.instruction_status, 'accepted')
    assert.equal(assignment.assignment_status, 'active')
    assert.equal(assignment.instruction_accepted_by, 'attorney-user-1')
    assert.equal(assignment.instruction_accepted_at, '2026-07-09T07:30:00.000Z')
    assert.equal(transaction.current_main_stage, 'ATTY')
    assert.equal(transaction.attorney_stage, 'instruction_received')
    assert.equal(transaction.next_action, 'Transfer instruction accepted. Begin attorney preparation.')
    assert.equal(client.tables.transaction_events.length, 1)
    assert.equal(client.tables.transaction_events[0].event_type, 'AttorneyIncomingInstructionAccepted')
    assert.equal(client.tables.transaction_events[0].transaction_id, 'tx-ready')
    assert.equal(client.tables.transaction_events[0].event_data.assignmentId, 'assign-ready')
    assert.equal(client.tables.transaction_events[0].event_data.decision, 'accepted')
    assert.equal(client.tables.transaction_events[0].created_by, 'attorney-user-1')
    assert.equal(client.tables.transaction_events[0].created_by_role, 'attorney')
    assert.equal(client.tables.transaction_events[0].visibility_scope, 'internal')
    assert.equal(result.auditEvent.event_type, 'AttorneyIncomingInstructionAccepted')
  }

  {
    const client = createFakeClient({
      assignments: [
        {
          id: 'assign-waiting',
          transaction_id: 'tx-waiting',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'awaiting_signed_otp',
          assignment_status: 'active',
        },
      ],
      transactions: [{ id: 'tx-waiting' }],
    })

    await assert.rejects(
      () => acceptAttorneyIncomingInstruction(client, { assignmentId: 'assign-waiting' }),
      /not ready for acceptance/i,
    )
    assert.equal(client.updates.length, 0)
  }

  {
    const client = createFakeClient({
      assignments: [
        {
          id: 'assign-accepted',
          transaction_id: 'tx-accepted',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'accepted',
          assignment_status: 'active',
        },
      ],
      transactions: [{ id: 'tx-accepted' }],
    })

    const result = await acceptAttorneyIncomingInstruction(client, { assignmentId: 'assign-accepted' })
    assert.equal(result.alreadyAccepted, true)
    assert.equal(client.updates.length, 0)
  }

  {
    const client = createFakeClient({
      assignments: [
        {
          id: 'assign-bond',
          transaction_id: 'tx-bond',
          assignment_type: 'bond',
          attorney_role: 'bond_attorney',
          instruction_status: 'ready_for_acceptance',
          assignment_status: 'active',
        },
      ],
      transactions: [{ id: 'tx-bond' }],
    })

    await assert.rejects(
      () => acceptAttorneyIncomingInstruction(client, { assignmentId: 'assign-bond' }),
      /only transfer incoming matters/i,
    )
  }

  {
    const client = createFakeClient({
      actorUserId: 'attorney-user-2',
      assignments: [
        {
          id: 'assign-decline',
          transaction_id: 'tx-decline',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'awaiting_documents',
          assignment_status: 'active',
          status: 'active',
        },
      ],
      transactions: [{ id: 'tx-decline', current_main_stage: 'OTP' }],
    })

    const result = await declineAttorneyIncomingInstruction(client, {
      assignmentId: 'assign-decline',
      declinedAt: '2026-07-09T08:15:00.000Z',
      reason: 'Conflict check failed.',
    })

    const assignment = client.tables.transaction_attorney_assignments[0]
    const transaction = client.tables.transactions[0]
    assert.equal(result.status, 'declined')
    assert.equal(result.alreadyDeclined, false)
    assert.equal(result.actionHref, '/transactions/tx-decline')
    assert.equal(assignment.instruction_status, 'declined')
    assert.equal(assignment.assignment_status, 'removed')
    assert.equal(assignment.status, 'removed')
    assert.equal(assignment.instruction_declined_by, 'attorney-user-2')
    assert.equal(assignment.instruction_declined_at, '2026-07-09T08:15:00.000Z')
    assert.equal(assignment.instruction_decision_note, 'Conflict check failed.')
    assert.equal(transaction.next_action, 'Conflict check failed.')
    assert.equal(client.tables.transaction_events.length, 1)
    assert.equal(client.tables.transaction_events[0].event_type, 'AttorneyIncomingInstructionDeclined')
    assert.equal(client.tables.transaction_events[0].event_data.assignmentId, 'assign-decline')
    assert.equal(client.tables.transaction_events[0].event_data.decision, 'declined')
    assert.equal(client.tables.transaction_events[0].event_data.decisionNote, 'Conflict check failed.')
    assert.equal(result.auditEvent.event_type, 'AttorneyIncomingInstructionDeclined')
  }

  {
    const client = createFakeClient({
      assignments: [
        {
          id: 'assign-already-declined',
          transaction_id: 'tx-already-declined',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'declined',
          assignment_status: 'removed',
        },
      ],
      transactions: [{ id: 'tx-already-declined' }],
    })

    const result = await declineAttorneyIncomingInstruction(client, { assignmentId: 'assign-already-declined' })
    assert.equal(result.alreadyDeclined, true)
    assert.equal(client.updates.length, 0)
  }

  {
    const client = createFakeClient({
      assignments: [
        {
          id: 'assign-accepted-cannot-decline',
          transaction_id: 'tx-accepted-cannot-decline',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'accepted',
          assignment_status: 'active',
        },
      ],
      transactions: [{ id: 'tx-accepted-cannot-decline' }],
    })

    await assert.rejects(
      () => declineAttorneyIncomingInstruction(client, { assignmentId: 'assign-accepted-cannot-decline' }),
      /accepted incoming matters cannot be declined/i,
    )
  }

  {
    const payload = __attorneyIncomingMatterInstructionActionsTestUtils.buildDeclineAttorneyIncomingInstructionPayload({
      actorUserId: 'actor-2',
      declinedAt: '2026-07-09T08:30:00.000Z',
      reason: 'Panel capacity reached.',
    })
    assert.equal(payload.instruction_status, 'declined')
    assert.equal(payload.assignment_status, 'removed')
    assert.equal(payload.instruction_decision_note, 'Panel capacity reached.')
  }

  {
    const payload = __attorneyIncomingMatterInstructionActionsTestUtils.buildAcceptAttorneyIncomingInstructionPayload({
      actorUserId: 'actor-1',
      acceptedAt: '2026-07-09T07:45:00.000Z',
      note: 'Accepted after OTP review.',
    })
    assert.equal(payload.instruction_status, 'accepted')
    assert.equal(payload.instruction_decision_note, 'Accepted after OTP review.')
  }

  {
    const client = createFakeClient({
      actorUserId: 'attorney-user-3',
      includeTransactionEvents: false,
      assignments: [
        {
          id: 'assign-no-event-table',
          transaction_id: 'tx-no-event-table',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'ready_for_acceptance',
          assignment_status: 'active',
        },
      ],
      transactions: [{ id: 'tx-no-event-table' }],
    })

    const result = await acceptAttorneyIncomingInstruction(client, {
      assignmentId: 'assign-no-event-table',
      acceptedAt: '2026-07-09T09:00:00.000Z',
    })

    assert.equal(result.status, 'accepted')
    assert.equal(result.auditEvent, null)
    assert.equal(client.tables.transaction_attorney_assignments[0].instruction_status, 'accepted')
  }

  {
    const client = createFakeClient({
      actorUserId: 'attorney-user-4',
      allowedTransactionEventTypes: ['TransactionUpdated'],
      assignments: [
        {
          id: 'assign-legacy-event-check',
          transaction_id: 'tx-legacy-event-check',
          assignment_type: 'transfer',
          attorney_role: 'transfer_attorney',
          instruction_status: 'ready_for_acceptance',
          assignment_status: 'active',
        },
      ],
      transactions: [{ id: 'tx-legacy-event-check' }],
    })

    const result = await acceptAttorneyIncomingInstruction(client, {
      assignmentId: 'assign-legacy-event-check',
      acceptedAt: '2026-07-09T09:15:00.000Z',
    })

    assert.equal(result.status, 'accepted')
    assert.equal(result.auditEvent.event_type, 'TransactionUpdated')
    assert.equal(client.tables.transaction_events[0].event_data.originalEventType, 'AttorneyIncomingInstructionAccepted')
    assert.equal(client.tables.transaction_events[0].event_data.assignmentId, 'assign-legacy-event-check')
  }

  {
    const eventPayload = __attorneyIncomingMatterInstructionActionsTestUtils.buildAttorneyIncomingInstructionDecisionEventPayload({
      transactionId: 'tx-payload',
      assignmentId: 'assign-payload',
      actorUserId: 'actor-payload',
      decision: 'declined',
      decidedAt: '2026-07-09T09:30:00.000Z',
      reason: 'Capacity issue.',
    })
    assert.equal(eventPayload.event_type, 'AttorneyIncomingInstructionDeclined')
    assert.equal(eventPayload.event_data.decision, 'declined')
    assert.equal(eventPayload.event_data.decisionNote, 'Capacity issue.')
  }

  console.log('attorneyIncomingMatterInstructionActions tests passed')
} finally {
  await server.close()
}
