import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function createMockClient({ requirements = [], reminders = [], documentRequests = [] } = {}) {
  const state = {
    requirements,
    reminders: [...reminders],
    reminderItems: [],
    documentRequests: [...documentRequests],
    events: [],
    updates: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.action = 'select'
      this.payload = null
      this.singleRow = false
    }

    select() {
      return this
    }

    insert(payload) {
      this.action = 'insert'
      this.payload = payload
      return this
    }

    update(payload) {
      this.action = 'update'
      this.payload = payload
      return this
    }

    upsert(payload) {
      this.action = 'upsert'
      this.payload = payload
      return this
    }

    eq() {
      return this
    }

    neq() {
      return this
    }

    in() {
      return this
    }

    maybeSingle() {
      this.singleRow = true
      return this.execute()
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }

    async execute() {
      if (this.table === 'document_requirement_instances') return { data: state.requirements, error: null }
      if (this.table === 'document_requirement_reminders') {
        if (this.action === 'insert') {
          const row = { id: `reminder-${state.reminders.length + 1}`, ...this.payload }
          state.reminders.push(row)
          return { data: this.singleRow ? row : [row], error: null }
        }
        if (this.action === 'update') {
          const row = { ...(state.reminders[0] || { id: 'reminder-1' }), ...this.payload }
          state.reminders[0] = row
          state.updates.push(row)
          return { data: this.singleRow ? row : [row], error: null }
        }
        return { data: state.reminders, error: null }
      }
      if (this.table === 'document_requirement_reminder_items') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
        state.reminderItems.push(...rows)
        return { data: rows, error: null }
      }
      if (this.table === 'document_requirement_events') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
        state.events.push(...rows)
        return { data: rows, error: null }
      }
      if (this.table === 'document_requests') {
        if (this.action === 'upsert') {
          const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
          state.documentRequests.push(...rows.map((row, index) => ({ id: row.id || `request-${index + 1}`, ...row })))
          return { data: rows, error: null }
        }
        return { data: state.documentRequests, error: null }
      }
      return { data: [], error: null }
    }
  }

  return {
    state,
    from(table) {
      return new Query(table)
    },
  }
}

