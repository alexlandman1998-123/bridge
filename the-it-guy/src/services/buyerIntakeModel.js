const BUYER_QUALIFICATION_NOTE_START = '[Buyer qualification]'
const BUYER_QUALIFICATION_NOTE_END = '[/Buyer qualification]'
const BUYER_VIEWING_PLAN_NOTE_START = '[Buyer viewing plan]'
const BUYER_VIEWING_PLAN_NOTE_END = '[/Buyer viewing plan]'

export const BUYER_INTAKE_VERSION = 'buyer_intake_v1'
export const BUYER_INTAKE_NOTE_START = '[Buyer intake]'
export const BUYER_INTAKE_NOTE_END = '[/Buyer intake]'
export const BUYER_INTAKE_SOURCE_QUALIFICATION = 'buyer_qualification_form'
export const BUYER_INTAKE_SOURCE_VIEWING = 'buyer_viewing_preferences'
export const BUYER_INTAKE_MINIMUM_ANSWER_COUNT = 2

export const BUYER_INTAKE_QUALIFICATION_FIELDS = Object.freeze([
  { key: 'budget', label: 'Budget' },
  { key: 'areaInterest', label: 'Preferred areas' },
  { key: 'moveTimeframe', label: 'Move timeframe' },
  { key: 'financeType', label: 'Cash or bond' },
  { key: 'subjectToFinance', label: 'Subject to finance' },
  { key: 'depositAvailable', label: 'Deposit available' },
  { key: 'preApprovalStatus', label: 'Pre-approval status' },
  { key: 'propertyToSell', label: 'Property to sell first' },
  { key: 'propertyNeed', label: 'Property need' },
  { key: 'additionalNotes', label: 'Call notes' },
])

function normalizeText(value = '', maxLength = 5000) {
  return String(value || '').trim().slice(0, maxLength)
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactObject(item))
      .filter((item) => item !== undefined && item !== null && item !== '')
  }
  if (!value || typeof value !== 'object') return value

  return Object.entries(value).reduce((accumulator, [key, item]) => {
    const next = compactObject(item)
    if (next === undefined || next === null || next === '') return accumulator
    if (Array.isArray(next) && !next.length) return accumulator
    if (next && typeof next === 'object' && !Array.isArray(next) && !Object.keys(next).length) return accumulator
    accumulator[key] = next
    return accumulator
  }, {})
}

function mergeArray(existing = [], next = []) {
  const existingHasObjects = Array.isArray(existing) && existing.some((item) => item && typeof item === 'object')
  const nextHasObjects = Array.isArray(next) && next.some((item) => item && typeof item === 'object')
  if (existingHasObjects || nextHasObjects) {
    return Array.isArray(next) && next.length
      ? next
      : Array.isArray(existing) ? existing : []
  }
  const normalizedNext = Array.isArray(next)
    ? next.map((item) => normalizeText(item)).filter(Boolean)
    : []
  if (normalizedNext.length) return normalizedNext
  return Array.isArray(existing)
    ? existing.map((item) => normalizeText(item)).filter(Boolean)
    : []
}

function normalizeTextList(value = '') {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean)
  }
  return normalizeText(value)
    .split(/\r?\n|,/)
    .map(normalizeText)
    .filter(Boolean)
}

function mergeRecord(existing = {}, patch = {}) {
  const base = asRecord(existing)
  const updates = asRecord(patch)
  const keys = new Set([...Object.keys(base), ...Object.keys(updates)])
  const merged = {}

  for (const key of keys) {
    const current = base[key]
    const next = updates[key]
    if (next === undefined) {
      if (current !== undefined) merged[key] = current
      continue
    }
    if (next === null) {
      if (current !== undefined) merged[key] = current
      continue
    }
    if (Array.isArray(next)) {
      merged[key] = mergeArray(current, next)
      continue
    }
    if (next && typeof next === 'object') {
      merged[key] = mergeRecord(current, next)
      continue
    }
    if (typeof next === 'string') {
      const normalized = normalizeText(next)
      if (normalized) {
        merged[key] = normalized
      } else if (current !== undefined) {
        merged[key] = current
      }
      continue
    }
    if (typeof next === 'number' && Number.isFinite(next)) {
      merged[key] = next
      continue
    }
    if (typeof next === 'boolean') {
      merged[key] = next
      continue
    }
    if (current !== undefined) merged[key] = current
  }

  return compactObject(merged)
}

