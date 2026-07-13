import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const leadWorkspaceSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const membershipStatusSource = await readFile(new URL('../src/constants/membershipStatuses.js', import.meta.url), 'utf8')
const acceptedStatusMigration = await readFile(new URL('../../supabase/migrations/202607130004_membership_helper_accepted_status.sql', import.meta.url), 'utf8')

assert.match(
  leadWorkspaceSource,
  /function getMembershipOrganisationId\(membership = null\)/,
  'Lead workspace should resolve an organisation id from membership context.',
)

assert.match(
  leadWorkspaceSource,
  /const currentMembershipOrganisationId = getMembershipOrganisationId\(workspaceContext\.currentMembership\)[\s\S]+if \(currentMembershipOrganisationId\) return currentMembershipOrganisationId/,
  'Lead workspace should prefer the active current membership over a stale currentWorkspace id.',
)

assert.match(
  leadWorkspaceSource,
  /workspaceContext\.activeMemberships[\s\S]+workspaceContext\.memberships[\s\S]+workspaceContext\.currentWorkspace\?\.id/,
  'Lead workspace should fall back through active memberships before currentWorkspace.',
)

assert.match(
  membershipStatusSource,
  /if \(normalized === 'accepted'\) return MEMBERSHIP_STATUSES\.active/,
  'Accepted membership rows should normalize to active in app workspace resolution.',
)

assert.match(
  acceptedStatusMigration,
  /coalesce\(ou\.membership_status,\s*ou\.status,\s*''\)[\s\S]+in \('active', 'accepted'\)/,
  'Active-member RLS helper should accept active and accepted organisation_users membership states.',
)

console.log('agent lead workspace org scope tests passed')
