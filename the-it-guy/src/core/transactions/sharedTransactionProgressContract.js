export const TRANSACTION_PROGRESS_VISIBILITY = Object.freeze({
  private: 'internal',
  professional: 'professional_shared',
  client: 'client_visible',
})

export const TRANSACTION_PROGRESS_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'waiting',
  'blocked',
  'completed',
])

const PROFESSIONAL_ROLES = new Set([
  'developer',
  'platform_admin',
  'internal_admin',
  'admin',
  'agent',
  'attorney',
  'conveyancer',
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'bond_originator',
  'firm_admin',
  'director_partner',
  'attorney_conveyancer',
  'candidate_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'principal',
  'director',
  'partner',
  'transaction_coordinator',
])

const CLIENT_ROLES = new Set(['client', 'buyer', 'seller'])

function text(value = '') {
  return String(value || '').trim()
}

function normalizeRole(value = '') {
  return text(value).toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
}

export function normalizeTransactionProgressVisibility(
  value,
  fallback = TRANSACTION_PROGRESS_VISIBILITY.private,
) {
  const normalized = text(value).toLowerCase()
  if (['private', 'internal', 'internal_only'].includes(normalized)) {
    return TRANSACTION_PROGRESS_VISIBILITY.private
  }
  if (['professional', 'professional_shared', 'shared', 'shared_role_players'].includes(normalized)) {
    return TRANSACTION_PROGRESS_VISIBILITY.professional
  }
  if (['client', 'client_visible'].includes(normalized)) {
    return TRANSACTION_PROGRESS_VISIBILITY.client
  }
  return fallback
}

export function normalizeTransactionProgressStatus(value, fallback = 'not_started') {
  const normalized = text(value).toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'pending' || normalized === 'active') return 'in_progress'
  if (normalized === 'waiting_on_party') return 'waiting'
  return TRANSACTION_PROGRESS_STATUSES.includes(normalized) ? normalized : fallback
}

export function canViewTransactionProgress({
  viewerRole,
  visibility,
  canViewPrivate = false,
} = {}) {
  const normalizedRole = normalizeRole(viewerRole)
  const normalizedVisibility = normalizeTransactionProgressVisibility(visibility)

  if (normalizedVisibility === TRANSACTION_PROGRESS_VISIBILITY.client) {
    return PROFESSIONAL_ROLES.has(normalizedRole) || CLIENT_ROLES.has(normalizedRole)
  }
  if (normalizedVisibility === TRANSACTION_PROGRESS_VISIBILITY.professional) {
    return PROFESSIONAL_ROLES.has(normalizedRole)
  }
  return Boolean(canViewPrivate)
}

export function createTransactionProgressDefinition({
  processKey,
  processLabel,
  stepKey,
  ownerRole,
  defaultVisibility = TRANSACTION_PROGRESS_VISIBILITY.professional,
  clientVisibleAllowed = true,
  professionalTitle,
  professionalDescription,
  clientTitle = '',
  clientDescription = '',
} = {}) {
  const definition = {
    processKey: text(processKey).toLowerCase(),
    processLabel: text(processLabel),
    stepKey: text(stepKey).toLowerCase(),
    ownerRole: normalizeRole(ownerRole),
    defaultVisibility: normalizeTransactionProgressVisibility(defaultVisibility),
    clientVisibleAllowed: clientVisibleAllowed !== false,
    professional: {
      title: text(professionalTitle),
      description: text(professionalDescription),
    },
    client: clientVisibleAllowed === false
      ? null
      : {
          title: text(clientTitle),
          description: text(clientDescription),
        },
  }

  const missing = []
  if (!definition.processKey) missing.push('processKey')
  if (!definition.processLabel) missing.push('processLabel')
  if (!definition.stepKey) missing.push('stepKey')
  if (!definition.ownerRole) missing.push('ownerRole')
  if (!definition.professional.title) missing.push('professionalTitle')
  if (!definition.professional.description) missing.push('professionalDescription')
  if (definition.clientVisibleAllowed && !definition.client?.title) missing.push('clientTitle')
  if (definition.clientVisibleAllowed && !definition.client?.description) missing.push('clientDescription')
  if (missing.length) {
    throw new Error(`Invalid transaction progress definition for ${definition.stepKey || 'unknown step'}: missing ${missing.join(', ')}.`)
  }

  return Object.freeze({
    ...definition,
    professional: Object.freeze(definition.professional),
    client: definition.client ? Object.freeze(definition.client) : null,
  })
}

export function buildTransactionProgressSnapshot(definition, {
  transactionId = null,
  status = 'not_started',
  visibility = null,
  blocked = false,
  safeExplanation = '',
  lastUpdated = null,
  expectedNextStep = '',
} = {}) {
  if (!definition?.processKey || !definition?.stepKey) {
    throw new Error('A valid transaction progress definition is required.')
  }

  const normalizedStatus = normalizeTransactionProgressStatus(blocked ? 'blocked' : status)
  const normalizedVisibility = normalizeTransactionProgressVisibility(
    visibility || definition.defaultVisibility,
    definition.defaultVisibility,
  )
  if (
    normalizedVisibility === TRANSACTION_PROGRESS_VISIBILITY.client &&
    definition.clientVisibleAllowed === false
  ) {
    throw new Error(`${definition.stepKey} cannot be published to clients.`)
  }

  return {
    transactionId: text(transactionId) || null,
    processKey: definition.processKey,
    processLabel: definition.processLabel,
    stepKey: definition.stepKey,
    status: normalizedStatus,
    responsibleRole: definition.ownerRole,
    blocked: normalizedStatus === 'blocked',
    safeExplanation: text(safeExplanation) || null,
    lastUpdated: text(lastUpdated) || null,
    expectedNextStep: text(expectedNextStep) || null,
    visibility: normalizedVisibility,
    professional: definition.professional,
    client: definition.client,
  }
}

export function presentTransactionProgress(snapshot, viewer = {}) {
  if (!canViewTransactionProgress({ ...viewer, visibility: snapshot?.visibility })) return null
  const normalizedRole = normalizeRole(viewer.viewerRole)
  const useClientWording = CLIENT_ROLES.has(normalizedRole)
  const wording = useClientWording ? snapshot.client : snapshot.professional
  if (!wording) return null

  return {
    transactionId: snapshot.transactionId,
    processKey: snapshot.processKey,
    processLabel: snapshot.processLabel,
    stepKey: snapshot.stepKey,
    title: wording.title,
    description: wording.description,
    status: snapshot.status,
    responsibleRole: snapshot.responsibleRole,
    blocked: snapshot.blocked,
    safeExplanation: snapshot.safeExplanation,
    lastUpdated: snapshot.lastUpdated || snapshot.updatedAt || null,
    expectedNextStep: snapshot.expectedNextStep,
  }
}
