import { describe, expect, it } from 'vitest'
import {
  buildAgencySignupSubmission,
  applyAgencyBrandingUpload,
  buildDefaultAgencyOnboarding,
  getAgencySignupDetails,
  mergeAgencyOnboardingDraft,
  validateAgencySignupStep,
} from '../agencyOnboarding'

describe('short agency signup', () => {
  const profile = { fullName: 'Mary Jane van der Merwe', firstName: 'Mary Jane', lastName: 'van der Merwe', email: 'mary@example.test' }

  it('reuses signup names without splitting a compound first name', () => {
    expect(getAgencySignupDetails(buildDefaultAgencyOnboarding(profile), profile)).toMatchObject({ firstName: 'Mary Jane', lastName: 'van der Merwe' })
    expect(getAgencySignupDetails({ principalInformation: { principalFullName: 'Alex Landman' } })).toMatchObject({ firstName: 'Alex', lastName: 'Landman' })
  })

  it('allows only names and agency name, with no FFC, address, phone or upload', () => {
    const draft = buildDefaultAgencyOnboarding(profile)
    draft.agencyInformation.agencyName = 'Example Agency'
    expect(validateAgencySignupStep('personal', draft)).toBe('')
    expect(validateAgencySignupStep('organisation', draft)).toBe('')
    expect(validateAgencySignupStep('branding', draft)).toBe('')
    expect(validateAgencySignupStep('personal', { principalInformation: { firstName: 'Alex', lastName: ' ' } })).toBe('Enter your surname.')
    expect(validateAgencySignupStep('organisation', { agencyInformation: { agencyName: ' ' } })).toBe('Enter your agency name.')
  })

  it('keeps saved agency details and branches while excluding hidden invitations', () => {
    const draft = mergeAgencyOnboardingDraft(buildDefaultAgencyOnboarding(profile), {
      agencyInformation: { agencyName: 'Example Agency', physicalAddress: 'Saved address', agencyType: 'mixed' },
      principalInformation: { firstName: 'Mary Jane', lastName: 'van der Merwe', avatarUrl: 'https://example.test/photo.png', ppraNumber: 'FFC-123' },
      invitations: [{ name: 'Old invite', email: 'old@example.test' }],
    }, profile)
    const submission = buildAgencySignupSubmission(draft, profile, profile.email)
    const persisted = mergeAgencyOnboardingDraft(draft, submission, profile)
    expect(persisted.invitations.filter((invite) => invite.email)).toEqual([])
    expect(draft.invitations[0].email).toBe('old@example.test')
    expect(persisted.agencyInformation).toMatchObject({ physicalAddress: 'Saved address', agencyType: 'mixed' })
    expect(persisted.branchStructure).toEqual(draft.branchStructure)
    expect(persisted.principalInformation).toMatchObject({ firstName: 'Mary Jane', lastName: 'van der Merwe', principalFullName: profile.fullName, emailAddress: profile.email, ppraNumber: 'FFC-123', avatarUrl: 'https://example.test/photo.png' })
  })

  it('uses a safe default colour when branding is skipped with an unfinished colour', () => {
    const draft = buildDefaultAgencyOnboarding(profile)
    draft.branding.brandColours.primary = '#16'
    expect(buildAgencySignupSubmission(draft, profile, profile.email).branding.brandColours.primary).toBe('#166b50')
  })

  it('keeps the three logo variants separate and fills compact assets from the icon', () => {
    let branding = { favicon: 'https://example.test/custom-favicon.png' }
    for (const target of ['logoLight', 'logoDark', 'logoIcon']) {
      branding = applyAgencyBrandingUpload(branding, target, { resolvedUrl: `https://example.test/${target}.svg`, bucket: 'branding', path: `${target}.svg` }, `${target}.svg`)
    }
    const submission = buildAgencySignupSubmission({ branding }, {}, 'owner@example.test')
    expect(submission.branding).toMatchObject({
      logoLight: 'https://example.test/logoLight.svg',
      logoDark: 'https://example.test/logoDark.svg',
      logoIcon: 'https://example.test/logoIcon.svg',
      logoIconBucket: 'branding',
      logoIconPath: 'logoIcon.svg',
      favicon: 'https://example.test/custom-favicon.png',
      portalIcon: 'https://example.test/logoIcon.svg',
      mobileIcon: 'https://example.test/logoIcon.svg',
      browserTile: 'https://example.test/logoIcon.svg',
    })
    const replaced = applyAgencyBrandingUpload(branding, 'logoIcon', { resolvedUrl: 'https://example.test/new-icon.svg' }, 'new-icon.svg')
    expect(replaced.portalIcon).toBe('https://example.test/new-icon.svg')
    expect(replaced.mobileIcon).toBe('https://example.test/new-icon.svg')
    expect(replaced.favicon).toBe('https://example.test/custom-favicon.png')
  })
})
