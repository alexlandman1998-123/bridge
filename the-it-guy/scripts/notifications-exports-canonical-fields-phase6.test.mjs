import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:notifications-exports-canonical-fields-phase6'],
  'node scripts/notifications-exports-canonical-fields-phase6.test.mjs',
  'package.json should expose the notifications and exports canonical fields Phase 6 contract.',
)
assert.equal(
  packageJson.scripts?.['verify:canonical-fields-phase6:staging'],
  'node --env-file=.env --env-file=.env.staging.local scripts/notifications-exports-canonical-fields-phase6.test.mjs --live',
  'package.json should expose the Phase 6 staging smoke command.',
)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return String(value || '').trim()
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
        return Promise.resolve({ data: clone(row), error: null })
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
    organisations: [],
    units: [],
    developments: [],
    ...clone(initialState),
  }
  const calls = []
  return {
    state,
    calls,
    auth: {
      getUser: async () => ({ data: { user: { id: 'phase-6-user' } }, error: null }),
    },
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

function projectRefFromUrl(value) {
  const match = normalizeText(value).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return match?.[1] || ''
}

async function runLiveStagingSmoke() {
  if (!process.argv.includes('--live')) return { skipped: true, reason: 'live_not_requested' }

  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  assert.ok(supabaseUrl, 'SUPABASE_URL or VITE_SUPABASE_URL is required for Phase 6 staging smoke.')
  assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required for Phase 6 staging smoke.')
  assert.equal(
    projectRefFromUrl(supabaseUrl),
    STAGING_PROJECT_REF,
    `Refusing Phase 6 staging smoke outside Supabase project ${STAGING_PROJECT_REF}.`,
  )

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const checks = [
    ['transactions', 'id'],
    ['transaction_events', 'id'],
    ['transaction_notifications', 'id'],
  ]
  for (const [table, columns] of checks) {
    const { error } = await client.from(table).select(columns).limit(1)
    assert.ifError(error)
  }
  return { skipped: false, projectRef: STAGING_PROJECT_REF }
}

const canonicalOnboardingFormData = {
  buyer: {
    person: {
      first_name: 'Jordan',
      last_name: 'Buyer',
    },
  },
  seller: {
    person: {
      first_name: 'Alex',
      last_name: 'Seller',
    },
  },
  property: {
    address: {
      line_1: '22 Bond Street',
      suburb: 'Newlands',
      city: 'Cape Town',
      postal_code: '7700',
    },
  },
  finance: {
    purchase_finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
}

const staleTransaction = {
  id: 'tx-phase-6',
  transaction_id: 'tx-phase-6',
  organisation_id: 'agency-1',
  buyer_id: 'buyer-1',
  finance_type: 'bond',
  finance_managed_by: 'bond_originator',
  buyer_name: 'Buyer pending',
  buyerName: 'Buyer pending',
  property_address_line_1: 'Property pending',
  property_description: 'Property pending',
  onboarding_form_data: canonicalOnboardingFormData,
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    BOND_NOTIFICATION_EVENTS,
    notifyBondIntakeEvent,
  } = await server.ssrLoadModule('/src/services/bondIntakeNotificationService.js')
  const {
    __transactionPartnerInvitationServiceTestUtils,
  } = await server.ssrLoadModule('/src/services/transactionPartnerInvitationService.js')
  const {
    buildCanonicalBondApplicationExport,
  } = await server.ssrLoadModule('/src/modules/bond/integrations/canonical/canonicalBondApplicationExport.js')
  const {
    BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    BOND_APPLICATION_RECIPIENT_FORMAT_KEYS,
    buildBondApplicationRecipientFormatPackage,
  } = await server.ssrLoadModule('/src/modules/bond/integrations/packages/bondApplicationExportPackages.js')

  const notificationClient = createMockClient({
    transaction_events: [],
    transaction_notifications: [],
  })
  const notificationResult = await notifyBondIntakeEvent({
    eventType: BOND_NOTIFICATION_EVENTS.BOND_APPLICATION_READY_FOR_REVIEW,
    transaction: staleTransaction,
    recipients: [
      {
        userId: 'originator-user-1',
        email: 'originator@example.test',
        name: 'Olive Originator',
        roleType: 'bond_originator',
      },
    ],
    metadata: { onboardingFormData: canonicalOnboardingFormData },
    client: notificationClient,
    enabled: true,
    emailEnabled: false,
  })

  assert.equal(notificationResult.skipped, false)
  assert.equal(notificationResult.activity.event_data.metadata.buyerName, 'Jordan Buyer')
  assert.equal(notificationResult.activity.event_data.metadata.propertyLabel, '22 Bond Street')
  assert.match(notificationResult.activity.event_data.notification_message, /Jordan Buyer/)
  assert.match(notificationResult.activity.event_data.notification_message, /22 Bond Street/)
  assert.equal(notificationResult.notifications[0].event_data.buyerName, 'Jordan Buyer')
  assert.equal(notificationResult.notifications[0].event_data.propertyLabel, '22 Bond Street')

  const invitationClient = createMockClient({
    transactions: [staleTransaction],
    organisations: [{ id: 'agency-1', name: 'Agency One', display_name: 'Agency One' }],
    buyers: [{ id: 'buyer-1', name: 'Buyer pending', email: 'buyer@example.test' }],
  })
  const invitationContext = await __transactionPartnerInvitationServiceTestUtils.getTransactionPartnerInvitationEmailContext(
    invitationClient,
    'tx-phase-6',
  )
  assert.equal(invitationContext.buyerLabel, 'Jordan Buyer')
  assert.equal(invitationContext.propertyLabel, '22 Bond Street')

  const canonicalExport = buildCanonicalBondApplicationExport({
    submission: {
      id: 'sub-phase-6',
      transaction_id: 'tx-phase-6',
      snapshot_hash: 'phase-6-snapshot-hash',
      submission_version: 1,
      submitted_at: '2026-08-01T10:00:00.000Z',
      snapshot_json: {
        transaction: staleTransaction,
        onboarding_form_data: canonicalOnboardingFormData,
        property: {
          displayAddress: 'Property pending',
          address: 'Property pending',
        },
        finance: {
          purchasePrice: '1200000',
          depositAmount: '100000',
          requestedBondAmount: '1100000',
        },
        participants: [
          {
            role: 'primary_applicant',
            answers: {
              personal: {
                first_name: 'Jordan',
                last_name: 'Buyer',
              },
            },
          },
        ],
      },
    },
    generatedAt: '2026-08-01T10:00:00.000Z',
  })
  assert.equal(canonicalExport.application.property.displayAddress, '22 Bond Street')
  assert.equal(canonicalExport.application.property.address, '22 Bond Street')
  assert.equal(canonicalExport.participants[0].displayName, 'Jordan Buyer')

  const recipientFormat = await buildBondApplicationRecipientFormatPackage({
    exportPackage: {
      id: 'export-package-phase-6',
      destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
      transactionId: 'tx-phase-6',
      submissionId: 'sub-phase-6',
      sourceSnapshotHash: 'phase-6-snapshot-hash',
      canonicalHash: 'phase-6-canonical-hash',
      canonicalExport,
    },
    generatedAt: '2026-08-01T10:00:00.000Z',
  })
  assert.equal(recipientFormat.ok, true)
  const summaryCsv = recipientFormat.formatPackage.artifacts.find(
    (artifact) => artifact.formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorSummaryCsv,
  )
  assert.ok(summaryCsv, 'Originator summary CSV should be generated.')
  assert.match(summaryCsv.body, /property,,,display_address,22 Bond Street/)
  assert.match(summaryCsv.body, /participant,primary_applicant,primary_applicant:1,display_name,Jordan Buyer/)

  const live = await runLiveStagingSmoke()
  if (live.skipped) {
    console.log(`notifications and exports canonical fields Phase 6 tests passed (staging smoke skipped: ${live.reason})`)
  } else {
    console.log(`notifications and exports canonical fields Phase 6 tests passed (staging smoke: ${live.projectRef})`)
  }
} finally {
  await server.close()
}
