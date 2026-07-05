import { normalizeFinanceManagedBy } from '../core/transactions/financeType.js'

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeDocumentStatus(status = '') {
  const normalized = normalizeValue(status).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (
    [
      'required',
      'requested',
      'uploaded',
      'under_review',
      'rejected',
      'approved',
      'completed',
      'not_applicable',
      'cancelled',
    ].includes(normalized)
  ) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted') return 'approved'
  if (normalized === 'missing') return 'required'
  if (normalized === 'pending_review' || normalized === 'in_review' || normalized === 'awaiting_review') return 'under_review'
  if (normalized === 'not_uploaded' || normalized === 'outstanding') return 'required'
  return 'required'
}

function isOnboardingComplete(status) {
  return new Set(['submitted', 'reviewed', 'approved', 'complete', 'completed', 'client_onboarding_complete', 'awaiting_signed_otp', 'signed_otp_received']).has(
    normalizeValue(status),
  )
}

function normalizePriority(value = '') {
  const normalized = normalizeValue(value)
  if (['urgent', 'high', 'normal', 'low', 'informational'].includes(normalized)) return normalized
  if (normalized === 'medium') return 'normal'
  if (normalized === 'required') return 'high'
  return 'normal'
}

function toDate(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeFinanceType(value = '') {
  const normalized = normalizeValue(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['bond', 'bond_finance', 'mortgage'].includes(normalized)) return 'bond'
  if (['cash', 'cash_sale'].includes(normalized)) return 'cash'
  if (['hybrid', 'combination', 'cash_bond', 'cash_and_bond', 'cash_bond_combination'].includes(normalized)) return 'hybrid'
  return normalized
}

function isBondFinanceType(value = '') {
  return ['bond', 'hybrid'].includes(normalizeFinanceType(value))
}

function isCashFinanceType(value = '') {
  return ['cash', 'hybrid'].includes(normalizeFinanceType(value))
}

function resolveFinanceManagedBy(context = {}) {
  const formData = context?.portalData?.onboardingFormData?.formData || context?.portalData?.formData || {}
  const finance = formData?.finance && typeof formData.finance === 'object' ? formData.finance : {}
  return normalizeFinanceManagedBy(
    context?.finance?.managedBy ||
      context?.finance?.managed_by ||
      context?.transaction?.finance_managed_by ||
      context?.transaction?.financeManagedBy ||
      context?.transaction?.finance_owner ||
      context?.transaction?.financeOwner ||
      context?.portalData?.transaction?.finance_managed_by ||
      context?.portalData?.transaction?.financeManagedBy ||
      formData.finance_managed_by ||
      formData.financeManagedBy ||
      finance.finance_managed_by ||
      finance.financeManagedBy,
    { fallback: 'bond_originator' },
  )
}

function isOriginatorManagedFinanceContext(context = {}) {
  return resolveFinanceManagedBy(context) === 'bond_originator'
}

function actionRouteFromCategory(category = '') {
  const normalized = normalizeValue(category)
  if (normalized === 'onboarding') return 'details'
  if (normalized === 'documents') return 'documents'
  if (normalized === 'mandate') return 'documents'
  if (normalized === 'otp') return 'documents'
  if (normalized === 'finance') return 'documents'
  return 'overview'
}

function createAction(partial = {}) {
  const category = normalizeValue(partial.category || 'documents')
  const route = String(partial.actionRoute || actionRouteFromCategory(category)).trim() || 'overview'
  return {
    id: partial.id || `${partial.type || 'informational'}_${Math.random().toString(36).slice(2, 10)}`,
    type: partial.type || 'informational',
    category: category || 'documents',
    title: String(partial.title || 'Action required').trim(),
    description: String(partial.description || 'Please review your transaction action items.').trim(),
    priority: normalizePriority(partial.priority),
    status: String(partial.status || 'pending').trim(),
    blocking: Boolean(partial.blocking),
    visibility: partial.visibility || 'client_visible',
    actionLabel: String(partial.actionLabel || 'Open').trim(),
    actionRoute: route,
    dueDate: partial.dueDate || null,
    metadata: partial.metadata && typeof partial.metadata === 'object' ? partial.metadata : {},
    createdAt: partial.createdAt || new Date().toISOString(),
    notificationEligible: partial.notificationEligible !== false,
  }
}

function parseWorkspace(context = {}) {
  return normalizeValue(context?.workspaceMode || context?.portalContext?.workspace || 'shared')
}

function parseBondApplication(context = {}) {
  const formData = context?.portalData?.onboardingFormData?.formData || context?.portalData?.formData || {}
  const candidates = [
    context?.bondApplication,
    context?.portalData?.bondApplication,
    context?.portalData?.bond_application,
    formData?.bond_application,
    context?.transaction?.bond_application,
  ]
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null
}

function normalizeBondApplicationStatus(value = '') {
  const normalized = normalizeValue(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return 'not_started'
  if (['not_started', 'new', 'draft'].includes(normalized)) return 'not_started'
  if (['in_progress', 'started', 'saved'].includes(normalized)) return 'in_progress'
  if (['submitted', 'sent', 'sent_to_originator', 'submitted_to_originator', 'submitted_to_banks'].includes(normalized)) return 'submitted'
  if (['under_review', 'review', 'application_in_progress', 'feedback_received'].includes(normalized)) return 'under_review'
  if (['approved', 'approval', 'buyer_approved', 'quote_received'].includes(normalized)) return 'approved'
  if (['declined', 'rejected'].includes(normalized)) return 'declined'
  return normalized
}

function parseRequirementLabel(requirement = {}) {
  return (
    requirement?.label ||
    requirement?.requirement_name ||
    requirement?.document_name ||
    requirement?.name ||
    'required document'
  )
}

function parseRequirementKey(requirement = {}) {
  return (
    requirement?.key ||
    requirement?.requirement_key ||
    requirement?.document_type ||
    requirement?.id ||
    parseRequirementLabel(requirement)
  )
}

function parseRequirementDescription(requirement = {}) {
  return requirement?.description || requirement?.requirement_description || 'This document is required to continue.'
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function isDocumentComplete(status = '') {
  const normalized = normalizeDocumentStatus(status)
  return normalized === 'approved' || normalized === 'completed' || normalized === 'not_applicable'
}

function deriveRequestedFromAudience(request = {}) {
  const requestedFrom = normalizeValue(request?.requestedFrom || request?.requested_from)
  return {
    buyer: requestedFrom === 'buyer' || requestedFrom === 'buyer_and_seller' || requestedFrom === '',
    seller: requestedFrom === 'seller' || requestedFrom === 'buyer_and_seller',
  }
}

function filterByWorkspace(actions = [], workspace = 'shared') {
  if (workspace === 'shared') return actions
  return actions.filter((action) => {
    const scope = normalizeValue(action?.metadata?.workspaceScope || 'shared')
    if (scope === 'shared') return true
    return scope === workspace
  })
}

function normalizeAppointmentStatus(value = '') {
  return normalizeValue(value).replace(/\s+/g, '_')
}

function dedupeActions(actions = []) {
  const map = new Map()
  for (const action of actions) {
    const existing = map.get(action.id)
    if (!existing) {
      map.set(action.id, action)
      continue
    }
    if (getNextActionPriority(action) < getNextActionPriority(existing)) {
      map.set(action.id, action)
    }
  }
  return [...map.values()]
}

export function getDocumentRequirementActions(context = {}) {
  const workspace = parseWorkspace(context)
  const requirements = toArray(context?.documentCenter?.requiredDocuments)
  const actions = []

  for (const requirement of requirements) {
    const key = parseRequirementKey(requirement)
    const label = parseRequirementLabel(requirement)
    const status = normalizeDocumentStatus(requirement?.requiredDocumentStatus || requirement?.status)
    const isRequired = requirement?.isRequired !== false && requirement?.is_required !== false
    const description = parseRequirementDescription(requirement)
    const workspaceScope = workspace === 'selling' ? 'selling' : 'buying'

    if (status === 'rejected') continue

    if (status === 'required' || status === 'requested') {
      actions.push(
        createAction({
          id: `doc_upload_${key}`,
          type: 'document_upload_required',
          category: 'documents',
          title: `Upload ${label}`,
          description,
          priority: isRequired ? 'high' : 'normal',
          status,
          blocking: isRequired,
          actionLabel: 'Upload document',
          actionRoute: 'documents',
          dueDate: requirement?.dueDate || requirement?.due_date || null,
          metadata: { requirementKey: key, workspaceScope },
        }),
      )
      continue
    }

    if ((status === 'uploaded' || status === 'under_review') && isRequired) {
      actions.push(
        createAction({
          id: `doc_review_${key}`,
          type: 'document_under_review',
          category: 'documents',
          title: `${label} is under review`,
          description: 'Your team is reviewing this document. No action is needed right now.',
          priority: 'informational',
          status: 'under_review',
          blocking: false,
          actionLabel: 'View documents',
          actionRoute: 'documents',
          metadata: { requirementKey: key, workspaceScope },
          notificationEligible: false,
        }),
      )
    }
  }

  return filterByWorkspace(actions, workspace)
}

export function getRejectedDocumentActions(context = {}) {
  const workspace = parseWorkspace(context)
  const requirements = toArray(context?.documentCenter?.requiredDocuments)
  return filterByWorkspace(
    requirements
      .filter((item) => normalizeDocumentStatus(item?.requiredDocumentStatus || item?.status) === 'rejected')
      .map((item) => {
        const key = parseRequirementKey(item)
        return createAction({
          id: `rejected_${key}`,
          type: 'document_reupload_required',
          category: 'documents',
          title: `Re-upload ${parseRequirementLabel(item)}`,
          description:
            item?.rejectionReason || item?.rejection_reason || 'This document was rejected and needs a new upload.',
          priority: 'urgent',
          status: 'rejected',
          blocking: true,
          actionLabel: 'Re-upload',
          actionRoute: 'documents',
          metadata: { requirementKey: key, workspaceScope: workspace === 'selling' ? 'selling' : 'buying' },
        })
      }),
    workspace,
  )
}

export function getAdditionalRequestActions(context = {}) {
  const workspace = parseWorkspace(context)
  const requests = toArray(context?.documentCenter?.additionalRequests)
  const actions = []

  for (const request of requests) {
    const status = normalizeDocumentStatus(request?.status)
    if (status === 'completed' || status === 'cancelled' || status === 'approved' || status === 'not_applicable') continue

    const requestedFrom = deriveRequestedFromAudience(request)
    const appliesToWorkspace =
      workspace === 'shared' ||
      (workspace === 'buying' && requestedFrom.buyer) ||
      (workspace === 'selling' && requestedFrom.seller)
    if (!appliesToWorkspace) continue

    const documentName = request?.documentName || request?.document_name || request?.title || 'additional document'
    const priority = normalizePriority(request?.additionalPriority || request?.priority || 'normal')
    const idBase = String(request?.id || documentName).trim().replace(/\s+/g, '_').toLowerCase()

    if (status === 'requested' || status === 'required' || status === 'rejected') {
      actions.push(
        createAction({
          id: `additional_upload_${idBase}`,
          type: status === 'rejected' ? 'document_reupload_required' : 'additional_document_requested',
          category: 'documents',
          title: `Upload ${documentName}`,
          description:
            request?.notes ||
            request?.description ||
            (status === 'rejected'
              ? `${documentName} was rejected and needs to be uploaded again.`
              : 'Your transaction team requested an additional document.'),
          priority: status === 'rejected' ? 'urgent' : priority,
          status,
          blocking: true,
          actionLabel: status === 'rejected' ? 'Re-upload document' : 'Upload document',
          actionRoute: 'documents',
          dueDate: request?.dueDate || request?.due_date || null,
          metadata: {
            requestId: request?.id || null,
            requestedBy: request?.requestedByName || request?.requested_by_name || null,
            workspaceScope: workspace,
          },
        }),
      )
      continue
    }

    if (status === 'uploaded' || status === 'under_review') {
      actions.push(
        createAction({
          id: `additional_review_${idBase}`,
          type: 'awaiting_internal_review',
          category: 'documents',
          title: `${documentName} is under review`,
          description: 'Your upload was received and is currently being reviewed.',
          priority: 'informational',
          status: 'under_review',
          blocking: false,
          actionLabel: 'View documents',
          actionRoute: 'documents',
          metadata: { requestId: request?.id || null, workspaceScope: workspace },
          notificationEligible: false,
        }),
      )
    }
  }

  return actions
}

export function getAppointmentActions(context = {}) {
  const workspace = parseWorkspace(context)
  const appointments = toArray(context?.appointments || context?.portalData?.appointments)
  const actions = []

  for (const appointment of appointments) {
    const visibility = normalizeValue(appointment?.visibility || appointment?.visibility_scope || 'client_visible')
    if (visibility === 'internal_only') continue
    const status = normalizeAppointmentStatus(appointment?.status)
    const typeLabel = appointment?.appointmentTypeLabel || appointment?.appointmentType || 'Appointment'
    const appointmentId = appointment?.appointmentId || appointment?.id || typeLabel
    const route = 'appointments'

    if (status.includes('pending') || status.includes('proposed') || status.includes('requested')) {
      actions.push(
        createAction({
          id: `appointment_confirm_${appointmentId}`,
          type: 'appointment_confirm_required',
          category: 'appointments',
          title: `Confirm ${typeLabel}`,
          description:
            appointment?.instructions ||
            `Your ${typeLabel.toLowerCase()} is waiting for confirmation.`,
          priority: 'normal',
          status: 'pending',
          blocking: false,
          actionLabel: 'View appointment',
          actionRoute: route,
          dueDate: appointment?.dateTime || null,
          metadata: {
            appointmentId,
            linkedWorkflowStage: appointment?.linkedWorkflowStage || appointment?.linked_workflow_stage || null,
            workspaceScope: workspace,
          },
        }),
      )
      continue
    }

    if (status.includes('reschedule')) {
      actions.push(
        createAction({
          id: `appointment_reschedule_${appointmentId}`,
          type: 'appointment_required',
          category: 'appointments',
          title: `Reschedule ${typeLabel}`,
          description:
            appointment?.instructions ||
            `${typeLabel} needs to be rescheduled to keep your workflow on track.`,
          priority: 'high',
          status: 'pending',
          blocking: true,
          actionLabel: 'Open appointment',
          actionRoute: route,
          dueDate: appointment?.dateTime || null,
          metadata: {
            appointmentId,
            linkedWorkflowStage: appointment?.linkedWorkflowStage || appointment?.linked_workflow_stage || null,
            workspaceScope: workspace,
          },
        }),
      )
      continue
    }

    if (status.includes('confirmed') || status.includes('completed')) {
      actions.push(
        createAction({
          id: `appointment_info_${appointmentId}`,
          type: 'informational',
          category: 'appointments',
          title: `${typeLabel} ${status.includes('completed') ? 'completed' : 'confirmed'}`,
          description:
            appointment?.instructions ||
            `This appointment is linked to ${appointment?.linkedWorkflowStage || appointment?.linkedWorkflow || 'your transaction workflow'}.`,
          priority: 'informational',
          status: status.includes('completed') ? 'completed' : 'in_progress',
          blocking: false,
          actionLabel: 'View appointment',
          actionRoute: route,
          dueDate: appointment?.dateTime || null,
          metadata: {
            appointmentId,
            linkedWorkflowStage: appointment?.linkedWorkflowStage || appointment?.linked_workflow_stage || null,
            workspaceScope: workspace,
          },
          notificationEligible: false,
        }),
      )
    }
  }

  return filterByWorkspace(actions, workspace)
}

export function getMandateActions(context = {}) {
  const workspace = parseWorkspace(context)
  if (workspace === 'buying') return []

  const mandatePacket = context?.mandate?.packet || context?.portalData?.activeSellingContext?.mandatePacket || {}
  const mandateState = normalizeValue(mandatePacket?.state || context?.portalData?.activeSellingContext?.mandate_status)

  if (['ready_for_client_signature', 'sent', 'viewed'].includes(mandateState)) {
    return [
      createAction({
        id: 'mandate_signature_required',
        type: 'mandate_signature_required',
        category: 'mandate',
        title: 'Sign your mandate',
        description: 'Your mandate is ready and requires your signature before listing activation can proceed.',
        priority: 'high',
        status: 'pending',
        blocking: true,
        actionLabel: 'Review and sign',
        actionRoute: 'documents',
        metadata: { workspaceScope: 'selling' },
      }),
    ]
  }

  if (mandateState === 'awaiting_other_signatures') {
    return [
      createAction({
        id: 'mandate_awaiting_other_party',
        type: 'awaiting_other_party',
        category: 'mandate',
        title: 'Awaiting other signatures',
        description: 'The mandate is waiting for signatures from other parties.',
        priority: 'informational',
        status: 'under_review',
        blocking: false,
        actionLabel: 'View mandate',
        actionRoute: 'documents',
        metadata: { workspaceScope: 'selling' },
        notificationEligible: false,
      }),
    ]
  }

  return []
}

export function getOtpActions(context = {}) {
  const workspace = parseWorkspace(context)
  if (workspace === 'selling') return []

  const otpPacket = context?.portalData?.otpPacket || {}
  const otpState = normalizeValue(otpPacket?.state)

  if (otpState === 'ready_for_client_signature') {
    return [
      createAction({
        id: 'otp_signature_required',
        type: 'otp_signature_required',
        category: 'otp',
        title: 'Sign your OTP',
        description: 'Your Offer to Purchase is ready for signature.',
        priority: 'urgent',
        status: 'pending',
        blocking: true,
        actionLabel: 'Sign OTP',
        actionRoute: 'documents',
        metadata: { workspaceScope: 'buying' },
      }),
    ]
  }

  if (otpState === 'awaiting_other_signatures') {
    return [
      createAction({
        id: 'otp_awaiting_other_signatures',
        type: 'awaiting_other_party',
        category: 'otp',
        title: 'Awaiting signatures',
        description: 'The OTP has been signed by you and is waiting for other signatures.',
        priority: 'informational',
        status: 'under_review',
        blocking: false,
        actionLabel: 'View OTP',
        actionRoute: 'documents',
        metadata: { workspaceScope: 'buying' },
        notificationEligible: false,
      }),
    ]
  }

  return []
}

const PROOF_OF_FUNDS_PATTERN = /(proof of funds|source of funds|deposit proof|deposit)/i
const BOND_PATTERN = /(bond|mortgage|home loan|payslip|income|bank statement|bank statements|financial statement|application form|approval letter|bank approval|lender approval|finance approval)/i

export function getBondApplicationActions(context = {}) {
  const workspace = parseWorkspace(context)
  if (workspace === 'selling') return []

  const financeType = normalizeFinanceType(context?.finance?.type || context?.transaction?.finance_type || '')
  if (!isBondFinanceType(financeType)) return []
  const financeManagedBy = resolveFinanceManagedBy(context)
  if (!isOriginatorManagedFinanceContext(context)) return []

  const application = parseBondApplication(context)
  const status = normalizeBondApplicationStatus(
    application?.status ||
      context?.transaction?.bond_application_status ||
      context?.transaction?.finance_status ||
      '',
  )
  const submittedAt = application?.submitted_at || application?.submittedAt || context?.transaction?.submitted_to_banks_at || null

  if (!application || status === 'not_started') {
    return [
      createAction({
        id: 'bond_application_required',
        type: 'bond_application_required',
        category: 'finance',
        title: 'Complete your bond application',
        description: 'Your bond application still needs to be completed before it can be shared with the bond originator or banks.',
        priority: 'high',
        status: 'pending',
        blocking: true,
        actionLabel: 'Open bond application',
        actionRoute: 'bond_application',
        metadata: { workspaceScope: 'buying', bondApplicationStatus: status, financeManagedBy },
      }),
    ]
  }

  if (status === 'in_progress') {
    return [
      createAction({
        id: 'bond_application_in_progress',
        type: 'bond_application_required',
        category: 'finance',
        title: 'Finish your bond application',
        description: 'Your bond application has been started but still needs to be submitted.',
        priority: 'high',
        status: 'pending',
        blocking: true,
        actionLabel: 'Continue application',
        actionRoute: 'bond_application',
        metadata: { workspaceScope: 'buying', bondApplicationStatus: status, financeManagedBy },
      }),
    ]
  }

  if (status === 'declined') {
    return [
      createAction({
        id: 'bond_application_declined',
        type: 'bond_application_attention_required',
        category: 'finance',
        title: 'Bond application needs attention',
        description: 'Your bond application has been marked declined. Review the finance section or contact your transaction team for next steps.',
        priority: 'high',
        status: 'pending',
        blocking: false,
        actionLabel: 'View application',
        actionRoute: 'bond_application',
        metadata: { workspaceScope: 'buying', bondApplicationStatus: status, financeManagedBy },
      }),
    ]
  }

  if (status === 'submitted' || status === 'under_review') {
    return [
      createAction({
        id: 'bond_application_under_review',
        type: 'awaiting_internal_review',
        category: 'finance',
        title: 'Bond application under review',
        description: submittedAt
          ? 'Your bond application has been submitted and is being reviewed.'
          : 'Your bond application is with the finance team.',
        priority: 'informational',
        status: 'under_review',
        blocking: false,
        actionLabel: 'View application',
        actionRoute: 'bond_application',
        metadata: { workspaceScope: 'buying', bondApplicationStatus: status, financeManagedBy },
        notificationEligible: false,
      }),
    ]
  }

  return []
}

export function getFinanceActions(context = {}) {
  const workspace = parseWorkspace(context)
  if (workspace === 'selling') return []

  const financeType = normalizeFinanceType(context?.finance?.type || context?.transaction?.finance_type || 'cash')
  const financeManagedBy = resolveFinanceManagedBy(context)
  const originatorManagedFinance = financeManagedBy === 'bond_originator'
  const requirements = toArray(context?.documentCenter?.requiredDocuments)

  const missingProofOfFunds = requirements.some((item) => {
    const status = normalizeDocumentStatus(item?.requiredDocumentStatus || item?.status)
    if (isDocumentComplete(status)) return false
    return PROOF_OF_FUNDS_PATTERN.test(`${item?.label || ''} ${item?.key || ''}`)
  })

  const missingBondFinance = requirements.some((item) => {
    const status = normalizeDocumentStatus(item?.requiredDocumentStatus || item?.status)
    if (isDocumentComplete(status)) return false
    return BOND_PATTERN.test(`${item?.label || ''} ${item?.key || ''}`)
  })

  const actions = []
  if (isCashFinanceType(financeType) && missingProofOfFunds) {
    actions.push(
      createAction({
        id: 'proof_of_funds_required',
        type: 'proof_of_funds_required',
        category: 'finance',
        title: 'Upload proof of funds',
        description: 'Proof of funds is required before your transaction can progress.',
        priority: 'high',
        status: 'pending',
        blocking: true,
        actionLabel: 'Upload proof',
        actionRoute: 'documents',
        metadata: { workspaceScope: 'buying' },
      }),
    )
  }

  if (isBondFinanceType(financeType) && missingBondFinance) {
    actions.push(
      createAction({
        id: 'bond_finance_documents_required',
        type: financeType === 'bond' && originatorManagedFinance ? 'bond_document_required' : 'finance_document_required',
        category: 'finance',
        title: originatorManagedFinance ? 'Upload finance documents' : 'Upload external finance documents',
        description: originatorManagedFinance
          ? 'Your finance documentation is incomplete for the current funding structure.'
          : 'Upload the approval, bank confirmation, or supporting documents for the finance you are arranging directly.',
        priority: 'high',
        status: 'pending',
        blocking: true,
        actionLabel: originatorManagedFinance ? 'Upload finance docs' : 'Upload finance proof',
        actionRoute: 'documents',
        metadata: { workspaceScope: 'buying', financeManagedBy, originatorManagedFinance },
      }),
    )
  }

  return actions
}

export function getBlockingActions(context = {}) {
  const actions = toArray(context?.actions)
  return actions.filter((action) => Boolean(action?.blocking))
}

function mapWorkflowBlockerToActionRoute(blocker = {}) {
  const relatedEntityType = normalizeValue(blocker?.relatedEntityType || blocker?.related_entity_type)
  const blockerType = normalizeValue(blocker?.type)
  if (relatedEntityType.includes('document') || blockerType.includes('document')) return 'documents'
  if (blockerType.includes('appointment')) return 'appointments'
  if (blockerType.includes('onboarding')) return 'details'
  return 'overview'
}

function isClientActionableWorkflowBlocker(blocker = {}) {
  const blockerType = normalizeValue(blocker?.type)
  const title = normalizeValue(blocker?.title)
  const description = normalizeValue(blocker?.description)
  const source = `${blockerType} ${title} ${description}`
  if (source.includes('document')) return false
  return (
    source.includes('onboarding') ||
    source.includes('proof of address') ||
    source.includes('proof of funds') ||
    source.includes('sign')
  )
}

export function getWorkflowProjectionActions(context = {}) {
  const workspace = parseWorkspace(context)
  const workflowSummary = context?.workflowSummary || {}
  const blockers = toArray(workflowSummary?.blockers)
  const waitingOn = toArray(workflowSummary?.waitingOn)
  const actions = []

  for (const [index, blocker] of blockers.entries()) {
    if (!isClientActionableWorkflowBlocker(blocker)) continue
    const blockerId = String(
      blocker?.id ||
        `${blocker?.type || 'workflow_blocker'}_${blocker?.relatedEntityType || 'entity'}_${blocker?.relatedEntityId || index}`,
    ).trim()
    actions.push(
      createAction({
        id: `workflow_blocker_${blockerId}`,
        type: 'action_required',
        category: 'documents',
        title: String(blocker?.title || 'Action required').trim(),
        description: String(blocker?.description || 'Please complete this step so your transaction can continue.').trim(),
        priority: 'high',
        status: 'pending',
        blocking: true,
        actionLabel: 'Resolve now',
        actionRoute: mapWorkflowBlockerToActionRoute(blocker),
        metadata: {
          workflowBlockerId: blockerId,
          relatedEntityType: blocker?.relatedEntityType || '',
          relatedEntityId: blocker?.relatedEntityId || '',
          workspaceScope: workspace,
        },
      }),
    )
  }

  if (!actions.length) {
    const waitingState = waitingOn.find((item) => normalizeValue(item?.key) !== 'waiting_on_client')
    if (waitingState?.label || waitingState?.description) {
      actions.push(
        createAction({
          id: `workflow_waiting_${normalizeValue(waitingState?.key || waitingState?.label)}`,
          type: 'awaiting_internal_review',
          category: 'informational',
          title: String(waitingState?.label || 'In Progress').trim(),
          description: String(waitingState?.description || 'Your transaction team is progressing the next stage.').trim(),
          priority: 'informational',
          status: 'in_progress',
          blocking: false,
          actionLabel: 'View progress',
          actionRoute: 'overview',
          metadata: { workspaceScope: workspace },
          notificationEligible: false,
        }),
      )
    }
  }

  return actions
}

export function getPassiveStatusActions(context = {}) {
  const workspace = parseWorkspace(context)
  const blockingCount = toArray(context?.actions).filter((action) => action?.blocking).length
  if (blockingCount > 0) return []

  const mainStage = normalizeValue(context?.lifecycle?.mainStage || context?.transaction?.current_main_stage)
  if (mainStage === 'fin') {
    return [
      createAction({
        id: 'awaiting_finance_review',
        type: 'awaiting_internal_review',
        category: 'finance',
        title: 'Awaiting finance review',
        description: 'Your finance team is progressing lender-side checks and approvals.',
        priority: 'informational',
        status: 'in_progress',
        blocking: false,
        actionLabel: 'View progress',
        actionRoute: 'overview',
        metadata: { workspaceScope: workspace === 'shared' ? 'buying' : workspace },
        notificationEligible: false,
      }),
    ]
  }

  if (['atty', 'xfer', 'reg'].includes(mainStage)) {
    return [
      createAction({
        id: 'awaiting_transfer_progress',
        type: 'awaiting_internal_review',
        category: 'transfer',
        title: 'Awaiting legal progression',
        description: 'Your legal team is preparing and progressing transfer milestones.',
        priority: 'informational',
        status: 'in_progress',
        blocking: false,
        actionLabel: 'View workflow',
        actionRoute: 'overview',
        metadata: { workspaceScope: workspace === 'shared' ? 'buying' : workspace },
        notificationEligible: false,
      }),
    ]
  }

  return [
    createAction({
      id: 'no_action_required',
      type: 'informational',
      category: 'informational',
      title: 'No action required at the moment',
      description: 'Your transaction team is progressing the next steps and will notify you if anything is needed.',
      priority: 'informational',
      status: 'ready',
      blocking: false,
      actionLabel: 'View progress',
      actionRoute: 'overview',
      metadata: { workspaceScope: workspace === 'shared' ? 'buying' : workspace },
      notificationEligible: false,
    }),
  ]
}

export function getBuyerNextActions(context = {}) {
  return [
    ...getDocumentRequirementActions({ ...context, workspaceMode: 'buying' }),
    ...getRejectedDocumentActions({ ...context, workspaceMode: 'buying' }),
    ...getAdditionalRequestActions({ ...context, workspaceMode: 'buying' }),
    ...getAppointmentActions({ ...context, workspaceMode: 'buying' }),
    ...getOtpActions({ ...context, workspaceMode: 'buying' }),
    ...getBondApplicationActions({ ...context, workspaceMode: 'buying' }),
    ...getFinanceActions({ ...context, workspaceMode: 'buying' }),
  ]
}

export function getSellerNextActions(context = {}) {
  return [
    ...getDocumentRequirementActions({ ...context, workspaceMode: 'selling' }),
    ...getRejectedDocumentActions({ ...context, workspaceMode: 'selling' }),
    ...getAdditionalRequestActions({ ...context, workspaceMode: 'selling' }),
    ...getAppointmentActions({ ...context, workspaceMode: 'selling' }),
    ...getMandateActions({ ...context, workspaceMode: 'selling' }),
  ]
}

function getOnboardingAction(context = {}, workspace = 'buying') {
  const onboardingStatus =
    workspace === 'selling'
      ? context?.portalData?.activeSellingContext?.sellerOnboardingStatus ||
        context?.portalData?.activeSellingContext?.onboarding_status ||
        context?.onboarding?.status
      : context?.onboarding?.status

  if (isOnboardingComplete(onboardingStatus)) return null
  return createAction({
    id: workspace === 'selling' ? 'seller_onboarding_required' : 'buyer_onboarding_required',
    type: 'onboarding_required',
    category: 'onboarding',
    title: workspace === 'selling' ? 'Complete seller onboarding' : 'Complete onboarding',
    description:
      workspace === 'selling'
        ? 'Complete your seller onboarding information to continue the listing workflow.'
        : 'Complete your onboarding information to continue your transaction.',
    priority: 'high',
    status: 'pending',
    blocking: true,
    actionLabel: 'Continue onboarding',
    actionRoute: 'details',
    metadata: { workspaceScope: workspace },
  })
}

export function getNextActionPriority(action = {}) {
  const priority = normalizePriority(action?.priority)
  const rank = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
    informational: 4,
  }
  return rank[priority] ?? 2
}

export function sortNextActions(actions = []) {
  return [...actions].sort((a, b) => {
    const aBlocking = a?.blocking ? 0 : 1
    const bBlocking = b?.blocking ? 0 : 1
    if (aBlocking !== bBlocking) return aBlocking - bBlocking

    const aPriority = getNextActionPriority(a)
    const bPriority = getNextActionPriority(b)
    if (aPriority !== bPriority) return aPriority - bPriority

    const aDue = toDate(a?.dueDate)
    const bDue = toDate(b?.dueDate)
    if (aDue && bDue && aDue !== bDue) return aDue - bDue
    if (aDue && !bDue) return -1
    if (!aDue && bDue) return 1

    const aCreated = toDate(a?.createdAt) || 0
    const bCreated = toDate(b?.createdAt) || 0
    return bCreated - aCreated
  })
}

export function generateClientPortalNextActions(context = {}) {
  const workspace = parseWorkspace(context)
  const actions = []

  if (workspace === 'buying' || workspace === 'shared') {
    const onboardingAction = getOnboardingAction(context, 'buying')
    if (onboardingAction) actions.push(onboardingAction)
    actions.push(...getBuyerNextActions(context))
  }

  if (workspace === 'selling' || workspace === 'shared') {
    const onboardingAction = getOnboardingAction(context, 'selling')
    if (onboardingAction) actions.push(onboardingAction)
    actions.push(...getSellerNextActions(context))
  }

  actions.push(...getWorkflowProjectionActions(context))

  const normalized = dedupeActions(actions)
  const withFallbackPassive = normalized.length ? normalized : getPassiveStatusActions({ ...context, actions: normalized })
  const finalActions = dedupeActions([...withFallbackPassive, ...getPassiveStatusActions({ ...context, actions: withFallbackPassive })])
  return sortNextActions(finalActions)
}
