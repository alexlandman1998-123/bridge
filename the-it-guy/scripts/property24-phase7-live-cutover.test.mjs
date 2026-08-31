import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  applyProperty24LiveCutoverAction,
  assertProperty24ProductionWriteAllowed,
  buildProperty24LiveCutoverView,
  fetchProperty24LiveCutoverGate,
} from '../server/property24/liveCutoverService.js'
import { resolveProperty24EnvironmentCredentials } from '../server/property24/environmentService.js'

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function createFakeSupabase(initialTables = {}) {
  const tables = Object.fromEntries(
    Object.entries(initialTables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  )
  let generatedId = 0

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.sorts = []
      this.limitCount = null
      this.mutation = null
    }

    select() { return this }
    eq(column, value) { this.filters.push((row) => String(row[column]) === String(value)); return this }
    in(column, values) { const allowed = new Set(values.map(String)); this.filters.push((row) => allowed.has(String(row[column]))); return this }
    gte(column, value) { this.filters.push((row) => String(row[column] || '') >= String(value)); return this }
    order(column, options = {}) { this.sorts.push({ column, ascending: options.ascending !== false }); return this }
    limit(value) { this.limitCount = Number(value); return this }
    update(patch) { this.mutation = { type: 'update', patch }; return this }
    insert(rows) { this.mutation = { type: 'insert', rows: Array.isArray(rows) ? rows : [rows] }; return this }
    upsert(row, options = {}) { this.mutation = { type: 'upsert', row, options }; return this }

    execute() {
      const tableRows = tables[this.table] ||= []
      const matches = (row) => this.filters.every((filter) => filter(row))
      let rows = tableRows.filter(matches)

      if (this.mutation?.type === 'update') {
        rows.forEach((row) => Object.assign(row, this.mutation.patch))
      }
      if (this.mutation?.type === 'insert') {
        rows = this.mutation.rows.map((input) => {
          const row = {
            id: input.id || `generated-${++generatedId}`,
            created_at: input.created_at || '2026-08-31T15:00:00.000Z',
            ...input,
          }
          tableRows.push(row)
          return row
        })
      }
      if (this.mutation?.type === 'upsert') {
        const conflictColumns = String(this.mutation.options.onConflict || 'id').split(',')
        let row = tableRows.find((candidate) => conflictColumns.every((column) => String(candidate[column]) === String(this.mutation.row[column])))
        if (row) {
          Object.assign(row, this.mutation.row)
        } else {
          row = {
            id: this.mutation.row.id || `generated-${++generatedId}`,
            status: 'blocked',
            phase6_evidence_summary: {},
            last_reconciliation_summary: {},
            created_at: '2026-08-31T15:00:00.000Z',
            updated_at: '2026-08-31T15:00:00.000Z',
            ...this.mutation.row,
          }
          tableRows.push(row)
        }
        rows = [row]
      }

      for (const sort of this.sorts.reverse()) {
        rows.sort((left, right) => {
          const comparison = String(left[sort.column] || '').localeCompare(String(right[sort.column] || ''))
          return sort.ascending ? comparison : -comparison
        })
      }
      if (Number.isFinite(this.limitCount)) rows = rows.slice(0, this.limitCount)
      return { data: rows, error: null }
    }

    then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject) }
    async single() {
      const result = this.execute()
      if (!result.data.length) return { data: null, error: { code: 'PGRST116', message: 'No rows returned' } }
      return { data: result.data[0], error: null }
    }
    async maybeSingle() {
      const result = this.execute()
      return { data: result.data[0] || null, error: null }
    }
  }

  return {
    tables,
    from(table) { return new Query(table) },
  }
}

const productionRuntime = resolveProperty24EnvironmentCredentials({
  environment: 'production',
  env: {
    PROPERTY24_BASE_URL: 'https://api.exdev.property24-test.com',
    PROPERTY24_BASIC_AUTH_USERNAME: 'legacy-exdev-user',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'legacy-exdev-password',
    PROPERTY24_PRODUCTION_BASE_URL: 'https://api.property24.com',
    PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME: 'production-user',
    PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD: 'production-password',
  },
})
assert.equal(productionRuntime.environment, 'production')
assert.equal(productionRuntime.configured, true)
assert.equal(productionRuntime.credentialSource, 'environment_specific')
assert.equal(productionRuntime.username, 'production-user')

const mismatchedRuntime = resolveProperty24EnvironmentCredentials({
  environment: 'production',
  env: {
    PROPERTY24_BASE_URL: 'https://api.exdev.property24-test.com',
    PROPERTY24_BASIC_AUTH_USERNAME: 'legacy-user',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'legacy-password',
  },
})
assert.equal(mismatchedRuntime.configured, false)
assert.equal(mismatchedRuntime.environmentMatches, false)

