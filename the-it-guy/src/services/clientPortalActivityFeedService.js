function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalize(value = '') {
  return toText(value).toLowerCase()
}

function normalizeVisibility(value = '', fallback = 'internal_only') {
  const normalized = normalize(value)
  if (['client_visible', 'internal_only', 'shared_role_players'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'client' || normalized === 'client_safe' || normalized === 'buyer_visible') return 'client_visible'
  if (normalized === 'internal' || normalized === 'internal_note') return 'internal_only'
  if (normalized === 'professional_shared' || normalized === 'shared_professional_update' || normalized === 'shared') return 'shared_role_players'
  return fallback
}

function resolveEventVisibility(source = {}, metadata = {}) {
  const visibilityFlags = [
    source?.isClientVisible,
    source?.is_client_visible,
    source?.clientVisible,
    source?.client_visible,
    metadata?.isClientVisible,
    metadata?.is_client_visible,
    metadata?.clientVisible,
    metadata?.client_visible,
  ].filter((value) => value !== undefined && value !== null && value !== '')

  if (visibilityFlags.some((value) => value === false || normalize(value) === 'false')) {
    return 'internal_only'
  }
  if (visibilityFlags.some((value) => value === true || normalize(value) === 'true')) {
    return 'client_visible'
  }

  return normalizeVisibility(
    source?.visibility ||
      source?.visibility_scope ||
      source?.event_visibility ||
      metadata?.visibility ||
      metadata?.visibility_scope ||
      metadata?.event_visibility,
    metadata?.fallbackVisibility || 'internal_only',
  )
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(value || '')
  if (Number.isNaN(parsed)) return new Date().toISOString()
  return new Date(parsed).toISOString()
}

function normalizeActorRole(value = '') {
  const normalized = normalize(value)
  if (normalized.includes('attorney') || normalized.includes('conveyancer')) return 'Attorney'
  if (normalized.includes('bond')) return 'Bond Originator'
  if (normalized.includes('agent') || normalized.includes('sales')) return 'Agent'
  if (normalized.includes('developer')) return 'Developer'
  if (normalized.includes('buyer')) return 'Buyer'
  if (normalized.includes('seller')) return 'Seller'
  if (normalized.includes('system') || normalized.includes('bridge')) return 'System'
  return 'Transaction Team'
}

function getTitleForType(type = '', metadata = {}) {
  const mapping = {
    onboarding_sent: 'Onboarding was sent',
    onboarding_completed: 'Onboarding completed',
    document_requested: 'Document requested',
    additional_document_requested: 'Additional document requested',
    document_uploaded: 'Document uploaded',
    document_rejected: 'Document needs to be re-uploaded',
    document_approved: 'Document approved',
    document_reminder_due: 'Document due soon',
    document_reminder_overdue: 'Document overdue',
    bond_application_required: 'Bond application required',
    bond_application_submitted: 'Bond application submitted',
    bond_application_attention_required: 'Bond application needs attention',
    mandate_generated: 'Mandate prepared',
    mandate_sent: 'Mandate sent for signature',
    mandate_signed: 'Mandate signed',
    otp_ready: 'OTP ready for signature',
    otp_signed: 'OTP signed',
    finance_submitted: 'Finance submitted',
    finance_updated: 'Finance update received',
    finance_approved: 'Finance approved',
    attorney_assigned: 'Attorney assigned',
    bond_originator_assigned: 'Bond originator assigned',
    buyer_bond_originator_request_resolved: 'Bond originator request updated',
    roleplayer_intro_sent: 'Transaction team introduced',
    guarantees_received: 'Guarantees received',
    lodgement_submitted: 'Lodgement submitted',
    registration_completed: 'Registration completed',
    appointment_scheduled: 'Appointment scheduled',
    appointment_reschedule_requested: 'Appointment reschedule requested',
    appointment_reschedule_proposed: 'New appointment time proposed',
    appointment_reschedule_rejected: 'Appointment reschedule rejected',
    appointment_confirmed: 'Appointment confirmed',
    appointment_completed: 'Appointment completed',
    appointment_rescheduled: 'Appointment rescheduled',
    appointment_cancelled: 'Appointment cancelled',
    appointment_reminder_due: 'Appointment reminder',
    appointment_documents_required: 'Documents required before appointment',
    additional_request_completed: 'Additional request completed',
    transaction_stage_changed: 'Transaction stage changed',
    note_shared_with_client: 'Update from your team',
    attorneylaneclientvisibleupdatepublished: 'Legal update',
    attorneydocumentrejected: 'Document needs to be re-uploaded',
    attorneydocumentapproved: 'Document approved',
    attorneydocumentcompleted: 'Document completed',
  }
  return mapping[type] || toText(metadata?.title, 'Transaction updated')
}

function getDescriptionForType(type = '', metadata = {}) {
  const stageTo = toText(metadata?.stageTo || metadata?.stage_to)
  if (type === 'transaction_stage_changed' && stageTo) {
    return `Your transaction moved to ${stageTo}.`
  }

  const defaults = {
    onboarding_sent: 'Your onboarding process is ready to begin.',
    onboarding_completed: 'Your onboarding details were received successfully.',
    document_requested: 'A required document is needed to progress your transaction.',
    additional_document_requested: 'Your transaction team requested an additional supporting document.',
    document_uploaded: 'A document was uploaded and is now available for review.',
    document_rejected: 'A document was rejected and needs a corrected upload.',
    document_approved: 'A document was reviewed and approved.',
    document_reminder_due: 'A required document is due soon. Upload it to avoid delaying the next step.',
    document_reminder_overdue: 'A required document is overdue and may delay your transaction.',
    bond_application_required: 'Your bond application must be completed before it can be submitted to banks.',
    bond_application_submitted: 'Your bond application has been submitted for finance review.',
    bond_application_attention_required: 'Your bond application needs attention before finance can progress cleanly.',
    mandate_generated: 'Your mandate draft was generated.',
    mandate_sent: 'Your mandate is ready for review and signature.',
    mandate_signed: 'Your mandate has been signed and recorded.',
    otp_ready: 'Your Offer to Purchase is ready for signature.',
    otp_signed: 'Your Offer to Purchase has been signed.',
    finance_submitted: 'Finance documents were submitted for review.',
    finance_updated: 'Finance progress was updated.',
    finance_approved: 'Finance approval has been received.',
    attorney_assigned: 'An attorney has been assigned to your transaction.',
    bond_originator_assigned: 'A bond originator has been assigned to your transaction.',
    buyer_bond_originator_request_resolved: 'Your buyer-appointed bond originator request has been reviewed.',
    roleplayer_intro_sent: 'Your transaction team details were shared with you by email.',
    guarantees_received: 'Guarantee requirements have been received.',
    lodgement_submitted: 'Transfer documents were submitted to the Deeds Office.',
    registration_completed: 'Registration has been completed.',
    appointment_scheduled: 'A transaction appointment has been scheduled.',
    appointment_reschedule_requested: 'A request to reschedule your appointment has been submitted.',
    appointment_reschedule_proposed: 'A new appointment time has been proposed for your review.',
    appointment_reschedule_rejected: 'A requested appointment reschedule could not be accommodated.',
    appointment_confirmed: 'Your appointment has been confirmed.',
    appointment_completed: 'Your appointment was completed.',
    appointment_rescheduled: 'Your appointment has been rescheduled.',
    appointment_cancelled: 'Your appointment was cancelled.',
    appointment_reminder_due: 'You have an upcoming appointment.',
    appointment_documents_required: 'Please upload your required documents before the appointment.',
    additional_request_completed: 'An additional request was completed.',
    transaction_stage_changed: 'Your transaction progressed to a new stage.',
    note_shared_with_client: 'Your team shared a progress update.',
    attorneylaneclientvisibleupdatepublished: 'Your legal team shared a progress update.',
    attorneydocumentrejected: 'A document was rejected and needs a corrected upload.',
    attorneydocumentapproved: 'A document was reviewed and approved.',
    attorneydocumentcompleted: 'A document requirement was completed.',
  }
  return toText(metadata?.description, defaults[type] || 'Your transaction was updated.')
}

function getActionForEvent(type = '', metadata = {}) {
  if (type === 'document_rejected') {
    return { label: 'Upload New Version', route: 'documents' }
  }
  if (['additional_document_requested', 'document_reminder_due', 'document_reminder_overdue'].includes(type)) {
    return { label: 'Upload Document', route: 'documents' }
  }
  if (type === 'bond_application_required' || type === 'bond_application_attention_required') {
    return { label: metadata?.actionLabel || 'Open Bond Application', route: metadata?.actionRoute || 'bond_application' }
  }
  if (type === 'otp_ready') {
    return { label: 'Sign OTP', route: 'documents' }
  }
  if (type === 'mandate_sent') {
    return { label: 'Review & Sign Mandate', route: 'documents' }
  }
  if (type === 'onboarding_sent') {
    return { label: 'Complete Onboarding', route: 'details' }
  }
  if (type === 'document_requested') {
    return { label: 'Open Documents', route: 'documents' }
  }
  if (['appointment_scheduled', 'appointment_reschedule_requested', 'appointment_reschedule_proposed', 'appointment_reschedule_rejected', 'appointment_confirmed', 'appointment_rescheduled', 'appointment_cancelled', 'appointment_completed', 'appointment_reminder_due', 'appointment_documents_required'].includes(type)) {
    return { label: 'View Appointment', route: 'overview' }
  }
  if (type === 'roleplayer_intro_sent') {
    return { label: 'View Team', route: 'team' }
  }
  return metadata?.actionLabel && metadata?.actionRoute
    ? { label: metadata.actionLabel, route: metadata.actionRoute }
    : null
}

export function getActivityFeedDisplayType(event = {}) {
  const type = normalize(event?.type)
  if (['document_rejected', 'additional_document_requested', 'document_requested', 'document_reminder_due', 'document_reminder_overdue', 'bond_application_required', 'bond_application_attention_required', 'otp_ready', 'mandate_sent', 'appointment_documents_required'].includes(type)) {
    return 'action_required'
  }
  if (['document_uploaded', 'finance_submitted', 'finance_updated', 'bond_application_submitted', 'lodgement_submitted', 'transaction_stage_changed', 'appointment_scheduled', 'appointment_reschedule_requested', 'appointment_reschedule_proposed', 'appointment_confirmed', 'appointment_rescheduled', 'appointment_reminder_due', 'roleplayer_intro_sent', 'buyer_bond_originator_request_resolved'].includes(type)) {
    return 'progress'
  }
  if (['document_approved', 'finance_approved', 'registration_completed', 'mandate_signed', 'otp_signed', 'appointment_completed'].includes(type)) {
    return 'milestone'
  }
  return 'update'
}

function getActivityTopic(type = '', metadata = {}) {
  const normalizedType = normalize(type)
  const source = `${normalizedType} ${metadata?.category || ''} ${metadata?.topic || ''}`.toLowerCase()
  if (/bond|finance|fund|bank|loan/.test(source)) return 'finance'
  if (/document|fica|upload|reupload/.test(source)) return 'documents'
  if (/otp|offer|mandate|signature/.test(source)) return 'signature'
  if (/attorney|legal|conveyancer|lodgement|registration|guarantee|transfer/.test(source)) return 'legal'
  if (/appointment|viewing|handover/.test(source)) return 'appointment'
  if (/roleplayer|agent|developer|team/.test(source)) return 'team'
  if (/onboarding/.test(source)) return 'onboarding'
  return 'general'
}

function getActivityStatusLabel({ type = '', displayType = '', dueStatus = '' } = {}) {
  const normalizedType = normalize(type)
  if (dueStatus === 'overdue' || normalizedType === 'document_reminder_overdue') return 'Overdue'
  if (dueStatus === 'due_soon' || normalizedType === 'document_reminder_due') return 'Due soon'
  if (displayType === 'action_required') return 'Action needed'
  if (displayType === 'milestone') return 'Milestone'
  if (displayType === 'progress') return 'In progress'
  return 'Update'
}

function normalizeDocumentStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (normalized === 'reupload_required' || normalized === 'needs_reupload' || normalized === 'needs_re_upload') return 'rejected'
  if (normalized === 'pending_review' || normalized === 'in_review' || normalized === 'awaiting_review') return 'under_review'
  if (normalized === 'not_uploaded' || normalized === 'outstanding' || normalized === 'missing') return 'required'
  if (normalized === 'accepted' || normalized === 'verified') return 'approved'
  if (['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable', 'cancelled'].includes(normalized)) {
    return normalized
  }
  return normalized || 'required'
}

