// Private Property Agency Feed Service Rev 4.7, Appendix B (headline rules).
// Shared by capture and the server mapper so readiness agrees with the form.
export function getPrivatePropertyHeadlineIssues(value = '') {
  const headline = String(value ?? '').trim()
  const issues = []
  const add = (code, message) => issues.push({ code, message })
  if (headline.length > 200) add('headline_exceeds_200_characters', 'Keep the listing title within 200 characters.')
  if (/https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.(?:[a-z]{2,})(?:\b|\/)/i.test(headline)) add('illegal_headline_web_address', 'Remove website addresses from the listing title.')
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(headline)) add('illegal_headline_email', 'Remove email addresses from the listing title.')
  if (/(?:\+?\d[\s().-]*){9,}/.test(headline)) add('illegal_headline_phone_number', 'Remove telephone numbers from the listing title.')
  if (/[^\p{L}\p{N} !,.-]/u.test(headline)) add('illegal_headline_special_characters', 'Use letters, numbers, spaces, commas, full stops, hyphens or exclamation marks in the listing title.')
  return issues
}

export const PRIVATE_PROPERTY_POA_PRICE_MESSAGE = 'Private Property needs an asking price even when it is hidden. Add a price, or remove Private Property from your selected channels.'