function parseBuyerQualificationLegacyNoteBlock(notes = '') {
  const raw = String(notes || '')
  const startIndex = raw.indexOf(BUYER_QUALIFICATION_NOTE_START)
  const endIndex = raw.indexOf(BUYER_QUALIFICATION_NOTE_END, startIndex)
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return {}

  const labelToKey = new Map(BUYER_INTAKE_QUALIFICATION_FIELDS.map((field) => [field.label, field.key]))
  const parsed = {}
  let activeKey = ''
  raw
    .slice(startIndex + BUYER_QUALIFICATION_NOTE_START.length, endIndex)
    .trim()
    .split(/\r?\n/)
    .forEach((line) => {
      const labelMatch = line.match(/^([^:]+):\s*(.*)$/)
      const matchedKey = labelMatch ? labelToKey.get(normalizeText(labelMatch[1])) : ''
      if (matchedKey) {
        activeKey = matchedKey
        parsed[matchedKey] = normalizeText(labelMatch[2])
        return
      }
      if (activeKey && normalizeText(line)) {
        parsed[activeKey] = [parsed[activeKey], normalizeText(line)].filter(Boolean).join('\n')
      }
    })
  return parsed
}

function parseBuyerViewingLegacyNoteBlock(notes = '') {
  const raw = String(notes || '')
  const startIndex = raw.indexOf(BUYER_VIEWING_PLAN_NOTE_START)
  const endIndex = raw.indexOf(BUYER_VIEWING_PLAN_NOTE_END, startIndex)
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {}
  }

  const labelToKey = new Map([
    ['Status', 'status'],
    ['Selected property ids', 'selectedPropertyIds'],
    ['Confirmed property ids', 'confirmedPropertyIds'],
    ['Buyer availability windows', 'availabilityWindows'],
    ['Buyer response notes', 'responseNotes'],
    ['Seller recipients', 'sellerRecipientEmails'],
    ['Seller coordination notes', 'sellerCoordinationNotes'],
    ['Booked property ids', 'bookedPropertyIds'],
    ['Booked appointment ids', 'bookedAppointmentIds'],
    ['Buyer availability requested at', 'requestedAt'],
    ['Buyer responded at', 'respondedAt'],
    ['Seller availability requested at', 'sellerRequestedAt'],
    ['Viewing appointments booked at', 'bookedAt'],
    ['Buyer email', 'recipientEmail'],
    ['Updated at', 'updatedAt'],
  ])
  const parsed = {}
  let activeKey = ''
  raw
    .slice(startIndex + BUYER_VIEWING_PLAN_NOTE_START.length, endIndex)
    .trim()
    .split(/\r?\n/)
    .forEach((line) => {
      const labelMatch = line.match(/^([^:]+):\s*(.*)$/)
      const matchedKey = labelMatch ? labelToKey.get(normalizeText(labelMatch[1])) : ''
      if (matchedKey) {
        activeKey = matchedKey
        parsed[matchedKey] = normalizeText(labelMatch[2])
        return
      }
      if (activeKey && normalizeText(line)) {
        parsed[activeKey] = [parsed[activeKey], normalizeText(line)].filter(Boolean).join('\n')
      }
    })

  const status = normalizeText(parsed.status).toLowerCase() || 'draft'
  return {
    status,
    selectedPropertyIds: normalizeText(parsed.selectedPropertyIds)
      .split(',')
      .map(normalizeText)
      .filter(Boolean),
    confirmedPropertyIds: normalizeText(parsed.confirmedPropertyIds)
      .split(',')
      .map(normalizeText)
      .filter(Boolean),
    availabilityWindows: normalizeText(parsed.availabilityWindows),
    responseNotes: normalizeText(parsed.responseNotes),
    sellerRecipientEmails: normalizeText(parsed.sellerRecipientEmails),
    sellerCoordinationNotes: normalizeText(parsed.sellerCoordinationNotes),
    bookedPropertyIds: normalizeText(parsed.bookedPropertyIds)
      .split(',')
      .map(normalizeText)
      .filter(Boolean),
    bookedAppointmentIds: normalizeText(parsed.bookedAppointmentIds)
      .split(',')
      .map(normalizeText)
      .filter(Boolean),
    updatedAt: normalizeText(parsed.updatedAt),
    requestedAt: normalizeText(parsed.requestedAt),
    respondedAt: normalizeText(parsed.respondedAt),
    sellerRequestedAt: normalizeText(parsed.sellerRequestedAt),
    bookedAt: normalizeText(parsed.bookedAt),
    recipientEmail: normalizeText(parsed.recipientEmail),
  }
}

