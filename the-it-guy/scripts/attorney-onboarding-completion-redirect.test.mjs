import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const onboardingSource = readFileSync(new URL('../src/pages/AttorneyOnboardingPage.jsx', import.meta.url), 'utf8')
const postDashboardSetupSource = readFileSync(new URL('../src/pages/PostDashboardSetup.jsx', import.meta.url), 'utf8')
const mattersSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')

assert.match(
  onboardingSource,
  /const target = pendingPartnerInvitePath[\s\S]*: '\/attorney\/dashboard'/,
  'Attorney onboarding completion should default to the attorney dashboard when there is no pending partner invite.',
)

assert.match(
  onboardingSource,
  /window\.location\.replace\(target\)/,
  'Attorney onboarding completion should replace the current route with the resolved destination.',
)

assert.match(
  onboardingSource,
  /buildPartnerInviteAutoAcceptPath\(pendingPartnerInvitePath\)/,
  'Attorney onboarding completion should resume pending partner invites with auto-accept enabled.',
)

assert.match(
  onboardingSource,
  /await completeAttorneyFirmOnboarding\(onboardingPayload\)[\s\S]*openAttorneyDashboard\(\)/,
  'Successful attorney onboarding confirmation should immediately open the attorney dashboard.',
)

assert.doesNotMatch(
  onboardingSource,
  /completedOnboarding|Firm setup complete|Open Attorney Dashboard/,
  'Attorney onboarding should not stop on a completion card after setup succeeds.',
)

assert.match(
  postDashboardSetupSource,
  /const canOpenActiveWorkspace = hasResolvedWorkspaceMembership && !hasBlockingRecoveryReason/,
  'An authoritative active membership should be able to open its workspace when no genuine setup blocker remains.',
)

assert.match(
  postDashboardSetupSource,
  /RESOLVED_WORKSPACE_STALE_RECOVERY_REASONS[\s\S]*ONBOARDING_REQUIRED_REASONS\.noActiveMembership[\s\S]*ONBOARDING_REQUIRED_REASONS\.onboardingIncomplete[\s\S]*ONBOARDING_REQUIRED_REASONS\.workspaceMissing/,
  'A stale no-active-membership recovery reason should not override an active backend membership.',
)

assert.match(
  postDashboardSetupSource,
  /recoveryReasons\.some\(\(reason\) => isBlockingRecoveryReason\(reason, hasResolvedWorkspaceMembership\)\)/,
  'Setup recovery should only block resolved workspaces for genuine blockers.',
)

for (const inertLabel of [
  'Assign Attorney',
  'Assign Assistant',
  'Generate Document',
  'Request Documents',
  'Schedule Appointment',
  'Follow Up OTP',
  'Email Client',
  'Generate Letter',
]) {
  assert.doesNotMatch(
    mattersSource,
    new RegExp(`>${inertLabel}<`),
    `Attorney matter lists should not expose the inert ${inertLabel} action.`,
  )
}

console.log('attorney onboarding completion redirect contract passed')
