import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

class FakeQuery {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.filters = []
    this.payload = null
    this.updatePayload = null
    this.orderColumn = ''
    this.orderAscending = true
    this.singleMode = false
    this.operation = 'select'
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ column, value })
    return this
  }

  order(column, options = {}) {
    this.orderColumn = column
    this.orderAscending = options.ascending !== false
    return this
  }

  insert(payload) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.updatePayload = payload
    return this
  }

  maybeSingle() {
    this.singleMode = true
    return this
  }

  then(resolve) {
    return Promise.resolve(this.execute()).then(resolve)
  }

  rows() {
    return this.client.tables[this.table] || []
  }

  matches(row) {
    return this.filters.every((filter) => row[filter.column] === filter.value)
  }

  execute() {
    if (!this.client.tables[this.table]) {
      return { data: this.singleMode ? null : [], error: null }
    }

    if (this.operation === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = rows.map((row) => ({
        id: row.id || `${this.table}-${this.client.nextId++}`,
        created_at: row.created_at || new Date('2026-07-01T10:00:00.000Z').toISOString(),
        ...clone(row),
      }))
      this.client.tables[this.table].push(...inserted)
      return { data: this.singleMode ? clone(inserted[0]) : clone(inserted), error: null }
    }

    if (this.operation === 'update') {
      const updated = []
      this.client.tables[this.table] = this.rows().map((row) => {
        if (!this.matches(row)) return row
        const next = { ...row, ...clone(this.updatePayload) }
        updated.push(next)
        return next
      })
      return { data: this.singleMode ? clone(updated[0] || null) : clone(updated), error: null }
    }

    let rows = this.rows().filter((row) => this.matches(row))
    if (this.orderColumn) {
      rows = [...rows].sort((left, right) => {
        const result = String(left[this.orderColumn] || '').localeCompare(String(right[this.orderColumn] || ''))
        return this.orderAscending ? result : -result
      })
    }
    return { data: this.singleMode ? clone(rows[0] || null) : clone(rows), error: null }
  }
}

