import { describe, expect, it } from 'vitest'
import { BOND_SIGNUP_STEPS, createBondSignupDraft, restoreBondSignupDraft, validateBondSignupStep, buildBondSignupForm } from '../bondQuickStart'
import { applyAgencyBrandingUpload } from '../../../lib/agencyOnboarding'

const profile = { firstName: 'Mary Jane', lastName: 'van der Merwe', email: 'mary@example.test' }
function readyDraft(kind = 'bond_company') {
  const draft = createBondSignupDraft(profile, {}, { workspace_kind: kind })
  draft.companyDetails.name = 'Example Bonds'
  return draft
}

describe('bond originator quick start', () => {
  it('requires only names and company name and starts a company with owner coverage', () => {
    const draft = readyDraft()
    for (const step of BOND_SIGNUP_STEPS) expect(validateBondSignupStep(step.key, draft)).toBe('')
    const form = buildBondSignupForm(draft, profile.email)
    expect(form).toMatchObject({ name: 'Example Bonds', ownerFirstName: 'Mary Jane', ownerLastName: 'van der Merwe', businessEmail: profile.email, workspaceKind: 'bond_company', mainBranchName: 'Main Team' })
    expect(form.settings.bondWorkspace).toMatchObject({ operatingModel: 'company', ownerHandlesConsulting: true, ownerHandlesProcessing: true })
    expect(form.branches).toEqual([])
    expect(form.invites).toEqual([])
    draft.personalDetails.lastName = ' '
    expect(validateBondSignupStep('personal', draft)).toBe('Enter your surname.')
    draft.companyDetails.name = ' '
    expect(validateBondSignupStep('company', draft)).toBe('Enter your company name.')
  })

  it('retains an independent originator with a personal pipeline', () => {
    const form = buildBondSignupForm(readyDraft('personal_originator'), profile.email)
    expect(form).toMatchObject({ workspaceKind: 'personal_originator', mainBranchName: 'My Pipeline', settings: { bondWorkspace: { operatingModel: 'independent' } } })
  })

  it('preserves all branding variants and colours in canonical settings', () => {
    const draft = readyDraft()
    for (const key of ['logoLight', 'logoDark', 'logoIcon']) draft.branding = applyAgencyBrandingUpload(draft.branding, key, { resolvedUrl: `https://example.test/${key}`, bucket: 'branding', path: `${key}.svg` }, `${key}.svg`)
    draft.branding.brandColours.secondary = '#334455'
    const { settings } = buildBondSignupForm(draft, profile.email)
    expect(settings.branding).toMatchObject({ logoLight: 'https://example.test/logoLight', logoDark: 'https://example.test/logoDark', logoIcon: 'https://example.test/logoIcon', logoIconPath: 'logoIcon.svg', brandColours: { primary: '#166b50', secondary: '#334455' } })
    expect(settings.developerOnboarding).toBeUndefined()
    expect(settings.bondOnboarding.flow).toBe('bond_quick_start_v1')
  })

  it('recovers legacy business and owner details without sending old invitations', () => {
    const draft = restoreBondSignupDraft({ bondDraft: { businessInformation: { businessName: 'Saved Bonds', registrationNumber: '123', city: 'Cape Town' }, ownerInformation: { fullName: 'Alex van der Merwe' }, meta: { workspaceKind: 'personal_originator' }, invitations: [{ email: 'hidden@example.test' }] } }, createBondSignupDraft(profile))
    const form = buildBondSignupForm(draft, profile.email)
    expect(form).toMatchObject({ name: 'Saved Bonds', registrationNumber: '123', city: 'Cape Town', ownerFirstName: 'Alex', ownerLastName: 'van der Merwe', workspaceKind: 'personal_originator', invites: [] })
  })

  it('restores the current stage and kind, isolates developer drafts, and tolerates invalid storage', () => {
    const draft = readyDraft('personal_originator')
    draft.currentStepKey = 'branding'
    expect(restoreBondSignupDraft(JSON.stringify(draft), createBondSignupDraft(profile))).toEqual(draft)
    expect(restoreBondSignupDraft('broken json', draft)).toBe(draft)
    expect(restoreBondSignupDraft({ flow: 'developer_quick_start_v1', companyDetails: { name: 'Wrong company' } }, createBondSignupDraft(profile)).companyDetails.name).toBe('')
  })
})
