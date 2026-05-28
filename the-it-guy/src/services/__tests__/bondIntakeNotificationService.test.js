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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createQuery(state, calls, table, action = 'select', payload = null) {
  const query = {
    filters: [],
    orderSpec: null,
    limitCount: null,
    eq(column, value) {
      this.filters.push({ op: 'eq', column, value })
      return this
    },
    in(column, values) {
      this.filters.push({ op: 'in', column, values })
      return this
    },
    order(column, options = {}) {
      this.orderSpec = { column, ascending: options.ascending !== false }
      return this
    },
    limit(count) {
      this.limitCount = count
      return this
    },
    maybeSingle() {
      const rows = this.resolveRows()
      calls.push({ table, action: `${action}:maybeSingle`, payload, filters: this.filters })
      return Promise.resolve({ data: rows[0] || null, error: null })
    },
    single() {
      if (action === 'insert') {
        const row = { id: `${table}-${state[table].length + 1}`, ...payload }
        state[table].push(row)
        calls.push({ table, action: 'insert', payload: row, filters: this.filters })
        return Promise.resolve({ data: row, error: null })
      }
      const rows = this.resolveRows()
      calls.push({ table, action: `${action}:single`, payload, filters: this.filters })
      return Promise.resolve({ data: rows[0] || null, error: null })
    },
    resolveRows() {
      let rows = [...(state[table] || [])]
      for (const filter of this.filters) {
        if (filter.op === 'eq') {
          rows = rows.filter((row) => row?.[filter.column] === filter.value)
        } else if (filter.op === 'in') {
          rows = rows.filter((row) => (filter.values || []).includes(row?.[filter.column]))
        }
      }
      if (this.orderSpec) {
        const { column, ascending } = this.orderSpec
        rows.sort((left, right) => {
          const compare = String(left?.[column] || '').localeCompare(String(right?.[column] || ''))
          return ascending ? compare : -compare
        })
      }
      if (Number.isFinite(this.limitCount)) rows = rows.slice(0, this.limitCount)
      return rows.map(clone)
    },
    then(resolve) {
      const rows = this.resolveRows()
      calls.push({ table, action, payload, filters: this.filters })
      resolve({ data: rows, error: null })
    },
  }
  return query
}

function createMockClient(initialState = {}) {
  const state = {
    transactions: [],
    transaction_events: [],
    transaction_notifications: [],
    transaction_participants: [],
    transaction_role_players: [],
    organisation_preferred_partners: [],
    organisation_users: [],
    profiles: [],
    buyers: [],
    ...clone(initialState),
  }
  const calls = []
  return {
    state,
    calls,
    from(table) {
      if (!state[table]) state[table] = []
      return {
        select() {
          return createQuery(state, calls, table, 'select')
        },
        insert(payload) {
          return {
            select() {
              return createQuery(state, calls, table, 'insert', payload)
            },
          }
        },
      }
    },
  }
}

function transaction(overrides = {}) {
  return {
    id: 'tx-bond-1',
    finance_type: 'bond',
    buyer_id: 'buyer-1',
    buyer_name: 'Mila Buyer',
    buyer_email: 'mila@example.test',
    assigned_agent_email: 'agent@example.test',
    assigned_agent: 'Alex Agent',
    organisation_id: 'agency-1',
    bond_workspace_id: 'bond-org-1',
    ...overrides,
  }
}

const baseState = {
  buyers: [{ id: 'buyer-1', name: 'Mila Buyer', email: 'mila@example.test' }],
  profiles: [
    { id: 'buyer-user-1', email: 'mila@example.test', full_name: 'Mila Buyer' },
    { id: 'agent-user-1', email: 'agent@example.test', full_name: 'Alex Agent' },
    { id: 'originator-user-1', email: 'originator@example.test', full_name: 'Olive Originator' },
    { id: 'consultant-user-1', email: 'consultant@example.test', full_name: 'Case Consultant' },
  ],
  organisations: [
    {
      id: 'bond-org-1',
      name: 'Originator Partners',
      display_name: 'Originator Partners',
      company_email: 'support@originator.test',
      company_phone: '010 555 0101',
    },
  ],
  transaction_participants: [
    {
      transaction_id: 'tx-bond-1',
      user_id: 'agent-user-1',
      role_type: 'agent',
      participant_name: 'Alex Agent',
      participant_email: 'agent@example.test',
      status: 'active',
    },
  ],
  transaction_role_players: [
    {
      transaction_id: 'tx-bond-1',
      role_type: 'bond_originator',
      contact_person: 'Olive Originator',
      partner_name: 'Originator Partners',
      email_address: 'originator@example.test',
      phone_number: '082 555 0101',
      status: 'active',
    },
  ],
  organisation_users: [
    {
      id: 'manager-row-1',
      organisation_id: 'bond-org-1',
      user_id: 'manager-user-1',
      first_name: 'Morgan',
      last_name: 'Manager',
      email: 'manager@example.test',
      role: 'manager',
      status: 'active',
    },
  ],
}

