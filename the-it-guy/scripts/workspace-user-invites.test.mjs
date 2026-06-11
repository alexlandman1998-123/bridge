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
const inviteResolver = await read('../src/pages/InviteResolver.jsx')
const authPage = await read('../src/pages/Auth.jsx')
const packageJson = JSON.parse(await read('../package.json'))

for (const marker of [
  'export async function listWorkspaceUserInvites',
  'export async function resendWorkspaceUserInvite',
  'export async function revokeWorkspaceUserInvite',
  'export async function createWorkspaceUserInvite',
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

for (const marker of [
  'listWorkspaceUserInvites({ includeInactive: false })',
  'onResendInvite={handleResendAgentInvite}',
  'onCopyInviteLink={handleCopyAgentInviteLink}',
  "onRevokeInvite={(agent) => openConfirm('revoke', agent)}",
  'This agent already had a pending invite, so Bridge resent the existing onboarding link.',
]) {
  includes(agentsPage, marker, `Agents page should keep canonical pending invite management wired: ${marker}`)
}

matches(
  settingsUsersPage,
  /inviteResult\.reusedExistingInvite \? 'Existing pending invite resent\.' : 'User invite sent\.'/,
  'Settings users invite flow should distinguish reused pending invites from fresh sends.',
)

for (const marker of [
  'itg:pending-org-invite-email',
  'itg:pending-org-invite-auto-accept-token',
  'CLEAR_PENDING_INVITE_REASONS',
  "new Set(['not_found', 'expired', 'revoked', 'already_accepted'])",
  'rememberPendingInviteAutoAccept(safeToken)',
  "navigate(getAuthInvitePath({ token: safeToken, email: invitedEmail, mode: 'signup' }))",
  "'Accept invite'",
]) {
  includes(inviteResolver, marker, `Invite resolver should preserve Phase 3/4 auth handoff behavior: ${marker}`)
}

for (const marker of [
  'resolveInviteEmailFromLocation',
  'readOnly={inviteDrivenSignup && Boolean(invitedEmail)}',
  'This invite is locked to {invitedEmail}.',
  'This invite is for ${invitedEmail}. Sign in or create an account with that email address to continue.',
  'resolvePendingInvitePath() || (currentIntent ? resolveSignupIntentRoute(currentIntent) : \'/setup\')',
]) {
  includes(authPage, marker, `Auth page should keep invite-email lock and redirect behavior: ${marker}`)
}

assert.equal(
  packageJson.scripts?.['test:agent-invite-onboarding-readiness'],
  'node scripts/agent-invite-onboarding-readiness.test.mjs',
  'Phase 6 readiness command should stay wired for the full invite onboarding regression suite.',
)

console.log('workspace user invite hardening tests passed')