function normalizeDueDate(value = '') {
  const parsed = Date.parse(value || '')
  if (Number.isNaN(parsed)) return ''
  return new Date(parsed).toISOString()
}

function getDueStatus(value = '') {
  const dueDate = normalizeDueDate(value)
  if (!dueDate) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 7) return 'due_soon'
  return ''
}

function isAttentionActivity(type = '') {
  return [
    'document_rejected',
    'additional_document_requested',
    'document_requested',
    'document_reminder_due',
    'document_reminder_overdue',
    'bond_application_required',
    'bond_application_attention_required',
    'otp_ready',
    'mandate_sent',
    'appointment_documents_required',
  ].includes(normalize(type))
}

export function normalizeClientActivityEvent(event = {}) {
  const normalizedType = normalize(event?.type || event?.activity_type || event?.event_type || 'note_shared_with_client')
  const metadata = event?.metadata || event?.event_data || event
  const action = getActionForEvent(normalizedType, metadata)
  const visibility = resolveEventVisibility(event, metadata)
  const actorRoleRaw =
    event?.actorRole ||
    event?.actor_role ||
    event?.authorRole ||
    event?.authorRoleLabel ||
    event?.requested_by_role ||
    ''

  const displayType = getActivityFeedDisplayType({ type: normalizedType })
  const dueDate = normalizeDueDate(event?.dueDate || event?.due_date || metadata?.dueDate || metadata?.due_date)
  const dueStatus = getDueStatus(dueDate)
  const topic = getActivityTopic(normalizedType, metadata)

  return {
    id: toText(event?.id || `${normalizedType}_${Math.random().toString(36).slice(2, 9)}`),
    type: normalizedType,
    title: getTitleForType(normalizedType, metadata),
    description: getDescriptionForType(normalizedType, metadata),
    timestamp: normalizeTimestamp(event?.timestamp || event?.createdAt || event?.created_at || event?.updated_at),
    actor: toText(event?.actor || event?.authorName || event?.author_name || event?.requested_by_name, 'Arch9'),
    actorRole: normalizeActorRole(actorRoleRaw),
    visibility,
    requiresAttention: isAttentionActivity(normalizedType),
    displayType,
    topic,
    statusLabel: getActivityStatusLabel({ type: normalizedType, displayType, dueStatus }),
    dueDate,
    dueStatus,
    relatedEntityType: toText(event?.relatedEntityType || event?.related_entity_type || event?.entity_type || ''),
    relatedEntityId: toText(event?.relatedEntityId || event?.related_entity_id || event?.entity_id || ''),
    metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      actionLabel: action?.label || '',
      actionRoute: action?.route || '',
      displayType,
      topic,
      statusLabel: getActivityStatusLabel({ type: normalizedType, displayType, dueStatus }),
      dueDate,
      dueStatus,
      audience: normalize(event?.audience || event?.requested_from || metadata?.audience || metadata?.requestedFrom || metadata?.requested_from || ''),
      rejectionReason: toText(event?.rejectionReason || event?.rejection_reason),
    },
  }
}

