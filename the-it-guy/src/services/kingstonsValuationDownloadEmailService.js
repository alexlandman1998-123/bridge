import {
  DOCUMENTS_BUCKET_CANDIDATES,
  getEdgeFunctionInvokeError,
  invokeEdgeFunction,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function normalizeAppointmentKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeLower(value))
}

export function isKingstonsValuationPresentationAppointment(appointment = {}) {
  const appointmentType = normalizeAppointmentKey(appointment.appointmentType || appointment.appointment_type)
  const workflowStage = normalizeAppointmentKey(appointment.linkedWorkflowStage || appointment.linked_workflow_stage)
  const title = normalizeAppointmentKey(appointment.title || appointment.appointmentTitle || appointment.appointment_title)
  return appointmentType === 'valuation_presentation' ||
    workflowStage === 'valuation_presentation' ||
    title.includes('valuation_presentation')
}

export function resolveKingstonsValuationRecipient({
  recipientEmail = '',
  recipientName = '',
  participants = [],
  lead = {},
} = {}) {
  const explicitEmail = normalizeLower(recipientEmail)
  const sellerParticipant = (Array.isArray(participants) ? participants : []).find((participant) => (
    normalizeText(participant?.email) &&
    normalizeAppointmentKey(participant?.participantRole || participant?.participant_role || participant?.role).includes('seller')
  ))
  const firstParticipant = (Array.isArray(participants) ? participants : []).find((participant) => normalizeText(participant?.email))
  const email = firstText(
    explicitEmail,
    sellerParticipant?.email,
    firstParticipant?.email,
    lead?.sellerEmail,
    lead?.seller_email,
    lead?.email,
  ).toLowerCase()
  const name = firstText(
    recipientName,
    sellerParticipant?.name,
    firstParticipant?.name,
    lead?.name,
    email,
  )
  return { email, name }
}

export async function resolveKingstonsValuationDirectDownloadUrl(documentRow = {}, {
  storageClient = supabase?.storage,
  expiresInSeconds = 60 * 60 * 24 * 14,
} = {}) {
  const storagePath = normalizeText(documentRow.storagePath || documentRow.storage_path)
  const existingUrl = firstText(documentRow.downloadUrl, documentRow.download_url, documentRow.fileUrl, documentRow.file_url, documentRow.url)
  if (!storagePath) return existingUrl
  if (!storageClient) throw new Error('Supabase storage is required to create a valuation download link.')
  const bucketName = normalizeText(documentRow.storageBucket || documentRow.storage_bucket) || DOCUMENTS_BUCKET_CANDIDATES[0]
  const downloadName = firstText(
    documentRow.uploadedFileName,
    documentRow.uploaded_file_name,
    documentRow.fileName,
    documentRow.file_name,
    'kingstons-property-valuation.pdf',
  )
  const result = await storageClient
    .from(bucketName)
    .createSignedUrl(storagePath, expiresInSeconds, { download: downloadName })
  if (result?.error) throw result.error
  return normalizeText(result?.data?.signedUrl)
}