const view = buildProperty24LiveCutoverView({
  gate: {
    id: 'gate-1',
    organisationId: 'org-1',
    status: 'pilot',
    phase6PackStatus: 'READY_FOR_VETTING',
    phase6PackDigest: 'phase6-digest',
    pilotListingLimit: 3,
    lastReconciliationStatus: 'OK',
  },
  productionConnection: { configured: true, environment: 'production', agencyId: '31382' },
  runtime: { productionCredentialsReady: true, syndicationEnabled: true },
  evidence: { summary: { trackedListingCount: 3, onPortalListingCount: 3, failedAttemptCount: 0 } },
})
assert.equal(view.pilotReady, true)
assert.equal(view.liveReady, true)
assert.equal(view.availableActions.promoteLive, true)
assert.equal(view.safety.bulkPublishingAllowed, false)
assert.equal(view.safety.rollbackDeletesRecords, false)

const supabase = createFakeSupabase({
  property24_live_cutover_gates: [],
  property24_live_cutover_events: [],
  property24_accounts: [
    { organisation_id: 'org-1', environment: 'production', agency_id: 31382, enabled: false },
  ],
  private_listings: [
    { id: 'listing-1', organisation_id: 'org-1' },
    { id: 'listing-2', organisation_id: 'org-1' },
    { id: 'listing-3', organisation_id: 'org-1' },
    { id: 'listing-4', organisation_id: 'org-1' },
  ],
  property24_listing_syncs: [],
  property24_sync_attempts: [],
})

const commonAction = {
  supabase,
  organisationId: 'org-1',
  actorUserId: 'user-1',
  productionConnection: { configured: true, environment: 'production', agencyId: '31382' },
  runtime: { productionCredentialsReady: true, syndicationEnabled: true },
}

const approval = await applyProperty24LiveCutoverAction({
  ...commonAction,
  action: 'approve_exdev',
  reason: 'ExDev vetting evidence reviewed and accepted.',
  phase6Pack: {
    status: 'READY_FOR_VETTING',
    generatedAt: '2026-08-31T14:00:00.000Z',
    summary: { passCount: 17, manualCount: 0 },
  },
})
assert.equal(approval.gate.status, 'approved')
assert.ok(approval.gate.phase6PackDigest)

const pilot = await applyProperty24LiveCutoverAction({
  ...commonAction,
  action: 'start_pilot',
  reason: 'Start the controlled three-listing production pilot.',
  productionCredentialCheck: { ok: true, echoHttpStatus: 200, agencyHttpStatus: 200 },
})
assert.equal(pilot.gate.status, 'pilot')
assert.equal(supabase.tables.property24_accounts[0].enabled, true)

supabase.tables.property24_listing_syncs.push(
  ...['listing-1', 'listing-2', 'listing-3'].map((listingId, index) => ({
    private_listing_id: listingId,
    environment: 'production',
    agency_id: 31382,
    listing_number: 100314819 + index,
    external_status: 'Active',
    is_on_portal: true,
    updated_at: '2026-08-31T15:00:00.000Z',
  })),
)

const live = await applyProperty24LiveCutoverAction({
  ...commonAction,
  action: 'promote_live',
  reason: 'Pilot listings are visible and reconciliation passed.',
  evidence: { summary: { trackedListingCount: 3, onPortalListingCount: 3, failedAttemptCount: 0 } },
  reconciliation: {
    status: 'OK',
    generatedAt: '2026-08-31T15:05:00.000Z',
    reconciliation: { summary: { matchedCount: 3, statusDriftCount: 0 } },
  },
})
assert.equal(live.gate.status, 'live')

const paused = await applyProperty24LiveCutoverAction({
  ...commonAction,
  action: 'pause',
  reason: 'Pause production while an operator reviews the portal.',
  evidence: { summary: { trackedListingCount: 3 } },
})
assert.equal(paused.gate.status, 'paused')
assert.equal(supabase.tables.property24_accounts[0].enabled, false)

const pausedRollback = await assertProperty24ProductionWriteAllowed({
  supabase,
  organisationId: 'org-1',
  agencyId: 31382,
  listingId: 'listing-1',
  environment: 'production',
  rollbackOnly: true,
})
assert.equal(pausedRollback.allowed, true)
assert.equal(pausedRollback.rollbackOnly, true)

