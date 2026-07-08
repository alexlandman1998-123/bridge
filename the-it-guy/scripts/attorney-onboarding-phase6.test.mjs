import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_BRANDING,
  DEFAULT_DEPARTMENTS,
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

assert.deepEqual(
  blockedGuidance.activationDossier.nextAction,
  {
    key: 'team_access',
    label: 'Team access',
    stepKey: 'team_invites',
    state: 'needs_attention',
    actionLabel: 'Fix',
  },
  'Blocked launch dossiers should route the primary action to the first required failing step.',
)

const recommendedGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
  },
  branding: DEFAULT_BRANDING,
  activeDepartmentTypes,
  invites: [],
})

assert.deepEqual(
  recommendedGuidance.activationDossier.nextAction,
  {
    key: 'client_surface',
    label: 'Client surface',
    stepKey: 'firm_information',
    state: 'recommended',
    actionLabel: 'Review',
  },
  'Launch-ready dossiers with nonblocking recommendations should route to the recommended finishing touch.',
)

const readyGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
    email: 'ops@kingstons.co.za',
    phone: '+27 11 555 0180',
    website: 'kingstons.co.za',
  },
  branding: {
    ...DEFAULT_BRANDING,
    logoUrl: 'https://cdn.example.com/kingstons-logo.png',
  },
  activeDepartmentTypes,
  invites: [
    {
      id: 'invite-transfer',
      email: 'transfer@kingstons.co.za',
      role: 'transfer_attorney',
      departmentType: 'transfer',
    },
  ],
})

assert.equal(readyGuidance.activationDossier.nextAction, null)
assert.deepEqual(
  readyGuidance.activationDossier.launchSurfaces.map((surface) => [surface.key, surface.stepKey]),
  [
    ['letterhead', 'branding'],
    ['matter_routing', 'departments'],
    ['client_portal', 'firm_information'],
    ['team_invites', 'team_invites'],
  ],
  'Every launch surface should expose the onboarding step that can edit it.',
)

const reviewSource = readFileSync(new URL('../src/components/attorney/onboarding/ReviewConfirmStep.jsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/AttorneyOnboardingPage.jsx', import.meta.url), 'utf8')

assert.match(
  reviewSource,
  /function ReviewConfirmStep\([^)]*onNavigateToStep/,
  'The review step should accept the phase 6 navigation callback.',
)

assert.match(
  reviewSource,
  /className="attorney-dossier-hero-action"[\s\S]*onNavigateToStep\(nextAction\.stepKey\)/,
  'The launch dossier hero action should route to the next recommended setup step.',
)

assert.match(
  reviewSource,
  /ReviewAction stepKey=\{item\.stepKey\}[\s\S]*onNavigateToStep=\{onNavigateToStep\}/,
  'Dossier rows should render step-aware review actions.',
)

assert.match(
  pageSource,
  /function handleReviewStepRequest\(stepKey\)[\s\S]*ONBOARDING_STEPS\.findIndex\(\(step\) => step\.key === stepKey\)/,
  'The onboarding page should resolve review actions by step key.',
)

assert.match(
  pageSource,
  /onNavigateToStep=\{handleReviewStepRequest\}/,
  'The onboarding page should pass the review navigation handler to the review step.',
)

console.log('attorney onboarding phase 6 action routing contracts passed')