function eventMatchesClientRole(event = {}, clientRole = 'buyer') {
  const normalizedClientRole = normalize(clientRole)
  if (!normalizedClientRole || normalizedClientRole === 'shared') return true

  const audience = normalize(event?.metadata?.audience || event?.audience || '')
  if (!audience || audience === 'both' || audience === 'buyer_and_seller' || audience === 'shared') return true
  if (normalizedClientRole === 'buyer') return audience.includes('buyer')
  if (normalizedClientRole === 'seller') return audience.includes('seller')
  return true
}

export function filterClientVisibleActivity(events = [], clientRole = 'buyer') {
  return (events || [])
    .map((event) => normalizeClientActivityEvent(event))
    .filter((event) => event.visibility === 'client_visible' && eventMatchesClientRole(event, clientRole))
}

export function groupClientActivityByDate(events = []) {
  const groups = {}
  for (const event of events || []) {
    const dateKey = event?.timestamp ? new Date(event.timestamp).toISOString().slice(0, 10) : 'unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(event)
  }
  return Object.entries(groups)
    .sort((a, b) => Date.parse(b[0]) - Date.parse(a[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((left, right) => Date.parse(right.timestamp || '') - Date.parse(left.timestamp || '')),
    }))
}

function buildDiscussionEvents(portalData = {}) {
  const discussion = Array.isArray(portalData?.discussion) ? portalData.discussion : []
  return discussion.map((item, index) => {
    const typeRaw = normalize(item?.discussionType || item?.type)
    let type = 'note_shared_with_client'
    if (typeRaw.includes('document')) type = 'document_requested'
    if (typeRaw.includes('finance')) type = 'finance_updated'
    if (typeRaw.includes('legal') || typeRaw.includes('attorney')) type = 'transaction_stage_changed'
    if (typeRaw.includes('system')) type = 'note_shared_with_client'

    return {
      id: toText(item?.id || `discussion_${index}`),
      type,
      title: 'Update from your team',
      description: toText(item?.commentBody || item?.commentText, 'Your transaction team shared an update.'),
      timestamp: item?.createdAt || item?.created_at,
      actor: toText(item?.authorName || item?.author_name, 'Arch9'),
      actorRole: item?.authorRoleLabel || item?.authorRole || item?.author_role || '',
      visibility: resolveEventVisibility(item, {
        visibility: item?.visibility || item?.visibility_scope || item?.comment_visibility,
      }),
      metadata: {
        displayType: 'update',
        audience: normalize(item?.audience || item?.requested_from || 'shared'),
      },
    }
  })
}

