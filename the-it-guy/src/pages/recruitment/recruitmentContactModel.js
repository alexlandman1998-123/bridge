export const recruitmentContactVersion = 'recruitment-contact-v1'
export const recruitmentContactConsent = 'I agree that the agency may save my contact details and contact me about recruitment.'

export function recruitmentSignupErrors(contact, password) {
  const errors = recruitmentContactErrors(contact)
  if (typeof password !== 'string' || password.length < 8 || new TextEncoder().encode(password).length > 72) errors.password = 'Use at least 8 characters and no more than 72 bytes for your password.'
  return errors
}

// Passwords, organisation IDs and account/verification claims never enter CRM capture.
export function normalizeRecruitmentContact(raw = {}) {
  const text = (key) => typeof raw?.[key] === 'string' ? raw[key].trim() : ''
  return {
    firstName: text('firstName'), lastName: text('lastName'),
    email: text('email').toLowerCase(), phone: text('phone'),
    privacyAccepted: raw?.privacyAccepted === true,
    consentVersion: recruitmentContactVersion,
  }
}

export function recruitmentContactErrors(raw) {
  const contact = normalizeRecruitmentContact(raw), errors = {}
  for (const key of ['firstName', 'lastName']) {
    if (!contact[key] || contact[key].length > 60) errors[key] = `Enter your ${key === 'firstName' ? 'first name' : 'surname'} (up to 60 characters).`
  }
  if (`${contact.firstName} ${contact.lastName}`.length > 120) errors.lastName = 'Keep your full name to 120 characters.'
  if (contact.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) errors.email = 'Enter a valid email address.'
  const digits = contact.phone.replace(/\D/g, '')
  if (contact.phone.length > 50 || digits.length < 9 || digits.length > 15) errors.phone = 'Enter a valid mobile number, including the country code where needed.'
  if (!contact.privacyAccepted) errors.privacyAccepted = 'Agree that the agency may save your contact details and contact you about recruitment.'
  return errors
}