export function buildKingstonsValuationDownloadEmailPayload({
  to = '',
  recipientName = '',
  valuationDownloadUrl = '',
  valuationFileName = '',
  propertyLabel = '',
  agent = {},
  appointment = {},
  organisationId = '',
  organisationName = '',
  branding = {},
  leadId = '',
} = {}) {
  return {
    type: 'kingstons_valuation_download',
    to: normalizeLower(to),
    recipientName: normalizeText(recipientName),
    organisationId: normalizeText(organisationId || appointment.organisationId || appointment.organisation_id),
    organisationName: normalizeText(organisationName || branding.organisationName || appointment.organisationName || appointment.organisation_name || 'Kingstons Real Estate'),
    organisationLogoUrl: normalizeText(branding.organisationLogoUrl || branding.logoUrl || appointment.organisationLogoUrl || appointment.organisation_logo_url),
    organisationLogoLightUrl: normalizeText(branding.organisationLogoLightUrl || branding.logoLightUrl || appointment.organisationLogoLightUrl || appointment.organisation_logo_light_url),
    organisationLogoDarkUrl: normalizeText(branding.organisationLogoDarkUrl || branding.logoDarkUrl || appointment.organisationLogoDarkUrl || appointment.organisation_logo_dark_url),
    organisationBrandPrimaryColor: normalizeText(branding.organisationBrandPrimaryColor || branding.primaryColor || appointment.organisationBrandPrimaryColor || appointment.organisation_brand_primary_color),
    organisationBrandSecondaryColor: normalizeText(branding.organisationBrandSecondaryColor || branding.secondaryColor || appointment.organisationBrandSecondaryColor || appointment.organisation_brand_secondary_color),
    supportEmail: normalizeLower(branding.supportEmail || appointment.supportEmail || appointment.support_email),
    supportPhone: normalizeText(branding.supportPhone || appointment.supportPhone || appointment.support_phone),
    propertyLabel: normalizeText(propertyLabel || appointment.location || appointment.listingLabel || appointment.listing_label),
    agentName: normalizeText(agent.name || agent.fullName || appointment.agentName || appointment.assignedAgentName || appointment.assigned_agent_name),
    agentEmail: normalizeLower(agent.email || appointment.agentEmail || appointment.assignedAgentEmail || appointment.assigned_agent_email),
    agentRole: normalizeText(agent.role || agent.jobTitle || 'Agent'),
    valuationDownloadUrl: normalizeText(valuationDownloadUrl),
    valuationFileName: normalizeText(valuationFileName),
    leadId: normalizeText(leadId || appointment.leadId || appointment.lead_id),
    appointmentId: normalizeText(appointment.appointmentId || appointment.appointment_id || appointment.id),
    idempotencyKey: [
      'kingstons-valuation-download',
      normalizeText(appointment.appointmentId || appointment.appointment_id || appointment.id),
      normalizeLower(to),
    ].filter(Boolean).join(':'),
  }
}

export async function sendKingstonsValuationDownloadEmailForPresentation({
  appointment = {},
  documentRow = {},
  participants = [],
  lead = {},
  recipientEmail = '',
  recipientName = '',
  propertyLabel = '',
  agent = {},
  organisationId = '',
  organisationName = '',
  branding = {},
  storageClient = isSupabaseConfigured ? supabase?.storage : null,
  emailInvoker = invokeEdgeFunction,
} = {}) {
  if (!isKingstonsValuationPresentationAppointment(appointment)) {
    return { status: 'skipped', reason: 'not_valuation_presentation' }
  }
  const recipient = resolveKingstonsValuationRecipient({ recipientEmail, recipientName, participants, lead })
  if (!isValidEmail(recipient.email)) {
    return { status: 'skipped', reason: 'missing_seller_email' }
  }
  const valuationDownloadUrl = await resolveKingstonsValuationDirectDownloadUrl(documentRow, { storageClient })
  if (!valuationDownloadUrl) {
    return { status: 'skipped', reason: 'missing_valuation_download_url' }
  }
  const valuationFileName = firstText(
    documentRow.uploadedFileName,
    documentRow.uploaded_file_name,
    documentRow.fileName,
    documentRow.file_name,
    'Kingstons property valuation.pdf',
  )
  const payload = buildKingstonsValuationDownloadEmailPayload({
    to: recipient.email,
    recipientName: recipient.name,
    valuationDownloadUrl,
    valuationFileName,
    propertyLabel,
    agent,
    appointment,
    organisationId,
    organisationName,
    branding,
    leadId: lead?.leadId || lead?.lead_id,
  })
  const response = await emailInvoker('send-email', { body: payload })
  const invokeError = getEdgeFunctionInvokeError(response)
  const data = response?.data || null
  if (invokeError || data?.ok === false) {
    return {
      status: 'failed',
      reason: invokeError?.message || data?.error || 'valuation_download_email_failed',
      details: invokeError?.details ?? data?.details ?? null,
    }
  }
  return {
    status: 'sent',
    reason: '',
    payload,
    response: data,
  }
}