function buildStageEvents(portalData = {}) {
  const events = []
  const currentStage = toText(portalData?.transaction?.stage)
  if (currentStage) {
    events.push({
      id: `stage_${currentStage}_${toText(portalData?.transaction?.updated_at)}`,
      type: 'transaction_stage_changed',
      timestamp: portalData?.transaction?.updated_at || portalData?.lastUpdated,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: 'client_visible',
      metadata: {
        stageTo: currentStage,
        description: `Your transaction moved to ${currentStage}.`,
      },
    })
  }
  return events
}

function buildOnboardingEvents(portalData = {}, clientRole = 'buyer') {
  const events = []
  const onboardingStatus = normalize(
    clientRole === 'seller'
      ? portalData?.activeSellingContext?.sellerOnboardingStatus || portalData?.activeSellingContext?.onboarding_status
      : portalData?.onboarding?.status,
  )
  if (onboardingStatus && onboardingStatus !== 'not_started') {
    events.push({
      id: `onboarding_${onboardingStatus}`,
      type: ['submitted', 'reviewed', 'approved', 'completed', 'complete'].includes(onboardingStatus)
        ? 'onboarding_completed'
        : 'onboarding_sent',
      timestamp: portalData?.transaction?.updated_at || portalData?.lastUpdated,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: 'client_visible',
      metadata: {
        audience: clientRole,
      },
    })
  }
  return events
}

function shouldCreateDocumentReminder(status = '', dueDate = '') {
  const normalizedStatus = normalizeDocumentStatus(status)
  if (!['required', 'requested', 'rejected'].includes(normalizedStatus)) return false
  return Boolean(getDueStatus(dueDate))
}

function buildDocumentReminderEvents({ requiredDocuments = [], additionalRequests = [], portalData = {}, clientRole = 'buyer' } = {}) {
  const events = []
  const reminderTimestamp = portalData?.lastUpdated || portalData?.transaction?.updated_at || new Date().toISOString()

  for (const document of requiredDocuments || []) {
    const dueDate = document?.dueDate || document?.due_date || ''
    const status = document?.requiredDocumentStatus || document?.status
    const dueStatus = getDueStatus(dueDate)
    if (!shouldCreateDocumentReminder(status, dueDate)) continue

    const documentId = toText(document?.id || document?.key || document?.requirement_key || document?.label)
    events.push({
      id: `document_reminder_${dueStatus}_${documentId}`,
      type: dueStatus === 'overdue' ? 'document_reminder_overdue' : 'document_reminder_due',
      timestamp: reminderTimestamp,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: resolveEventVisibility(document, {
        visibility: document?.visibility || document?.visibility_scope || document?.document_visibility,
      }),
      relatedEntityType: 'required_document',
      relatedEntityId: documentId,
      dueDate,
      metadata: {
        title: toText(document?.label || document?.requirement_name, 'Required document'),
        description: dueStatus === 'overdue'
          ? 'This document is overdue and may hold up the next step.'
          : 'This document is due soon. Upload it before the due date to keep the transaction moving.',
        audience: normalize(document?.applies_to || document?.requested_from || clientRole),
        actionLabel: 'Upload Document',
        actionRoute: 'documents',
        category: 'documents',
        dueDate,
      },
    })
  }

  for (const request of additionalRequests || []) {
    const dueDate = request?.dueDate || request?.due_date || ''
    const status = request?.status || 'requested'
    const dueStatus = getDueStatus(dueDate)
    if (!shouldCreateDocumentReminder(status, dueDate)) continue

    const requestId = toText(request?.id || request?.request_id || request?.documentName || request?.title)
    events.push({
      id: `additional_document_reminder_${dueStatus}_${requestId}`,
      type: dueStatus === 'overdue' ? 'document_reminder_overdue' : 'document_reminder_due',
      timestamp: reminderTimestamp,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: resolveEventVisibility(request, {
        visibility: request?.visibility || request?.visibility_scope,
      }),
      relatedEntityType: 'additional_document_request',
      relatedEntityId: requestId,
      dueDate,
      metadata: {
        title: toText(request?.documentName || request?.document_name || request?.title, 'Additional document request'),
        description: dueStatus === 'overdue'
          ? 'This additional request is overdue and may hold up the next step.'
          : 'This additional request is due soon. Upload it before the due date to keep the transaction moving.',
        audience: normalize(request?.requestedFrom || request?.requested_from || clientRole),
        actionLabel: 'Upload Document',
        actionRoute: 'documents',
        category: 'documents',
        dueDate,
      },
    })
  }

  return events
}

