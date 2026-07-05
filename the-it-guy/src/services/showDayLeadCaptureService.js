import { createAgencyCrmLeadTask } from '../lib/agencyCrmRepository'
import { createAppointmentAsync, updateAppointmentAsync } from '../lib/agencyPipelineService'
import { upsertAppointmentViewedListings } from '../lib/buyerLifecycleService'
import { markLeadFirstContacted } from './leadAssignmentService'
import { createOrUpdateLeadFromEnquiry } from './leadIngestionService'
import { upsertLeadListingInterest } from './leadListingInterestService'
import { processViewingEvent } from './leadActionEngineService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const SHOW_DAY_SOURCE = 'Show Day'
export const SHOW_DAY_WORKFLOW_VARIANT = 'show_day'
export const SHOW_DAY_FOLLOW_UP_TITLE = 'Follow up after show day viewing'
export const DEFAULT_SHOW_DAY_OUTCOME = 'Interested'
export const DEFAULT_SHOW_DAY_NEXT_STEP = 'Phone follow-up and confirm whether buyer wants to submit an offer.'

const DEFAULT_BULK_VISITOR_COLUMNS = ['name', 'phone', 'email', 'outcome', 'buyerFeedback', 'notes', 'nextStep']
const BULK_VISITOR_FIELD_ALIASES = {
  name: ['name', 'buyer', 'buyer_name', 'visitor', 'visitor_name', 'full_name', 'fullname'],
  phone: ['phone', 'mobile', 'cell', 'cellphone', 'telephone', 'contact_number', 'contactnumber'],
  email: ['email', 'email_address', 'emailaddress'],
  outcome: ['outcome', 'intent', 'interest', 'interest_level', 'interestlevel'],
  buyerFeedback: ['feedback', 'buyer_feedback', 'buyerfeedback', 'comments', 'comment'],
  notes: ['notes', 'agent_notes', 'agentnotes', 'internal_notes', 'internalnotes'],
  nextStep: ['next_step', 'nextstep', 'follow_up', 'followup'],
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeKey(value = '') {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeEmail(value) {
  return normalizeLower(value)
}

function normalizePhone(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const plus = text.startsWith('+') ? '+' : ''
  return `${plus}${text.replace(/[^\d]/g, '')}`
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function slug(value, fallback = 'unknown') {
  return normalizeLower(value).replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback
}

function splitDelimitedRow(line = '', delimiter = ',') {
  const cells = []
  let current = ''
  let quoted = false
  const text = String(line || '')
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function countDelimiter(line = '', delimiter = ',') {
  return splitDelimitedRow(line, delimiter).length
}

function detectVisitorDelimiter(lines = []) {
  const first = lines.find((line) => normalizeText(line))
  if (!first) return ','
  const candidates = ['\t', ';', ',']
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiter(first, delimiter) }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ','
}

function resolveBulkVisitorFieldKey(value = '') {
  const key = normalizeKey(value)
  for (const [field, aliases] of Object.entries(BULK_VISITOR_FIELD_ALIASES)) {
    if (aliases.includes(key)) return field
  }
  return ''
}

function hasVisitorIdentity(row = {}) {
  return Boolean(normalizeText(row.name) || normalizeText(row.email) || normalizeText(row.phone))
}

function readDateValue(payload = {}) {
  return payload.showDayAt || payload.show_day_at || payload.viewedAt || payload.viewed_at || payload.enquiryTimestamp || payload.enquiry_timestamp || payload.createdAt || payload.created_at
}

function normalizeTime(value = '', fallback = '12:00') {
  const text = normalizeText(value)
  if (!text) return fallback
  const match = text.match(/^(\d{1,2})(?::?(\d{2}))?/)
  if (!match) return fallback
  const hour = Math.min(23, Math.max(0, Number(match[1]) || 0))
  const minute = Math.min(59, Math.max(0, Number(match[2] || 0) || 0))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeDatePart(value = '') {
  const text = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = text ? new Date(text) : null
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return ''
}

function extractInputDatePart(value = '') {
  const match = normalizeText(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || ''
}

function extractInputTimePart(value = '') {
  const match = normalizeText(value).match(/[T\s](\d{1,2}):?(\d{2})/)
  if (!match) return ''
  return normalizeTime(`${match[1]}:${match[2]}`, '')
}

function resolveShowDayAt(payload = {}, fallbackDate = new Date()) {
  const direct = readDateValue(payload)
  const directDate = direct ? new Date(direct) : null
  if (directDate && !Number.isNaN(directDate.getTime())) return directDate.toISOString()

  const datePart = normalizeDatePart(payload.showDayDate || payload.show_day_date || payload.date || payload.appointmentDate || payload.appointment_date)
  if (datePart) {
    const timePart = normalizeTime(payload.showDayTime || payload.show_day_time || payload.time || payload.startTime || payload.start_time)
    const parsed = new Date(`${datePart}T${timePart}:00`)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  const fallback = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate)
  return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString()
}

function resolveShowDayDatePart(payload = {}, showDayAt = '') {
  const explicitDate = normalizeDatePart(payload.showDayDate || payload.show_day_date || payload.date || payload.appointmentDate || payload.appointment_date)
  if (explicitDate) return explicitDate
  return extractInputDatePart(readDateValue(payload)) || normalizeDatePart(showDayAt)
}

function resolveShowDayTimePart(payload = {}, showDayAt = '') {
  const explicitTime = normalizeTime(payload.showDayTime || payload.show_day_time || payload.time || payload.startTime || payload.start_time, '')
  if (explicitTime) return explicitTime
  return extractInputTimePart(readDateValue(payload)) || normalizeTime(showDayAt.slice(11, 16))
}

function addDaysDatePart(isoValue = '', days = 1) {
  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function resolveName(payload = {}) {
  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {}
  return normalizeText(
    payload.name ||
      payload.fullName ||
      payload.full_name ||
      contact.name ||
      contact.fullName ||
      contact.full_name ||
      [payload.firstName || payload.first_name || contact.firstName || contact.first_name, payload.lastName || payload.last_name || contact.lastName || contact.last_name].filter(Boolean).join(' '),
  )
}

function resolveContact(payload = {}) {
  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {}
  return {
    contactId: nullableUuid(payload.contactId || payload.contact_id || contact.contactId || contact.contact_id),
    name: resolveName(payload),
    firstName: normalizeText(payload.firstName || payload.first_name || contact.firstName || contact.first_name),
    lastName: normalizeText(payload.lastName || payload.last_name || contact.lastName || contact.last_name),
    email: normalizeEmail(payload.email || contact.email || payload.fromEmail || payload.from_email),
    phone: normalizePhone(payload.phone || payload.mobile || contact.phone || contact.mobile || payload.fromPhone || payload.from_phone),
  }
}

function resolveListingId(payload = {}) {
  return nullableUuid(payload.listingId || payload.listing_id || payload.privateListingId || payload.private_listing_id || payload.propertyId || payload.property_id)
}

function resolveListingReference(payload = {}) {
  return normalizeText(payload.listingReference || payload.listing_reference || payload.externalListingReference || payload.external_listing_reference || payload.propertyReference || payload.property_reference)
}

function buildShowDayNotes(payload = {}, normalized = {}) {
  const notes = normalizeText(payload.notes || payload.message || payload.comment)
  const feedback = normalizeText(payload.buyerFeedback || payload.buyer_feedback || payload.feedback)
  const sourceReference = normalizeText(normalized.sourceReferenceId)
  return [
    notes,
    feedback ? `Buyer feedback: ${feedback}` : '',
    sourceReference ? `Show day capture reference: ${sourceReference}` : '',
  ].filter(Boolean).join('\n')
}

function resolveActorAgent(actor = null, fallback = null) {
  if (fallback && typeof fallback === 'object') return fallback
  if (actor && typeof actor === 'object') return actor
  return null
}

function resolveAssignedAgentId(ingestion = {}, actor = null) {
  return nullableUuid(
    ingestion?.assignment?.agentId ||
      ingestion?.assignment?.newAgentId ||
      ingestion?.assignment?.assignedAgentId ||
      actor?.id ||
      actor?.userId ||
      actor?.user_id,
  )
}

function buildBuyerParticipant(contact = {}, contactId = '') {
  const hasParticipantSignal = contact.name || contact.email || contact.phone || contactId
  if (!hasParticipantSignal) return []
  return [{
    name: contact.name || 'Buyer',
    email: contact.email,
    phone: contact.phone,
    contactId: nullableUuid(contactId) || null,
    participantRole: 'Buyer',
    rsvpStatus: 'Confirmed',
  }]
}

function getLeadId(result = {}) {
  return nullableUuid(result.leadId || result.lead_id || result.lead?.leadId || result.lead?.lead_id || result.log?.lead_id || result.duplicateOf?.lead_id)
}

function getContactId(result = {}) {
  return nullableUuid(result.contactId || result.contact_id || result.contact?.contactId || result.contact?.contact_id || result.log?.contact_id || result.duplicateOf?.contact_id)
}

function getAppointmentId(result = {}) {
  return nullableUuid(result.appointmentId || result.appointment_id || result.id)
}

export function buildShowDaySourceReference(payload = {}, { now = new Date() } = {}) {
  const showDayAt = resolveShowDayAt(payload, now)
  const showDayDate = resolveShowDayDatePart(payload, showDayAt)
  const contact = resolveContact(payload)
  const listingKey = resolveListingId(payload) || resolveListingReference(payload) || 'property'
  const contactKey = contact.email || contact.phone || contact.name || contact.contactId || 'visitor'
  return `show-day:${slug(listingKey, 'property')}:${slug(contactKey, 'visitor')}:${showDayDate}`
}

export function normalizeShowDayCapturePayload(payload = {}, { now = new Date() } = {}) {
  const contact = resolveContact(payload)
  const showDayAt = resolveShowDayAt(payload, now)
  const listingId = resolveListingId(payload)
  const sourceReferenceId = normalizeText(payload.sourceReferenceId || payload.source_reference_id) || buildShowDaySourceReference(payload, { now })
  const followUpDueDate = normalizeDatePart(payload.followUpDueDate || payload.follow_up_due_date || payload.followUpDate || payload.follow_up_date) || addDaysDatePart(showDayAt, 1)
  const outcome = normalizeText(payload.outcome || payload.showDayOutcome || payload.show_day_outcome || payload.intent) || DEFAULT_SHOW_DAY_OUTCOME
  const buyerFeedback = normalizeText(payload.buyerFeedback || payload.buyer_feedback || payload.feedback)
  const agentNotes = normalizeText(payload.agentNotes || payload.agent_notes || payload.notes || payload.message || payload.comment)
  const nextStep = normalizeText(payload.nextStep || payload.next_step) || DEFAULT_SHOW_DAY_NEXT_STEP

  return {
    organisationId: nullableUuid(payload.organisationId || payload.organisation_id),
    listingId,
    listingReference: resolveListingReference(payload),
    contact,
    showDayAt,
    showDayDate: resolveShowDayDatePart(payload, showDayAt),
    showDayTime: resolveShowDayTimePart(payload, showDayAt),
    sourceReferenceId,
    outcome,
    buyerFeedback,
    agentNotes,
    nextStep,
    followUpDueDate,
    createFollowUpTask: payload.createFollowUpTask !== false && payload.create_follow_up_task !== false,
    skipDuplicateSideEffects: payload.skipDuplicateSideEffects !== false && payload.skip_duplicate_side_effects !== false,
    reserveAgentCalendar: payload.reserveAgentCalendar === true || payload.reserve_agent_calendar === true,
    assignedAgent: payload.assignedAgent || payload.assigned_agent || payload.agent || null,
    requirement: payload.requirement && typeof payload.requirement === 'object' ? payload.requirement : null,
    location: normalizeText(payload.location || payload.propertyAddress || payload.property_address),
    raw: payload,
  }
}

export function parseShowDayVisitorRows(text = '', defaults = {}) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return []

  const delimiter = detectVisitorDelimiter(lines)
  const firstCells = splitDelimitedRow(lines[0], delimiter)
  const headerFields = firstCells.map(resolveBulkVisitorFieldKey)
  const hasHeader = headerFields.some(Boolean)
  const fieldKeys = hasHeader ? headerFields : DEFAULT_BULK_VISITOR_COLUMNS
  const dataLines = hasHeader ? lines.slice(1) : lines
  const rowOffset = hasHeader ? 2 : 1

  return dataLines
    .map((line, index) => {
      const cells = splitDelimitedRow(line, delimiter)
      const row = { ...defaults, rowNumber: index + rowOffset }
      fieldKeys.forEach((fieldKey, cellIndex) => {
        if (!fieldKey) return
        const value = normalizeText(cells[cellIndex])
        if (value) row[fieldKey] = value
      })
      return row
    })
    .filter(hasVisitorIdentity)
}

function assertCaptureReady(normalized = {}) {
  if (!normalized.organisationId) throw new Error('A valid organisation id is required for show day lead capture.')
  if (!normalized.listingId) throw new Error('A valid listing id is required for show day lead capture.')
  if (!normalized.contact.name && !normalized.contact.email && !normalized.contact.phone && !normalized.contact.contactId) {
    throw new Error('Show day lead capture needs at least a buyer name, phone, email, or contact id.')
  }
}

function buildEnquiryPayload(normalized = {}) {
  const notes = buildShowDayNotes(normalized.raw, normalized)
  return {
    organisationId: normalized.organisationId,
    source: SHOW_DAY_SOURCE,
    externalReference: normalized.sourceReferenceId,
    enquiryTimestamp: normalized.showDayAt,
    name: normalized.contact.name,
    firstName: normalized.contact.firstName,
    lastName: normalized.contact.lastName,
    email: normalized.contact.email,
    phone: normalized.contact.phone,
    listingId: normalized.listingId,
    listingReference: normalized.listingReference,
    message: notes,
    leadCategory: 'buyer',
    assignedAgent: normalized.assignedAgent,
    requirement: normalized.requirement,
    lead: {
      leadCategory: 'buyer',
      leadDirection: 'Inbound',
      leadSource: SHOW_DAY_SOURCE,
      stage: 'Viewing Completed',
      status: 'Viewing Completed',
      priority: normalizeText(normalized.raw?.priority) || 'High',
      listingId: normalized.listingId,
      sourceReferenceId: normalized.sourceReferenceId,
      notes,
    },
  }
}

function buildAppointmentPayload(normalized = {}, { leadId = '', contactId = '', actor = null } = {}) {
  const participantContact = {
    ...normalized.contact,
    contactId,
  }
  return {
    appointmentType: 'viewing',
    title: `Show Day Viewing - ${normalized.contact.name || 'Buyer'}`,
    date: normalized.showDayDate,
    startTime: normalized.showDayTime,
    dateTime: normalized.showDayAt,
    location: normalized.location,
    locationType: normalized.location ? 'physical_address' : 'to_be_confirmed',
    notes: buildShowDayNotes(normalized.raw, normalized),
    status: 'confirmed',
    leadId,
    contactId,
    listingId: normalized.listingId,
    relatedEntityType: 'lead',
    relatedEntityId: leadId,
    assignedAgent: normalized.reserveAgentCalendar ? resolveActorAgent(actor, normalized.assignedAgent) : {},
    participants: buildBuyerParticipant(participantContact, contactId),
    instructions: 'Post-show-day capture. Buyer has already viewed the property.',
    allowOutsideBusinessHours: true,
    schedulingOverrideReason: 'Post-show-day capture; viewing already happened.',
    sendInviteEmails: false,
    attachCalendarInvite: false,
  }
}

function buildFollowUpDescription(normalized = {}) {
  return [
    'Phone the buyer after the show day viewing.',
    'Capture feedback, confirm buying readiness, and ask whether they want to submit an offer or keep looking.',
    normalized.outcome ? `Viewing outcome: ${normalized.outcome}.` : '',
    normalized.nextStep ? `Next step: ${normalized.nextStep}` : '',
  ].filter(Boolean).join('\n')
}

export async function captureShowDayLead(payload = {}, { actor = null } = {}) {
  const normalized = normalizeShowDayCapturePayload(payload)
  assertCaptureReady(normalized)

  const ingestion = await createOrUpdateLeadFromEnquiry(
    buildEnquiryPayload(normalized),
    {
      actor,
      createInitialTask: false,
      createLeadRecommendation: false,
      workflowVariant: SHOW_DAY_WORKFLOW_VARIANT,
    },
  )

  if (!ingestion?.ok) {
    return {
      ok: false,
      status: ingestion?.status || 'failed',
      source: SHOW_DAY_SOURCE,
      sourceReferenceId: normalized.sourceReferenceId,
      error: ingestion?.error || 'Show day lead capture failed during ingestion.',
      ingestion,
    }
  }

  const leadId = getLeadId(ingestion)
  const contactId = getContactId(ingestion)
  if (!leadId) {
    return {
      ok: false,
      status: 'failed',
      source: SHOW_DAY_SOURCE,
      sourceReferenceId: normalized.sourceReferenceId,
      error: 'Show day lead capture could not resolve a lead id.',
      ingestion,
    }
  }

  const duplicateCapture = ingestion.status === 'duplicate'
  if (duplicateCapture && normalized.skipDuplicateSideEffects) {
    return {
      ok: true,
      status: 'duplicate',
      source: SHOW_DAY_SOURCE,
      sourceReferenceId: normalized.sourceReferenceId,
      leadId,
      contactId,
      listingId: normalized.listingId,
      skippedSideEffects: true,
      ingestion,
    }
  }

  const contactedLead = await markLeadFirstContacted({
    organisationId: normalized.organisationId,
    leadId,
    contactedAt: normalized.showDayAt,
  }, { actor })

  const listingInterest = await upsertLeadListingInterest({
    organisationId: normalized.organisationId,
    leadId,
    contactId,
    listingId: normalized.listingId,
    requirementId: ingestion.requirement?.requirementId || ingestion.requirement?.requirement_id,
    source: SHOW_DAY_SOURCE,
    status: 'viewed',
    isOriginalEnquiry: true,
    isAgentSelected: false,
    notes: buildShowDayNotes(normalized.raw, normalized),
    createdBy: actor?.id,
  }, { actor })

  const createdAppointment = await createAppointmentAsync(
    normalized.organisationId,
    buildAppointmentPayload(normalized, { leadId, contactId, actor }),
    { actor },
  )
  const appointmentId = getAppointmentId(createdAppointment)
  const completedAppointment = appointmentId
    ? await updateAppointmentAsync(
        normalized.organisationId,
        appointmentId,
        {
          status: 'completed',
          completedAt: normalized.showDayAt,
          listingId: normalized.listingId,
          outcomeSummary: normalized.outcome,
          clientFeedback: normalized.buyerFeedback,
          agentNotes: normalized.agentNotes,
          nextStep: normalized.nextStep,
          followUpDate: normalized.followUpDueDate,
        },
        { actor, suppressNotifications: true },
      )
    : null

  const viewedListings = appointmentId
    ? await upsertAppointmentViewedListings({
        organisationId: normalized.organisationId,
        appointmentId,
        leadId,
        agentId: actor?.id || actor?.userId,
        replaceExisting: true,
        viewedListings: [{
          listingId: normalized.listingId,
          outcome: normalized.outcome,
          buyerFeedback: normalized.buyerFeedback,
          agentNotes: normalized.agentNotes,
          viewedAt: normalized.showDayAt,
          metadata: {
            source: 'show_day_capture',
            sourceReferenceId: normalized.sourceReferenceId,
            nextStep: normalized.nextStep,
          },
        }],
      })
    : []

  const recommendation = await processViewingEvent({
    organisationId: normalized.organisationId,
    leadId,
    contactId,
    assignedAgentId: resolveAssignedAgentId(ingestion, actor),
    appointmentId,
    status: 'completed',
    dueDate: normalized.followUpDueDate,
    sourceEvent: `show_day_viewing_completed:${appointmentId || normalized.sourceReferenceId}`,
    metadata: {
      source: 'show_day_capture',
      sourceReferenceId: normalized.sourceReferenceId,
      listingId: normalized.listingId,
      outcome: normalized.outcome,
      nextStep: normalized.nextStep,
    },
  }, { actor })

  const followUpTask = normalized.createFollowUpTask
    ? await createAgencyCrmLeadTask(normalized.organisationId, leadId, {
        title: SHOW_DAY_FOLLOW_UP_TITLE,
        description: buildFollowUpDescription(normalized),
        dueDate: normalized.followUpDueDate,
        status: 'Pending',
        priority: 'High',
        assignedAgent: resolveActorAgent(actor, normalized.assignedAgent),
      }, { actor })
    : null

  return {
    ok: true,
    status: 'processed',
    source: SHOW_DAY_SOURCE,
    sourceReferenceId: normalized.sourceReferenceId,
    leadId,
    contactId,
    listingId: normalized.listingId,
    ingestion,
    contactedLead,
    listingInterest,
    appointment: completedAppointment || createdAppointment,
    viewedListings,
    recommendation,
    followUpTask,
  }
}

export async function captureShowDayLeadBatch(payload = {}, { actor = null } = {}) {
  const shared = payload.shared && typeof payload.shared === 'object' ? payload.shared : {}
  const visitors = Array.isArray(payload.visitors)
    ? payload.visitors
    : parseShowDayVisitorRows(payload.visitorText || payload.visitor_text || '', shared)

  if (!visitors.length) {
    return {
      ok: false,
      status: 'failed',
      source: SHOW_DAY_SOURCE,
      total: 0,
      processed: 0,
      duplicates: 0,
      failed: 0,
      results: [],
      error: 'Add at least one show-day visitor.',
    }
  }

  const results = []
  for (const visitor of visitors) {
    const rowNumber = visitor?.rowNumber || results.length + 1
    const { rowNumber: _rowNumber, ...visitorPayload } = visitor || {}
    try {
      const result = await captureShowDayLead({
        ...shared,
        ...visitorPayload,
      }, { actor })
      results.push({
        ok: result?.ok === true,
        status: result?.status || 'processed',
        rowNumber,
        leadId: result?.leadId || '',
        contactId: result?.contactId || '',
        sourceReferenceId: result?.sourceReferenceId || '',
        result,
      })
    } catch (error) {
      results.push({
        ok: false,
        status: 'failed',
        rowNumber,
        error: error?.message || 'Show-day visitor capture failed.',
      })
    }
  }

  const failed = results.filter((row) => !row.ok)
  const duplicates = results.filter((row) => row.ok && row.status === 'duplicate')
  const processed = results.filter((row) => row.ok && row.status !== 'duplicate')
  return {
    ok: failed.length === 0,
    status: failed.length ? 'partial' : 'processed',
    source: SHOW_DAY_SOURCE,
    total: results.length,
    processed: processed.length,
    duplicates: duplicates.length,
    failed: failed.length,
    results,
    error: failed[0]?.error || '',
  }
}

export const __showDayLeadCaptureServiceTestUtils = {
  buildAppointmentPayload,
  buildEnquiryPayload,
  buildFollowUpDescription,
  buildShowDayNotes,
  buildShowDaySourceReference,
  normalizeShowDayCapturePayload,
  normalizePhone,
  normalizeTime,
  parseShowDayVisitorRows,
  resolveShowDayAt,
  splitDelimitedRow,
}
