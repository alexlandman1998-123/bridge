import { DEFAULT_SELLER_PROCESS_PROFILE } from './sellerProcessProfileService.js'
import { getSellerProcessDefinition } from './sellerProcessDefinitionService.js'

const DOCUMENT_COMPLETE_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'verified', 'accepted', 'complete', 'completed', 'signed'])
const BLOCKED_APPOINTMENT_STATUSES = new Set(['cancelled', 'canceled', 'declined', 'draft', 'internal_draft'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstPresent(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function hasFileEvidence(row = {}) {
  return Boolean(firstPresent(
    row?.url,
    row?.fileUrl,
    row?.file_url,
    row?.signedUrl,
    row?.signed_url,
    row?.storagePath,
    row?.storage_path,
    row?.filePath,
    row?.file_path,
    row?.path,
    row?.finalSignedFilePath,
    row?.final_signed_file_path,
  ))
}

function rowKeys(row = {}) {
  return [
    row?.key,
    row?.documentKey,
    row?.document_key,
    row?.requirementKey,
    row?.requirement_key,
    row?.documentType,
    row?.document_type,
    row?.type,
    row?.category,
    row?.title,
    row?.name,
  ].map(normalizeKey).filter(Boolean)
}

function typeMatches(row = {}, expectedTypes = []) {
  const expected = expectedTypes.map(normalizeKey).filter(Boolean)
  if (!expected.length) return false
  const keys = rowKeys(row)
  return expected.some((type) => keys.some((key) => key === type || key.includes(type) || type.includes(key)))
}

function statusAccepted(status = '', acceptedStatuses = []) {
  const normalized = normalizeKey(status)
  const accepted = acceptedStatuses.map(normalizeKey).filter(Boolean)
  if (!accepted.length) return true
  return accepted.includes(normalized)
}

function documentSatisfiesGate(document = {}, gate = {}) {
  if (!typeMatches(document, gate.documentTypes || [])) return false
  const status = normalizeKey(document?.status || document?.documentStatus || document?.document_status || document?.reviewStatus || document?.review_status)
  return Boolean(statusAccepted(status, gate.acceptedStatuses || []) || DOCUMENT_COMPLETE_STATUSES.has(status) || hasFileEvidence(document))
}

function appointmentTypeMatches(appointment = {}, appointmentType = '', appointmentTypeAliases = []) {
  const expected = normalizeKey(appointmentType)
  const acceptedTypes = [expected, ...asArray(appointmentTypeAliases).map(normalizeKey)].filter(Boolean)
  if (!acceptedTypes.length) return false
  const keys = [
    appointment?.appointmentType,
    appointment?.appointment_type,
    appointment?.type,
    appointment?.title,
    appointment?.linkedWorkflowStage,
    appointment?.linked_workflow_stage,
  ].map(normalizeKey).filter(Boolean)
  if (expected === 'seller_valuation') {
    const savedAsSellerConsultation = keys.includes('seller_consultation')
    const valuationSignal = keys.some((key) => key.includes('valuation'))
    if (savedAsSellerConsultation && valuationSignal) return true
  }
  return acceptedTypes.some((type) => keys.some((key) => key === type || key.includes(type)))
}

function appointmentSatisfiesGate(appointment = {}, gate = {}) {
  if (!appointmentTypeMatches(appointment, gate.appointmentType, gate.appointmentTypeAliases)) return false
  const status = normalizeKey(appointment?.status || appointment?.appointmentStatus || appointment?.appointment_status)
  if (BLOCKED_APPOINTMENT_STATUSES.has(status)) return false
  return statusAccepted(status || 'scheduled', gate.acceptedStatuses || [])
}

function activitySatisfiesSellerContact(activity = {}) {
  const type = normalizeKey(activity?.activityType || activity?.activity_type || activity?.eventType || activity?.event_type || activity?.type || activity?.title)
  const status = normalizeKey(activity?.status)
  if (['cancelled', 'canceled', 'deleted'].includes(status)) return false
  return Boolean(type.includes('contact') || type.includes('call') || type.includes('email') || type.includes('whatsapp'))
}

function leadHasSellerContactEvidence(lead = {}) {
  const stage = normalizeKey(lead?.stage)
  const status = normalizeKey(lead?.status)
  return Boolean(
    firstPresent(lead?.contactedAt, lead?.contacted_at, lead?.firstContactedAt, lead?.first_contacted_at) ||
      stage.includes('contacted') ||
      status.includes('contacted')
  )
}

function appointmentImpliesSellerContact(appointment = {}, gate = {}) {
  if (!asArray(gate.impliedByAppointmentTypes).length) return false
  return appointmentTypeMatches(appointment, '', gate.impliedByAppointmentTypes) &&
    !BLOCKED_APPOINTMENT_STATUSES.has(normalizeKey(appointment?.status || appointment?.appointmentStatus || appointment?.appointment_status))
}

function mandatePacketSatisfiesSignedEvidence({ mandatePacket = null, mandatePacketStatus = null } = {}) {
  const packet = mandatePacketStatus?.packet || mandatePacket || {}
  const version = mandatePacketStatus?.version || packet?.version || {}
  const signingSummary = mandatePacketStatus?.signingSummary || packet?.signingSummary || {}
  const packetStatus = normalizeKey(packet?.status || packet?.state)
  return Boolean(
    ['completed', 'complete', 'signed'].includes(packetStatus) ||
      signingSummary?.allSignersSigned === true ||
      hasFileEvidence(version) ||
      hasFileEvidence(packet)
  )
}

function listingSatisfiesReadyEvidence(listing = {}, gate = {}) {
  const id = firstPresent(listing?.id, listing?.listingId, listing?.listing_id)
  if (!id) return false
  const status = normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.status || 'created')
  return statusAccepted(status || 'created', gate.acceptedStatuses || [])
}

function evaluateGate(gate = {}, context = {}) {
  if (gate.source === 'activity' && gate.key === 'seller_contacted') {
    const satisfied =
      leadHasSellerContactEvidence(context.lead) ||
      asArray(context.activities).some(activitySatisfiesSellerContact) ||
      asArray(context.appointments).some((appointment) => appointmentImpliesSellerContact(appointment, gate))
    return { key: gate.key, source: gate.source, satisfied, evidenceCount: satisfied ? 1 : 0 }
  }

  if (gate.source === 'appointment') {
    const matches = asArray(context.appointments).filter((appointment) => appointmentSatisfiesGate(appointment, gate))
    return { key: gate.key, source: gate.source, satisfied: matches.length > 0, evidenceCount: matches.length }
  }

  if (gate.source === 'document') {
    const documentMatches = asArray(context.documents).filter((document) => documentSatisfiesGate(document, gate))
    const packetMatch = gate.key === 'mandate_signed' && mandatePacketSatisfiesSignedEvidence(context)
    return {
      key: gate.key,
      source: gate.source,
      satisfied: documentMatches.length > 0 || packetMatch,
      evidenceCount: documentMatches.length + (packetMatch ? 1 : 0),
    }
  }

  if (gate.source === 'listing') {
    const satisfied = listingSatisfiesReadyEvidence(context.listing || {}, gate)
    return { key: gate.key, source: gate.source, satisfied, evidenceCount: satisfied ? 1 : 0 }
  }

  return { key: gate.key, source: gate.source || 'unknown', satisfied: false, evidenceCount: 0 }
}

function buildEvidenceMap(definition = {}, context = {}) {
  return Object.fromEntries(
    asArray(definition.evidenceGates).map((gate) => [gate.key, evaluateGate(gate, context)]),
  )
}

function evaluateStages(definition = {}, evidence = {}) {
  return asArray(definition.stages).map((stage) => {
    const requiredEvidenceKeys = asArray(stage.requiredEvidenceKeys)
    const missingEvidenceKeys = requiredEvidenceKeys.filter((key) => evidence[key]?.satisfied !== true)
    return {
      ...stage,
      requiredEvidenceKeys,
      missingEvidenceKeys,
      complete: requiredEvidenceKeys.length === 0 ? definition.profile === DEFAULT_SELLER_PROCESS_PROFILE : missingEvidenceKeys.length === 0,
    }
  })
}

function buildBlockers(definition = {}, evidence = {}) {
  return asArray(definition.evidenceGates)
    .filter((gate) => evidence[gate.key]?.satisfied !== true)
    .map((gate) => ({
      id: `missing_${gate.key}`,
      evidenceKey: gate.key,
      source: gate.source,
      stageKey: gate.requiredForStage,
      severity: 'blocked',
    }))
}

function buildPartnerReadiness(definition = {}, stageEvaluations = []) {
  const stageMap = new Map(stageEvaluations.map((stage) => [stage.key, stage]))
  return asArray(definition.partnerHandoffs).map((handoff) => ({
    ...handoff,
    ready: stageMap.get(handoff.readyAfterStage)?.complete === true,
  }))
}

export function evaluateSellerProcess(source = {}) {
  const definition = getSellerProcessDefinition(source)
  const context = {
    lead: source.lead || {},
    listing: source.listing || {},
    appointments: source.appointments || [],
    documents: source.documents || [],
    activities: source.activities || source.activityTimeline || source.activity_timeline || [],
    mandatePacket: source.mandatePacket || null,
    mandatePacketStatus: source.mandatePacketStatus || null,
  }
  const evidence = buildEvidenceMap(definition, context)
  const stages = evaluateStages(definition, evidence)
  const currentStage = stages.find((stage) => !stage.complete) || stages[stages.length - 1] || null
  const completedStageKeys = stages.filter((stage) => stage.complete).map((stage) => stage.key)
  const blockers = buildBlockers(definition, evidence)
  const partnerReadiness = buildPartnerReadiness(definition, stages)
  const canApplyToRuntime = Boolean(definition.runtimeEnabled && definition.profile !== DEFAULT_SELLER_PROCESS_PROFILE)

  return Object.freeze({
    profile: definition.profile,
    label: definition.label,
    phase: definition.phase,
    runtimeEnabled: definition.runtimeEnabled,
    canApplyToRuntime,
    resolution: definition.resolution,
    currentStage,
    stages,
    completedStageKeys,
    evidence,
    blockers,
    partnerReadiness,
    summary: {
      completedStageCount: completedStageKeys.length,
      totalStageCount: stages.length,
      blockerCount: blockers.length,
      percent: stages.length ? Math.round((completedStageKeys.length / stages.length) * 100) : 0,
    },
  })
}