function buildDocumentEvents(portalData = {}, clientRole = 'buyer') {
  const requiredDocuments = Array.isArray(portalData?.requiredDocuments) ? portalData.requiredDocuments : []
  const additionalRequests = Array.isArray(portalData?.additionalDocumentRequests) ? portalData.additionalDocumentRequests : []

  const requirementEvents = requiredDocuments.map((document) => {
    const status = normalizeDocumentStatus(document?.requiredDocumentStatus || document?.status)
    let type = 'document_requested'
    if (status === 'rejected') type = 'document_rejected'
    else if (status === 'uploaded' || status === 'under_review') type = 'document_uploaded'
    else if (status === 'approved' || status === 'completed') type = 'document_approved'
    const documentId = toText(document?.id || document?.key || document?.requirement_key || document?.label)
    const dueDate = document?.dueDate || document?.due_date || null

    return {
      id: `requirement_${documentId}`,
      type,
      timestamp: document?.updatedAt || document?.updated_at || document?.createdAt || document?.created_at || portalData?.lastUpdated,
      actor: toText(document?.requested_by_name, 'Arch9'),
      actorRole: document?.requested_by_role || 'System',
      visibility: resolveEventVisibility(document, {
        visibility: document?.visibility || document?.visibility_scope || document?.document_visibility,
      }),
      relatedEntityType: 'required_document',
      relatedEntityId: documentId,
      dueDate,
      metadata: {
        title: toText(document?.label || document?.requirement_name, 'Document update'),
        description: toText(document?.description || document?.requirement_description),
        rejectionReason: toText(document?.rejectionReason || document?.rejection_reason),
        audience: normalize(document?.applies_to || document?.requested_from || clientRole),
        actionLabel: status === 'rejected' ? 'Upload New Version' : '',
        actionRoute: status === 'rejected' ? 'documents' : '',
        category: 'documents',
        dueDate,
      },
    }
  })

  const additionalEvents = additionalRequests.map((request) => {
    const status = normalizeDocumentStatus(request?.status)
    const type =
      status === 'completed'
        ? 'additional_request_completed'
        : 'additional_document_requested'
    const requestId = toText(request?.id || request?.request_id || request?.documentName || request?.title)
    const dueDate = request?.dueDate || request?.due_date || null
    return {
      id: `additional_${requestId}`,
      type,
      timestamp: request?.updatedAt || request?.updated_at || request?.createdAt || request?.created_at || portalData?.lastUpdated,
      actor: toText(request?.requestedByName || request?.createdByName || request?.requested_by_name, 'Transaction Team'),
      actorRole: request?.requestedByRole || request?.createdByRole || request?.requested_by_role || '',
      visibility: resolveEventVisibility(request, {
        visibility: request?.visibility || request?.visibility_scope,
      }),
      relatedEntityType: 'additional_document_request',
      relatedEntityId: requestId,
      dueDate,
      metadata: {
        title: toText(request?.documentName || request?.document_name || request?.title, 'Additional document requested'),
        description: toText(request?.notes || request?.description),
        audience: normalize(request?.requestedFrom || request?.requested_from || clientRole),
        actionLabel: status === 'requested' || status === 'rejected' ? 'Upload Document' : '',
        actionRoute: status === 'requested' || status === 'rejected' ? 'documents' : '',
        category: 'documents',
        dueDate,
      },
    }
  })

  return [...requirementEvents, ...additionalEvents, ...buildDocumentReminderEvents({ requiredDocuments, additionalRequests, portalData, clientRole })]
}

