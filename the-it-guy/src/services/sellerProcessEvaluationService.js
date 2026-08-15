import {
  SELLER_BASE_PACK_COMPLETION_ROUTES,
  SELLER_BASE_PACK_KEYS,
  normalizeSellerBasePackKey,
  SELLER_BASE_PACK_REQUIRED_KEYS,
} from '../lib/sellerBasePackContract.js'
import { DEFAULT_SELLER_PROCESS_PROFILE } from './sellerProcessProfileService.js'
import { getSellerProcessDefinition } from './sellerProcessDefinitionService.js'

const DOCUMENT_COMPLETE_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'verified', 'accepted', 'complete', 'completed', 'signed'])
const BLOCKED_APPOINTMENT_STATUSES = new Set(['cancelled', 'canceled', 'declined', 'draft', 'internal_draft'])
const KINGSTONS_BASELINE_SELLER_PACK_KEYS = new Set(SELLER_BASE_PACK_REQUIRED_KEYS)
const KINGSTONS_SELLER_PACK_GENERATED_SECTION_KEYS = new Set(['seller_identity_fica', 'authority_documents'])

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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseJsonRecord(value) {
  if (!value) return {}
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return {}
  }
}

function isValidKingstonsSellerType(value = '') {
  return ['natural', 'juristic'].includes(normalizeKey(value))
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

function leadHasValuationDocumentUploadedEvidence(lead = {}) {
  const payload = parseJsonRecord(lead.rawEnquiryPayload || lead.raw_enquiry_payload)
  const valuationSources = [
    lead.kingstonsFormalValuation,
    lead.kingstons_formal_valuation,
    lead.formalValuation,
    lead.formal_valuation,
    lead.valuationDocument,
    lead.valuation_document,
    payload.kingstonsFormalValuation,
    payload.kingstons_formal_valuation,
    payload.formalValuation,
    payload.formal_valuation,
    payload.valuationDocument,
    payload.valuation_document,
    asRecord(payload.kingstonsSellerPack || payload.kingstons_seller_pack || payload.sellerPack || payload.seller_pack).documents?.valuation_document,
  ].map(asRecord).filter((source) => Object.keys(source).length > 0)

  return valuationSources.some((source) => {
    const document = asRecord(source.document || source.upload || source.file || source)
    const status = normalizeKey(document.status || document.statusLabel || document.status_label || source.status || source.statusLabel || source.status_label)
    return Boolean(
      hasFileEvidence(document) ||
        hasFileEvidence(source) ||
        DOCUMENT_COMPLETE_STATUSES.has(status) ||
        firstPresent(document.uploadedAt, document.uploaded_at, source.uploadedAt, source.uploaded_at)
    )
  })
}

function sellerPackSourcesFromContext(context = {}) {
  const lead = asRecord(context.lead)
  const listing = asRecord(context.listing)
  const leadPayload = parseJsonRecord(lead.rawEnquiryPayload || lead.raw_enquiry_payload)
  const listingFacts = parseJsonRecord(listing.sellerCanonicalFacts || listing.seller_canonical_facts_json)
  return [
    lead.kingstonsSellerPack,
    lead.kingstons_seller_pack,
    lead.sellerPack,
    lead.seller_pack,
    leadPayload.kingstonsSellerPack,
    leadPayload.kingstons_seller_pack,
    leadPayload.sellerPack,
    leadPayload.seller_pack,
    listing.kingstonsSellerPack,
    listing.kingstons_seller_pack,
    listing.sellerPack,
    listing.seller_pack,
    listingFacts.kingstonsSellerPack,
    listingFacts.kingstons_seller_pack,
    listingFacts.sellerPack,
    listingFacts.seller_pack,
  ].map(asRecord).filter((source) => Object.keys(source).length > 0)
}

function hasKingstonsSellerPackLegalPathCapture(context = {}) {
  const sources = sellerPackSourcesFromContext(context)
  return sources.some((pack) => {
    const legalPath = asRecord(pack.legalPath || pack.legal_path)
    return isValidKingstonsSellerType(
      pack.sellerType ||
        pack.seller_type ||
        pack.ficaSellerType ||
        pack.fica_seller_type ||
        legalPath.sellerType ||
        legalPath.seller_type ||
        legalPath.legalPathType ||
        legalPath.legal_path_type,
    )
  })
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

function resolveDocumentMetadata(row = {}) {
  const document = asRecord(row?.document)
  const upload = asRecord(row?.upload)
  return asRecord(
    row?.metadata ||
      row?.meta ||
      row?.documentMetadata ||
      row?.document_metadata ||
      upload.metadata ||
      upload.meta ||
      upload.documentMetadata ||
      upload.document_metadata ||
      document.metadata ||
      document.meta ||
      document.documentMetadata ||
      document.document_metadata,
  )
}

function resolveDocumentCompletionRoute(row = {}) {
  const document = asRecord(row?.document)
  const upload = asRecord(row?.upload)
  const metadata = resolveDocumentMetadata(row)
  return normalizeKey(
    row?.completionRoute ||
      row?.completion_route ||
      upload.completionRoute ||
      upload.completion_route ||
      document.completionRoute ||
      document.completion_route ||
      metadata.completionRoute ||
      metadata.completion_route,
  )
}

function isKingstonsSellerPackFicaDeclarationRow(row = {}) {
  return rowKeys(row).some((key) =>
    normalizeSellerBasePackKey(key) === SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION
  )
}

function resolveFicaDeclarationUploadContext(row = {}) {
  const document = asRecord(row?.document)
  const upload = asRecord(row?.upload)
  const metadata = resolveDocumentMetadata(row)
  return asRecord(
    row?.ficaDeclarationContext ||
      row?.fica_declaration_context ||
      row?.uploadContext ||
      row?.upload_context ||
      upload.ficaDeclarationContext ||
      upload.fica_declaration_context ||
      upload.uploadContext ||
      upload.upload_context ||
      document.ficaDeclarationContext ||
      document.fica_declaration_context ||
      document.uploadContext ||
      document.upload_context ||
      metadata.ficaDeclarationContext ||
      metadata.fica_declaration_context ||
      metadata.uploadContext ||
      metadata.upload_context,
  )
}

function sellerPackFicaDeclarationContextCaptured(row = {}) {
  const context = resolveFicaDeclarationUploadContext(row)
  return Boolean(
    Object.keys(context).length &&
      (
        firstPresent(
          context.sellerType,
          context.seller_type,
          context.legalPathType,
          context.legal_path_type,
          context.contextCapturedAt,
          context.context_captured_at,
          context.capturedAt,
          context.captured_at,
        )
      )
  )
}

function sellerPackFicaDeclarationRequiresPhysicalContext(row = {}) {
  if (!isKingstonsSellerPackFicaDeclarationRow(row)) return false
  const document = asRecord(row?.document)
  const upload = asRecord(row?.upload)
  const metadata = resolveDocumentMetadata(row)
  const completionRoute = resolveDocumentCompletionRoute(row)
  if (completionRoute === SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK) return false
  return Boolean(
    completionRoute === SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD ||
      completionRoute === SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT ||
      row?.physicalUploadContextRequired === true ||
      row?.physical_upload_context_required === true ||
      upload.physicalUploadContextRequired === true ||
      upload.physical_upload_context_required === true ||
      document.physicalUploadContextRequired === true ||
      document.physical_upload_context_required === true ||
      metadata.physicalUploadContextRequired === true ||
      metadata.physical_upload_context_required === true ||
      !completionRoute,
  )
}

function isKingstonsSellerPackReadinessDocument(row = {}) {
  const keys = rowKeys(row)
  const basePackKeys = keys.map(normalizeSellerBasePackKey).filter(Boolean)
  const source = normalizeKey(row?.source || row?.sourceSystem || row?.source_system)
  const lane = normalizeKey(row?.requirementLane || row?.requirement_lane || row?.documentRequirementLane || row?.document_requirement_lane)
  const section = normalizeKey(row?.documentRequirementSection || row?.document_requirement_section || row?.section)
  if (source.includes('kingstons_seller_pack')) return true
  if (lane === 'ownership_driven') return true
  if (KINGSTONS_SELLER_PACK_GENERATED_SECTION_KEYS.has(section)) return true
  return [...keys, ...basePackKeys].some((key) =>
    KINGSTONS_BASELINE_SELLER_PACK_KEYS.has(key) ||
      key.includes('owner_fica') ||
      key.includes('director_fica') ||
      key.includes('trustee_fica') ||
      key.includes('member_fica') ||
      key.includes('spouse_fica') ||
      key.includes('resolution_to_sell') ||
      key.includes('letters_of_authority') ||
      key.includes('trust_deed') ||
      key.includes('spouse_consent') ||
      key.includes('owner_authority_consent')
  )
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
  if (
    gate.key === 'fica_pack_signed' &&
    sellerPackFicaDeclarationRequiresPhysicalContext(document) &&
    !sellerPackFicaDeclarationContextCaptured(document)
  ) {
    return false
  }
  const status = normalizeKey(document?.status || document?.documentStatus || document?.document_status || document?.reviewStatus || document?.review_status)
  return Boolean(statusAccepted(status, gate.acceptedStatuses || []) || DOCUMENT_COMPLETE_STATUSES.has(status) || hasFileEvidence(document))
}

function documentSatisfiesSellerPackReadiness(document = {}) {
  if (document?.required === false || document?.applicable === false) return true
  const isFicaDeclaration = isKingstonsSellerPackFicaDeclarationRow(document)
  if (
    isFicaDeclaration &&
    sellerPackFicaDeclarationRequiresPhysicalContext(document) &&
    !sellerPackFicaDeclarationContextCaptured(document)
  ) {
    return false
  }
  const status = normalizeKey(document?.status || document?.documentStatus || document?.document_status || document?.reviewStatus || document?.review_status)
  if (status === 'not_applicable') return true
  return Boolean(
    DOCUMENT_COMPLETE_STATUSES.has(status) ||
      hasFileEvidence(document) ||
      (isFicaDeclaration && resolveDocumentCompletionRoute(document) === SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK)
  )
}

function evaluateSellerPackReadinessGate(context = {}, gate = {}) {
  const readinessRows = asArray(context.documents)
    .filter(isKingstonsSellerPackReadinessDocument)
    .filter((document) => document?.required !== false && document?.applicable !== false)
  const completedRows = readinessRows.filter(documentSatisfiesSellerPackReadiness)
  const ficaContextMissingRows = readinessRows.filter((document) =>
    sellerPackFicaDeclarationRequiresPhysicalContext(document) &&
      !sellerPackFicaDeclarationContextCaptured(document)
  )
  const presentKeys = new Set(readinessRows.flatMap((row) => rowKeys(row).map((key) => normalizeSellerBasePackKey(key) || key)))
  const baselinePresent = [...KINGSTONS_BASELINE_SELLER_PACK_KEYS].every((key) => presentKeys.has(key))
  const sellerTypeCaptured = hasKingstonsSellerPackLegalPathCapture(context) ||
    readinessRows.some((document) => isValidKingstonsSellerType(document?.sellerType || document?.seller_type || document?.ficaSellerType || document?.fica_seller_type))
  const complete = Boolean(
    sellerTypeCaptured &&
      baselinePresent &&
      readinessRows.length >= KINGSTONS_BASELINE_SELLER_PACK_KEYS.size &&
      completedRows.length === readinessRows.length,
  )

  return {
    key: gate.key,
    source: gate.source,
    satisfied: complete,
    evidenceCount: completedRows.length,
    requiredCount: readinessRows.length,
    missingCount: Math.max(readinessRows.length - completedRows.length, 0) + (sellerTypeCaptured ? 0 : 1),
    contextMissingCount: ficaContextMissingRows.length,
    blockedReasons: [
      ...(ficaContextMissingRows.length ? ['Physical FICA declaration upload is missing seller-context metadata.'] : []),
      ...(sellerTypeCaptured ? [] : ['FICA seller type has not been captured.']),
    ],
  }
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

function leadHasValuationAppointmentScheduledEvidence(lead = {}) {
  const stage = normalizeKey(lead?.stage || lead?.currentStage || lead?.current_stage)
  const status = normalizeKey(lead?.status || lead?.currentStatus || lead?.current_status)
  const nextStep = normalizeKey(lead?.nextStep || lead?.next_step || lead?.nextFollowUp || lead?.next_follow_up)
  const signals = [stage, status, nextStep].filter(Boolean)
  return signals.some((signal) =>
    signal === 'formal_valuation' ||
      signal === 'formal_valuation_completed' ||
      signal === 'formal_valuation_uploaded' ||
      signal === 'valuation_presentation' ||
      signal === 'valuation_presentation_scheduled' ||
      signal === 'valuation_appointment_scheduled' ||
      signal === 'valuation_scheduled' ||
      signal === 'valuation_appointment_booked'
  )
}

function activitySatisfiesValuationAppointmentScheduled(activity = {}) {
  const type = normalizeKey(activity?.activityType || activity?.activity_type || activity?.eventType || activity?.event_type || activity?.type || activity?.title)
  const status = normalizeKey(activity?.status)
  if (['cancelled', 'canceled', 'deleted'].includes(status)) return false
  const signal = [
    type,
    normalizeKey(activity?.activityNote || activity?.activity_note || activity?.note || activity?.description),
    normalizeKey(activity?.outcome),
  ].filter(Boolean).join('_')
  return Boolean(
    signal.includes('valuation_appointment_scheduled') ||
      signal.includes('valuation_appointment_booked') ||
      signal.includes('valuation_scheduled') ||
      signal.includes('valuation_meeting_scheduled') ||
      (signal.includes('valuation') && signal.includes('appointment') && (signal.includes('scheduled') || signal.includes('sent') || signal.includes('booked')))
  )
}

function activitySatisfiesValuationPresented(activity = {}) {
  const type = normalizeKey(activity?.activityType || activity?.activity_type || activity?.eventType || activity?.event_type || activity?.type || activity?.title)
  const status = normalizeKey(activity?.status)
  if (['cancelled', 'canceled', 'deleted'].includes(status)) return false
  const signal = [
    type,
    normalizeKey(activity?.activityNote || activity?.activity_note || activity?.note || activity?.description),
    normalizeKey(activity?.outcome),
  ].filter(Boolean).join('_')
  return Boolean(
    signal.includes('valuation_presented') ||
      signal.includes('valuation_presentation_completed') ||
      signal.includes('presentation_completed') ||
      (signal.includes('valuation') && signal.includes('presented'))
  )
}

function leadHasValuationPresentedEvidence(lead = {}) {
  const stage = normalizeKey(lead?.stage || lead?.currentStage || lead?.current_stage)
  const status = normalizeKey(lead?.status || lead?.currentStatus || lead?.current_status)
  const nextStep = normalizeKey(lead?.nextStep || lead?.next_step || lead?.nextFollowUp || lead?.next_follow_up)
  const signals = [stage, status, nextStep].filter(Boolean)
  return signals.some((signal) =>
    signal === 'valuation_presented' ||
      signal === 'valuation_presentation_completed' ||
      signal === 'valuation_presentation_done' ||
      signal === 'seller_pack' ||
      signal === 'seller_pack_signed' ||
      signal === 'listing_ready' ||
      signal === 'listing_created'
  )
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

function collectListingTermsSources(context = {}) {
  const lead = asRecord(context.lead)
  const listing = asRecord(context.listing)
  const leadPayload = parseJsonRecord(lead.rawEnquiryPayload || lead.raw_enquiry_payload)
  const listingFacts = parseJsonRecord(listing.sellerCanonicalFacts || listing.seller_canonical_facts_json)
  return [
    lead.kingstonsListingTerms,
    lead.kingstons_listing_terms,
    lead.listingTerms,
    lead.listing_terms,
    leadPayload.kingstonsListingTerms,
    leadPayload.kingstons_listing_terms,
    leadPayload.listingTerms,
    leadPayload.listing_terms,
    listing.kingstonsListingTerms,
    listing.kingstons_listing_terms,
    listing.listingTerms,
    listing.listing_terms,
    listingFacts.kingstonsListingTerms,
    listingFacts.listingTerms,
  ].map(asRecord).filter((source) => Object.keys(source).length > 0)
}

function hasCommissionTermsEvidence(context = {}) {
  const sources = collectListingTermsSources(context)
  const listing = asRecord(context.listing)
  return sources.some((terms) => {
    const commission = asRecord(terms.commission || terms.commissionTerms || terms.commission_terms || terms)
    return Boolean(
      terms.commissionConfirmed === true ||
        terms.commission_confirmed === true ||
        commission.confirmed === true ||
        firstPresent(commission.type, commission.commissionType, commission.commission_type, terms.commissionType, terms.commission_type) ||
        Number(commission.percentage || commission.commissionPercentage || commission.commission_percentage || terms.commissionPercentage || terms.commission_percentage || 0) > 0 ||
        Number(commission.amount || commission.commissionAmount || commission.commission_amount || terms.commissionAmount || terms.commission_amount || 0) > 0
    )
  }) || Boolean(
    firstPresent(listing.commissionType, listing.commission_type) ||
      Number(listing.commissionPercentage || listing.commission_percentage || listing.commissionAmount || listing.commission_amount || 0) > 0 ||
      Object.keys(asRecord(listing.commission || listing.commissionTerms || listing.commission_terms)).length > 0
  )
}

function hasTransferAttorneyEvidence(context = {}) {
  const sources = collectListingTermsSources(context)
  const listing = asRecord(context.listing)
  const rolePlayers = asRecord(listing.rolePlayers || listing.role_players)
  return sources.some((terms) => {
    const attorney = asRecord(
      terms.transferAttorney ||
        terms.transfer_attorney ||
        terms.attorney ||
        terms.nominatedAttorney ||
        terms.nominated_attorney,
    )
    return Boolean(
      terms.transferAttorneyNominated === true ||
        terms.transfer_attorney_nominated === true ||
        attorney.nominated === true ||
        firstPresent(
          attorney.id,
          attorney.preferredPartnerId,
          attorney.preferred_partner_id,
          attorney.companyName,
          attorney.company_name,
          attorney.email,
          attorney.emailAddress,
          attorney.email_address,
        )
    )
  }) || Boolean(
    firstPresent(
      listing.transferAttorneyName,
      listing.transfer_attorney_name,
      listing.attorneyName,
      listing.attorney_name,
      rolePlayers.transferAttorney?.companyName,
      rolePlayers.transfer_attorney?.company_name,
    )
  )
}

function evaluateGate(gate = {}, context = {}) {
  if (gate.source === 'activity' && gate.key === 'seller_contacted') {
    const satisfied =
      leadHasSellerContactEvidence(context.lead) ||
      asArray(context.activities).some(activitySatisfiesSellerContact) ||
      asArray(context.appointments).some((appointment) => appointmentImpliesSellerContact(appointment, gate))
    return { key: gate.key, source: gate.source, satisfied, evidenceCount: satisfied ? 1 : 0 }
  }

  if (gate.source === 'activity' && gate.key === 'valuation_presented') {
    const completedPresentationAppointments = asArray(context.appointments).filter((appointment) =>
      appointmentSatisfiesGate(appointment, gate)
    )
    const activityMatch = asArray(context.activities).some(activitySatisfiesValuationPresented)
    const leadFallback = leadHasValuationPresentedEvidence(context.lead)
    const evidenceCount = completedPresentationAppointments.length + (activityMatch ? 1 : 0) + (leadFallback ? 1 : 0)
    return {
      key: gate.key,
      source: gate.source,
      satisfied: evidenceCount > 0,
      evidenceCount,
    }
  }

  if (gate.source === 'appointment') {
    const matches = asArray(context.appointments).filter((appointment) => appointmentSatisfiesGate(appointment, gate))
    const leadFallback = gate.key === 'valuation_appointment_scheduled' && leadHasValuationAppointmentScheduledEvidence(context.lead)
    const activityFallback = gate.key === 'valuation_appointment_scheduled' && asArray(context.activities).some(activitySatisfiesValuationAppointmentScheduled)
    return {
      key: gate.key,
      source: gate.source,
      satisfied: matches.length > 0 || leadFallback || activityFallback,
      evidenceCount: matches.length + (leadFallback ? 1 : 0) + (activityFallback ? 1 : 0),
    }
  }

  if (gate.source === 'document') {
    if (gate.requiresAllSellerPackDocuments === true) {
      return evaluateSellerPackReadinessGate(context, gate)
    }
    const documentMatches = asArray(context.documents).filter((document) => documentSatisfiesGate(document, gate))
    const packetMatch = gate.key === 'mandate_signed' && mandatePacketSatisfiesSignedEvidence(context)
    const leadDocumentFallback = gate.key === 'valuation_document_uploaded' && leadHasValuationDocumentUploadedEvidence(context.lead)
    return {
      key: gate.key,
      source: gate.source,
      satisfied: documentMatches.length > 0 || packetMatch || leadDocumentFallback,
      evidenceCount: documentMatches.length + (packetMatch ? 1 : 0) + (leadDocumentFallback ? 1 : 0),
    }
  }

  if (gate.source === 'listing') {
    const satisfied = listingSatisfiesReadyEvidence(context.listing || {}, gate)
    return { key: gate.key, source: gate.source, satisfied, evidenceCount: satisfied ? 1 : 0 }
  }

  if (gate.source === 'listing_terms') {
    const satisfied = gate.key === 'commission_terms_confirmed'
      ? hasCommissionTermsEvidence(context)
      : gate.key === 'transfer_attorney_nominated'
        ? hasTransferAttorneyEvidence(context)
        : false
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
