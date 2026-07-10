import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

function matches(source, pattern, message) {
  assert.match(source, pattern, message)
}

const inviteService = await read('../src/services/workspaceUserInviteService.js')
const agentsPage = await read('../src/pages/Agents.jsx')
const settingsUsersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
const agencyBranchesPage = await read('../src/pages/agency/AgencyBranchesPage.jsx')
const inviteResolver = await read('../src/pages/InviteResolver.jsx')
const authPage = await read('../src/pages/Auth.jsx')
const onboardingProfileSetup = await read('../src/pages/OnboardingProfileSetup.jsx')
const postDashboardSetup = await read('../src/pages/PostDashboardSetup.jsx')
const settingsApi = await read('../src/lib/settingsApi.js')
const signupIntentLib = await read('../src/lib/signupIntent.js')
const permissionRegistry = await read('../src/auth/permissions/permissionRegistry.js')
const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
const commercialRoleUtils = await read('../src/modules/commercial/utils/resolveCommercialRole.js')
const principalImmediateAccessMigration = await read('../../supabase/migrations/202607100001_principal_invites_immediate_access.sql')
const workspaceInviteEmail = await read('../../supabase/functions/send-email/handlers/workspaceInvite.ts')
const sendEmailTypes = await read('../../supabase/functions/send-email/types.ts')
const packageJson = JSON.parse(await read('../package.json'))

for (const marker of [
  'export async function listWorkspaceUserInvites',
  'export async function resendWorkspaceUserInvite',
  'export async function revokeWorkspaceUserInvite',
  'export async function createWorkspaceUserInvite',
  'export async function createPrincipalClaimInvite',
  'normalizeInviteDisplayRole',
  'metadata.commercial_role',
  'findActiveWorkspaceUserByEmail',
  'getWorkspaceInviteById',
  'deliverWorkspaceInvite',
]) {
  includes(inviteService, marker, `Workspace invite service should expose Phase 5 lifecycle behavior: ${marker}`)
}