function buildWorkflowEvents(portalData = {}, clientRole = 'buyer') {
  const events = []
  const transaction = portalData?.transaction || {}

  if (toText(transaction?.attorney || transaction?.assigned_attorney_email)) {
    events.push({
      id: `attorney_assigned_${toText(transaction?.id)}`,
      type: 'attorney_assigned',
      timestamp: transaction?.updated_at || portalData?.lastUpdated,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: 'client_visible',
    })
  }

  if (toText(transaction?.bond_originator || transaction?.assigned_bond_originator_email)) {
    events.push({
      id: `bond_originator_assigned_${toText(transaction?.id)}`,
      type: 'bond_originator_assigned',
      timestamp: transaction?.updated_at || portalData?.lastUpdated,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: 'client_visible',
      metadata: { audience: clientRole === 'seller' ? 'shared' : 'buyer' },
    })
  }

  const mandateState = normalize(portalData?.activeSellingContext?.mandatePacket?.state || portalData?.activeSellingContext?.mandate_status)
  if (mandateState) {
    let mandateType = null
    if (mandateState === 'fully_signed' || mandateState === 'signed') mandateType = 'mandate_signed'
    else if (mandateState === 'ready_for_client_signature' || mandateState === 'sent') mandateType = 'mandate_sent'
    else if (mandateState === 'generated_not_ready' || mandateState === 'preparing' || mandateState === 'generated') mandateType = 'mandate_generated'
    if (mandateType) {
      events.push({
        id: `mandate_${mandateState}_${toText(transaction?.id)}`,
        type: mandateType,
        timestamp: transaction?.updated_at || portalData?.lastUpdated,
        actor: 'Arch9',
        actorRole: 'System',
        visibility: 'client_visible',
        metadata: { audience: 'seller' },
      })
    }
  }

  const otpState = normalize(portalData?.otpPacket?.state)
  if (otpState) {
    const type = otpState === 'fully_signed' ? 'otp_signed' : otpState === 'ready_for_client_signature' ? 'otp_ready' : null
    if (type) {
      events.push({
        id: `otp_${otpState}_${toText(transaction?.id)}`,
        type,
        timestamp: transaction?.updated_at || portalData?.lastUpdated,
        actor: 'Arch9',
        actorRole: 'System',
        visibility: 'client_visible',
        metadata: { audience: 'buyer' },
      })
    }
  }

  const financeType = normalize(transaction?.finance_type)
  if (financeType === 'bond' || financeType === 'hybrid' || financeType === 'combination') {
    const bondApplication =
      portalData?.bondApplication ||
      portalData?.bond_application ||
      portalData?.onboarding?.formData?.bond_application ||
      portalData?.onboarding?.form_data?.bond_application ||
      null
    const bondStatus = normalizeDocumentStatus(
      bondApplication?.status ||
        transaction?.bond_application_status ||
        transaction?.finance_status ||
        '',
    )
    const submittedAt = bondApplication?.submitted_at || bondApplication?.submittedAt || transaction?.submitted_to_banks_at || null

    if (bondStatus === 'submitted' || bondStatus === 'approved' || submittedAt) {
      events.push({
        id: `bond_application_submitted_${toText(transaction?.id)}`,
        type: 'bond_application_submitted',
        timestamp: submittedAt || transaction?.updated_at || portalData?.lastUpdated,
        actor: 'Arch9',
        actorRole: 'System',
        visibility: 'client_visible',
        relatedEntityType: 'bond_application',
        relatedEntityId: toText(bondApplication?.id || transaction?.id),
        metadata: {
          audience: 'buyer',
          category: 'finance',
          actionLabel: 'View application',
          actionRoute: 'bond_application',
        },
      })
    } else if (!bondStatus || bondStatus === 'required' || bondStatus === 'not_started') {
      events.push({
        id: `bond_application_required_${toText(transaction?.id)}`,
        type: 'bond_application_required',
        timestamp: transaction?.updated_at || portalData?.lastUpdated,
        actor: 'Arch9',
        actorRole: 'System',
        visibility: 'client_visible',
        relatedEntityType: 'bond_application',
        relatedEntityId: toText(transaction?.id),
        metadata: {
          audience: 'buyer',
          category: 'finance',
          actionLabel: 'Open Bond Application',
          actionRoute: 'bond_application',
        },
      })
    } else if (bondStatus === 'rejected' || bondStatus === 'declined') {
      events.push({
        id: `bond_application_attention_${toText(transaction?.id)}`,
        type: 'bond_application_attention_required',
        timestamp: transaction?.updated_at || portalData?.lastUpdated,
        actor: 'Arch9',
        actorRole: 'System',
        visibility: 'client_visible',
        relatedEntityType: 'bond_application',
        relatedEntityId: toText(transaction?.id),
        metadata: {
          audience: 'buyer',
          category: 'finance',
          actionLabel: 'View application',
          actionRoute: 'bond_application',
        },
      })
    } else {
      events.push({
        id: `finance_submitted_${toText(transaction?.id)}`,
        type: 'finance_submitted',
        timestamp: transaction?.updated_at || portalData?.lastUpdated,
        actor: 'Arch9',
        actorRole: 'System',
        visibility: 'client_visible',
        metadata: { audience: 'buyer', category: 'finance' },
      })
    }
  }

  if (normalize(transaction?.status).includes('registered') || normalize(transaction?.stage).includes('registered')) {
    events.push({
      id: `registration_completed_${toText(transaction?.id)}`,
      type: 'registration_completed',
      timestamp: transaction?.updated_at || portalData?.lastUpdated,
      actor: 'Arch9',
      actorRole: 'System',
      visibility: 'client_visible',
      metadata: { audience: 'shared' },
    })
  }

  return events
}