function buildJsonNoteBlock(startMarker, endMarker, payload = {}) {
  return [
    startMarker,
    JSON.stringify(compactObject(payload), null, 2),
    endMarker,
  ].join('\n')
}

function replaceNoteBlock(notes = '', startMarker = '', endMarker = '', block = '') {
  const raw = String(notes || '').trim()
  const startIndex = raw.indexOf(startMarker)
  const existingStart = startIndex >= 0 ? startIndex : -1
  if (existingStart === -1) {
    return [raw, normalizeText(block)].filter(Boolean).join('\n\n')
  }
  const endIndex = raw.indexOf(endMarker, existingStart)
  const before = raw.slice(0, existingStart).trim()
  const after = endIndex === -1 ? '' : raw.slice(endIndex + endMarker.length).trim()
  return [before, normalizeText(block), after].filter(Boolean).join('\n\n')
}

function getBuyerQualificationAnsweredFields(answers = {}) {
  return BUYER_INTAKE_QUALIFICATION_FIELDS
    .map(({ key, label }) => ({ key, label, value: normalizeText(answers[key]) }))
    .filter((field) => field.value)
}

function normalizeBuyerQualificationAnswers(form = {}) {
  return compactObject({
    budget: normalizeText(form.budget),
    areaInterest: normalizeText(form.areaInterest),
    moveTimeframe: normalizeText(form.moveTimeframe),
    financeType: normalizeText(form.financeType),
    subjectToFinance: normalizeText(form.subjectToFinance),
    depositAvailable: normalizeText(form.depositAvailable),
    preApprovalStatus: normalizeText(form.preApprovalStatus),
    propertyToSell: normalizeText(form.propertyToSell),
    propertyNeed: normalizeText(form.propertyNeed),
    additionalNotes: normalizeText(form.additionalNotes, 4000),
  })
}

function buildBuyerQualificationSection(answers = {}, {
  source = BUYER_INTAKE_SOURCE_QUALIFICATION,
  capturedAt = '',
  updatedAt = '',
  qualifiedAt = '',
  existing = {},
} = {}) {
  const normalizedAnswers = normalizeBuyerQualificationAnswers(answers)
  const existingSection = asRecord(existing)
  const mergedAnswers = mergeRecord(existingSection.answers || {}, normalizedAnswers)
  const answeredFields = getBuyerQualificationAnsweredFields(mergedAnswers)
  const complete = answeredFields.length >= BUYER_INTAKE_MINIMUM_ANSWER_COUNT
  const nextCapturedAt = normalizeText(capturedAt) || normalizeText(existingSection.capturedAt)
  const nextUpdatedAt = normalizeText(updatedAt) || nextCapturedAt || normalizeText(existingSection.updatedAt)
  const nextQualifiedAt = complete
    ? (normalizeText(qualifiedAt) || normalizeText(existingSection.qualifiedAt) || nextUpdatedAt)
    : normalizeText(existingSection.qualifiedAt)

  return compactObject({
    source: normalizeText(existingSection.source) || source,
    capturedAt: nextCapturedAt,
    updatedAt: nextUpdatedAt,
    qualifiedAt: nextQualifiedAt,
    answeredFields,
    answeredCount: answeredFields.length,
    minimumCount: BUYER_INTAKE_MINIMUM_ANSWER_COUNT,
    complete,
    answers: mergedAnswers,
  })
}

