import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const [apiSource, transactionPage, migrationSource, incomingActions, incomingQueue, matterWorkspace, mattersPage] = await Promise.all([
  readFile(resolve(root, 'src/lib/api.js'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607170004_attorney_firm_first_reassignment_phase6.sql'), 'utf8'),
  readFile(resolve(root, 'src/services/attorneyIncomingMatterInstructionActions.js'), 'utf8'),
  readFile(resolve(root, 'src/services/attorneyIncomingMatterQueue.js'), 'utf8'),
  readFile(resolve(root, 'src/services/attorneyMatterWorkspace.js'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyMattersPage.jsx'), 'utf8'),
])

assert.match(apiSource, /export async function reassignDeclinedTransferAttorneyInstruction/)
assert.match(apiSource, /does not have a declined transfer instruction to reassign/)
assert.match(apiSource, /Choose a different transfer attorney firm from the firm that declined/)
assert.match(apiSource, /prepareFirmFirstTransferRoleplayer\(\{/)
assert.match(apiSource, /assignmentStatus:\s*'selected'/)
assert.match(apiSource, /activationTrigger:\s*'appointed_firm_staff_assignment'/)
assert.match(apiSource, /userId:\s*null,[\s\S]*firmFirstAllocation:\s*true/)
assert.match(apiSource, /assigned_attorney_email:\s*null/)
assert.match(apiSource, /status:\s*ATTORNEY_INCOMING_INSTRUCTION_STATUSES\.readyForAcceptance/)
assert.match(apiSource, /selection_source:\s*'agency_recommended'/)
assert.match(apiSource, /eventType:\s*'transfer_attorney_firm_renominated'/)
assert.match(apiSource, /allocationState:\s*'awaiting_firm_acceptance'/)
assert.match(transactionPage, /Replace Declined Transfer Attorney Firm/)
assert.match(transactionPage, /Nominate Replacement Firm/)
assert.match(transactionPage, /transferAttorneyReassignmentRequired/)
assert.match(transactionPage, /firm will allocate its own primary attorney/)
assert.match(migrationSource, /replaces_assignment_id/)
assert.match(migrationSource, /replacement transfer firm must differ/i)
assert.match(migrationSource, /pending firm-only nomination/i)
assert.doesNotMatch(migrationSource, /delete from|drop table|drop column/i)
assert.match(incomingActions, /p_action:\s*'accept'/)
assert.match(incomingActions, /firmAccepted:\s*true/)
assert.match(incomingActions, /p_action:\s*'decline'/)
assert.match(incomingActions, /firmDeclined:\s*true/)
assert.match(incomingQueue, /Firm accepted\. Assign an internal primary transfer attorney\./)
assert.match(matterWorkspace, /firmAcceptanceStatus:\s*row\.firmAcceptanceStatus/)
assert.match(mattersPage, /row\.firmAcceptanceStatus === 'accepted'/)

class Phase6Query {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.filters = []
    this.mode = 'select'
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

  update(payload) {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  upsert(payload) {
    this.mode = 'upsert'
    this.payload = payload
    return this
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  in(column, values) {
    this.filters.push({ type: 'in', column, values })
    return this
  }

  is(column, value) {
    this.filters.push({ type: 'is', column, value })
    return this
  }

  not() {
    return this
  }

  or() {
    return this
  }

  order() {
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
    return this.maybeSingle()
  }

  then(resolveResult, rejectResult) {
    return Promise.resolve(this.execute()).then(resolveResult, rejectResult)
  }

  execute() {
    const rows = this.client.state[this.table]
    if (!rows) {
      return { data: null, error: { code: '42P01', message: `relation "${this.table}" does not exist` } }
    }

    if (this.mode === 'insert') {
      const insertedRows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((payload) => {
        const row = { id: payload.id || `${this.table}-${rows.length + 1}`, ...payload }
        rows.push(row)
        this.client.inserts.push({ table: this.table, payload: { ...payload }, row: { ...row } })
        return { ...row }
      })
      return { data: insertedRows, error: null }
    }

    if (this.mode === 'upsert') {
      const upsertedRows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((payload) => {
        const existing = rows.find(
          (row) =>
            row.transaction_id === payload.transaction_id &&
            row.role_type === payload.role_type &&
            (!payload.legal_role || row.legal_role === payload.legal_role),
        )
        if (existing) {
          Object.assign(existing, payload)
          this.client.updates.push({ table: this.table, id: existing.id, payload: { ...payload } })
          return { ...existing }
        }
        const row = { id: `${this.table}-${rows.length + 1}`, ...payload }
        rows.push(row)
        this.client.inserts.push({ table: this.table, payload: { ...payload }, row: { ...row } })
        return { ...row }
      })
      return { data: upsertedRows, error: null }
    }

    const matchedRows = rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.type === 'eq') return row[filter.column] === filter.value
        if (filter.type === 'in') return filter.values.includes(row[filter.column])
        if (filter.type === 'is') return (row[filter.column] ?? null) === filter.value
        return true
      }),
    )

    if (this.mode === 'update') {
      matchedRows.forEach((row) => {
        Object.assign(row, this.payload)
        this.client.updates.push({ table: this.table, id: row.id, payload: { ...this.payload } })
      })
      return { data: matchedRows.map((row) => ({ ...row })), error: null }
    }

    return { data: matchedRows.map((row) => ({ ...row })), error: null }
  }
}

function createPhase6Client() {
  const transactionId = '11111111-1111-4111-8111-111111111111'
  const declinedFirmId = '22222222-2222-4222-8222-222222222222'
  const replacementFirmOrgId = '33333333-3333-4333-8333-333333333333'
  return {
    transactionId,
    declinedFirmId,
    replacementFirmOrgId,
    inserts: [],
    updates: [],
    state: {
      profiles: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'agent' }],
      transactions: [
        {
          id: transactionId,
          listing_id: '44444444-4444-4444-8444-444444444444',
          organisation_id: '55555555-5555-4555-8555-555555555555',
          buyer_id: '66666666-6666-4666-8666-666666666666',
          finance_type: 'cash',
          onboarding_status: 'signed_otp_received',
          current_main_stage: 'ATT',
          attorney: 'Declined Firm',
          assigned_attorney_email: 'declined@example.test',
          is_active: true,
        },
      ],
      transaction_attorney_assignments: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          transaction_id: transactionId,
          assignment_type: 'transfer',
          matter_type: 'transfer',
          attorney_role: 'transfer_attorney',
          attorney_firm_id: declinedFirmId,
          firm_id: declinedFirmId,
          instruction_status: 'declined',
          assignment_status: 'removed',
          status: 'removed',
          allocation_state: 'declined',
          replacement_sequence: 0,
        },
      ],
      transaction_role_players: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          transaction_id: transactionId,
          role_type: 'transfer_attorney',
          organisation_id: declinedFirmId,
          partner_name: 'Declined Firm',
          email_address: 'declined@example.test',
          status: 'removed',
          assignment_status: 'removed',
          removed_at: '2026-08-10T08:00:00.000Z',
          snapshot_json: {},
        },
      ],
      attorney_firms: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          organisation_id: replacementFirmOrgId,
          name: 'Replacement Conveyancers',
          email: 'replacement@example.test',
          is_active: true,
        },
      ],
      attorney_firm_members: [],
      transaction_participants: [
        {
          id: 'participant-agent',
          transaction_id: transactionId,
          user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          role_type: 'agent',
          legal_role: 'none',
          participant_email: 'agent@example.test',
          status: 'active',
        },
      ],
      transaction_events: [],
      transaction_notifications: [],
      private_listing_role_players: [],
    },
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              user: {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                email: 'agent@example.test',
              },
            },
          },
          error: null,
        }
      },
    },
    from(table) {
      return new Phase6Query(this, table)
    },
    async rpc() {
      return { data: null, error: null }
    },
  }
}

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const { reassignDeclinedTransferAttorneyInstruction } = await server.ssrLoadModule('/src/lib/api.js')
  const client = createPhase6Client()
  const originalWarn = console.warn
  const originalDebug = console.debug
  console.warn = (...args) => {
    const message = String(args[0] || '')
    if (message.startsWith('[AUDIT]') || message.startsWith('Replacement transfer instruction notification skipped')) {
      return
    }
    originalWarn(...args)
  }
  console.debug = (...args) => {
    if (String(args[0] || '').startsWith('[AUDIT]')) return
    originalDebug(...args)
  }
  let result
  try {
    result = await reassignDeclinedTransferAttorneyInstruction({
      client,
      transactionId: client.transactionId,
      replacement: {
        organisationId: client.replacementFirmOrgId,
        companyName: 'Replacement Conveyancers',
        contactPerson: 'Replacement Intake',
        email: 'replacement@example.test',
        phone: '0100000000',
      },
      reason: 'Original firm conflict check failed.',
      actorRole: 'agent',
    })
  } finally {
    console.warn = originalWarn
    console.debug = originalDebug
  }

  const declinedAssignment = client.state.transaction_attorney_assignments.find(
    (row) => row.id === '77777777-7777-4777-8777-777777777777',
  )
  const replacementAssignment = client.state.transaction_attorney_assignments.find(
    (row) => row.replaces_assignment_id === declinedAssignment.id,
  )
  const replacementRoleplayer = client.state.transaction_role_players.find(
    (row) => row.partner_name === 'Replacement Conveyancers',
  )
  const renominationEvent = client.state.transaction_events.find(
    (row) => row.event_data?.source === 'declined_transfer_instruction_reassignment',
  )

  assert.equal(result.id, client.transactionId)
  assert.equal(declinedAssignment.instruction_status, 'declined')
  assert.equal(declinedAssignment.assignment_status, 'removed')
  assert.ok(replacementRoleplayer, 'replacement roleplayer should be inserted')
  assert.equal(replacementRoleplayer.user_id, null)
  assert.equal(replacementRoleplayer.assignment_status, 'selected')
  assert.equal(replacementRoleplayer.activation_trigger, 'appointed_firm_staff_assignment')
  assert.equal(replacementRoleplayer.snapshot_json.firmFirstAllocation, true)
  assert.ok(replacementAssignment, 'replacement attorney assignment should be inserted')
  assert.equal(replacementAssignment.attorney_role, 'transfer_attorney')
  assert.equal(replacementAssignment.attorney_user_id, null)
  assert.equal(replacementAssignment.primary_attorney_id, null)
  assert.equal(replacementAssignment.firm_acceptance_status, 'awaiting_firm_acceptance')
  assert.equal(replacementAssignment.allocation_state, 'awaiting_firm_acceptance')
  assert.equal(replacementAssignment.instruction_status, 'ready_for_acceptance')
  assert.equal(replacementAssignment.replacement_reason, 'Original firm conflict check failed.')
  assert.equal(renominationEvent.event_type, 'TransactionUpdated')
  assert.equal(renominationEvent.event_data.previousAssignmentId, declinedAssignment.id)
  assert.equal(renominationEvent.event_data.replacementOrganisationId, client.replacementFirmOrgId)
  assert.equal(renominationEvent.event_data.allocationState, 'awaiting_firm_acceptance')
  assert.equal(client.state.transactions[0].assigned_attorney_email, null)
} finally {
  await server.close()
}

console.log('Firm-first declined transfer attorney reassignment Phase 6 checks passed.')
