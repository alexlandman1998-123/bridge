import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const onboardingSource = readFileSync(new URL('../src/pages/AttorneyOnboardingPage.jsx', import.meta.url), 'utf8')

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

console.log('attorney onboarding completion redirect contract passed')