function normalizeViewingSlot(slot = {}) {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return null
  const normalized = {
    date: normalizeText(slot.date),
    startTime: normalizeText(slot.startTime || slot.start_time),
    endTime: normalizeText(slot.endTime || slot.end_time),
    startAt: normalizeText(slot.startAt || slot.start_at),
    endAt: normalizeText(slot.endAt || slot.end_at),
    timezone: normalizeText(slot.timezone),
    label: normalizeText(slot.label),
  }
  return normalized.date && normalized.startTime && normalized.endTime ? normalized : null
}

function normalizeViewingResponse(response = {}) {
  const source = asRecord(response)
  const confirmedPropertyIds = normalizeTextList(source.confirmedPropertyIds || source.confirmed_property_ids || [])
  const selectedPropertyIds = normalizeTextList(source.selectedPropertyIds || source.selected_property_ids || [])
  const availabilityWindows = normalizeTextList(source.availabilityWindows || source.availability_windows || [])
  const availabilitySlots = (Array.isArray(source.availabilitySlots)
    ? source.availabilitySlots
    : Array.isArray(source.availability_slots)
      ? source.availability_slots
      : [])
    .map((slot) => normalizeViewingSlot(slot))
    .filter(Boolean)

  return compactObject({
    selectedPropertyIds,
    confirmedPropertyIds,
    availabilityWindows,
    availabilitySlots,
    timezone: normalizeText(source.timezone),
    attendeeNotes: normalizeText(source.attendeeNotes || source.attendee_notes, 4000),
    responseNotes: normalizeText(source.responseNotes || source.response_notes, 4000),
    propertyResponses: Array.isArray(source.propertyResponses) ? source.propertyResponses : [],
  })
}

function buildBuyerViewingSection(response = {}, {
  source = BUYER_INTAKE_SOURCE_VIEWING,
  requestedAt = '',
  respondedAt = '',
  updatedAt = '',
  existing = {},
} = {}) {
  const normalizedResponse = normalizeViewingResponse(response)
  const existingSection = asRecord(existing)
  const mergedSelectedPropertyIds = mergeArray(normalizeTextList(existingSection.selectedPropertyIds || []), normalizedResponse.selectedPropertyIds || [])
  const mergedConfirmedPropertyIds = mergeArray(normalizeTextList(existingSection.confirmedPropertyIds || []), normalizedResponse.confirmedPropertyIds || [])
  const mergedAvailabilityWindows = mergeArray(normalizeTextList(existingSection.availabilityWindows || []), normalizedResponse.availabilityWindows || [])
  const mergedAvailabilitySlots = Array.isArray(normalizedResponse.availabilitySlots) && normalizedResponse.availabilitySlots.length
    ? normalizedResponse.availabilitySlots
    : Array.isArray(existingSection.availabilitySlots) ? existingSection.availabilitySlots : []
  const nextRequestedAt = normalizeText(requestedAt) || normalizeText(existingSection.requestedAt)
  const nextRespondedAt = normalizeText(respondedAt) || normalizeText(existingSection.respondedAt)
  const nextUpdatedAt = normalizeText(updatedAt) || nextRespondedAt || nextRequestedAt || normalizeText(existingSection.updatedAt)
  const nextResponseNotes = normalizeText(normalizedResponse.responseNotes) || normalizeText(existingSection.responseNotes)

  return compactObject({
    source: normalizeText(existingSection.source) || source,
    requestedAt: nextRequestedAt,
    respondedAt: nextRespondedAt,
    updatedAt: nextUpdatedAt,
    selectedPropertyIds: mergedSelectedPropertyIds,
    confirmedPropertyIds: mergedConfirmedPropertyIds,
    availabilityWindows: mergedAvailabilityWindows,
    availabilitySlots: mergedAvailabilitySlots,
    timezone: normalizeText(normalizedResponse.timezone) || normalizeText(existingSection.timezone) || 'Africa/Johannesburg',
    attendeeNotes: normalizeText(normalizedResponse.attendeeNotes) || normalizeText(existingSection.attendeeNotes),
    responseNotes: nextResponseNotes,
    propertyResponses: Array.isArray(normalizedResponse.propertyResponses) && normalizedResponse.propertyResponses.length
      ? normalizedResponse.propertyResponses
      : Array.isArray(existingSection.propertyResponses) ? existingSection.propertyResponses : [],
  })
}