function buildAppointmentEvents(portalData = {}, clientRole = 'buyer') {
  const appointments = Array.isArray(portalData?.appointments) ? portalData.appointments : []
  return appointments.map((appointment, index) => {
    const status = normalize(appointment?.status)
    let type = 'appointment_scheduled'
    if (status.includes('confirm')) type = 'appointment_confirmed'
    else if (status.includes('complete')) type = 'appointment_completed'
    else if (status.includes('reschedule')) type = 'appointment_rescheduled'
    else if (status.includes('cancel') || status.includes('declined')) type = 'appointment_cancelled'

    return {
      id: toText(appointment?.appointmentId || appointment?.id || `appointment_${index}`),
      type,
      timestamp: appointment?.dateTime || appointment?.updatedAt || appointment?.createdAt || portalData?.lastUpdated,
      actor: toText(appointment?.requestedBy || 'Arch9'),
      actorRole: toText(appointment?.requestedByRole || 'System'),
      visibility: normalizeVisibility(appointment?.visibility || appointment?.visibility_scope),
      metadata: {
        title: `${toText(appointment?.title || appointment?.appointmentTypeLabel || appointment?.appointmentType || 'Appointment')} ${status === 'completed' ? 'completed' : status ? `(${status})` : ''}`.trim(),
        description:
          toText(appointment?.instructions) ||
          `This appointment supports ${toText(appointment?.linkedWorkflowStage || appointment?.linkedWorkflow || 'your transaction workflow')}.`,
        audience: normalize(appointment?.audience || clientRole),
        actionLabel: 'View appointment',
        actionRoute: 'appointments',
      },
    }
  })
}

function buildTransactionEventActivityEvents(portalData = {}, clientRole = 'buyer') {
  const events = Array.isArray(portalData?.events) ? portalData.events : []
  return events.map((event) => {
    const rawType = normalize(event?.eventType || event?.event_type || event?.type)
    const eventData =
      event?.eventData && typeof event.eventData === 'object'
        ? event.eventData
        : event?.event_data && typeof event.event_data === 'object'
          ? event.event_data
          : event?.metadata && typeof event.metadata === 'object'
            ? event.metadata
            : {}
    const normalizedType = rawType === 'roleplayerintroemailsent'
      ? 'roleplayer_intro_sent'
      : rawType || 'note_shared_with_client'

    return {
      id: toText(event?.id || `${normalizedType}_${event?.createdAt || event?.created_at || ''}`),
      type: normalizedType,
      timestamp: event?.createdAt || event?.created_at || event?.timestamp || event?.updatedAt || event?.updated_at,
      actor: toText(eventData?.actorName || eventData?.createdByName, 'Arch9'),
      actorRole: event?.createdByRole || event?.created_by_role || eventData?.actorRole || 'System',
      visibility: normalizeVisibility(eventData?.visibility || event?.visibility || event?.visibility_scope || 'internal_only'),
      relatedEntityType: toText(event?.relatedEntityType || event?.related_entity_type || eventData?.relatedEntityType || eventData?.related_entity_type),
      relatedEntityId: toText(event?.relatedEntityId || event?.related_entity_id || eventData?.relatedEntityId || eventData?.related_entity_id),
      metadata: {
        ...eventData,
        audience: normalize(eventData?.audience || eventData?.requestedFrom || clientRole),
      },
    }
  })
}

function buildWorkflowProjectionEvents(context = {}, clientRole = 'buyer') {
  const workflowSummary = context?.workflowSummary || {}
  const milestones = Array.isArray(workflowSummary?.clientVisibleMilestones) ? workflowSummary.clientVisibleMilestones : []
  const events = milestones.map((milestone, index) => ({
    id: toText(milestone?.id || `workflow_milestone_${index}`),
    type: 'transaction_stage_changed',
    timestamp: milestone?.updatedAt || context?.portalData?.lastUpdated || new Date().toISOString(),
    actor: 'Arch9',
    actorRole: 'System',
    visibility: 'client_visible',
    metadata: {
      title: toText(milestone?.title, 'Transaction update'),
      description: toText(milestone?.summary, 'Your transaction has progressed.'),
      audience: normalize(milestone?.audience || clientRole || 'shared'),
      actionLabel: 'View Progress',
      actionRoute: 'progress',
    },
  }))

  const waitingOn = Array.isArray(workflowSummary?.waitingOn) ? workflowSummary.waitingOn : []
  for (const [index, waitingState] of waitingOn.entries()) {
    const key = normalize(waitingState?.key)
    if (key === 'waiting_on_client') continue
    events.push({
      id: `workflow_waiting_${key || index}`,
      type: 'note_shared_with_client',
      timestamp: context?.portalData?.lastUpdated || context?.portalData?.transaction?.updated_at || new Date().toISOString(),
      actor: 'Arch9',
      actorRole: 'System',
      visibility: 'client_visible',
      metadata: {
        title: toText(waitingState?.label, 'In Progress'),
        description: toText(waitingState?.description, 'Your transaction team is progressing this stage.'),
        audience: 'shared',
        displayType: 'update',
        silentNotification: true,
      },
    })
  }

  return events
}

function buildActivityDedupeKey(event = {}) {
  const entityType = toText(event?.relatedEntityType || event?.related_entity_type)
  const entityId = toText(event?.relatedEntityId || event?.related_entity_id)
  const normalizedType = ['document_requested', 'additional_document_requested', 'document_reminder_due', 'document_reminder_overdue'].includes(normalize(event?.type))
    ? 'document_action'
    : event.type
  if (entityType && entityId) {
    return `${normalizedType}:${entityType}:${entityId}:${event?.metadata?.audience || ''}`
  }

  const title = normalize(event?.title)
  const day = event?.timestamp ? new Date(event.timestamp).toISOString().slice(0, 10) : ''
  return `${normalizedType}:${event.id || title}:${day}:${event?.metadata?.audience || ''}`
}

