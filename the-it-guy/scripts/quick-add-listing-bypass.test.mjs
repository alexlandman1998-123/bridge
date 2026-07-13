import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const workspaceResolutionSource = await readFile(new URL('../src/services/workspaceResolutionService.js', import.meta.url), 'utf8')
const settingsApiSource = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const mandateStatusMigration = await readFile(new URL('../sql/20260630_private_listing_manual_mandate_statuses.sql', import.meta.url), 'utf8')
const privateListingFoundation = await readFile(new URL('../sql/20260509_private_listing_foundation.sql', import.meta.url), 'utf8')
const activeMemberInsertPolicyMigration = await readFile(new URL('../../supabase/migrations/202607130001_private_listing_insert_policy_active_member.sql', import.meta.url), 'utf8')
const membershipHelperAlignmentMigration = await readFile(new URL('../../supabase/migrations/202607130002_membership_helper_status_alignment.sql', import.meta.url), 'utf8')
const membershipHelperEmailAlignmentMigration = await readFile(new URL('../../supabase/migrations/202607130003_membership_helper_email_claim_alignment.sql', import.meta.url), 'utf8')

assert.match(
  source,
  /function validateQuickListingMinimumFields\(\{ form, assignedAgentKey, requireAssignedAgent = true \}\)/,
  'Quick Add should have a dedicated minimum validation path with optional assigned-agent enforcement.',
)

assert.match(
  source,
  /Property address is required\./,
  'Quick Add draft creation should require property address as the location anchor.',
)

assert.match(
  source,
  /Seller email or phone is required\./,
  'Quick Add should require at least one seller contact method.',
)

assert.match(
  source,
  /sellerOnboardingStatus: 'not_started'/,
  'Quick Add Supabase persistence must not mark seller onboarding completed.',
)

assert.doesNotMatch(
  source,
  /sellerOnboardingStatus: 'completed'/,
  'Quick Add should not persist completed onboarding for agent-captured listings.',
)

assert.match(
  source,
  /QUICK_ADD_MANDATE_STATUS_OPTIONS = \[/,
  'Quick Add should expose explicit manual mandate status options.',
)

for (const status of ['in_progress', 'signed_uploaded', 'signed_external_pending_upload', 'expired']) {
  assert.match(
    source,
    new RegExp(status),
    `Quick Add UI should support mandate status ${status}.`,
  )
  assert.match(
    serviceSource,
    new RegExp(`'${status}'`),
    `Private listing service should allow mandate status ${status}.`,
  )
  assert.match(
    mandateStatusMigration,
    new RegExp(`'${status}'`),
    `Manual mandate status migration should allow mandate status ${status}.`,
  )
}

assert.match(
  source,
  /mandateStatus === 'signed_uploaded' \? 'signed_external_pending_upload' : mandateStatus/,
  'Quick Add should keep signed-and-uploaded as pending upload until the document upload succeeds.',
)

assert.doesNotMatch(
  source,
  /const mandateStatus = mandateSigned && mandateUploaded \? 'signed_uploaded' : 'missing'/,
  'Quick Add should not use local-only mandate status values for persisted status decisions.',
)

assert.match(
  source,
  /listingStatus: resolvedListingIsActive \? 'listing_review' : resolvedListingStatus/,
  'Supabase Quick Add should create as listing review before any signed mandate upload promotes it to active.',
)

assert.match(
  source,
  /sellerUpdatePayload\.listingStatus = 'active'/,
  'Quick Add should promote controlled active listings after activation validation passes.',
)

assert.match(
  source,
  /function canQuickListingActivateWithMandateStatus\(value\)/,
  'Active listing selection should allow signed-uploaded and signed-external mandate states.',
)

assert.match(
  serviceSource,
  /const mentionsTable = Boolean\(tableNameHint && text\.includes\(tableNameHint\)\)/,
  'Private listing schema detection should not treat any table-name mention as a missing table.',
)

assert.match(
  serviceSource,
  /Private listing creation was blocked by Supabase row-level security\./,
  'Private listing insert RLS failures should surface membership/policy guidance instead of missing-table guidance.',
)

for (const migrationSource of [privateListingFoundation, activeMemberInsertPolicyMigration]) {
  assert.match(
    migrationSource,
    /with check \(public\.bridge_is_active_member\(organisation_id\)\)/,
    'Private listing insert policy should allow active organisation members without comparing profile ids to auth.uid().',
  )
}

assert.match(
  membershipHelperAlignmentMigration,
  /coalesce\(ou\.membership_status,\s*ou\.status,\s*''\)/,
  'Active-member helper should honor the canonical membership_status column before legacy status.',
)

assert.match(
  membershipHelperAlignmentMigration,
  /coalesce\(ou\.workspace_role,\s*ou\.organization_role,\s*ou\.organisation_role,\s*ou\.role,\s*''\)/,
  'Membership role helper should normalize current workspace role columns before legacy role.',
)

assert.match(
  membershipHelperEmailAlignmentMigration,
  /ou\.user_id\s+is\s+null[\s\S]+auth\.jwt\(\)\s*->>\s*'email'/,
  'Active-member helper should allow active email-only memberships for the signed-in email claim.',
)

assert.match(
  source,
  /function resolveSelectedWorkspaceOrganisationId\(\{ workspace = null, currentMembership = null, fallbackOrganisationId = '' \} = \{\}\)/,
  'Quick Add should resolve writes from the selected workspace before legacy organisation settings.',
)

assert.match(
  source,
  /organisationId: listingOrganisationId/,
  'Quick Add should insert private listings into the selected workspace organisation.',
)

assert.match(
  workspaceResolutionSource,
  /status: row\.membership_status \|\| row\.status/,
  'Workspace resolution should prefer membership_status before legacy status.',
)

assert.match(
  workspaceResolutionSource,
  /organization_role/,
  'Workspace resolution should select current organization_role values.',
)

assert.match(
  settingsApiSource,
  /isActiveMembershipStatus\(row\?\.membership_status \|\| row\?\.status\)/,
  'Legacy organisation settings lookup should prefer membership_status when finding active memberships.',
)

assert.match(
  source,
  /Capture a signed mandate status before marking the listing Active\./,
  'Active listing selection should still block listings without signed mandate authority.',
)

assert.match(
  source,
  /Active With Warning/,
  'Quick Add should surface active listings with compliance gaps as Active With Warning.',
)

assert.match(
  source,
  /Signed mandate upload outstanding/,
  'Signed external mandates should keep the upload follow-up visible.',
)

assert.match(
  source,
  /Use this when the listing or mandate already exists outside Bridge\./,
  'Quick Add copy should explain the manual or external listing workaround.',
)

console.log('quick-add-listing-bypass tests passed')