function buildBuyerIntakeBase(existingIntake = {}, notes = '') {
  const existing = mergeRecord(parseBuyerIntakeNoteBlock(notes), existingIntake)
  const legacyQualification = parseBuyerQualificationLegacyNoteBlock(notes)
  const legacyViewing = parseBuyerViewingLegacyNoteBlock(notes)

  return compactObject({
    version: normalizeText(existing.version) || BUYER_INTAKE_VERSION,
    source: normalizeText(existing.source),
    capturedAt: normalizeText(existing.capturedAt),
    updatedAt: normalizeText(existing.updatedAt),
    qualification: buildBuyerQualificationSection(legacyQualification, {
      existing: existing.qualification || {},
      capturedAt: existing.capturedAt || existing.qualification?.capturedAt || '',
      updatedAt: existing.updatedAt || existing.qualification?.updatedAt || '',
      qualifiedAt: existing.qualification?.qualifiedAt || '',
      source: existing.qualification?.source || BUYER_INTAKE_SOURCE_QUALIFICATION,
    }),
    viewing: buildBuyerViewingSection(legacyViewing, {
      existing: existing.viewing || {},
      requestedAt: existing.viewing?.requestedAt || '',
      respondedAt: existing.viewing?.respondedAt || '',
      updatedAt: existing.updatedAt || existing.viewing?.updatedAt || '',
      source: existing.viewing?.source || BUYER_INTAKE_SOURCE_VIEWING,
    }),
  })
}

export function parseBuyerIntakeNoteBlock(notes = '') {
  const raw = String(notes || '')
  const startIndex = raw.indexOf(BUYER_INTAKE_NOTE_START)
  const endIndex = raw.indexOf(BUYER_INTAKE_NOTE_END, startIndex)
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return {}
  const body = raw.slice(startIndex + BUYER_INTAKE_NOTE_START.length, endIndex).trim()
  if (!body) return {}
  try {
    const parsed = JSON.parse(body)
    return asRecord(parsed)
  } catch {
    return {}
  }
}

export function hasBuyerIntakeNoteBlock(notes = '') {
  const raw = String(notes || '')
  const startIndex = raw.indexOf(BUYER_INTAKE_NOTE_START)
  const endIndex = raw.indexOf(BUYER_INTAKE_NOTE_END, startIndex)
  return startIndex >= 0 && endIndex > startIndex
}

export function buildBuyerIntakeNoteBlock(intake = {}) {
  return buildJsonNoteBlock(BUYER_INTAKE_NOTE_START, BUYER_INTAKE_NOTE_END, intake)
}

export function buildBuyerIntakeNotes(intake = {}, existingNotes = '') {
  return replaceNoteBlock(
    existingNotes,
    BUYER_INTAKE_NOTE_START,
    BUYER_INTAKE_NOTE_END,
    buildBuyerIntakeNoteBlock(intake),
  )
}