matches(
  inviteService,
  /This email already belongs to an active user in this workspace/i,
  'New invites must be blocked for users who already have an active workspace membership.',
)
matches(
  inviteService,
  /duplicate_pending_invite[\s\S]*resendWorkspaceUserInvite/i,
  'Duplicate pending invites should resend the existing canonical invite instead of failing the principal flow.',
)
matches(
  inviteService,
  /reusedExistingInvite:\s*true/i,
  'Duplicate invite resends must be surfaced to callers.',
)
matches(
  inviteService,
  /last_delivery_status:\s*'sent'[\s\S]*last_delivery_error:\s*''/i,
  'Successful invite delivery should update delivery metadata.',
)
matches(
  inviteService,
  /last_delivery_status:\s*'failed'[\s\S]*last_delivery_failed_at/i,
  'Failed invite delivery should be captured in invite metadata for support diagnostics.',
)
matches(
  inviteService,
  /last_resent_at:\s*new Date\(\)\.toISOString\(\)/i,
  'Resends should record the resend timestamp.',
)
matches(
  inviteService,
  /first_sent_at:\s*sentAt[\s\S]*last_sent_at:\s*sentAt/i,
  'Initial sends should record first and last sent timestamps.',
)
matches(
  inviteService,
  /\.in\('invite_type',\s*\[[\s\S]*'principal_claim_invite'[\s\S]*\]\)/,
  'Pending invite lists must include principal claim invites so Settings can manage them before acceptance.',
)
matches(
  inviteService,
  /const principalClaimInvite = isPrincipalClaimInviteType\(inviteType\)[\s\S]*const role = principalClaimInvite[\s\S]*\? 'principal_claim'/,
  'Principal claim invite rows must normalize to a non-authority principal_claim role.',
)
matches(
  inviteService,
  /isPrincipalClaimInvite:\s*principalClaimInvite/,
  'Principal claim invite rows must expose an explicit UI flag.',
)
matches(
  inviteService,
  /const role = normalizeRole\([\s\S]*const roleLabel[\s\S]*await assertWorkspaceUserInviteAuthority\(\{ workspaceId, role, branchId \}\)[\s\S]*createInvite\(\{[\s\S]*target_workspace_role:\s*role/,
  'Normal workspace principal invites should stay on the canonical workspace invite path so access is granted on acceptance.',
)
matches(
  inviteService,
  /bridge_create_principal_claim_invite[\s\S]*target_workspace_role:\s*'principal'[\s\S]*role:\s*'principal_claim'[\s\S]*role_label:\s*'Principal'/,
  'Principal claim creation must request principal onboarding while storing a safe principal_claim invite role.',
)
matches(
  inviteService,
  /duplicate_pending_invite[\s\S]*role:\s*'principal_claim'[\s\S]*roleLabel:\s*'Principal'[\s\S]*reusedExistingInvite:\s*true/i,
  'Duplicate legacy principal claim invites should resend the existing principal link and preserve the principal label.',
)
for (const marker of [
  'resolveInviteBranding',
  'organisation_logo_url',
  'organisationLogoUrl: invite.organisationLogoUrl',
  'brand_primary_color',
]) {
  includes(inviteService, marker, `Workspace invites should preserve optional agency branding for invite emails: ${marker}`)
}
for (const marker of [
  'organisationLogoUrl?: string',
  'organisation_logo_url?: string',
  'brandPrimaryColor?: string',
  'brand_primary_color?: string',
]) {
  includes(sendEmailTypes, marker, `Workspace invite email payload should accept optional branding field: ${marker}`)
}
for (const marker of [
  'Workspace invitation',
  'Powered by Arch9',
  'linear-gradient',
  'Accept invite',
  'organisationLogoUrl',
  'getInitials',
]) {
  includes(workspaceInviteEmail, marker, `Workspace invite email should render the premium branded invite UI: ${marker}`)
}

for (const marker of [
  'listWorkspaceUserInvites({ includeInactive: false })',
  'onResendInvite={handleResendAgentInvite}',
  'onCopyInviteLink={handleCopyAgentInviteLink}',
  "onRevokeInvite={(agent) => openConfirm('revoke', agent)}",
  'This agent already had a pending invite, so Arch9 resent the existing onboarding link.',
]) {
  includes(agentsPage, marker, `Agents page should keep canonical pending invite management wired: ${marker}`)
}

matches(
  settingsUsersPage,
  /inviteResult\.reusedExistingInvite[\s\S]*Existing pending invite resent\.[\s\S]*User invite sent\./,
  'Settings users invite flow should distinguish reused pending invites from fresh sends.',
)
matches(
  settingsUsersPage,
  /principalInviteSelected[\s\S]*createWorkspaceUserInvite[\s\S]*role:\s*principalInviteSelected \? 'principal' : inviteForm\.role[\s\S]*settings_users_principal_invite/i,
  'Selecting Principal in Settings must send a direct principal workspace invite.',
)
matches(
  settingsUsersPage,
  /listWorkspaceUserInvites\(\{ includeInactive: true \}\)[\s\S]*setPrincipalClaimInviteHistory\(principalClaimInviteRows\)[\s\S]*setPendingPrincipalClaimInvites\(principalClaimInviteRows\.filter\(\(invite\) => invite\.status === 'pending_invite'\)\)/,
  'Settings users page should load the full principal claim lifecycle and derive the pending state from it.',
)
for (const marker of [
  'Principal Invite Activity',
  'setPrincipalClaimInviteHistory',
  'handleCopyPrincipalClaimLink',
  'handleResendPrincipalClaimInvite',
  'handleRevokePrincipalClaimInvite',
  'Copy Link',
  'Resend',
  'Revoke',
  'Send Principal Invite',
  'Principal invite selected. Arch9 grants active principal access as soon as the invite is accepted.',
  'A principal invite has been accepted.',
  'Access active',
  'Invite pending',
]) {
  includes(settingsUsersPage, marker, `Settings users page should expose principal invite activity UI: ${marker}`)
}
matches(
  settingsUsersPage,
  /useLocation\(\)[\s\S]*inviteNavigationState[\s\S]*resolveInviteRole/i,
  'Settings users invite flow should honor navigation intent from residential principal/manager CTAs.',
)
matches(
  settingsUsersPage,
  /branchId:\s*principalInviteSelected \? '' : inviteNavigationState\.branchId[\s\S]*branchName:\s*principalInviteSelected \? '' : inviteNavigationState\.branchName/i,
  'Settings users invite flow should preserve optional branch metadata for branch-scoped invites.',
)
matches(
  agencyBranchesPage,
  /inviteIntent:\s*'residential_principal_manager'[\s\S]*inviteRole:\s*'principal'[\s\S]*inviteSource:\s*'residential_branches_principal_manager_invite'/i,
  'Residential branches principal/manager CTA should open the invite form with the correct principal intent.',
)

for (const marker of [
  'itg:pending-org-invite-email',
  'itg:pending-org-invite-module',
  'itg:pending-org-invite-role',
  'itg:pending-org-invite-auto-accept-token',
  'CLEAR_PENDING_INVITE_REASONS',
  "new Set(['not_found', 'expired', 'revoked', 'already_accepted'])",
  'getInviteModuleContext',
  'getInviteRole',
  'isCommercialInvite',
  'rememberPendingInviteAutoAccept(safeToken)',
  'moduleContext: getInviteModuleContext(invite)',
  'role: getInviteRole(invite)',
  'window.location.assign(getRedirectTarget(result))',
  'window.location.replace(getInviteTarget(invite))',
  "'Accept invite'",
  'Accept Principal Invite',
  'Arch9 will grant principal access when this invite is accepted.',
]) {
  includes(inviteResolver, marker, `Invite resolver should preserve Phase 3/4 auth handoff behavior: ${marker}`)
}

for (const marker of [
  'claimExistingWorkspace',
  "workspace_action === SIGNUP_WORKSPACE_ACTIONS.claimExistingWorkspace",
  'Before We Continue',
  'We found a principal invite.',
]) {
  includes(onboardingProfileSetup, marker, `Onboarding profile setup should show the principal invite handoff: ${marker}`)
}

for (const marker of [
  'canClaimExistingWorkspace',
  "'Claim your agency workspace'",
  'Confirm the profile details for the principal who is claiming an existing agency workspace.',
  'workspace_action === SIGNUP_WORKSPACE_ACTIONS.claimExistingWorkspace',
]) {
  includes(postDashboardSetup, marker, `Post dashboard setup should understand the principal claim workspace action: ${marker}`)
}

matches(
  signupIntentLib,
  /workspace_action === SIGNUP_WORKSPACE_ACTIONS\.acceptInvite[\s\S]*workspace_action === SIGNUP_WORKSPACE_ACTIONS\.claimExistingWorkspace[\s\S]*return '\/setup'/,
  'Signup intent routing should treat principal claim intents as setup flows.',
)

matches(
  settingsApi,
  /bridge_complete_principal_claim_onboarding[\s\S]*workspace_action:\s*'claim_existing_workspace'[\s\S]*principal_claim_invite_id:\s*principalClaimInviteId/,
  'Agency onboarding completion must call the principal-claim completion RPC for pending principal claims.',
)
matches(
  settingsApi,
  /scopeMetadata\.source === 'principal_claim_invite'[\s\S]*Boolean\(scopeMetadata\.principalClaimInviteId\)/,
  'Settings user normalization must mark principal-claim memberships for clearer user directory status.',
)
for (const marker of [
  'create or replace function public.bridge_sync_principal_claim_membership',
  'create or replace function public.bridge_sync_direct_principal_invite_membership',
  'create trigger trg_bridge_sync_direct_principal_invite_membership',
  "new.invite_type <> 'principal_claim_invite'",
  "target_workspace_role, '')) <> 'principal'",
  "status = 'active'",
  "membership_status = 'active'",
  "role = 'principal'",
  "workspace_role = 'principal'",
  "organisation_role = 'principal'",
  "organization_role = 'principal'",
  "app_role = 'agent'",
  'v_commercial_enabled boolean := false',
  "om.module_key = 'commercial'",
  "module_context = case when v_commercial_enabled then 'commercial' else module_context end",
  "'commercialAccessInheritedAt'",
  "'principal_invite_immediate_access', true",
  "'principal_invite_access_granted'",
  'active_workspace_selected_at',
  'user_workspace_preferences',
  "'onboarding_completed'",
]) {
  includes(principalImmediateAccessMigration, marker, `Principal invite migration should grant immediate active access: ${marker}`)
}

matches(
  permissionRegistry,
  /\[ORG_ROLES\.owner\]: mergeGrants\(allGeneral, grant\(ACCESS_SCOPES\.allWorkspace, AGENCY_PERMISSIONS\)\)[\s\S]*\[ORG_ROLES\.principal\]: mergeGrants\(allGeneral, grant\(ACCESS_SCOPES\.allWorkspace, AGENCY_PERMISSIONS\)\)/,
  'Agency principals should keep the same all-workspace agency permission scope as organisation owners.',
)
matches(
  commercialApi,
  /const COMMERCIAL_HQ_ROLES = COMMERCIAL_ORGANISATION_SCOPE_ROLES[\s\S]*function resolveScopeLevel\(role\)[\s\S]*getCommercialScopeLevel\(role\)[\s\S]*return 'organisation'/,
  'Commercial scope resolution should use the shared organisation-level commercial role set.',
)
matches(
  commercialRoleUtils,
  /COMMERCIAL_ORGANISATION_SCOPE_ROLES = new Set\(\[[\s\S]*COMMERCIAL_ROLES\.principal[\s\S]*LEGACY_COMMERCIAL_ROLE_MAP = new Map\(\[[\s\S]*\['principal', COMMERCIAL_ROLES\.principal\][\s\S]*getCommercialScopeLevel\(userOrMembership[\s\S]*return 'organisation'/,
  'Commercial principals should resolve to organisation-level commercial scope once the commercial access marker is present.',
)
matches(
  commercialApi,
  /function isCommercialMembershipRow[\s\S]*return hasCommercialAccessMarker\(member\)/,
  'Commercial access should continue to be driven by the membership module marker inherited during principal claim completion.',
)
matches(
  commercialRoleUtils,
  /export function hasCommercialAccessMarker[\s\S]*COMMERCIAL_MODULE_MARKERS\.has\(moduleValue\)[\s\S]*return true/,
  'Commercial access markers should still be recognized by the shared role resolver.',
)

for (const marker of [
  'resolveInviteEmailFromLocation',
  'resolveInviteModuleFromLocation',
  'resolveInviteSignupPosition',
  'SIGNUP_BUSINESS_TYPES.commercialBrokerage',
  '!inviteDrivenSignup && signupStep === 0',
  'loading && !inviteDrivenSignup',
  'readOnly={inviteDrivenSignup && Boolean(invitedEmail)}',
  'This invite is locked to {invitedEmail}.',
  'Arch9 will take you straight into the invited workspace.',
  'This invite is for ${invitedEmail}. Sign in or create an account with that email address to continue.',
  'resolvePendingInvitePath(location) ||',
  'isPublicInviteReturnPath(redirectTo)',
  '? resolveSignupIntentRoute(currentIntent)',
  ': \'/setup\'',
  'if (inviteTokenFromUrl && inviteTokenFromUrl !== storedInviteToken) return \'\'',
]) {
  includes(authPage, marker, `Auth page should keep invite-email lock and redirect behavior: ${marker}`)
}

assert.equal(
  packageJson.scripts?.['test:agent-invite-onboarding-readiness'],
  'node scripts/agent-invite-onboarding-readiness.test.mjs',
  'Phase 6 readiness command should stay wired for the full invite onboarding regression suite.',
)

console.log('workspace user invite hardening tests passed')
