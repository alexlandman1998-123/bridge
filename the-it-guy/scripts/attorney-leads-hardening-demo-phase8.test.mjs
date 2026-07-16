import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getAttorneyLeadsLaunchReadiness } from '../src/services/attorneyLeadsService.js'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../../supabase/migrations/202607160007_attorney_leads_launch_readiness_phase8.sql', import.meta.url), 'utf8')
const edge = await readFile(new URL('../../supabase/functions/attorney-public-intake/index.ts', import.meta.url), 'utf8')
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const publicPage = await readFile(new URL('src/pages/AttorneyPublicIntakePage.jsx', root), 'utf8')
const notes = await readFile(new URL('docs/attorney-public-intake-leads-phase-8-notes.md', root), 'utf8')

function test(name, fn) {
  try {
    return Promise.resolve(fn()).then(() => console.log(`ok - ${name}`))
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('readiness is authenticated, tenant scoped, aggregate only, and read only', () => {
  assert.match(migration, /bridge_attorney_leads_launch_readiness/)
  assert.match(migration, /auth\.uid\(\) is null/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'view_link'/)
  assert.match(migration, /where lead\.organisation_id = p_organisation_id/)
  assert.match(migration, /where submission\.organisation_id = p_organisation_id/)
  assert.match(migration, /where conversion\.organisation_id = p_organisation_id/)
  assert.doesNotMatch(migration, /contact_id|first_name|last_name|ip_hash|request_metadata_json/)
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
  assert.match(migration, /revoke all on function public\.bridge_attorney_leads_launch_readiness\(uuid\) from public, anon/)
})

await test('launch gate separates blockers from operational warnings', () => {
  for (const marker of [
    'No active Attorney firm',
    'Create the firm public Journey link',
    'Enable the firm public Journey link',
    'Restore all six first-release Attorney services',
    'Attorney-qualified Lead or Matter owner',
    'failed conversion attempt(s)',
    'Lead follow-up(s) are due',
  ]) assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(migration, /'blocked'/)
  assert.match(migration, /'attention'/)
  assert.match(migration, /'ready'/)
})

await test('service normalizes the readiness result and uses the dedicated RPC', async () => {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push({ name, args })
    return { data: { status: 'attention', checked_at: '2026-07-16T12:00:00Z', journey: { active: true, services_ready: true }, operations: { qualified_owner_count: 2, due_follow_ups: 1 }, blockers: [], warnings: ['One warning'] }, error: null }
  } }
  const result = await getAttorneyLeadsLaunchReadiness({ organisationId: 'org-1', client })
  assert.equal(calls[0].name, 'bridge_attorney_leads_launch_readiness')
  assert.equal(calls[0].args.p_organisation_id, 'org-1')
  assert.equal(result.status, 'attention')
  assert.equal(result.operations.qualifiedOwnerCount, 2)
  assert.deepEqual(result.warnings, ['One warning'])
})

await test('firm workspace exposes actionable launch readiness beside the public link', () => {
  assert.match(page, /Launch readiness/)
  assert.match(page, /Ready to share/)
  assert.match(page, /getAttorneyLeadsLaunchReadiness/)
  assert.match(page, /qualifiedOwnerCount/)
  assert.match(page, /publicSubmissions30d/)
  assert.match(page, /dueFollowUps/)
})

await test('public boundary supplies hardened response and throttle headers', () => {
  for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy', 'X-Request-ID', 'Retry-After']) {
    assert.match(edge, new RegExp(header))
  }
  assert.match(publicPage, /no duplicate Lead was created/)
})

await test('demo runbook certifies duplicate safety, conversion, and Incoming Matters isolation', () => {
  assert.match(notes, /browser-to-database duplicate\/throttle rehearsal/)
  assert.match(notes, /only one Lead appears/)
  assert.match(notes, /no record was added to Incoming Matters/)
  assert.match(notes, /verify:attorney-leads-phase8/)
})

console.log('attorney Leads hardening and demo Phase 8 tests passed')
