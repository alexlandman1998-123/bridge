import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createProperty24LeadSyncResponse, resolveScheduledProperty24After } from '../server/property24/index.js'

const account = (organisationId, agencyId) => ({ organisation_id: organisationId, agency_id: agencyId, environment: 'production', enabled: true })
const kingdom = account('kingdom', 39227)
const isell = account('isell', 39837)
const baseEnv = { VERCEL_ENV: 'production', PROPERTY24_PRODUCTION_BASE_URL: 'https://api.property24.com', CRON_SECRET: 'cron-secret', PROPERTY24_DEFAULT_AGENCY_ID: '40067' }
function stateClient(accounts = [kingdom, isell], checkpoints = {}, overlaps = []) {
  const writes = []
  const reads = []
  return {
    writes, reads,
    from(table) {
      const filters = []; let start = 0; let end = 99
      const query = {
        select: () => query, eq: (key, value) => { filters.push([key, value]); return query }, order: () => query,
        range: (a, b) => { start = a; end = b; return query },
        maybeSingle: async () => { reads.push({ table, filters }); return { data: { cursor_after: checkpoints[String(filters.find(([key]) => key === 'agency_id')?.[1])] || null }, error: null } },
        then(resolve, reject) { reads.push({ table, filters }); return Promise.resolve({ data: accounts.filter((row) => filters.every(([key, value]) => String(row[key]) === String(value))).slice(start, end + 1), error: null }).then(resolve, reject) },
      }; return query
    },
    async rpc(name, args) {
      writes.push({ name, args })
      return name === 'property24_acquire_lead_sync_lock'
        ? { data: [{ acquired: !overlaps.includes(args.p_agency_id), cursor_after: checkpoints[args.p_agency_id] || null, lock_token: 'lock-' + args.p_agency_id }], error: null }
        : { data: true, error: null }
    },
  }
}
async function run({ accounts, checkpoints, overlaps, url, env, credentials, pull } = {}) {
  const client = stateClient(accounts, checkpoints, overlaps)
  const calls = []
  const result = await createProperty24LeadSyncResponse({ url, headers: { authorization: 'Bearer cron-secret' }, env: { ...baseEnv, ...env }, dependencies: {
    createLeadSyncStateClient: () => client,
    fetchOrganisationCredentials: credentials || (async ({ organisationId }) => ({ username: organisationId, password: 'test-password', userGroupId: organisationId === 'kingdom' ? '' : 'group-isell' })),
    createProperty24: (config) => config,
    pullAndImportLeads: async (options) => { calls.push(options); return pull ? pull(options) : { import: { summary: { receivedCount: 1, importedCount: 1 } } } },
  } })
  return { result, client, calls }
}
assert.equal(resolveScheduledProperty24After({ cursorAfter: '2026-08-20T10:00:00Z', now: new Date('2026-08-20T10:05:00Z') }), '2026-08-19T10:05:00.000Z')
assert.equal(resolveScheduledProperty24After({ cursorAfter: '2026-08-17T10:00:00Z', now: new Date('2026-08-20T10:00:00Z') }), '2026-08-17T09:50:00.000Z')
const denied = await createProperty24LeadSyncResponse({ headers: { authorization: 'Bearer wrong' }, env: baseEnv })
assert.equal(denied.status, 401)
const global = await run()
assert.equal(global.result.status, 200)
assert.equal(global.result.body.connectionCount, 2)
assert.equal(global.result.body.imported, 2)
assert.deepEqual(global.calls.map((call) => [call.config.agencyId, call.config.organisationId, call.property24.username, call.property24.userGroupId]), [['39227', 'kingdom', 'kingdom', ''], ['39837', 'isell', 'isell', 'group-isell']])
assert.ok(global.calls.every((call) => call.config.applyLeads))
assert.ok(global.calls.every((call) => call.config.sendNotifications === false), 'Initial recovery must not send historical introductions.')
assert.ok(global.calls.every((call) => Date.now() - new Date(call.config.after).getTime() >= 29 * 86400000))
assert.deepEqual(global.client.writes.filter((call) => call.name.includes('acquire')).map((call) => call.args.p_agency_id), ['39227', '39837'])
assert.ok(!JSON.stringify(global.result.body).includes('test-password'))

