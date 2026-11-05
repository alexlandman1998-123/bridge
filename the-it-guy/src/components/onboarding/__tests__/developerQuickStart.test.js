import { describe, expect, it } from 'vitest'
import { createDeveloperSignupDraft, restoreDeveloperSignupDraft, validateDeveloperSignupStep, buildDeveloperSignupForm, DEVELOPER_SIGNUP_STEPS } from '../developerQuickStart'
import { applyAgencyBrandingUpload } from '../../../lib/agencyOnboarding'

describe('developer quick start', () => {
  const profile = { firstName: 'Mary Jane', lastName: 'van der Merwe', email: 'mary@example.test' }

  it('requires only names and company name, with no contact, location or branding fields', () => {
    const draft = createDeveloperSignupDraft(profile)
    draft.companyDetails.name = 'Example Developments'
    for (const step of DEVELOPER_SIGNUP_STEPS) expect(validateDeveloperSignupStep(step.key, draft)).toBe('')
    const form = buildDeveloperSignupForm(draft, profile.email)
    expect(form).toMatchObject({ name: 'Example Developments', ownerFirstName: 'Mary Jane', ownerLastName: 'van der Merwe', businessEmail: profile.email, contactNumber: '' })
    expect(form.invites).toEqual([])
    expect(form.branches).toEqual([])
    draft.personalDetails.lastName = ' '
    expect(validateDeveloperSignupStep('personal', draft)).toBe('Enter your surname.')
    draft.companyDetails.name = ' '
    expect(validateDeveloperSignupStep('company', draft)).toBe('Enter your company name.')
  })

  it('keeps branding in the generic atomic settings contract, with distinct logo variants', () => {
    const draft = createDeveloperSignupDraft(profile)
    draft.companyDetails.name = 'Example Developments'
    for (const target of ['logoLight', 'logoDark', 'logoIcon']) {
      draft.branding = applyAgencyBrandingUpload(draft.branding, target, { resolvedUrl: 'https://example.test/' + target, bucket: 'branding', path: target + '.svg' }, target + '.svg')
    }
    const form = buildDeveloperSignupForm(draft, profile.email)
    expect(form.settings.branding).toMatchObject({ logoLight: 'https://example.test/logoLight', logoDark: 'https://example.test/logoDark', logoIcon: 'https://example.test/logoIcon', logoIconPath: 'logoIcon.svg', brandColours: { primary: '#166b50', secondary: '#152621' } })
    expect(form.settings.developerOnboarding.companyName).toBe('Example Developments')
    expect(form.settings.agencyOnboarding).toBeUndefined()
  })

  it('restores old company details without submitting hidden team invitations', () => {
    const draft = restoreDeveloperSignupDraft({ form: { name: 'Saved Company', legalName: 'Saved Company Pty Ltd', registrationNumber: '123', province: 'Gauteng', invites: [{ email: 'old@example.test' }] } }, createDeveloperSignupDraft(profile))
    const form = buildDeveloperSignupForm(draft, profile.email)
    expect(form).toMatchObject({ name: 'Saved Company', legalName: 'Saved Company Pty Ltd', registrationNumber: '123', province: 'Gauteng' })
    expect(form.invites).toEqual([])
  })

  it('restores the new stage and handles malformed drafts without losing defaults', () => {
    const original = createDeveloperSignupDraft(profile)
    original.currentStepKey = 'branding'
    expect(restoreDeveloperSignupDraft(JSON.stringify(original), createDeveloperSignupDraft(profile))).toEqual(original)
    expect(restoreDeveloperSignupDraft('invalid json', original)).toBe(original)
  })

  it('normalises incomplete optional colours when branding is skipped', () => {
    const draft = createDeveloperSignupDraft(profile)
    draft.branding.brandColours.primary = '#1'
    draft.branding.brandColours.secondary = ''
    expect(buildDeveloperSignupForm(draft, profile.email).settings.branding.brandColours).toMatchObject({ primary: '#166b50', secondary: '#152621' })
  })
})
