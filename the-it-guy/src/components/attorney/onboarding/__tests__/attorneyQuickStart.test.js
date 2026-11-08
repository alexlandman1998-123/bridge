import { describe, expect, it } from 'vitest'
import {
  ATTORNEY_SIGNUP_STEPS, ATTORNEY_LOGO_VARIANTS,
  createAttorneySignupDraft, restoreAttorneySignupDraft,
  validateAttorneySignupStep, buildAttorneySignupPayload, applyAttorneyLogoUpload,
} from '../attorneyQuickStart'

describe('attorney quick start', () => {
  const profile = { firstName: 'Mary Jane', lastName: 'van der Merwe', email: 'mary@example.test' }

  it('requires only names and firm name, and reuses the verified email', () => {
    const draft = createAttorneySignupDraft(profile)
    draft.firmInformation.name = 'Example Legal'
    for (const step of ATTORNEY_SIGNUP_STEPS) expect(validateAttorneySignupStep(step.key, draft)).toBe('')
    expect(draft.personalDetails).toMatchObject({ firstName: 'Mary Jane', lastName: 'van der Merwe' })
    const payload = buildAttorneySignupPayload(draft, profile.email, ['management'])
    expect(payload.firmInformation).toMatchObject({ name: 'Example Legal', email: profile.email, phone: '', registrationNumber: '' })
    draft.personalDetails.lastName = ' '
    expect(validateAttorneySignupStep('personal', draft)).toBe('Enter your surname.')
    draft.firmInformation.name = ''
    expect(validateAttorneySignupStep('firm_information', draft)).toBe('Enter your firm name.')
  })

  it('restores the older draft without dispatching its hidden invitations', () => {
    const draft = restoreAttorneySignupDraft(JSON.stringify({
      currentStepIndex: 4,
      firmInformation: { name: 'Saved Legal', registrationNumber: '123', city: 'Cape Town' },
      branding: { logoDarkUrl: 'https://example.test/dark.svg' },
      invites: [{ email: 'old@example.test', role: 'firm_admin' }],
    }), createAttorneySignupDraft(profile))
    expect(draft.currentStepKey).toBe('branding')
    const payload = buildAttorneySignupPayload(draft, profile.email, ['transfer', 'management'])
    expect(payload.invites).toEqual([])
    expect(payload.activeDepartmentTypes).toEqual(['transfer', 'management'])
    expect(payload.firmInformation).toMatchObject({ registrationNumber: '123', city: 'Cape Town' })
    expect(payload.branding.logoDarkUrl).toBe('https://example.test/dark.svg')
  })

  it('restores the new stage and optional LPC number and ignores malformed drafts', () => {
    const original = createAttorneySignupDraft(profile)
    original.currentStepKey = 'firm_information'
    original.firmInformation.lpcNumber = 'LPC-123'
    expect(restoreAttorneySignupDraft(JSON.stringify(original), createAttorneySignupDraft(profile))).toEqual(original)
    expect(restoreAttorneySignupDraft('broken json', original)).toBe(original)
    expect(restoreAttorneySignupDraft('{}', original)).toBe(original)
  })

  it('keeps each uploaded logo and its storage metadata separate in the final payload', () => {
    const draft = createAttorneySignupDraft(profile)
    for (const asset of ATTORNEY_LOGO_VARIANTS) {
      draft.branding = applyAttorneyLogoUpload(draft.branding, asset, { resolvedUrl: 'https://example.test/' + asset.variant, bucket: 'branding', path: asset.variant + '.svg' }, asset.variant + '.svg')
    }
    const payload = buildAttorneySignupPayload(draft, profile.email, ['management'])
    expect(payload.branding).toMatchObject({
      logoUrl: 'https://example.test/logo-light', logoDarkUrl: 'https://example.test/logo-dark', logoIconUrl: 'https://example.test/logo-icon',
      logoIconBucket: 'branding', logoIconPath: 'logo-icon.svg',
    })
  })

  it('keeps branding optional even with unfinished colour fields', () => {
    const draft = createAttorneySignupDraft(profile)
    draft.branding.primaryColour = '#1'
    draft.branding.secondaryColour = ''
    const payload = buildAttorneySignupPayload(draft, profile.email, ['management'])
    expect(payload.branding.primaryColour).toBe('#166b50')
    expect(payload.branding.secondaryColour).toBe('#152621')
    expect(validateAttorneySignupStep('branding', draft)).toBe('')
  })
})
