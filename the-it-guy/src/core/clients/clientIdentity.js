export const normalizeClientEmail = (value = '') => String(value || '').trim().toLowerCase()
export function normalizeClientPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.startsWith('0') && digits.length === 10 ? `27${digits.slice(1)}` : digits
}

// Phone numbers and names are evidence for review, never automatic identity keys.
export function clientSourceKey(source = {}) {
  const ref = source.identitySource
  return ref?.kind && ref?.id ? `${ref.kind}:${ref.id}` : String(source.sourceRecordId || '')
}

export function resolveClientRedirect(profiles = [], id = '') {
  const byId = profiles instanceof Map ? profiles : new Map(profiles.map((profile) => [profile.id, profile]))
  let current = byId.get(String(id).replace(/^client:/, ''))
  const visited = new Set()
  while (current?.merged_into) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    current = byId.get(current.merged_into)
  }
  return current || null
}

export function findClientDuplicateCandidates(client, clients = []) {
  if (!client) return []
  const emails = new Set([client.email, ...(client.emails || [])].map(normalizeClientEmail).filter(Boolean))
  const phones = new Set([client.phone, ...(client.phones || [])].map(normalizeClientPhone).filter(Boolean))
  const name = String(client.name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return clients.filter((other) => other.id !== client.id && other.organisationId === client.organisationId)
    .map((other) => {
      const reasons = []
      if ([other.email, ...(other.emails || [])].some((email) => emails.has(normalizeClientEmail(email)))) reasons.push('Matching email')
      if ([other.phone, ...(other.phones || [])].some((phone) => phones.has(normalizeClientPhone(phone)))) reasons.push('Matching phone')
      if (name && !/^(unnamed|seller for |buyer$|seller$)/.test(name) && name === String(other.name || '').trim().toLowerCase().replace(/\s+/g, ' ')) reasons.push('Matching name')
      return { client: other, reasons }
    }).filter((candidate) => candidate.reasons.length)
    .sort((a, b) => b.reasons.length - a.reasons.length)
}

export function validateClientContactDetails({ name = '', emails = [], phones = [] } = {}) {
  if (!String(name).trim()) throw new Error('Client name is required.')
  const normalizedEmails = [...new Set(emails.map(normalizeClientEmail).filter(Boolean))]
  if (normalizedEmails.length > 20 || phones.length > 20) throw new Error('Use at most 20 emails and 20 phone numbers.')
  if (normalizedEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Enter valid email addresses.')
  const normalizedPhones = [...new Set(phones.map(normalizeClientPhone).filter(Boolean))]
  if (normalizedPhones.some((phone) => phone.length < 7 || phone.length > 15)) throw new Error('Enter valid phone numbers.')
  return { name: String(name).trim(), emails: normalizedEmails, phones: normalizedPhones }
}

export function clientMatchesStoredId(client, ids) {
  return [client.id, ...(client.legacyDirectoryIds || [])]
    .some((id) => ids.has(id))
}