// Connections are discovered every time, without adding another cron or default.
const next = await run({ accounts: [kingdom, isell, account('new-agency', 50000), { ...account('disabled', 60000), enabled: false }] })
assert.equal(next.result.body.connectionCount, 3)
assert.equal(next.calls[2].property24.username, 'new-agency')
const paged = await run({ accounts: Array.from({ length: 102 }, (_, i) => account('agency-' + i, 60000 + i)), pull: async () => ({ summary: { receivedCount: 0 } }) })
assert.equal(paged.result.body.connectionCount, 102)

const missing = await run({ credentials: async ({ organisationId }) => organisationId === 'kingdom' ? null : { username: 'isell', password: 'test-password', userGroupId: '' } })
assert.equal(missing.result.status, 502)
assert.equal(missing.calls.length, 1)
assert.equal(missing.result.body.reports[0].status, 'failed')
assert.equal(missing.result.body.reports[1].status, 'complete')
const failure = await run({ pull: async ({ config }) => { if (config.agencyId === '39227') throw new Error('Portal unavailable'); return { summary: { receivedCount: 0 } } } })
assert.equal(failure.result.status, 502)
assert.equal(failure.result.body.reports[1].status, 'complete')
assert.ok(failure.client.writes.some((call) => call.args.p_agency_id === '39227' && call.args.p_status === 'failed'))

const cursor = '2026-09-20T10:00:00.000Z'
const empty = await run({ accounts: [kingdom], checkpoints: { 39227: cursor }, pull: async () => ({ import: { summary: { receivedCount: 0, importedCount: 0 } } }) })
assert.equal(empty.result.body.reports[0].cursorAdvanced, false)
assert.equal(empty.calls[0].config.sendNotifications, true)
assert.equal(empty.client.writes[1].args.p_cursor_after, cursor)
const replay = await run({ accounts: [kingdom], checkpoints: { 39227: cursor }, pull: async () => ({ nextAfter: '2026-09-19T10:00:00Z', import: { summary: { receivedCount: 1, importedCount: 0 } } }) })
assert.equal(replay.client.writes[1].args.p_cursor_after, cursor)
const unresolved = await run({ accounts: [kingdom], checkpoints: { 39227: cursor }, pull: async () => ({ import: { summary: { receivedCount: 1 }, results: [{ status: 'needs_review' }] } }) })
assert.equal(unresolved.result.status, 502)
assert.equal(unresolved.client.writes[1].args.p_cursor_after, null)
const lookahead = await run({ accounts: [kingdom], pull: async () => ({ property24: { listingChecks: [{ lookaheadFallback: true }] }, import: { summary: { receivedCount: 1, importedCount: 1 } } }) })
assert.equal(lookahead.result.status, 502)
assert.match(lookahead.client.writes[1].args.p_error, /fell back/)
const overlap = await run({ overlaps: ['39227'] })
assert.equal(overlap.calls.length, 1)
assert.equal(overlap.result.body.reports[0].status, 'skipped_overlap')
const dry = await run({ url: '/api/property24/leads/sync?dryRun=true&agencyId=39227&after=2026-10-01T00:00:00Z' })
assert.equal(dry.result.body.connectionCount, 1)
assert.equal(dry.calls[0].config.applyLeads, false)
assert.equal(dry.calls[0].config.after, '2026-10-01T00:00:00.000Z')
assert.equal(dry.client.writes.length, 0, 'Dry runs must not change locks or checkpoints.')
assert.equal((await run({ url: '/api/property24/leads/sync?agencyId=40067' })).result.status, 404)
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
assert.ok(vercel.crons.some((cron) => cron.path === '/api/property24/leads/sync' && cron.schedule === '*/2 * * * *'))
assert.equal(vercel.functions['api/property24/leads/sync.js'].maxDuration, 300)
console.log('Global Property24 lead sync checks passed')
