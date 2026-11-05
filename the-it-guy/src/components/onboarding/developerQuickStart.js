export const DEVELOPER_SIGNUP_STEPS = [
  { key: 'personal', label: 'Your details' },
  { key: 'company', label: 'Company details' },
  { key: 'branding', label: 'Branding' },
]

export const DEVELOPER_LOGO_VARIANTS = [
  { key: 'logoLight', label: 'Light logo', variant: 'light', description: 'For light backgrounds' },
  { key: 'logoDark', label: 'Dark logo', variant: 'dark', description: 'For dark backgrounds' },
  { key: 'logoIcon', label: 'Icon', variant: 'icon', description: 'For compact spaces' },
]

export function createDeveloperSignupDraft(profile = {}, form = {}) {
  const parts = String(profile?.fullName || '').trim().split(/\s+/)
  return {
    flow: 'developer_quick_start_v1',
    currentStepKey: 'personal',
    personalDetails: {
      firstName: profile?.firstName || parts[0] || '',
      lastName: profile?.lastName || parts.slice(1).join(' '),
      avatarUrl: profile?.avatarUrl || '',
    },
    companyDetails: { ...form, name: form.name || profile?.companyName || '', registrationNumber: form.registrationNumber || '' },
    branding: { logoLight: '', logoDark: '', logoIcon: '', brandColours: { primary: '#166b50', secondary: '#152621' } },
  }
}

export function restoreDeveloperSignupDraft(raw, fallback) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback
    if (saved.flow !== 'developer_quick_start_v1') {
      return saved.form && typeof saved.form === 'object'
        ? { ...fallback, companyDetails: { ...fallback.companyDetails, ...saved.form } }
        : fallback
    }
    return {
      ...fallback,
      personalDetails: { ...fallback.personalDetails, ...(saved.personalDetails || {}) },
      companyDetails: { ...fallback.companyDetails, ...(saved.companyDetails || {}) },
      branding: { ...fallback.branding, ...(saved.branding || {}), brandColours: { ...fallback.branding.brandColours, ...(saved.branding?.brandColours || {}) } },
      currentStepKey: DEVELOPER_SIGNUP_STEPS.some((step) => step.key === saved.currentStepKey) ? saved.currentStepKey : 'personal',
    }
  } catch { return fallback }
}

export function validateDeveloperSignupStep(step, draft) {
  if (step === 'personal') {
    if (!String(draft.personalDetails.firstName || '').trim()) return 'Enter your first name.'
    if (!String(draft.personalDetails.lastName || '').trim()) return 'Enter your surname.'
  }
  if (step === 'company' && !String(draft.companyDetails.name || '').trim()) return 'Enter your company name.'
  return ''
}

export function buildDeveloperSignupForm(draft, verifiedEmail) {
  const company = draft.companyDetails
  const firstName = draft.personalDetails.firstName.trim()
  const lastName = draft.personalDetails.lastName.trim()
  const validColour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback
  const branding = {
    ...draft.branding,
    brandColours: {
      ...draft.branding.brandColours,
      primary: validColour(draft.branding.brandColours.primary, '#166b50'),
      secondary: validColour(draft.branding.brandColours.secondary, '#152621'),
    },
  }
  return {
    name: company.name.trim(),
    legalName: company.legalName || company.name.trim(),
    registrationNumber: company.registrationNumber || '',
    businessEmail: verifiedEmail,
    contactNumber: company.contactNumber || '',
    province: company.province || '',
    operatingArea: company.operatingArea || '',
    firstName, lastName,
    ownerFirstName: firstName, ownerLastName: lastName,
    ownerFullName: [firstName, lastName].join(' '),
    ownerEmail: verifiedEmail,
    primaryContactName: [firstName, lastName].join(' '),
    // The existing atomic workspace RPC saves these settings and its branding
    // triggers populate the shared company logos and colours in the same save.
    settings: { branding, developerOnboarding: { companyName: company.name.trim(), registrationNumber: company.registrationNumber || '', flow: 'developer_quick_start_v1' } },
    invites: [],
    branches: [],
  }
}