function compareActivityFreshness(left = {}, right = {}) {
  const leftTime = Date.parse(left?.timestamp || '')
  const rightTime = Date.parse(right?.timestamp || '')
  const normalizedLeftTime = Number.isNaN(leftTime) ? 0 : leftTime
  const normalizedRightTime = Number.isNaN(rightTime) ? 0 : rightTime
  if (normalizedLeftTime !== normalizedRightTime) return normalizedLeftTime - normalizedRightTime

  const leftAttention = left?.requiresAttention ? 1 : 0
  const rightAttention = right?.requiresAttention ? 1 : 0
  if (leftAttention !== rightAttention) return leftAttention - rightAttention

  const duePriority = { overdue: 3, due_soon: 2 }
  const leftDuePriority = duePriority[left?.dueStatus || left?.metadata?.dueStatus] || 0
  const rightDuePriority = duePriority[right?.dueStatus || right?.metadata?.dueStatus] || 0
  if (leftDuePriority !== rightDuePriority) return leftDuePriority - rightDuePriority

  const typePriority = {
    document_reminder_overdue: 4,
    document_reminder_due: 3,
    document_rejected: 2,
    additional_document_requested: 1,
    document_requested: 1,
  }
  const leftTypePriority = typePriority[normalize(left?.type)] || 0
  const rightTypePriority = typePriority[normalize(right?.type)] || 0
  if (leftTypePriority !== rightTypePriority) return leftTypePriority - rightTypePriority

  const leftDescriptionLength = String(left?.description || '').length
  const rightDescriptionLength = String(right?.description || '').length
  return leftDescriptionLength - rightDescriptionLength
}

function dedupeActivityEvents(events = []) {
  const dedupedMap = new Map()
  for (const event of events || []) {
    const key = buildActivityDedupeKey(event)
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, event)
      continue
    }
    const existing = dedupedMap.get(key)
    if (compareActivityFreshness(existing, event) < 0) {
      dedupedMap.set(key, event)
    }
  }
  return [...dedupedMap.values()]
}

export function buildClientPortalActivityFeedSummary(events = []) {
  const summary = {
    total: 0,
    actionRequired: 0,
    milestones: 0,
    progress: 0,
    updates: 0,
    overdue: 0,
    dueSoon: 0,
    latestTimestamp: '',
    topics: {},
  }

  for (const event of events || []) {
    summary.total += 1
    const displayType = event?.displayType || event?.metadata?.displayType || 'update'
    const topic = event?.topic || event?.metadata?.topic || 'general'
    summary.topics[topic] = (summary.topics[topic] || 0) + 1
    if (event?.requiresAttention || displayType === 'action_required') summary.actionRequired += 1
    else if (displayType === 'milestone') summary.milestones += 1
    else if (displayType === 'progress') summary.progress += 1
    else summary.updates += 1
    if (event?.dueStatus === 'overdue' || event?.metadata?.dueStatus === 'overdue') summary.overdue += 1
    if (event?.dueStatus === 'due_soon' || event?.metadata?.dueStatus === 'due_soon') summary.dueSoon += 1

    const eventTime = Date.parse(event?.timestamp || '')
    const latestTime = Date.parse(summary.latestTimestamp || '')
    if (!Number.isNaN(eventTime) && (Number.isNaN(latestTime) || eventTime > latestTime)) {
      summary.latestTimestamp = event.timestamp
    }
  }

  return summary
}

function buildRawClientPortalActivityEvents(transactionIdOrContext, clientRole = 'buyer') {
  const context = transactionIdOrContext && typeof transactionIdOrContext === 'object'
    ? transactionIdOrContext
    : { transactionId: transactionIdOrContext }

  const portalData = context?.portalData || {}
  const resolvedClientRole = normalize(clientRole) === 'seller' ? 'seller' : 'buyer'
  const allEvents = [
    ...buildOnboardingEvents(portalData, resolvedClientRole),
    ...buildDocumentEvents(portalData, resolvedClientRole),
    ...buildWorkflowEvents(portalData, resolvedClientRole),
    ...buildWorkflowProjectionEvents(context, resolvedClientRole),
    ...buildAppointmentEvents(portalData, resolvedClientRole),
    ...buildStageEvents(portalData),
    ...buildDiscussionEvents(portalData),
    ...buildTransactionEventActivityEvents(portalData, resolvedClientRole),
  ]

  const filtered = filterClientVisibleActivity(allEvents, resolvedClientRole)
  return dedupeActivityEvents(filtered)
}

export function getClientPortalActivityFeed(transactionIdOrContext, clientRole = 'buyer') {
  return buildRawClientPortalActivityEvents(transactionIdOrContext, clientRole)
    .sort((left, right) => Date.parse(right.timestamp || '') - Date.parse(left.timestamp || ''))
}

export function buildClientPortalActivityFeedModel(transactionIdOrContext, clientRole = 'buyer') {
  const items = getClientPortalActivityFeed(transactionIdOrContext, clientRole)
  return {
    items,
    grouped: groupClientActivityByDate(items),
    summary: buildClientPortalActivityFeedSummary(items),
  }
}
