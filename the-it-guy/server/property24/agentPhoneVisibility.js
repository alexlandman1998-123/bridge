// Property24 stores contact numbers on the agent, shared by their listings.
export const PROPERTY24_AGENT_PHONE_FIELDS = Object.freeze([
  'mobileNumber', 'mobileNumber1', 'mobileNumber2', 'mobileNumber3',
  'workNumber', 'workNumber1', 'workNumber2', 'workNumber3', 'faxNumber',
])

export function buildProperty24AgentPhonePayload(profile = {}) {
  if (profile.hidePhoneNumberOnProperty24 === true) {
    return Object.fromEntries(PROPERTY24_AGENT_PHONE_FIELDS.map((field) => [field, null]))
  }
  return { mobileNumber: String(profile.phone || '').trim().replace(/[^0-9+]+/g, '') }
}

export function normalizeHiddenProperty24AgentPhoneNumbers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([userId, hidden]) => userId.trim() && hidden === true))
}
