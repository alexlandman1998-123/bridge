import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { summarizeWorkspaceBrandingIntegrity } from './workspace-branding-integrity-audit.mjs'

const migration = await readFile(
  new URL('../../supabase/migrations/202607160020_workspace_branding_integrity_phase6.sql', import.meta.url),
  'utf8',
)
const resolver = await readFile(new URL('../src/services/workspaceResolutionService.js', import.meta.url), 'utf8')

assert.match(migration, /bridge_canonical_workspace_memberships_v1[\s\S]*security_invoker\s*=\s*true/i)
assert.match(migration, /bridge_workspace_membership_integrity_v1[\s\S]*security_invoker\s*=\s*true/i)
assert.match(migration, /coalesce\(mapped_firm\.id, ou\.organisation_id\) as canonical_workspace_id/i)
assert.match(migration, /'organisation_users'::text as membership_source[\s\S]*union all[\s\S]*'attorney_firm_members'::text as membership_source/i)
assert.match(migration, /workspace_type = 'attorney_firm'[\s\S]*membership_source = 'attorney_firm_members' then 0/i)
assert.match(migration, /logo_present[\s\S]*branding_source/i)
assert.match(migration, /grant select on public\.bridge_canonical_workspace_memberships_v1 to authenticated/i)
assert.match(migration, /grant select on public\.bridge_workspace_membership_integrity_v1 to authenticated/i)
assert.doesNotMatch(migration, /grant select[\s\S]*to anon/i)
assert.doesNotMatch(migration, /delete from public\.(organisation_users|attorney_firm_members)/i)

assert.match(resolver, /firmByOrganisationId/)
assert.match(resolver, /workspaceId: linkedAttorneyFirm\?\.id \|\| row\.organisation_id/)
assert.match(resolver, /canonicalWorkspace\.sourceWorkspaceId = sourceWorkspaceId/)

const summary = summarizeWorkspaceBrandingIntegrity([
  {
    integrity_status: 'healthy_overlap',
    identity_normalized: false,
    membership_source_count: 2,
    logo_present: true,
  },
  {
    integrity_status: 'unbranded',
    identity_normalized: true,
    membership_source_count: 2,
    logo_present: false,
  },
  {
    integrity_status: 'missing_attorney_membership',
    identity_normalized: false,
    membership_source_count: 1,
    logo_present: true,
  },
])

assert.deepEqual(summary, {
  rowCount: 3,
  blockingCount: 1,
  normalizedIdentityCount: 1,
  overlapCount: 2,
  brandedCount: 2,
  unbrandedCount: 1,
  statusCounts: {
    healthy_overlap: 1,
    unbranded: 1,
    missing_attorney_membership: 1,
  },
  healthy: false,
})

console.log('workspace branding integrity Phase 6 tests passed')
