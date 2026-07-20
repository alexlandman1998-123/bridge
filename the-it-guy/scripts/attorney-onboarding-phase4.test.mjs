import assert from 'node:assert/strict'
import {
  ONBOARDING_STEPS,
  DEFAULT_BRANDING,
  DEFAULT_DEPARTMENTS,
  buildDraftPayload,
  buildDraftStorageKey,
  buildOnboardingGuidance,
  buildSelectedDepartmentsFromRows,
  getActiveDepartmentTypes,
  getValidationErrorsForStep,
  normalizeHexColour,
  parseDraftPayload,
  validateInvites,
} from '../src/components/attorney/onboarding/attorneyOnboardingGuidance.js'

const allDepartmentTypes = getActiveDepartmentTypes(DEFAULT_DEPARTMENTS)

assert.equal(ONBOARDING_STEPS.at(-2).key, 'review_confirm')
assert.equal(ONBOARDING_STEPS.at(-1).key, 'workspace_preview')

const emptyGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: '',
    email: 'not-an-email',
    website: 'arch9',
  },
  branding: DEFAULT_BRANDING,
  activeDepartmentTypes: allDepartmentTypes,
  invites: [],
})

assert.equal(emptyGuidance.readiness.percent, 75, 'Empty firm identity should hold readiness at 75%.')
assert.equal(emptyGuidance.readiness.nextAction, 'Firm profile', 'Firm profile should be the first required action.')
assert.equal(emptyGuidance.stepStatuses.firm_information.status, 'needs_attention')
assert.equal(emptyGuidance.stepStatuses.team_invites.status, 'optional')
assert.equal(emptyGuidance.stepStatuses.review_confirm.status, 'pending')
assert.equal(emptyGuidance.stepStatuses.workspace_preview.status, 'pending')

const completeGuidance = buildOnboardingGuidance({
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
  activeDepartmentTypes: allDepartmentTypes,
  invites: [
    {
      id: 'invite-transfer',
      email: 'transfer@kingstons.co.za',
      role: 'transfer_attorney',
      departmentType: 'transfer',
    },
  ],
})

assert.equal(completeGuidance.readiness.percent, 100, 'Complete required setup should be activation ready.')
assert.equal(completeGuidance.readiness.nextAction, 'Activate workspace')
assert.equal(completeGuidance.stepStatuses.branding.label, 'Ready')
assert.equal(completeGuidance.stepStatuses.review_confirm.status, 'complete')
assert.equal(completeGuidance.stepStatuses.workspace_preview.label, 'Activate')

const inviteErrors = validateInvites(
  [
    {
      id: 'invite-1',
      email: 'transfer@kingstons.co.za',
      role: 'transfer_attorney',
      departmentType: 'transfer',
    },
    {
      id: 'invite-2',
      email: ' Transfer@Kingstons.co.za ',
      role: 'bond_attorney',
      departmentType: 'bond',
    },
    {
      id: 'invite-3',
      email: 'director@kingstons.co.za',
      role: 'director_partner',
      departmentType: 'transfer',
    },
    {
      id: 'invite-4',
      email: 'admin@kingstons.co.za',
      role: 'firm_admin',
      departmentType: 'management',
    },
  ],
  allDepartmentTypes,
)

assert.equal(inviteErrors['invite-2'].email, 'Duplicate invitation email.')
assert.equal(inviteErrors['invite-3'].departmentType, 'Selected department is not valid for this role.')
assert.equal(inviteErrors['invite-4'].role, 'Firm admin invitations are not allowed during onboarding.')

const stepErrors = getValidationErrorsForStep('branding', {
  branding: {
    primaryColour: '#12345',
    secondaryColour: '#123456',
  },
})

assert.deepEqual(stepErrors, { primaryColour: 'Use a valid hex colour.' })

assert.deepEqual(
  buildSelectedDepartmentsFromRows([
    { departmentType: 'transfer', isActive: true },
    { departmentType: 'bond', isActive: false },
    { departmentType: 'management', isActive: true },
  ]),
  {
    transfer: true,
    bond: false,
    cancellation: false,
    admin: false,
    management: true,
  },
  'Department rows should preserve explicit inactive lanes while keeping management available.',
)

const draftPayload = buildDraftPayload({
  currentStepIndex: ONBOARDING_STEPS.length + 10,
  selectedDepartments: {
    transfer: true,
    bond: false,
    admin: false,
    management: false,
  },
  invites: [
    {
      id: 'draft-invite',
      email: 42,
      role: 'bond_attorney',
      departmentType: 'bond',
    },
  ],
  savedAt: '2026-07-08T12:00:00.000Z',
})

assert.equal(draftPayload.currentStepIndex, ONBOARDING_STEPS.length - 1)
assert.equal(draftPayload.selectedDepartments.management, true)
assert.equal(draftPayload.invites[0].email, '42')
assert.equal(draftPayload.savedAt, '2026-07-08T12:00:00.000Z')
assert.deepEqual(parseDraftPayload(JSON.stringify(draftPayload)), draftPayload)
assert.equal(buildDraftStorageKey(' profile-123 '), 'itg:attorney-onboarding-draft:profile-123')
assert.equal(buildDraftStorageKey(''), 'itg:attorney-onboarding-draft:anonymous')
assert.equal(normalizeHexColour('ABCDEF', DEFAULT_BRANDING.primaryColour), DEFAULT_BRANDING.primaryColour)
assert.equal(normalizeHexColour('#ABCDEF', DEFAULT_BRANDING.primaryColour), '#abcdef')

console.log('attorney onboarding phase 4 guidance contracts passed')
