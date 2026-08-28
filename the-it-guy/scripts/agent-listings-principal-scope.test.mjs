import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const listingsSource = await fs.readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.match(
  listingsSource,
  /function resolveMembershipListingScopeRole\(\{ currentMembership = null, workspaceRole = '' \} = \{\}\)/,
  'AgentListings should centralize membership-role resolution for listing scope.',
)
assert.match(
  listingsSource,
  /currentMembership\?\.workspace_role/,
  'Principals stored with snake_case workspace_role must be recognized.',
)
assert.match(
  listingsSource,
  /currentMembership\?\.raw\?\.workspace_role/,
  'Raw membership workspace_role fallbacks must be recognized.',
)
assert.match(
  listingsSource,
  /currentMembership\?\.raw\?\.organisation_role/,
  'Raw membership organisation_role fallbacks must be recognized.',
)
assert.match(
  listingsSource,
  /includeAllOrganisationListings:\s*canAccessOrganisationListings\(\{/,
  'The private-listing loader must use the shared organisation listing access check.',
)
assert.match(
  listingsSource,
  /getAgentPrivateListingSummaries\(profile\.id,\s*\{/,
  'The main listings page must use the compact private-listing summary loader.',
)
assert.doesNotMatch(
  listingsSource,
  /dbPrivateListings\s*=\s*await getAgentPrivateListings\(/,
  'The main listings page must not invoke the full collection hydrator.',
)
assert.match(
  listingsSource,
  /includeCommissionTerms:\s*false/,
  'The initial listings screen must defer onboarding commission data.',
)
assert.match(
  listingsSource,
  /isEditListingWorkspace[\s\S]*?getPrivateListing\(remoteEditListingId\)/,
  'The edit route must retain a targeted full-record load.',
)
assert.match(
  listingsSource,
  /ORGANISATION_LISTING_SCOPE_ROLES = \['principal', 'owner', 'admin', 'hq', 'branch_manager', 'manager', 'team_lead'\]/,
  'Principal and management roles should load organisation-scoped listings.',
)

console.log('agent listings principal scope tests passed')
