import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const leadWorkspaceSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const organisationContextSource = await readFile(new URL('../src/context/OrganisationContext.jsx', import.meta.url), 'utf8')
const membershipStatusSource = await readFile(new URL('../src/constants/membershipStatuses.js', import.meta.url), 'utf8')
const acceptedStatusMigration = await readFile(new URL('../../supabase/migrations/202607130004_membership_helper_accepted_status.sql', import.meta.url), 'utf8')

assert.match(
  leadWorkspaceSource,
  /export function getLeadWorkspaceOrganisationId\(workspace = \{\}\)/,
  'Lead workspace should resolve an organisation id from its route workspace payload.',
)

assert.match(
  leadWorkspaceSource,
  /const organisationId = getLeadWorkspaceOrganisationId\(location\.state\?\.leadWorkspace\) \|\|[\s\S]*workspaceContext\?\.organisationId \|\|[\s\S]*organisationContext\?\.currentOrganisation\?\.id/,
  'Lead workspace should prefer its route payload, then the active workspace and canonical organisation context.',
)

assert.match(
  organisationContextSource,
  /const workspace = authState\.currentWorkspace \|\| \{\}[\s\S]*id: workspace\.id \|\| membership\.workspaceId \|\| ''/,
  'The canonical organisation context should resolve the active workspace before hydrating its organisation snapshot.',
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
