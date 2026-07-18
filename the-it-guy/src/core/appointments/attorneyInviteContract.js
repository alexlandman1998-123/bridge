export const ATTORNEY_INVITE_TIMEZONE = 'Africa/Johannesburg'

export const ATTORNEY_INVITE_LOCATION_TYPES = Object.freeze({
  videoCall: 'video_call',
  physicalAddress: 'physical_address',
  phoneCall: 'phone_call',
})

export const ATTORNEY_INVITE_LOCATION_MODES = Object.freeze({
  videoCall: 'video_call',
  boardroom: 'boardroom',
  physicalAddress: 'physical_address',
  phoneCall: 'phone_call',
})

export const ATTORNEY_INVITE_LOCATION_OPTIONS = Object.freeze([
  { value: ATTORNEY_INVITE_LOCATION_MODES.videoCall, label: 'Video call' },
  { value: ATTORNEY_INVITE_LOCATION_MODES.boardroom, label: 'Firm boardroom' },
  { value: ATTORNEY_INVITE_LOCATION_MODES.physicalAddress, label: 'Office / address' },
  { value: ATTORNEY_INVITE_LOCATION_MODES.phoneCall, label: 'Phone call' },
])

export const ATTORNEY_INVITE_TYPES = Object.freeze([
  Object.freeze({
    value: 'transfer_signing',
    label: 'Transfer Signing',
    helper: 'Buyer or seller transfer document signing.',
    participantRole: 'Client',
    visibility: 'client_visible',
    durationMinutes: 60,
    requiresRecipientEmail: true,
  }),
  Object.freeze({
    value: 'bond_signing',
    label: 'Bond Signing',
    helper: 'Buyer bond registration document signing.',
    participantRole: 'Buyer',
    visibility: 'client_visible',
    durationMinutes: 60,
    requiresRecipientEmail: true,
  }),
  Object.freeze({
    value: 'attorney_consultation',
    label: 'Attorney Consultation',
    helper: 'Legal process questions, readiness, or next steps.',
    participantRole: 'Client',
    visibility: 'shared_role_players',
    durationMinutes: 45,
    requiresRecipientEmail: true,
  }),
  Object.freeze({
    value: 'internal_meeting',
    label: 'Internal Prep',
    helper: 'Firm-only coordination before a signing.',
    participantRole: 'Attorney',
    visibility: 'internal_only',
    durationMinutes: 30,
    requiresRecipientEmail: true,
  }),
])

export const DEFAULT_ATTORNEY_INVITE_DRAFT = Object.freeze({
  appointmentType: 'transfer_signing',
  matterId: '',
  recipientName: '',
  recipientEmail: '',
  date: '',
  startTime: '',
  locationMode: ATTORNEY_INVITE_LOCATION_MODES.videoCall,
  location: '',
  resourceId: '',
  notes: '',
})

const TYPE_BY_KEY = new Map(ATTORNEY_INVITE_TYPES.map((item) => [item.value, item]))
const VALID_LOCATION_MODES = new Set(Object.values(ATTORNEY_INVITE_LOCATION_MODES))
const JOHANNESBURG_UTC_OFFSET_MINUTES = 120

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeAppointmentType(value = '') {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function normalizeLocationMode(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === 'office' || normalized === 'address') {
    return ATTORNEY_INVITE_LOCATION_MODES.physicalAddress
  }
  if (VALID_LOCATION_MODES.has(normalized)) return normalized
  return normalized
}

function parseDate(value = '') {
  const match = normalizeText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null
  return { year, month, day }
}

function parseTime(value = '') {
  const match = normalizeText(value).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] || 0)
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return { hours, minutes, seconds, totalMinutes: (hours * 60) + minutes }
}

function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function isEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value))
}

