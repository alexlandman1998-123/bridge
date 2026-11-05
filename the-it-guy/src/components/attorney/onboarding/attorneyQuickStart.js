import {
  DEFAULT_FIRM_INFORMATION,
  buildFirmInformationFromFirm,
  buildBrandingFromFirm,
  normalizeHexColour,
} from './attorneyOnboardingGuidance.js'

export const ATTORNEY_SIGNUP_STEPS = [
  { key: 'personal', label: 'Your details' },
  { key: 'firm_information', label: 'Firm details' },
  { key: 'branding', label: 'Branding' },
]

export const ATTORNEY_SIGNUP_COLOURS = { primaryColour: '#166b50', secondaryColour: '#152621' }
export const ATTORNEY_LOGO_VARIANTS = [
  { key: 'logoUrl', prefix: 'logo', label: 'Light logo', variant: 'logo-light', description: 'For light backgrounds' },
  { key: 'logoDarkUrl', prefix: 'logoDark', label: 'Dark logo', variant: 'logo-dark', description: 'For dark backgrounds' },
  { key: 'logoIconUrl', prefix: 'logoIcon', label: 'Icon', variant: 'logo-icon', description: 'For compact spaces' },
]

export function createAttorneySignupDraft(profile = {}, firm = null) {
  const parts = String(profile?.fullName || '').trim().split(/\s+/)
  return {
    flow: 'attorney_quick_start_v1',
    currentStepKey: 'personal',
    personalDetails: {
      firstName: profile?.firstName || parts[0] || '',
      lastName: profile?.lastName || parts.slice(1).join(' '),
      avatarUrl: profile?.avatarUrl || '',
    },
    firmInformation: { ...DEFAULT_FIRM_INFORMATION, email: profile?.email || '', ...(firm ? buildFirmInformationFromFirm(firm) : {}) },
    branding: {
      ...(firm ? buildBrandingFromFirm(firm) : {}),
      primaryColour: firm?.primaryColour || ATTORNEY_SIGNUP_COLOURS.primaryColour,
      secondaryColour: firm?.secondaryColour || ATTORNEY_SIGNUP_COLOURS.secondaryColour,
      logoIconUrl: '',
    },
  }
}

export function restoreAttorneySignupDraft(raw, fallback) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback
    if (!saved.firmInformation || typeof saved.firmInformation !== 'object' || Array.isArray(saved.firmInformation)) return fallback
    const isCurrent = saved.flow === 'attorney_quick_start_v1'
    return {
      ...fallback,
      personalDetails: { ...fallback.personalDetails, ...(saved.personalDetails || {}) },
      firmInformation: { ...fallback.firmInformation, ...(saved.firmInformation || {}) },
      branding: { ...fallback.branding, ...(saved.branding || {}) },
      currentStepKey: isCurrent && ATTORNEY_SIGNUP_STEPS.some((step) => step.key === saved.currentStepKey)
        ? saved.currentStepKey
        : Number(saved.currentStepIndex) === 0 ? 'firm_information' : 'branding',
    }
  } catch {
    return fallback
  }
}

export function validateAttorneySignupStep(step, draft) {
  if (step === 'personal') {
    if (!String(draft.personalDetails.firstName || '').trim()) return 'Enter your first name.'
    if (!String(draft.personalDetails.lastName || '').trim()) return 'Enter your surname.'
  }
  if (step === 'firm_information' && !String(draft.firmInformation.name || '').trim()) return 'Enter your firm name.'
  return ''
}

export function buildAttorneySignupPayload(draft, verifiedEmail, activeDepartmentTypes) {
  return {
    firmInformation: { ...draft.firmInformation, name: draft.firmInformation.name.trim(), email: draft.firmInformation.email || verifiedEmail },
    branding: {
      ...draft.branding,
      primaryColour: normalizeHexColour(draft.branding.primaryColour, ATTORNEY_SIGNUP_COLOURS.primaryColour),
      secondaryColour: normalizeHexColour(draft.branding.secondaryColour, ATTORNEY_SIGNUP_COLOURS.secondaryColour),
    },
    activeDepartmentTypes,
    // Team invitations are configured after onboarding. Never dispatch hidden
    // invitations recovered from an older six-step draft.
    invites: [],
    quickStart: true,
  }
}

export function applyAttorneyLogoUpload(branding, asset, upload, fileName) {
  const url = upload.resolvedUrl || upload.publicUrl || upload.signedUrl
  if (!url) throw new Error('The logo uploaded, but its preview could not be loaded. Please try again.')
  return { ...branding, [asset.key]: url, [asset.prefix + 'FileName']: fileName, [asset.prefix + 'Bucket']: upload.bucket || '', [asset.prefix + 'Path']: upload.path || '' }
}
