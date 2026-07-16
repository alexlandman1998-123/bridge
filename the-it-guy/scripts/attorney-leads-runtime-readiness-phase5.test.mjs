import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getAttorneyLeadsLaunchReadiness } from '../src/services/attorneyLeadsService.js'

const edge = await readFile(new URL('../../supabase/functions/attorney-public-intake/index.ts', import.meta.url), 'utf8')
const intakeService = await readFile(new URL('../src/services/attorneyPublicIntakeService.js', import.meta.url), 'utf8')
const leadsService = await readFile(new URL('../src/services/attorneyLeadsService.js', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/AttorneyLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(edge, /action === "health"/)
assert.match(edge, /RUNTIME_VERSION/)
assert.match(edge, /resolve_attorney_public_intake/)
assert.match(edge, /database_unavailable/)
assert.match(intakeService, /probeAttorneyPublicIntakeRuntime/)
assert.match(leadsService, /Deploy or restore the Attorney public Journey Edge Function/)
assert.match(page, /Public runtime/)
assert.match(page, /Online/)
assert.match(page, /Offline/)

const dbResult = {
  status: 'ready',
  checked_at: '2026-07-16T12:00:00Z',
  journey: { active: true, slug: 'firm-journey', services_ready: true },
  operations: {},
  blockers: [],
  warnings: [],
}
const client = { rpc: async () => ({ data: dbResult, error: null }) }

const ready = await getAttorneyLeadsLaunchReadiness({
  organisationId: 'org-1',
  client,
  runtimeProbe: async (slug) => ({ healthy: slug === 'firm-journey', intakeActive: true, code: 'ready', version: 'phase5' }),
})
assert.equal(ready.status, 'ready')
assert.equal(ready.runtime.healthy, true)
assert.deepEqual(ready.blockers, [])

const missing = await getAttorneyLeadsLaunchReadiness({
  organisationId: 'org-1',
  client,
  runtimeProbe: async () => { throw new Error('Failed to send a request to the Edge Function') },
})
assert.equal(missing.status, 'blocked')
assert.equal(missing.runtime.code, 'unreachable')
assert.match(missing.blockers[0], /Edge Function/)

const wrongSlug = await getAttorneyLeadsLaunchReadiness({
  organisationId: 'org-1',
  client,
  runtimeProbe: async () => ({ healthy: false, intakeActive: false, code: 'intake_unavailable', version: 'phase5' }),
})
assert.equal(wrongSlug.status, 'blocked')

console.log('attorney Leads runtime readiness Phase 5 tests passed')
