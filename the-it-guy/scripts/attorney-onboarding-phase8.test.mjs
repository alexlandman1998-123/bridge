import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_BRANDING,
  DEFAULT_DEPARTMENTS,
  buildActivationGuard,
  buildOnboardingGuidance,
  getActiveDepartmentTypes,
} from '../src/components/attorney/onboarding/attorneyOnboardingGuidance.js'

const activeDepartmentTypes = getActiveDepartmentTypes(DEFAULT_DEPARTMENTS)

const blockedGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
  },
  branding: DEFAULT_BRANDING,
  activeDepartmentTypes,
  invites: [
    {
      id: 'invite-1',
      email: 'bad-email',
      role: 'transfer_attorney',
      departmentType: 'transfer',
    },
  ],
})

assert.equal(blockedGuidance.activationDossier.status, 'blocked')
assert.deepEqual(
  blockedGuidance.activationDossier.activationGuard,
  {
    canActivate: false,
    blockedCount: 1,
    blockedItems: [
      {
        key: 'team_access',
        label: 'Team access',
        description: 'Resolve invite email, role, or department issues.',
        state: 'needs_attention',
        blocking: true,
        stepKey: 'team_invites',
        isReady: false,
      },
    ],
    stepKey: 'team_invites',
    actionLabel: 'Fix Team access',
    message: 'Resolve 1 required gate before activation.',
  },
  'Blocked dossiers should expose an activation guard with the first fix path.',
)

const recommendedGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
  },
  branding: DEFAULT_BRANDING,
  activeDepartmentTypes,
  invites: [],
})

assert.equal(recommendedGuidance.activationDossier.status, 'ready')
assert.equal(recommendedGuidance.activationDossier.nextAction.actionLabel, 'Review')
assert.deepEqual(
  recommendedGuidance.activationDossier.activationGuard,
  {
    canActivate: true,
    blockedCount: 0,
    blockedItems: [],
    stepKey: '',
    actionLabel: 'Activate workspace',
    message: 'All required gates are clear.',
  },
  'Nonblocking recommendations should not disable workspace activation.',
)

const directGuard = buildActivationGuard({
  status: 'blocked',
  requiredItems: [
    {
      label: 'Firm profile',
      stepKey: 'firm_information',
      isReady: false,
    },
    {
      label: 'Brand system',
      stepKey: 'branding',
      isReady: false,
    },
  ],
})

assert.equal(directGuard.canActivate, false)
assert.equal(directGuard.blockedCount, 2)
assert.equal(directGuard.stepKey, 'firm_information')
assert.equal(directGuard.actionLabel, 'Fix Firm profile')
assert.equal(directGuard.message, 'Resolve 2 required gates before activation.')

const pageSource = readFileSync(new URL('../src/pages/AttorneyOnboardingPage.jsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/components/attorney/onboarding/AttorneyOnboardingLayout.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

assert.match(
  pageSource,
  /currentActivationGuard && !currentActivationGuard\.canActivate/,
  'The confirm handler should stop activation when the dossier guard is blocked.',
)

assert.match(
  pageSource,
  /confirmLabel=\{finalActivationBlocked \? 'Activation Blocked' : 'Activate Workspace'\}/,
  'The final action label should communicate a blocked activation state.',
)

assert.match(
  pageSource,
  /confirmDisabledReason=\{activationBlockedMessage\}/,
  'The onboarding page should pass the activation guard reason into the layout.',
)

assert.match(
  layoutSource,
  /confirmDisabledReason = ''/,
  'The layout should accept a final-action disabled reason.',
)

assert.match(
  layoutSource,
  /className="attorney-setup-confirm-note"[\s\S]*\{confirmDisabledReason\}/,
  'The action bar should render the blocked activation reason.',
)

assert.match(
  layoutSource,
  /disabled=\{!canNext \|\| isSubmitting\}/,
  'The final action should remain disabled whenever activation is not allowed.',
)

assert.match(
  cssSource,
  /\.attorney-setup-actionbar-right > \.attorney-setup-confirm-note/,
  'The blocked activation note should have a dedicated action-bar treatment.',
)

console.log('attorney onboarding phase 8 activation guard contracts passed')