function isHttpUrl(value = '') {
  try {
    const parsed = new URL(normalizeText(value))
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function toJohannesburgStartMs(dateParts, timeParts) {
  if (!dateParts || !timeParts) return Number.NaN
  return Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hours,
    timeParts.minutes - JOHANNESBURG_UTC_OFFSET_MINUTES,
    timeParts.seconds,
  )
}

function addError(errors, field, code, message) {
  errors.push({ field, code, message })
}

export function getAttorneyInviteTypeDefinition(value = '') {
  return TYPE_BY_KEY.get(normalizeAppointmentType(value)) || null
}

export function buildAttorneyInviteContract(input = {}, options = {}) {
  const errors = []
  const appointmentType = normalizeAppointmentType(input.appointmentType || input.appointment_type)
  const typeDefinition = getAttorneyInviteTypeDefinition(appointmentType)
  const organisationId = normalizeText(input.organisationId || input.organisation_id)
  const transactionId = normalizeText(input.transactionId || input.transaction_id || input.matterId)
  const recipientEmail = normalizeLower(input.recipientEmail || input.email)
  const recipientName = normalizeText(input.recipientName || input.name) || recipientEmail
  const date = normalizeText(input.date || input.appointmentDate || input.appointment_date)
  const startTime = normalizeText(input.startTime || input.start_time).slice(0, 8)
  const dateParts = parseDate(date)
  const timeParts = parseTime(startTime)
  const durationMinutes = Number(input.durationMinutes || input.duration_minutes || typeDefinition?.durationMinutes || 0)
  const locationMode = normalizeLocationMode(
    input.locationMode
    || input.location_mode
    || input.locationType
    || input.location_type
    || ATTORNEY_INVITE_LOCATION_MODES.videoCall,
  )
  const resourceId = normalizeText(input.resourceId || input.resource_id)
  const rawLocation = normalizeText(input.location)
  const suppliedMeetingUrl = normalizeText(input.meetingUrl || input.meeting_url)
  const boardroomName = normalizeText(input.resourceName || input.resource_name || rawLocation)

  if (!typeDefinition) {
    addError(errors, 'appointmentType', 'unsupported_appointment_type', 'Choose a supported attorney invite type.')
  }
  if (!organisationId) {
    addError(errors, 'organisationId', 'missing_organisation', 'Firm workspace is required before creating an attorney invite.')
  }
  if (!transactionId) {
    addError(errors, 'transactionId', 'missing_matter', 'Choose the matter this invite belongs to.')
  }
  if (!recipientEmail) {
    addError(errors, 'recipientEmail', 'missing_recipient_email', 'Recipient email is required.')
  } else if (!isEmail(recipientEmail)) {
    addError(errors, 'recipientEmail', 'invalid_recipient_email', 'Enter a valid recipient email address.')
  }
  if (!dateParts) {
    addError(errors, 'date', 'invalid_date', 'Enter a valid invite date.')
  }
  if (!timeParts) {
    addError(errors, 'startTime', 'invalid_start_time', 'Enter a valid invite start time.')
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 8 * 60) {
    addError(errors, 'durationMinutes', 'invalid_duration', 'Invite duration must be between 15 minutes and 8 hours.')
  }
  if (!VALID_LOCATION_MODES.has(locationMode)) {
    addError(errors, 'locationMode', 'unsupported_location_type', 'Choose a supported invite location type.')
  }

  const endTotalMinutes = timeParts && Number.isFinite(durationMinutes)
    ? timeParts.totalMinutes + durationMinutes
    : Number.NaN
  if (Number.isFinite(endTotalMinutes) && endTotalMinutes >= 24 * 60) {
    addError(errors, 'startTime', 'invite_crosses_midnight', 'Choose a start time that keeps the invite within the same day.')
  }

  const startMs = toJohannesburgStartMs(dateParts, timeParts)
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : Number.isFinite(Number(options.now))
      ? Number(options.now)
      : Date.now()
  if (Number.isFinite(startMs) && startMs <= nowMs) {
    addError(errors, 'date', 'invite_in_past', 'Choose an invite date and time in the future.')
  }

  let locationType = locationMode
  let location = rawLocation
  let meetingUrl = suppliedMeetingUrl

  if (locationMode === ATTORNEY_INVITE_LOCATION_MODES.videoCall) {
    locationType = ATTORNEY_INVITE_LOCATION_TYPES.videoCall
    meetingUrl = suppliedMeetingUrl || rawLocation
    location = meetingUrl
    if (!meetingUrl) {
      addError(errors, 'location', 'missing_meeting_url', 'Meeting link is required for a video call.')
    } else if (!isHttpUrl(meetingUrl)) {
      addError(errors, 'location', 'invalid_meeting_url', 'Enter a valid HTTPS meeting link.')
    }
  } else if (locationMode === ATTORNEY_INVITE_LOCATION_MODES.boardroom) {
    locationType = ATTORNEY_INVITE_LOCATION_TYPES.physicalAddress
    location = boardroomName
    meetingUrl = ''
    if (!resourceId) {
      addError(errors, 'resourceId', 'missing_boardroom', 'Choose a boardroom for this invite.')
    }
    if (!boardroomName) {
      addError(errors, 'resourceId', 'missing_boardroom_name', 'The selected boardroom is unavailable.')
    }
  } else if (locationMode === ATTORNEY_INVITE_LOCATION_MODES.physicalAddress) {
    locationType = ATTORNEY_INVITE_LOCATION_TYPES.physicalAddress
    meetingUrl = ''
    if (!location) {
      addError(errors, 'location', 'missing_physical_address', 'Office or address details are required.')
    }
  } else if (locationMode === ATTORNEY_INVITE_LOCATION_MODES.phoneCall) {
    locationType = ATTORNEY_INVITE_LOCATION_TYPES.phoneCall
    meetingUrl = ''
    if (!location) {
      addError(errors, 'location', 'missing_phone_details', 'Phone call details are required.')
    }
  }

  const fieldErrors = errors.reduce((accumulator, error) => {
    if (!accumulator[error.field]) accumulator[error.field] = error.message
    return accumulator
  }, {})

  const normalizedStartTime = timeParts
    ? `${String(timeParts.hours).padStart(2, '0')}:${String(timeParts.minutes).padStart(2, '0')}`
    : startTime
  const endTime = Number.isFinite(endTotalMinutes) && endTotalMinutes < 24 * 60
    ? formatTime(endTotalMinutes)
    : ''

  return {
    isValid: errors.length === 0,
    errors,
    fieldErrors,
    value: {
      organisationId,
      transactionId,
      appointmentType: typeDefinition?.value || appointmentType,
      recipientName,
      recipientEmail,
      participantRole: typeDefinition?.participantRole || normalizeText(input.participantRole || input.participant_role),
      date,
      startTime: normalizedStartTime,
      endTime,
      dateTime: dateParts && timeParts ? `${date}T${normalizedStartTime}:00+02:00` : '',
      durationMinutes,
      timezone: ATTORNEY_INVITE_TIMEZONE,
      locationMode,
      locationType,
      location,
      meetingUrl,
      resourceId: locationMode === ATTORNEY_INVITE_LOCATION_MODES.boardroom ? resourceId : '',
      resourceName: locationMode === ATTORNEY_INVITE_LOCATION_MODES.boardroom ? boardroomName : '',
      visibility: typeDefinition?.visibility || normalizeText(input.visibility || input.visibility_scope),
      title: normalizeText(input.title),
      instructions: normalizeText(input.instructions || input.appointmentInstructions || input.appointment_instructions),
      linkedWorkflow: normalizeText(input.linkedWorkflow || input.linked_workflow),
      linkedWorkflowStage: normalizeText(input.linkedWorkflowStage || input.linked_workflow_stage),
      linkedTransactionStage: normalizeText(input.linkedTransactionStage || input.linked_transaction_stage),
      notes: normalizeText(input.notes),
      attorneyName: normalizeText(input.attorneyName || input.senderName),
      attorneyEmail: normalizeLower(input.attorneyEmail),
      attachCalendarInvite: input.attachCalendarInvite !== false,
    },
  }
}

export class AttorneyInviteContractError extends Error {
  constructor(result) {
    super(result?.errors?.[0]?.message || 'Attorney invite details are invalid.')
    this.name = 'AttorneyInviteContractError'
    this.code = result?.errors?.[0]?.code || 'invalid_attorney_invite'
    this.field = result?.errors?.[0]?.field || ''
    this.errors = Array.isArray(result?.errors) ? result.errors : []
    this.fieldErrors = result?.fieldErrors || {}
  }
}

export function requireValidAttorneyInvite(input = {}, options = {}) {
  const result = buildAttorneyInviteContract(input, options)
  if (!result.isValid) throw new AttorneyInviteContractError(result)
  return result.value
}
