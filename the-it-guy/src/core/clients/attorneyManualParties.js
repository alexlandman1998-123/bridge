const ATTORNEY_MANUAL_PARTIES_STORAGE_KEY = 'itg:attorney-manual-parties:v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function createManualPartyId() {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `manual-party-${Date.now().toString(36)}-${randomPart}`
}

export function readAttorneyManualParties() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ATTORNEY_MANUAL_PARTIES_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeAttorneyManualParties(records = []) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ATTORNEY_MANUAL_PARTIES_STORAGE_KEY, JSON.stringify(records))
}

export function buildAttorneyManualPartyRecord(form = {}) {
  const now = new Date().toISOString()
  return {
    id: createManualPartyId(),
    name: normalizeText(form.name),
    email: normalizeText(form.email).toLowerCase(),
    phone: normalizeText(form.phone),
    role: normalizeText(form.role || 'buyer'),
    type: normalizeText(form.type || 'individual'),
    matterReference: normalizeText(form.matterReference),
    notes: normalizeText(form.notes),
    createdAt: now,
    updatedAt: now,
  }
}
