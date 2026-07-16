export const NEW_BUSINESS_FORM_KEY = 'arch9-new-business-intake'
export const NEW_BUSINESS_FORM_VERSION = '2026-07-16'
export const NEW_BUSINESS_PRIVACY_VERSION = '2026-07-16'

export function createIntakeSubmissionKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().toLowerCase()
  return `intake-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

function getAttributionContext() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return {
    pageUrl: window.location.href,
    referrer: document.referrer || '',
    userAgent: navigator.userAgent || '',
    utm: Object.fromEntries(
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
        .map((key) => [key, params.get(key)])
        .filter(([, value]) => value),
    ),
  }
}

export async function submitNewBusinessIntake(form, { submissionKey } = {}) {
  const consentAt = new Date().toISOString()
  const payload = {
    intakeKind: 'new_business_partner',
    formKey: NEW_BUSINESS_FORM_KEY,
    formVersion: NEW_BUSINESS_FORM_VERSION,
    privacyPolicyVersion: NEW_BUSINESS_PRIVACY_VERSION,
    submissionKey,
    source: 'arch9-new-business-intake',
    role: form.role,
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    company: form.company,
    businessSize: form.businessSize,
    monthlyVolume: form.monthlyVolume,
    servicesInterested: form.servicesInterested,
    demoFocus: form.servicesInterested,
    biggestFrustration: form.biggestFrustration,
    preferredContactMethod: form.preferredContactMethod,
    preferredWindow: form.preferredWindow ? [form.preferredWindow] : [],
    popiaConsentGiven: form.popiaConsentGiven === true,
    popiaConsentAt: consentAt,
    marketingConsent: form.marketingConsent === true,
    website: form.website,
    submittedAt: consentAt,
    context: getAttributionContext(),
  }

  const response = await fetch('/api/public/demo-enquiries', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.message || 'Your enquiry could not be submitted.')
    error.fieldErrors = data?.errors || {}
    throw error
  }
  return data
}