await applyProperty24LiveCutoverAction({
  ...commonAction,
  action: 'resume_pilot',
  reason: 'Resume the controlled pilot after review completed.',
  productionCredentialCheck: { ok: true, echoHttpStatus: 200, agencyHttpStatus: 200 },
})
assert.equal((await fetchProperty24LiveCutoverGate({ supabase, organisationId: 'org-1' })).status, 'pilot')
assert.equal(supabase.tables.property24_accounts[0].enabled, true)

const allowedWrite = await assertProperty24ProductionWriteAllowed({
  supabase,
  organisationId: 'org-1',
  agencyId: 31382,
  listingId: 'listing-1',
  environment: 'production',
  now: new Date('2026-08-31T15:10:00.000Z'),
})
assert.equal(allowedWrite.allowed, true)

await assert.rejects(
  assertProperty24ProductionWriteAllowed({
    supabase,
    organisationId: 'org-1',
    agencyId: 31382,
    listingId: 'listing-4',
    environment: 'production',
    now: new Date('2026-08-31T15:10:00.000Z'),
  }),
  (error) => error.code === 'property24_pilot_listing_limit_reached',
)

supabase.tables.property24_sync_attempts.push(
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `attempt-${index}`,
    private_listing_id: 'listing-1',
    environment: 'production',
    agency_id: 31382,
    action: 'update',
    status: 'succeeded',
    created_at: `2026-08-31T15:09:${50 + index}.000Z`,
  })),
)
await assert.rejects(
  assertProperty24ProductionWriteAllowed({
    supabase,
    organisationId: 'org-1',
    agencyId: 31382,
    listingId: 'listing-1',
    environment: 'production',
    now: new Date('2026-08-31T15:10:00.000Z'),
  }),
  (error) => error.code === 'property24_production_rate_limited' && error.status === 429,
)

supabase.tables.property24_sync_attempts.splice(0, supabase.tables.property24_sync_attempts.length,
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `failed-attempt-${index}`,
    private_listing_id: 'listing-1',
    environment: 'production',
    agency_id: 31382,
    action: 'update',
    status: 'failed',
    created_at: `2026-08-31T15:0${7 + index}:00.000Z`,
  })),
)
await assert.rejects(
  assertProperty24ProductionWriteAllowed({
    supabase,
    organisationId: 'org-1',
    agencyId: 31382,
    listingId: 'listing-1',
    environment: 'production',
    now: new Date('2026-08-31T15:10:00.000Z'),
  }),
  (error) => error.code === 'property24_production_circuit_open',
)

const blockedSupabase = createFakeSupabase({
  property24_live_cutover_gates: [],
  private_listings: [{ id: 'blocked-listing', organisation_id: 'org-blocked' }],
})
await assert.rejects(
  assertProperty24ProductionWriteAllowed({
    supabase: blockedSupabase,
    organisationId: 'org-blocked',
    agencyId: 999,
    listingId: 'blocked-listing',
    environment: 'production',
  }),
  (error) => error.code === 'property24_live_cutover_not_authorized' && error.status === 403,
)

const migrationSource = read('../../supabase/migrations/20260831150740_property24_live_cutover_gate.sql')
assert.match(migrationSource, /property24_live_cutover_gates/)
assert.match(migrationSource, /property24_live_cutover_events/)
assert.match(migrationSource, /pilot_listing_limit between 1 and 3/)
assert.match(migrationSource, /enable row level security/)
assert.match(migrationSource, /revoke all on table public\.property24_live_cutover_gates from anon, authenticated/)
assert.match(migrationSource, /grant select, insert on table public\.property24_live_cutover_events to service_role/)

const publishServiceSource = read('../server/property24/publishService.js')
assert.match(publishServiceSource, /assertProperty24ProductionWriteAllowed/)
assert.match(publishServiceSource, /config\.syndicationEnabled &&/)
const connectionServiceSource = read('../server/property24/organisationConnectionService.js')
assert.match(connectionServiceSource, /assertProperty24ProductionConnectionEnablement/)
const apiSource = read('../server/property24/api.js')
assert.match(apiSource, /productionWriteRequired/)
assert.match(apiSource, /productionRollbackOnly/)
assert.match(apiSource, /PROPERTY24_PUBLISH_PERMISSION = 'publish_listings'/)
const endpointSource = read('../api/property24/settings/live-cutover.js')
assert.match(endpointSource, /supabase\.auth\.getUser\(token\)/)
assert.match(endpointSource, /createProperty24OrganisationVettingPack/)
assert.match(endpointSource, /runProperty24ReconciliationJob/)
const settingsSource = read('../src/pages/settings/SettingsProperty24Page.jsx')
assert.match(settingsSource, /Production cutover/)
assert.match(settingsSource, /No bulk publishing/)

console.log('Property24 Phase 7 live cutover contract passed')