try {
  const reminders = await server.ssrLoadModule('/src/services/documents/canonicalDocumentReminderService.js')
  const { REQUIREMENT_LEVELS, REQUIREMENT_STATUSES } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')

  const contextId = '22222222-2222-4222-8222-222222222222'
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    document_definition_key: 'seller_id_document',
    context_type: 'private_listing',
    context_id: contextId,
    pack_key: 'seller_identity_fica',
    requirement_level: REQUIREMENT_LEVELS.required,
    status: REQUIREMENT_STATUSES.pending,
    stage_gates: ['mandate_ready'],
    requested_from_role: 'seller',
    visible_to_roles: ['seller', 'agent'],
    uploadable_by_roles: ['seller'],
    document_definitions: {
      display_label: 'Seller ID Document',
      review_required: false,
    },
    document_packs: {
      display_label: 'Seller Identity & FICA',
    },
  }

  assert.equal(reminders.areCanonicalDocumentRemindersEnabled(), true)
  assert.equal(reminders.areCanonicalAutomatedRemindersEnabled(), false)
  assert.equal(reminders.areCanonicalEmailRemindersEnabled(), false)
  assert.equal(reminders.areCanonicalWhatsappRemindersEnabled(), false)
  assert.equal(reminders.areCanonicalEscalationsEnabled(), false)

  assert.equal(reminders.addBusinessDays(new Date('2026-05-22T00:00:00.000Z'), 2), '2026-05-26T00:00:00.000Z')
  assert.equal(reminders.getNextReminderAt({ reminderCount: 1, now: new Date('2026-05-25T00:00:00.000Z') }), '2026-05-27T00:00:00.000Z')

  const eligible = reminders.evaluateReminderEligibility(base, {
    contactsByRole: { seller: { email: 'seller@example.com' } },
  })
  assert.equal(eligible.eligible, true)
  assert.equal(eligible.reminderType, reminders.REMINDER_TYPES.missingRequiredDocuments)
  assert.equal(eligible.recipientRole, 'seller')

  const optional = reminders.evaluateReminderEligibility({
    ...base,
    requirement_level: REQUIREMENT_LEVELS.optional,
  }, {
    contactsByRole: { seller: { email: 'seller@example.com' } },
  })
  assert.equal(optional.eligible, false)
  assert.equal(optional.suppressedReason, 'optional_requirement')

  const recommended = reminders.evaluateReminderEligibility({
    ...base,
    requirement_level: REQUIREMENT_LEVELS.recommended,
  }, {
    contactsByRole: { seller: { email: 'seller@example.com' } },
  })
  assert.equal(recommended.eligible, false)
  assert.equal(recommended.suppressedReason, 'recommended_not_automatic')

  const rejected = reminders.evaluateReminderEligibility({
    ...base,
    status: REQUIREMENT_STATUSES.rejected,
    rejection_reason: 'Blurry copy',
  }, {
    contactsByRole: { seller: { email: 'seller@example.com' } },
  })
  assert.equal(rejected.reminderType, reminders.REMINDER_TYPES.rejectedDocuments)

  const reviewer = reminders.evaluateReminderEligibility({
    ...base,
    status: REQUIREMENT_STATUSES.underReview,
    reviewer_role: 'agent',
    document_definitions: {
      display_label: 'Seller ID Document',
      review_required: true,
    },
    visible_to_roles: ['seller', 'agent'],
    uploadable_by_roles: ['seller'],
  }, {
    contactsByRole: { agent: { email: 'agent@example.com' } },
  })
  assert.equal(reviewer.eligible, true)
  assert.equal(reviewer.recipientRole, 'agent')
  assert.equal(reviewer.reminderType, reminders.REMINDER_TYPES.documentsAwaitingReview)

  const noContact = reminders.evaluateReminderEligibility(base, { contactsByRole: {} })
  assert.equal(noContact.eligible, false)
  assert.equal(noContact.suppressedReason, 'recipient_contact_missing')

  const plan = reminders.buildReminderPlan({
    requirements: [
      base,
      {
        ...base,
        id: '33333333-3333-4333-8333-333333333333',
        document_definition_key: 'seller_proof_of_address',
        document_definitions: { display_label: 'Proof of Address' },
      },
    ],
    contactsByRole: { seller: { email: 'seller@example.com' } },
    context: { property_address: '123 Main Street' },
  })
  assert.equal(plan.scheduled.length, 1)
  assert.equal(plan.scheduled[0].items.length, 2)
  assert.equal(plan.scheduled[0].template.title, 'Seller Identity & FICA documents still needed')
  assert.equal(plan.scheduled[0].template.body.includes('Seller ID Document'), true)

  const recentPlan = reminders.buildReminderPlan({
    requirements: [base],
    contactsByRole: { seller: { email: 'seller@example.com' } },
    existingReminders: [{
      id: 'existing',
      status: reminders.REMINDER_STATUSES.sent,
      last_reminded_at: new Date().toISOString(),
      metadata_json: { group_key: reminders.buildReminderGroupKey(eligible, reminders.REMINDER_CHANNELS.inApp) },
    }],
  })
  assert.equal(recentPlan.scheduled.length, 0)
  assert.equal(recentPlan.suppressedGroups[0].suppressedReason, 'recently_reminded')

  const contextClosed = reminders.buildReminderPlan({
    requirements: [base],
    contactsByRole: { seller: { email: 'seller@example.com' } },
    context: { status: 'registered' },
  })
  assert.equal(contextClosed.suppressed[0].suppressedReason, 'context_closed')

  const mock = createMockClient({ requirements: [base] })
  const scheduled = await reminders.scheduleCanonicalRemindersForContext({
    contextType: 'private_listing',
    contextId,
    contactsByRole: { seller: { email: 'seller@example.com' } },
    client: mock,
    force: true,
  })
  assert.equal(scheduled.scheduledReminders.length, 1)
  assert.equal(mock.state.reminders.length, 1)
  assert.equal(mock.state.reminderItems.length, 1)
  assert.equal(mock.state.events.at(-1).event_type, reminders.REMINDER_EVENT_TYPES.scheduled)

  const emailSend = await reminders.sendReminderThroughChannel({
    id: 'reminder-1',
    channel: reminders.REMINDER_CHANNELS.email,
    reminder_count: 0,
    reminder_type: reminders.REMINDER_TYPES.missingRequiredDocuments,
  }, {
    client: mock,
  })
  assert.equal(emailSend.sent, false)
  assert.equal(emailSend.suppressed, true)
  assert.equal(emailSend.reason, 'email_reminders_disabled')

  const manualMock = createMockClient()
  const manual = await reminders.sendManualDocumentReminder({
    requirementInstances: [base],
    contactsByRole: { seller: { email: 'seller@example.com' } },
    context: { property_address: '123 Main Street' },
    customNote: 'Please upload when convenient.',
    client: manualMock,
  })
  assert.equal(manual.sent.length, 1)
  assert.equal(manualMock.state.events.some((event) => event.event_type === reminders.REMINDER_EVENT_TYPES.manualFollowUpSent), true)

  const escalation = reminders.buildEscalationCandidate({
    ...plan.scheduled[0],
    reminderCount: 3,
  }, { escalationsEnabled: true })
  assert.equal(escalation.escalates, true)
  assert.equal(escalation.escalationRole, 'agent')

  const audit = reminders.buildReminderAuditReport({
    requirements: [base],
    reminders: mock.state.reminders,
    contactsByRole: { seller: { email: 'seller@example.com' } },
  })
  assert.deepEqual(audit.overdueDocumentRequirements, [base.id])

  console.log('canonical-document-reminders tests passed')
} finally {
  await server.close()
}