try {
  const {
    BOND_NOTIFICATION_EVENTS,
    checkAndNotifyBondDocumentsComplete,
    notifyBondIntakeEvent,
    notifyBondIntakeStartedForOnboarding,
    resolveBondNotificationRecipients,
  } = await server.ssrLoadModule('/src/services/bondIntakeNotificationService.js')

  const onboardingClient = createMockClient(baseState)
  const started = await notifyBondIntakeStartedForOnboarding({
    transaction: transaction(),
    formData: { finance_type: 'bond' },
    client: onboardingClient,
  })
  assert.equal(started.eventType, BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED)
  assert.equal(onboardingClient.state.transaction_events.length, 6)
  assert.equal(started.buyerIntro.eventType, BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO)
  assert.equal(onboardingClient.state.transaction_events[0].event_data.event_key, 'bond_intake_started')
  assert.equal(onboardingClient.state.transaction_events.some((row) => row.event_type === BOND_NOTIFICATION_EVENTS.BUYER_BOND_ORIGINATOR_INTRO), true)
  assert.equal(onboardingClient.state.transaction_events.some((row) => row.event_type === 'buyer_bond_originator_introduced'), true)
  assert.equal(onboardingClient.state.transaction_events.some((row) => row.event_type === 'application_added_to_pipeline'), true)
  assert.equal(onboardingClient.state.transaction_events.some((row) => row.event_type === 'branch_manager_notified'), true)
  assert.equal(onboardingClient.state.transaction_events.some((row) => row.event_type === 'consultant_notified'), true)
  assert.equal(started.emailSuppressed, true)
  assert.equal(onboardingClient.state.transaction_notifications.some((row) => row.user_id === 'manager-user-1'), true)
  assert.equal(onboardingClient.state.transaction_notifications.some((row) => row.user_id === 'originator-user-1'), true)
  assert.equal(onboardingClient.state.transaction_notifications.some((row) => row.user_id === 'buyer-user-1' && row.notification_type === 'buyer_intro_email_sent'), true)

  const duplicateStarted = await notifyBondIntakeStartedForOnboarding({
    transaction: transaction(),
    formData: { finance_type: 'hybrid' },
    client: onboardingClient,
  })
  assert.equal(duplicateStarted.duplicate, true)
  assert.equal(onboardingClient.state.transaction_events.length, 6)

  const cashClient = createMockClient(baseState)
  const cashResult = await notifyBondIntakeStartedForOnboarding({
    transaction: transaction({ id: 'tx-cash-1', finance_type: 'cash' }),
    formData: { finance_type: 'cash' },
    client: cashClient,
  })
  assert.equal(cashResult.reason, 'not_bond_finance')
  assert.equal(cashClient.state.transaction_events.length, 0)

  const applicationClient = createMockClient(baseState)
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED,
    transaction: transaction(),
    client: applicationClient,
  })
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED,
    transaction: transaction(),
    client: applicationClient,
  })
  assert.equal(applicationClient.state.transaction_events.filter((row) => row.event_type === BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_STARTED).length, 1)

  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
    transaction: transaction(),
    client: applicationClient,
  })
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
    transaction: transaction(),
    client: applicationClient,
  })
  assert.equal(applicationClient.state.transaction_events.filter((row) => row.event_type === BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED).length, 1)

  const documentsClient = createMockClient(baseState)
  const notCrossing = await checkAndNotifyBondDocumentsComplete({
    transaction: transaction(),
    previousMissingCount: 0,
    readiness: { missingRequiredDocs: 0, docsComplete: true },
    client: documentsClient,
  })
  assert.equal(notCrossing.reason, 'documents_not_crossing_complete_threshold')
  const stillMissing = await checkAndNotifyBondDocumentsComplete({
    transaction: transaction(),
    previousMissingCount: 2,
    readiness: { missingRequiredDocs: 1, docsComplete: false },
    client: documentsClient,
  })
  assert.equal(stillMissing.reason, 'documents_not_crossing_complete_threshold')
  const crossing = await checkAndNotifyBondDocumentsComplete({
    transaction: transaction(),
    previousMissingCount: 2,
    readiness: { missingRequiredDocs: 0, docsComplete: true },
    client: documentsClient,
  })
  assert.equal(crossing.eventType, BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE)

  const explicitRecipients = [
    { userId: 'buyer-user-1', email: 'buyer@example.test', name: 'Buyer User', roleType: 'client' },
    { userId: 'agent-user-1', email: 'agent@example.test', name: 'Alex Agent', roleType: 'agent' },
  ]
  const acceptClient = createMockClient(baseState)
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ACCEPTED,
    transaction: transaction(),
    recipients: explicitRecipients,
    client: acceptClient,
  })
  assert.equal(acceptClient.state.transaction_notifications.some((row) => row.user_id === 'buyer-user-1'), true)
  assert.equal(acceptClient.state.transaction_notifications.some((row) => row.user_id === 'agent-user-1'), true)

  const assignClient = createMockClient(baseState)
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_ASSIGNED,
    transaction: transaction(),
    metadata: { assignee: { id: 'consultant-user-1', email: 'consultant@example.test', name: 'Case Consultant' } },
    client: assignClient,
  })
  assert.equal(assignClient.state.transaction_notifications.some((row) => row.user_id === 'consultant-user-1'), true)

  const declineClient = createMockClient(baseState)
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_DECLINED,
    transaction: transaction(),
    metadata: { reason: 'Outside mandate' },
    client: declineClient,
  })
  assert.equal(declineClient.state.transaction_notifications.some((row) => row.user_id === 'agent-user-1'), true)
  assert.equal(declineClient.state.transaction_notifications.some((row) => /buyer/i.test(row.role_type)), false)

  const emailCalls = []
  const emailClient = createMockClient(baseState)
  const invokeEmailFunction = async (functionName, request) => {
    emailCalls.push({ functionName, request })
    return { data: { ok: true, sent: true }, error: null }
  }
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
    transaction: transaction(),
    recipients: [{ userId: 'originator-user-1', email: 'originator@example.test', name: 'Olive Originator', roleType: 'bond_originator' }],
    emailEnabled: true,
    invokeEmailFunction,
    client: emailClient,
  })
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
    transaction: transaction(),
    recipients: [{ userId: 'originator-user-1', email: 'originator@example.test', name: 'Olive Originator', roleType: 'bond_originator' }],
    emailEnabled: true,
    invokeEmailFunction,
    client: emailClient,
  })
  assert.equal(emailCalls.length, 1)

  const managerEmailCalls = []
  const managerEmailClient = createMockClient(baseState)
  await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_INTAKE_STARTED,
    transaction: transaction({ id: 'tx-bond-manager-email' }),
    recipients: [{ userId: 'manager-user-1', email: 'manager@example.test', name: 'Morgan Manager', roleType: 'branch_manager' }],
    emailEnabled: true,
    invokeEmailFunction: async (functionName, request) => {
      managerEmailCalls.push({ functionName, request })
      return { data: { ok: true, sent: true }, error: null }
    },
    client: managerEmailClient,
  })
  assert.equal(managerEmailCalls.length, 1)
  assert.equal(managerEmailCalls[0].request.body.subject, 'New Bond Application Added To Pipeline')

  const buyerIntroEmailCalls = []
  const buyerIntroEmailClient = createMockClient(baseState)
  await notifyBondIntakeStartedForOnboarding({
    transaction: transaction(),
    formData: { finance_type: 'bond' },
    metadata: { applicationPath: '/client-access' },
    emailEnabled: true,
    invokeEmailFunction: async (functionName, request) => {
      buyerIntroEmailCalls.push({ functionName, request })
      return { data: { ok: true, sent: true }, error: null }
    },
    client: buyerIntroEmailClient,
  })
  const buyerIntroCall = buyerIntroEmailCalls.find((call) => call.request.body.type === 'bond_originator_buyer_intro')
  assert.ok(buyerIntroCall)
  assert.equal(buyerIntroCall.request.body.to, 'mila@example.test')
  assert.equal(buyerIntroCall.request.body.metadata.consultantName, 'Olive Originator')
  assert.equal(buyerIntroCall.request.body.metadata.consultantPhone, '082 555 0101')
  assert.equal(buyerIntroCall.request.body.metadata.organisationName, 'Originator Partners')
  assert.equal(buyerIntroCall.request.body.metadata.applicationLink, '/client-access')
  assert.equal(
    buyerIntroEmailClient.state.transaction_events.some((row) => row.event_type === 'buyer_bond_originator_introduced'),
    true,
  )
  assert.equal(
    buyerIntroEmailClient.state.transaction_notifications.some((row) => row.user_id === 'buyer-user-1' && row.notification_type === 'buyer_intro_email_sent'),
    true,
  )

  const rawResolverClient = createMockClient({
    ...baseState,
    transaction_role_players: [
      {
        transaction_id: 'tx-bond-1',
        role_type: 'bond_originator',
        partner_name: '9f0c2c1f-bb69-4a0d-81ff-c96379ddbd9b',
        contact_person: '',
        email_address: 'originator@example.test',
        status: 'active',
      },
    ],
  })
  const resolved = await resolveBondNotificationRecipients(transaction(), { client: rawResolverClient })
  assert.notEqual(resolved.preferredOriginator.name, '9f0c2c1f-bb69-4a0d-81ff-c96379ddbd9b')
  assert.equal(resolved.preferredOriginator.email, 'originator@example.test')

  const missingOriginatorClient = createMockClient({
    ...baseState,
    transaction_role_players: [],
    organisation_preferred_partners: [],
  })
  const missingOriginator = await resolveBondNotificationRecipients(transaction(), { client: missingOriginatorClient })
  assert.equal(missingOriginator.preferredOriginator, null)

  const suppressedClient = createMockClient(baseState)
  const suppressed = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_SUBMITTED,
    transaction: transaction({ id: 'tx-bond-suppressed' }),
    recipients: [{ userId: 'originator-user-1', email: 'originator@example.test', name: 'Olive Originator', roleType: 'bond_originator' }],
    emailEnabled: false,
    client: suppressedClient,
  })
  assert.equal(suppressed.emailSuppressed, true)
  assert.equal(suppressedClient.state.transaction_events.length, 1)

  console.log('bondIntakeNotificationService tests passed')
} finally {
  await server.close()
}
