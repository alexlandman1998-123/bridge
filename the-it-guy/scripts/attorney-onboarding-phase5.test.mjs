import assert from 'node:assert/strict'
import {
  DEFAULT_BRANDING,
  DEFAULT_DEPARTMENTS,
  buildOnboardingGuidance,
  getActiveDepartmentTypes,
} from '../src/components/attorney/onboarding/attorneyOnboardingGuidance.js'

const activeDepartmentTypes = getActiveDepartmentTypes(DEFAULT_DEPARTMENTS)

const launchReadyGuidance = buildOnboardingGuidance({
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

assert.equal(launchReadyGuidance.activationDossier.status, 'ready')
assert.equal(launchReadyGuidance.activationDossier.headline, 'Launch dossier is ready')
assert.equal(launchReadyGuidance.activationDossier.requiredItems.length, 4)
assert.equal(
  launchReadyGuidance.activationDossier.requiredItems.every((item) => item.isReady),
  true,
  'Every required gate should be ready when activation readiness is complete.',
)
assert.equal(launchReadyGuidance.activationDossier.recommendedItems.length, 0)
assert.deepEqual(
  launchReadyGuidance.activationDossier.metrics.map((metric) => [metric.key, metric.value]),
  [
    ['readiness', '100%'],
    ['workflow_lanes', '4'],
    ['team_access', '1'],
    ['client_surface', '3'],
  ],
)
assert.equal(
  launchReadyGuidance.activationDossier.launchSurfaces.find((surface) => surface.key === 'letterhead')?.state,
  'complete',
)
assert.equal(
  launchReadyGuidance.activationDossier.launchSurfaces.find((surface) => surface.key === 'client_portal')?.state,
  'complete',
)

const recommendedGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
  },
  branding: DEFAULT_BRANDING,
  activeDepartmentTypes,
  invites: [],
})

assert.equal(recommendedGuidance.readiness.percent, 100)
assert.equal(recommendedGuidance.activationDossier.status, 'ready')
assert.equal(recommendedGuidance.activationDossier.recommendedItems.length, 1)
assert.equal(recommendedGuidance.activationDossier.recommendedItems[0].key, 'client_surface')
assert.equal(
  recommendedGuidance.activationDossier.launchSurfaces.find((surface) => surface.key === 'client_portal')?.state,
  'recommended',
)

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

const blockedTeamGate = blockedGuidance.activationDossier.requiredItems.find((item) => item.key === 'team_access')
assert.equal(blockedGuidance.activationDossier.status, 'blocked')
assert.equal(blockedGuidance.activationDossier.headline, 'Launch dossier needs attention')
assert.equal(blockedTeamGate?.isReady, false)
assert.equal(blockedGuidance.activationDossier.metrics.find((metric) => metric.key === 'team_access')?.value, '1')

console.log('attorney onboarding phase 5 activation dossier contracts passed')