export function buildBuyerQualificationIntake(form = {}, {
  notes = '',
  existingIntake = {},
  source = BUYER_INTAKE_SOURCE_QUALIFICATION,
  capturedAt = '',
  updatedAt = '',
  qualifiedAt = '',
} = {}) {
  const base = buildBuyerIntakeBase(existingIntake, notes)
  const existingQualification = asRecord(base.qualification)
  const qualification = buildBuyerQualificationSection(form, {
    existing: existingQualification,
    source,
    capturedAt: capturedAt || existingQualification.capturedAt || base.capturedAt,
    updatedAt: updatedAt || existingQualification.updatedAt || base.updatedAt,
    qualifiedAt,
  })
  const viewing = buildBuyerViewingSection(base.viewing || {}, {
    existing: base.viewing || {},
    source: base.viewing?.source || BUYER_INTAKE_SOURCE_VIEWING,
    requestedAt: base.viewing?.requestedAt || '',
    respondedAt: base.viewing?.respondedAt || '',
    updatedAt: base.viewing?.updatedAt || base.updatedAt || '',
  })

  return compactObject({
    version: BUYER_INTAKE_VERSION,
    source,
    capturedAt: normalizeText(capturedAt) || normalizeText(base.capturedAt) || normalizeText(qualification.capturedAt),
    updatedAt: normalizeText(updatedAt) || normalizeText(base.updatedAt) || normalizeText(qualification.updatedAt),
    qualification,
    viewing,
  })
}

export function buildBuyerViewingIntake(response = {}, {
  notes = '',
  existingIntake = {},
  source = BUYER_INTAKE_SOURCE_VIEWING,
  requestedAt = '',
  respondedAt = '',
  updatedAt = '',
} = {}) {
  const base = buildBuyerIntakeBase(existingIntake, notes)
  const existingViewing = asRecord(base.viewing)
  const viewing = buildBuyerViewingSection(response, {
    existing: existingViewing,
    source,
    requestedAt: requestedAt || existingViewing.requestedAt || base.capturedAt,
    respondedAt: respondedAt || existingViewing.respondedAt,
    updatedAt: updatedAt || existingViewing.updatedAt || base.updatedAt || respondedAt || requestedAt,
  })
  const qualification = buildBuyerQualificationSection(base.qualification?.answers || {}, {
    existing: base.qualification || {},
    source: base.qualification?.source || BUYER_INTAKE_SOURCE_QUALIFICATION,
    capturedAt: base.qualification?.capturedAt || base.capturedAt || requestedAt || respondedAt,
    updatedAt: base.qualification?.updatedAt || base.updatedAt || respondedAt || requestedAt,
    qualifiedAt: base.qualification?.qualifiedAt || '',
  })

  return compactObject({
    version: BUYER_INTAKE_VERSION,
    source,
    capturedAt: normalizeText(base.capturedAt) || normalizeText(viewing.requestedAt) || normalizeText(respondedAt) || normalizeText(requestedAt),
    updatedAt: normalizeText(updatedAt) || normalizeText(base.updatedAt) || normalizeText(viewing.updatedAt) || normalizeText(respondedAt),
    qualification,
    viewing,
  })
}

export function normalizeBuyerIntakeForInspection(intake = {}) {
  const parsed = asRecord(intake)
  return compactObject({
    version: normalizeText(parsed.version) || BUYER_INTAKE_VERSION,
    source: normalizeText(parsed.source),
    capturedAt: normalizeText(parsed.capturedAt),
    updatedAt: normalizeText(parsed.updatedAt),
    qualification: buildBuyerQualificationSection(parsed.qualification?.answers || {}, {
      existing: parsed.qualification || {},
      source: parsed.qualification?.source || BUYER_INTAKE_SOURCE_QUALIFICATION,
      capturedAt: parsed.qualification?.capturedAt || parsed.capturedAt,
      updatedAt: parsed.qualification?.updatedAt || parsed.updatedAt,
      qualifiedAt: parsed.qualification?.qualifiedAt || '',
    }),
    viewing: buildBuyerViewingSection(parsed.viewing || {}, {
      existing: parsed.viewing || {},
      source: parsed.viewing?.source || BUYER_INTAKE_SOURCE_VIEWING,
      requestedAt: parsed.viewing?.requestedAt || '',
      respondedAt: parsed.viewing?.respondedAt || '',
      updatedAt: parsed.viewing?.updatedAt || parsed.updatedAt,
    }),
  })
}