function createFakeClient(seed = {}, rpcHandlers = {}) {
  return {
    nextId: 1,
    tables: clone(seed),
    rpcHandlers,
    from(table) {
      return new FakeQuery(this, table)
    },
    async rpc(name, payload) {
      if (!this.rpcHandlers[name]) {
        return { data: null, error: { code: 'PGRST202', message: `Could not find function ${name}` } }
      }
      return this.rpcHandlers[name](payload, this)
    },
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const service = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const client = createFakeClient({
    organisations: [
      { id: 'agency-1', name: 'Prime Realty', type: 'agency', status: 'active' },
      { id: 'partner-1', name: 'ABC Attorneys', type: 'attorney_firm', email: 'abc@example.test', status: 'active' },
      { id: 'partner-2', name: 'XYZ Finance', type: 'bond_originator', email: 'xyz@example.test', status: 'active' },
    ],
    profiles: [
      { id: 'user-attorney-1', full_name: 'Jane Attorney', email: 'jane@example.test', role: 'transfer_attorney', status: 'active' },
    ],
    transactions: [
      { id: 'tx-1', transaction_reference: 'TX-001', property_address_line_1: '12 Main Road', finance_status: 'instruction', created_at: '2026-06-01T08:00:00.000Z', updated_at: '2026-06-02T08:00:00.000Z' },
      { id: 'tx-2', transaction_reference: 'TX-002', property_address_line_1: '14 Main Road', finance_status: 'documents', created_at: '2026-06-03T08:00:00.000Z', updated_at: '2026-06-04T08:00:00.000Z' },
    ],
    transaction_partner_assignments: [
      {
        id: 'assignment-active',
        portal_token: 'active-token',
        transaction_id: 'tx-1',
        agency_organisation_id: 'agency-1',
        partner_organisation_id: 'partner-1',
        partner_connection_id: 'connection-1',
        partner_service_type: 'property_transfers',
        partner_role: 'transfer_attorney',
        assigned_person_id: 'user-attorney-1',
        assigned_queue_id: null,
        delivery_type: 'attorney_instruction',
        assignment_status: 'active',
        onboarding_invite_id: null,
        work_item_id: 'work-1',
        source: 'routing',
        routing_rule_id: 'rule-1',
        created_by: 'agent-1',
        pending_work_delivery: { payload: { buyerName: 'John Buyer', propertyLabel: '12 Main Road' } },
        created_at: '2026-06-01T08:00:00.000Z',
        activated_at: '2026-06-01T09:00:00.000Z',
      },
      {
        id: 'assignment-pending',
        portal_token: 'pending-assignment-token',
        transaction_id: 'tx-2',
        agency_organisation_id: 'agency-1',
        partner_organisation_id: 'partner-2',
        partner_connection_id: null,
        partner_service_type: 'bond_origination',
        partner_role: 'bond_originator',
        delivery_type: 'bond_application_request',
        assignment_status: 'pending_onboarding',
        onboarding_invite_id: 'invite-1',
        work_item_id: null,
        source: 'manual',
        pending_work_delivery: { payload: { buyerName: 'Jane Buyer', financeType: 'bond' } },
        created_at: '2026-06-03T08:00:00.000Z',
      },
    ],
    invites: [
      { id: 'invite-1', token: 'invite-token', invite_type: 'transaction_invite', status: 'pending', email: 'originator@example.test', target_transaction_id: 'tx-2', target_transaction_role: 'bond_originator', metadata: { contact_name: 'Ori Ginator' } },
    ],
    transaction_partner_invitations: [],
    partner_portal_uploads: [],
    partner_portal_document_requests: [
      { id: 'request-1', organisation_id: 'agency-1', partner_id: 'partner-1', transaction_partner_assignment_id: 'assignment-active', document_name: 'FICA', status: 'requested', created_at: '2026-06-01T10:00:00.000Z' },
    ],
    partner_portal_comments: [],
    partner_portal_support_tickets: [],
    partner_portal_audit_logs: [],
    partner_portal_notifications: [],
  })

  const options = { client, token: 'active-token' }
  const context = { token: 'active-token' }

  const dashboard = await service.getPartnerDashboard(context, options)
  assert.equal(dashboard.partner.name, 'ABC Attorneys')
  assert.equal(dashboard.assignment.id, 'assignment-active')
  assert.equal(dashboard.summaryCards.applicationsSubmitted, 1)
  assert.equal(dashboard.summaryCards.pendingDocuments, 1)

  const applications = await service.getPartnerApplications(context, options)
  assert.equal(applications.length, 1)
  assert.equal(applications[0].reference, 'TX-001')

  const workspace = await service.getPartnerApplication('assignment-active', context, options)
  assert.equal(workspace.documents.outstandingDocuments.length, 1)

  const rpcClient = createFakeClient({}, {
    bridge_lookup_partner_portal_by_token() {
      return {
        data: {
          success: true,
          assignment: {
            id: 'assignment-rpc',
            transaction_id: 'tx-rpc',
            agency_organisation_id: 'agency-rpc',
            partner_organisation_id: 'partner-rpc',
            partner_service_type: 'bond_origination',
            partner_role: 'bond_originator',
            delivery_type: 'bond_application_request',
            assignment_status: 'pending_onboarding',
            pending_work_delivery: { payload: { buyerName: 'RPC Buyer', propertyLabel: '22 Token Street' } },
            created_at: '2026-06-05T08:00:00.000Z',
          },
          partner: { id: 'partner-rpc', name: 'Token Originators', type: 'bond_originator', status: 'active' },
          user: { id: 'invite-rpc', email: 'token@example.test', name: 'Token User', role: 'bond_originator', status: 'invited' },
          transaction: { id: 'tx-rpc', transaction_reference: 'TX-RPC', property_address_line_1: '22 Token Street', created_at: '2026-06-05T08:00:00.000Z' },
          document_requests: [{ id: 'request-rpc', transaction_partner_assignment_id: 'assignment-rpc', document_name: 'ID', status: 'requested' }],
          comments: [{ id: 'comment-rpc', transaction_partner_assignment_id: 'assignment-rpc', partner_id: 'partner-rpc', message: 'Token context loaded.', created_at: '2026-06-05T09:00:00.000Z' }],
        },
        error: null,
      }
    },
  })
  const rpcDashboard = await service.getPartnerDashboard({ token: 'rpc-token' }, { client: rpcClient, token: 'rpc-token' })
  assert.equal(rpcDashboard.partner.name, 'Token Originators')
  assert.equal(rpcDashboard.summaryCards.pendingDocuments, 1)
  const rpcWorkspace = await service.getPartnerApplication('assignment-rpc', { token: 'rpc-token' }, { client: rpcClient, token: 'rpc-token' })
  assert.equal(rpcWorkspace.comments.length, 1)

  const uploaded = await service.uploadPartnerDocument('assignment-active', {
    name: 'FICA',
    documentType: 'fica',
    requestId: 'request-1',
  }, context, options)
  assert.equal(uploaded.status, 'received')
  assert.equal(client.tables.partner_portal_uploads.length, 1)
  assert.equal(client.tables.partner_portal_uploads[0].transaction_partner_assignment_id, 'assignment-active')
  assert.equal(client.tables.partner_portal_document_requests[0].status, 'uploaded')

  const comment = await service.addPartnerComment('assignment-active', { message: 'Documents uploaded.' }, context, options)
  assert.match(comment.message, /uploaded/)
  assert.equal(client.tables.partner_portal_comments[0].transaction_partner_assignment_id, 'assignment-active')

  const support = await service.createPartnerSupportTicket({ applicationId: 'assignment-active', type: 'Document Issue', subject: 'Upload query', message: 'Need help.' }, context, options)
  assert.equal(support.status, 'open')
  assert.equal(client.tables.partner_portal_support_tickets[0].transaction_partner_assignment_id, 'assignment-active')
  assert.ok(client.tables.partner_portal_audit_logs.some((row) => row.event_type === service.BOND_PARTNER_PORTAL_EVENTS.supportCreated))
  assert.ok(client.tables.partner_portal_notifications.some((row) => row.notification_type === service.BOND_PARTNER_PORTAL_EVENTS.supportCreated))

  const inviteDashboard = await service.getPartnerDashboard({ token: 'invite-token' }, { client, token: 'invite-token' })
  assert.equal(inviteDashboard.partner.name, 'XYZ Finance')
  assert.equal(inviteDashboard.assignment.assignmentStatus, 'pending_onboarding')

  const activated = await service.activatePartnerPortalOnboarding({ token: 'invite-token', profile: { workItemId: 'bond-work-1' } }, { client })
  assert.equal(activated.assignmentStatus, 'active')
  assert.equal(activated.workItemId, 'bond-work-1')
  assert.equal(client.tables.transaction_partner_assignments.find((row) => row.id === 'assignment-pending').assignment_status, 'active')

  console.log('bondPartnerPortalService tests passed')
} finally {
  await server.close()
}
