const ACCESS_GRANTS_TABLE = 'transaction_document_access_grants'
const DOCUMENT_REQUEST_TARGETS_TABLE = 'document_request_targets'

const CLIENT_GROUP_ALIASES = Object.freeze({
  client: 'client',
  clients: 'client',
  buyer: 'buyer',
  purchaser: 'buyer',
  buyer_client: 'buyer',
  seller: 'seller',
  seller_client: 'seller',
  both: 'buyer_and_seller',
  buyer_seller: 'buyer_and_seller',
  buyer_and_seller: 'buyer_and_seller',
  both_buyer_and_seller: 'buyer_and_seller',
  all_clients: 'all_clients',
})

const PROFESSIONAL_GROUP_ALIASES = new Set([
  'professional_group',
  'professional_groups',
  'professionals',
  'professional_roleplayers',
  'roleplayers',
  'shared_role_players',
  'shared_roleplayers',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '_')
}

function normalizeArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function uniqueBy(items, getKey) {
  const seen = new Set()
  const output = []
  for (const item of items) {
    const key = getKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}

function readBoolean(source, keys = [], fallback = false) {
  if (!source || typeof source !== 'object') return fallback
  for (const key of keys) {
    if (!(key in source)) continue
    const value = source[key]
    if (typeof value === 'boolean') return value
    const normalized = normalizeKey(value)
    if (['true', 'yes', '1', 'on', 'enabled'].includes(normalized)) return true
    if (['false', 'no', '0', 'off', 'disabled'].includes(normalized)) return false
  }
  return fallback
}

function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const status = Number(error.status || error.statusCode || 0)
  const code = normalizeKey(error.code).toUpperCase()
  const message = normalizeKey(error.message || error.details || error.hint)
  const table = normalizeKey(tableName)
  if (message.includes('permission_denied')) return false
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    status === 404 ||
    message.includes('relation_does_not_exist') ||
    message.includes('schema_cache') ||
    (table && message.includes(table))
  )
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const code = normalizeKey(error.code).toUpperCase()
  const message = normalizeKey(error.message || error.details || error.hint)
  const column = normalizeKey(columnName)
  if (message.includes('permission_denied')) return false
  if (!['42703', 'PGRST204', 'PGRST116'].includes(code) && !message.includes('column')) return false
  return column ? message.includes(column) : true
}

function isMissingSchemaError(error) {
  if (!error) return false
  return isMissingTableError(error) || isMissingColumnError(error)
}

function isDuplicateError(error) {
  if (!error) return false
  const code = normalizeKey(error.code).toUpperCase()
  const message = normalizeKey(error.message || error.details || error.hint)
  return code === '23505' || message.includes('duplicate_key') || message.includes('unique_constraint')
}

function isActiveParticipant(row = {}) {
  const status = normalizeKey(row.status || (row.removed_at ? 'removed' : 'active'))
  return !row.removed_at && status !== 'removed' && row.can_view !== false
}

function normalizeLegalRoleForDocumentAccess(value) {
  const normalized = normalizeKey(value)
  if (['transfer', 'bond', 'cancellation'].includes(normalized)) return normalized
  if (normalized === 'transfer_attorney' || normalized === 'transferring_attorney') return 'transfer'
  if (normalized === 'bond_attorney') return 'bond'
  if (normalized === 'cancellation_attorney') return 'cancellation'
  return null
}

function normalizeRoleTypeForDocumentAccess(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return null
  if (normalized === 'transfer_attorney' || normalized === 'transferring_attorney') return 'attorney'
  if (normalized === 'bond_attorney' || normalized === 'cancellation_attorney') return 'attorney'
  if (normalized === 'bond') return 'bond_originator'
  if (normalized === 'conveyancer') return 'attorney'
  if (normalized === 'buyer_client') return 'buyer'
  if (normalized === 'seller_client') return 'seller'
  return normalized
}

function normalizeClientGroup(value) {
  const normalized = normalizeRoleTypeForDocumentAccess(value)
  return CLIENT_GROUP_ALIASES[normalized] || null
}

function isClientRoleScope(value) {
  return Boolean(normalizeClientGroup(value))
}

function withLabel(principal, label) {
  if (!principal) return null
  const normalizedLabel = normalizeText(label)
  return normalizedLabel ? { ...principal, label: normalizedLabel } : principal
}

function principalFromRoleValue(value, label = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return null
  if (PROFESSIONAL_GROUP_ALIASES.has(normalized)) {
    return withLabel({ principalType: 'professional_group' }, label || 'Professional roleplayers')
  }

  const clientGroup = normalizeClientGroup(normalized)
  if (clientGroup) {
    return withLabel({ principalType: 'client_group', clientGroup }, label || clientGroup)
  }

  const roleType = normalizeRoleTypeForDocumentAccess(normalized)
  if (!roleType || roleType === 'other') return null
  return withLabel(
    {
      principalType: 'role',
      roleType,
      legalRole: normalizeLegalRoleForDocumentAccess(normalized),
    },
    label || roleType,
  )
}

function principalFromTarget(target) {
  if (typeof target === 'string') return principalFromRoleValue(target)
  if (!target || typeof target !== 'object') return null

  const explicitType = normalizeKey(target.principalType || target.principal_type || target.targetType || target.target_type || target.type)
  const label = target.label || target.principalLabel || target.principal_label || target.displayName || target.display_name || ''

  if (target.professionalGroup || target.professional_group || explicitType === 'professional_group') {
    return withLabel({ principalType: 'professional_group' }, label || 'Professional roleplayers')
  }
  if (target.participantId || target.participant_id) {
    return withLabel(
      {
        principalType: 'participant',
        participantId: target.participantId || target.participant_id,
      },
      label,
    )
  }
  if (target.userId || target.user_id) {
    return withLabel(
      {
        principalType: 'user',
        userId: target.userId || target.user_id,
      },
      label,
    )
  }
  if (target.email) {
    const email = normalizeText(target.email).toLowerCase()
    return email ? withLabel({ principalType: 'email', email }, label || email) : null
  }
  if (target.clientGroup || target.client_group || explicitType === 'client_group') {
    const clientGroup = normalizeClientGroup(target.clientGroup || target.client_group || target.role || target.roleType || target.role_type)
    return clientGroup ? withLabel({ principalType: 'client_group', clientGroup }, label || clientGroup) : null
  }

  return principalFromRoleValue(
    target.roleType ||
      target.role_type ||
      target.role ||
      target.requestedFrom ||
      target.requested_from ||
      target.assignedToRole ||
      target.assigned_to_role,
    label,
  )
}

function principalKey(principal = {}) {
  const type = principal.principalType || principal.principal_type || principal.targetType || principal.target_type
  if (!type) return ''
  if (type === 'participant') return `${type}:${principal.participantId || principal.participant_id || ''}`
  if (type === 'user') return `${type}:${principal.userId || principal.user_id || ''}`
  if (type === 'email') return `${type}:${normalizeText(principal.email).toLowerCase()}`
  if (type === 'role') {
    return `${type}:${normalizeRoleTypeForDocumentAccess(principal.roleType || principal.role_type)}:${normalizeLegalRoleForDocumentAccess(principal.legalRole || principal.legal_role) || ''}`
  }
  if (type === 'client_group') return `${type}:${normalizeClientGroup(principal.clientGroup || principal.client_group)}`
  if (type === 'professional_group' || type === 'system') return type
  return ''
}

function principalToTargetRow({ transactionId, documentRequestId, principal, actorUserId = null, createdAt = null, metadata = {} }) {
  if (!transactionId || !documentRequestId || !principal) return null
  const now = createdAt || new Date().toISOString()
  const targetType = principal.principalType
  if (targetType === 'system') return null
  return {
    document_request_id: documentRequestId,
    transaction_id: transactionId,
    target_type: targetType,
    participant_id: principal.participantId || null,
    user_id: principal.userId || null,
    email: principal.email || null,
    role_type: targetType === 'role' ? normalizeRoleTypeForDocumentAccess(principal.roleType) : null,
    legal_role: targetType === 'role' ? normalizeLegalRoleForDocumentAccess(principal.legalRole || principal.roleType) : null,
    client_group: targetType === 'client_group' ? normalizeClientGroup(principal.clientGroup) : null,
    display_name: principal.label || null,
    can_view_request: true,
    can_upload: true,
    status: 'requested',
    metadata_json: metadata,
    created_by: actorUserId || null,
    created_at: now,
    updated_at: now,
  }
}

function principalToGrantRow({
  transactionId,
  resourceType,
  resourceId,
  principal,
  permissions = {},
  grantSource,
  sourceDetail,
  actorUserId = null,
  createdAt = null,
  metadata = {},
}) {
  if (!transactionId || !resourceType || !resourceId || !principal) return null
  const principalType = principal.principalType
  const canDownload = Boolean(permissions.canDownload)
  const canReview = Boolean(permissions.canReview)
  const canManage = Boolean(permissions.canManage)
  const canUpload = Boolean(permissions.canUpload)
  const canView = Boolean(permissions.canView || canDownload || canReview || canManage || canUpload)
  if (!canView && !canDownload && !canUpload && !canReview && !canManage) return null

  const now = createdAt || new Date().toISOString()
  return {
    transaction_id: transactionId,
    resource_type: resourceType,
    document_id: resourceType === 'document' ? resourceId : null,
    document_request_id: resourceType === 'document_request' ? resourceId : null,
    requirement_instance_id: resourceType === 'requirement_instance' ? resourceId : null,
    principal_type: principalType,
    participant_id: principalType === 'participant' ? principal.participantId || null : null,
    user_id: principalType === 'user' ? principal.userId || null : null,
    email: principalType === 'email' ? principal.email || null : null,
    role_type: principalType === 'role' ? normalizeRoleTypeForDocumentAccess(principal.roleType) : null,
    legal_role: principalType === 'role' ? normalizeLegalRoleForDocumentAccess(principal.legalRole || principal.roleType) : null,
    client_group: principalType === 'client_group' ? normalizeClientGroup(principal.clientGroup) : null,
    principal_label: principal.label || null,
    can_view: canView,
    can_download: canDownload,
    can_upload: canUpload,
    can_review: canReview,
    can_manage: canManage,
    grant_source: grantSource,
    source_detail: sourceDetail,
    metadata_json: metadata,
    granted_by: actorUserId || null,
    granted_at: now,
    created_at: now,
    updated_at: now,
  }
}

function targetKey(row = {}) {
  return [
    row.document_request_id,
    row.target_type,
    row.participant_id || '',
    row.user_id || '',
    normalizeText(row.email).toLowerCase(),
    normalizeRoleTypeForDocumentAccess(row.role_type) || '',
    normalizeLegalRoleForDocumentAccess(row.legal_role || row.role_type) || '',
    normalizeClientGroup(row.client_group) || '',
  ].join('|')
}

function grantKey(row = {}) {
  const resourceId = row.document_id || row.document_request_id || row.requirement_instance_id || ''
  return [
    row.resource_type,
    resourceId,
    row.principal_type,
    row.participant_id || '',
    row.user_id || '',
    normalizeText(row.email).toLowerCase(),
    normalizeRoleTypeForDocumentAccess(row.role_type) || '',
    normalizeLegalRoleForDocumentAccess(row.legal_role || row.role_type) || '',
    normalizeClientGroup(row.client_group) || '',
    Boolean(row.can_view),
    Boolean(row.can_download),
    Boolean(row.can_upload),
    Boolean(row.can_review),
    Boolean(row.can_manage),
    row.grant_source || '',
    row.source_detail || '',
  ].join('|')
}

function normalizeResourceType(value) {
  const normalized = normalizeKey(value)
  if (['document', 'transaction_document', 'uploaded_document'].includes(normalized)) return 'document'
  if (['document_request', 'request'].includes(normalized)) return 'document_request'
  if (['requirement_instance', 'document_requirement_instance', 'canonical_requirement'].includes(normalized)) {
    return 'requirement_instance'
  }
  return null
}

function resourceColumnForType(resourceType) {
  const normalized = normalizeResourceType(resourceType)
  if (normalized === 'document') return 'document_id'
  if (normalized === 'document_request') return 'document_request_id'
  if (normalized === 'requirement_instance') return 'requirement_instance_id'
  return ''
}

function isEditableAccessGrantRow(row = {}) {
  if (row.grant_source === 'manual') return true
  if (row.source_detail === 'manual_access') return true
  if (row.source_detail === 'selected_access') return true
  if (row.grant_source === 'upload_inheritance' && row.source_detail === 'document_request_upload') {
    return row.can_manage !== true
  }
  return false
}

function accessSelectionValueFromGrantRow(row = {}) {
  if (!row || row.revoked_at) return null
  if (row.can_download !== true && row.can_manage !== true) return null
  if (row.source_detail === 'requester') return null
  if (row.principal_type === 'professional_group') return 'professional_group'
  if (row.principal_type === 'role') return normalizeRoleTypeForDocumentAccess(row.role_type)
  if (row.principal_type === 'client_group') {
    const clientGroup = normalizeClientGroup(row.client_group)
    if (clientGroup === 'buyer_and_seller' || clientGroup === 'all_clients' || clientGroup === 'client') {
      return ['buyer', 'seller']
    }
    return clientGroup
  }
  return null
}

export function resolveDocumentAccessSelectionValues(grants = []) {
  return uniqueBy(
    grants
      .flatMap((grant) => normalizeArray(accessSelectionValueFromGrantRow(grant)))
      .filter(Boolean)
      .map((value) => ({ value })),
    (item) => item.value,
  ).map((item) => item.value)
}

function titleLabel(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function labelForAccessGrantPrincipal(row = {}) {
  const explicit = normalizeText(row.principal_label)
  if (explicit) return explicit
  if (row.source_detail === 'requester') return 'Requester'
  if (row.principal_type === 'professional_group') return 'Professional roleplayers'
  if (row.principal_type === 'client_group') {
    const group = normalizeClientGroup(row.client_group)
    if (group === 'buyer_and_seller' || group === 'all_clients' || group === 'client') return 'Buyer & seller'
    return titleLabel(group || 'Client')
  }
  if (row.principal_type === 'role') {
    const role = normalizeRoleTypeForDocumentAccess(row.role_type)
    const legalRole = normalizeLegalRoleForDocumentAccess(row.legal_role)
    if (role === 'attorney' && legalRole) return `${titleLabel(legalRole)} attorney`
    if (role === 'bond_originator') return 'Bond originator'
    return titleLabel(role)
  }
  if (row.principal_type === 'email') return row.email || 'Email recipient'
  if (row.principal_type === 'user') return 'Selected user'
  if (row.principal_type === 'participant') return 'Selected participant'
  return 'Selected audience'
}

function summarizeLabels(labels = [], fallback = '') {
  const unique = [...new Set(labels.map(normalizeText).filter(Boolean))]
  if (!unique.length) return fallback
  if (unique.length <= 3) return unique.join(', ')
  return `${unique.slice(0, 3).join(', ')} +${unique.length - 3}`
}

function timestampMs(value) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function accessGrantPermissionLabels(row = {}) {
  const labels = []
  if (row.can_manage === true) labels.push('Manage')
  if (row.can_download === true && row.can_manage !== true) labels.push('Download')
  if (row.can_upload === true && row.can_manage !== true) labels.push('Upload')
  if (row.can_review === true && row.can_manage !== true) labels.push('Review')
  if (row.can_view === true && !labels.length) labels.push('View')
  return [...new Set(labels)]
}

function accessGrantSourceLabel(row = {}) {
  const source = normalizeKey(row.source_detail || row.grant_source)
  if (source === 'requester') return 'Requester'
  if (source === 'request_target') return 'Request target'
  if (source === 'selected_access') return 'Selected by requester'
  if (source === 'manual_access') return 'Manual access'
  if (source === 'document_request_upload') return 'Inherited from request'
  if (source === 'canonical_requirement_upload') return 'Inherited from requirement'
  if (source === 'canonical_visible_to_roles') return 'Canonical policy'
  if (source === 'canonical_uploadable_by_roles') return 'Canonical upload policy'
  return titleLabel(source || 'Access grant')
}

export function summarizeDocumentAccessGrants(grants = []) {
  const active = normalizeArray(grants).filter((grant) => grant && !grant.revoked_at)
  const downloadLabels = []
  const uploadLabels = []
  const reviewLabels = []
  const manageLabels = []

  for (const grant of active) {
    const label = labelForAccessGrantPrincipal(grant)
    if (grant.can_manage === true) manageLabels.push(label)
    if (grant.can_download === true || grant.can_manage === true) downloadLabels.push(label)
    if (grant.can_upload === true || grant.can_manage === true) uploadLabels.push(label)
    if (grant.can_review === true || grant.can_manage === true) reviewLabels.push(label)
  }

  return {
    downloadLabels: [...new Set(downloadLabels)],
    uploadLabels: [...new Set(uploadLabels)],
    reviewLabels: [...new Set(reviewLabels)],
    manageLabels: [...new Set(manageLabels)],
    summary: summarizeLabels(downloadLabels, active.length ? 'No download access' : ''),
    uploadSummary: summarizeLabels(uploadLabels, ''),
    reviewSummary: summarizeLabels(reviewLabels, ''),
    manageSummary: summarizeLabels(manageLabels, ''),
  }
}

export function summarizeDocumentAccessGrantHistory(grants = []) {
  return normalizeArray(grants)
    .filter(Boolean)
    .map((grant) => {
      const revoked = Boolean(grant.revoked_at)
      const permissionLabels = accessGrantPermissionLabels(grant)
      const permissionSummary = permissionLabels.join(', ') || 'Access'
      const timestamp = revoked
        ? grant.revoked_at
        : grant.granted_at || grant.created_at || grant.updated_at || null
      return {
        id: grant.id || '',
        action: revoked ? 'revoked' : 'granted',
        actionLabel: revoked ? `Revoked ${permissionSummary.toLowerCase()}` : `Granted ${permissionSummary.toLowerCase()}`,
        principalLabel: labelForAccessGrantPrincipal(grant),
        permissionLabels,
        permissionSummary,
        source: grant.source_detail || grant.grant_source || '',
        sourceLabel: accessGrantSourceLabel(grant),
        timestamp,
        grantedAt: grant.granted_at || grant.created_at || null,
        grantedBy: grant.granted_by || null,
        revokedAt: grant.revoked_at || null,
        revokedBy: grant.revoked_by || null,
        revokedReason: grant.revoked_reason || '',
      }
    })
    .sort((left, right) => timestampMs(right.timestamp) - timestampMs(left.timestamp))
}

function resourceTransactionId(resource = {}) {
  return resource.transaction_id || resource.transactionId || null
}

function resourceIdForType(resource = {}) {
  return resource.id || resource.document_id || resource.documentId || resource.document_request_id || resource.documentRequestId || null
}

function participantMatchesActor(participant = {}, actor = {}) {
  const userId = actor.userId || actor.user_id || null
  const email = normalizeEmail(actor.email || actor.userEmail || actor.user_email)
  return Boolean(
    (userId && participant.user_id === userId) ||
      (email && normalizeEmail(participant.participant_email || participant.email) === email),
  )
}

function clientGroupMatchesRole(clientGroup = '', roleType = '') {
  const group = normalizeClientGroup(clientGroup)
  const role = normalizeRoleTypeForDocumentAccess(roleType)
  if (!group || !role) return false
  if (['client', 'all_clients', 'buyer_and_seller'].includes(group)) return ['client', 'buyer', 'seller'].includes(role)
  if (group === 'buyer') return ['client', 'buyer'].includes(role)
  if (group === 'seller') return role === 'seller'
  return false
}

function roleGrantMatchesParticipant(grant = {}, participant = {}) {
  const grantRole = normalizeRoleTypeForDocumentAccess(grant.role_type)
  const participantRole = normalizeRoleTypeForDocumentAccess(participant.role_type)
  if (!grantRole || grantRole !== participantRole) return false
  const grantLegalRole = normalizeLegalRoleForDocumentAccess(grant.legal_role)
  if (!grantLegalRole) return true
  return normalizeLegalRoleForDocumentAccess(participant.legal_role) === grantLegalRole
}

function grantMatchesActor(grant = {}, actor = {}, participantsByTransaction = new Map()) {
  const userId = actor.userId || actor.user_id || null
  const email = normalizeEmail(actor.email || actor.userEmail || actor.user_email)
  const participants = participantsByTransaction.get(grant.transaction_id) || []

  if (grant.principal_type === 'user') return Boolean(userId && grant.user_id === userId)
  if (grant.principal_type === 'email') return Boolean(email && normalizeEmail(grant.email) === email)
  if (grant.principal_type === 'participant') {
    return participants.some((participant) => participant.id === grant.participant_id)
  }
  if (grant.principal_type === 'role') {
    return participants.some((participant) => roleGrantMatchesParticipant(grant, participant))
  }
  if (grant.principal_type === 'client_group') {
    return participants.some((participant) => clientGroupMatchesRole(grant.client_group, participant.role_type))
  }
  if (grant.principal_type === 'professional_group') {
    return participants.some((participant) => !['client', 'buyer', 'seller'].includes(normalizeRoleTypeForDocumentAccess(participant.role_type)))
  }
  return false
}

function emptyAccess({ hasGrantRows = false, source = 'legacy_visibility' } = {}) {
  return {
    hasGrantRows,
    source,
    canView: false,
    canDownload: false,
    canUpload: false,
    canReview: false,
    canManage: false,
  }
}

function applyGrantPermission(access, grant = {}) {
  access.canManage = access.canManage || grant.can_manage === true
  access.canReview = access.canReview || grant.can_review === true || access.canManage
  access.canDownload = access.canDownload || grant.can_download === true || access.canManage
  access.canUpload = access.canUpload || grant.can_upload === true || access.canManage
  access.canView =
    access.canView ||
    grant.can_view === true ||
    access.canDownload ||
    access.canUpload ||
    access.canReview ||
    access.canManage
  return access
}

async function fetchCurrentActorParticipants(client, transactionIds = [], actor = {}) {
  const ids = [...new Set(transactionIds.filter(Boolean))]
  const userId = actor.userId || actor.user_id || null
  const email = normalizeEmail(actor.email || actor.userEmail || actor.user_email)
  if (!client || !ids.length || (!userId && !email)) return new Map()

  let query = await client
    .from('transaction_participants')
    .select('id, transaction_id, user_id, role_type, legal_role, participant_email, status, removed_at, can_view')
    .in('transaction_id', ids)

  if (query.error && (isMissingColumnError(query.error, 'participant_email') || isMissingColumnError(query.error, 'legal_role') || isMissingColumnError(query.error, 'can_view'))) {
    query = await client
      .from('transaction_participants')
      .select('id, transaction_id, user_id, role_type, status, removed_at')
      .in('transaction_id', ids)
  }

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingTableError(query.error, 'transaction_participants')) return new Map()
    throw query.error
  }

  const map = new Map()
  for (const participant of query.data || []) {
    if (!isActiveParticipant(participant) || !participantMatchesActor(participant, actor)) continue
    const transactionId = participant.transaction_id
    if (!map.has(transactionId)) map.set(transactionId, [])
    map.get(transactionId).push(participant)
  }
  return map
}

async function fetchActiveAccessGrants(client, columnName, ids = []) {
  const safeIds = [...new Set(ids.filter(Boolean))]
  if (!client || !columnName || !safeIds.length) {
    return { rows: [], available: true }
  }

  const query = await client
    .from(ACCESS_GRANTS_TABLE)
    .select(
      'transaction_id, resource_type, document_id, document_request_id, requirement_instance_id, principal_type, participant_id, user_id, email, role_type, legal_role, client_group, principal_label, can_view, can_download, can_upload, can_review, can_manage, grant_source, source_detail, expires_at, revoked_at',
    )
    .in(columnName, safeIds)
    .is('revoked_at', null)

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingTableError(query.error, ACCESS_GRANTS_TABLE)) {
      return { rows: [], available: false }
    }
    throw query.error
  }

  const now = Date.now()
  return {
    rows: (query.data || []).filter((grant) => {
      if (!grant.expires_at) return true
      const expiry = new Date(grant.expires_at).getTime()
      return Number.isFinite(expiry) ? expiry > now : true
    }),
    available: true,
  }
}

function requestedClientGroupForRequest(request = {}) {
  const requestedFrom = request.requestedFrom || request.requested_from || request.assignedToRole || request.assigned_to_role
  return normalizeClientGroup(requestedFrom) || (isClientRoleScope(requestedFrom) ? 'client' : null)
}

function buildDefaultRequestTargetPrincipal(request = {}) {
  if (request.assignedToUserId || request.assigned_to_user_id) {
    return {
      principalType: 'user',
      userId: request.assignedToUserId || request.assigned_to_user_id,
      label: request.assignedToUserLabel || request.assigned_to_user_label || null,
    }
  }
  return principalFromRoleValue(
    request.requestedFrom || request.requested_from || request.assignedToRole || request.assigned_to_role || 'buyer',
  )
}

function collectRequestTargetPrincipals(request = {}) {
  const rawTargets = [
    ...normalizeArray(request.targets),
    ...normalizeArray(request.targetRecipients),
    ...normalizeArray(request.target_recipients),
    ...normalizeArray(request.requestTargets),
    ...normalizeArray(request.request_targets),
    ...normalizeArray(request.recipients),
  ]

  for (const participantId of normalizeArray(request.targetParticipantIds || request.target_participant_ids)) {
    rawTargets.push({ participantId })
  }
  for (const userId of normalizeArray(request.targetUserIds || request.target_user_ids)) {
    rawTargets.push({ userId })
  }
  for (const email of normalizeArray(request.targetEmails || request.target_emails)) {
    rawTargets.push({ email })
  }
  for (const role of normalizeArray(request.targetRoles || request.target_roles)) {
    rawTargets.push(role)
  }

  const principals = rawTargets.map(principalFromTarget).filter(Boolean)
  if (!principals.length) {
    const fallback = buildDefaultRequestTargetPrincipal(request)
    if (fallback) principals.push(fallback)
  }
  return uniqueBy(principals, principalKey)
}

function accessValuesFromRequest(request = {}) {
  const values = [
    ...normalizeArray(request.accessGrants),
    ...normalizeArray(request.access_grants),
    ...normalizeArray(request.permissions),
    ...normalizeArray(request.documentAccess),
    ...normalizeArray(request.document_access),
    ...normalizeArray(request.visibleTo),
    ...normalizeArray(request.visible_to),
    ...normalizeArray(request.visibleToRoles),
    ...normalizeArray(request.visible_to_roles),
    ...normalizeArray(request.viewerRoles),
    ...normalizeArray(request.viewer_roles),
    ...normalizeArray(request.viewers),
    ...normalizeArray(request.downloaders),
  ]

  if (values.length) return values

  const visibility = normalizeKey(request.visibility || request.visibility_scope)
  if (visibility === 'shared_role_players' || visibility === 'shared') return ['professional_group']
  if (visibility === 'client_visible' || visibility === 'client') {
    const clientGroup = requestedClientGroupForRequest(request)
    return clientGroup ? [{ clientGroup }] : ['client']
  }
  return []
}

function selectedPermissionFlags(value = {}) {
  const isObject = value && typeof value === 'object' && !Array.isArray(value)
  const defaultDownload = !isObject || !('canDownload' in value || 'can_download' in value || 'download' in value)
  const canDownload = readBoolean(value, ['canDownload', 'can_download', 'download'], defaultDownload)
  return {
    canView: readBoolean(value, ['canView', 'can_view', 'view'], true) || canDownload,
    canDownload,
    canUpload: readBoolean(value, ['canUpload', 'can_upload', 'upload'], false),
    canReview: readBoolean(value, ['canReview', 'can_review', 'review'], false),
    canManage: readBoolean(value, ['canManage', 'can_manage', 'manage'], false),
  }
}

function collectSelectedAccessEntries(request = {}) {
  return accessValuesFromRequest(request)
    .map((value) => ({
      principal: principalFromTarget(value),
      permissions: selectedPermissionFlags(value),
    }))
    .filter((entry) => entry.principal)
}

function buildDocumentRequestPermissionRows({ transactionId, createdRequest = {}, sourceRequest = {}, actor = {}, createdAt = null }) {
  const documentRequestId = createdRequest.id || createdRequest.document_request_id || sourceRequest.id || null
  if (!transactionId || !documentRequestId) return { targetRows: [], grantRows: [] }

  const mergedRequest = {
    ...sourceRequest,
    ...createdRequest,
    requestedFrom: sourceRequest.requestedFrom || sourceRequest.requested_from || createdRequest.requestedFrom,
    requested_from: sourceRequest.requested_from || sourceRequest.requestedFrom || createdRequest.requested_from,
    assignedToRole: sourceRequest.assignedToRole || sourceRequest.assigned_to_role || createdRequest.assignedToRole,
    assigned_to_role: sourceRequest.assigned_to_role || sourceRequest.assignedToRole || createdRequest.assigned_to_role,
    visibility: sourceRequest.visibility || sourceRequest.visibility_scope || createdRequest.visibility,
    visibility_scope: sourceRequest.visibility_scope || sourceRequest.visibility || createdRequest.visibility_scope,
    assignedToUserId: sourceRequest.assignedToUserId || sourceRequest.assigned_to_user_id || createdRequest.assignedToUserId,
    assigned_to_user_id: sourceRequest.assigned_to_user_id || sourceRequest.assignedToUserId || createdRequest.assigned_to_user_id,
  }
  const actorUserId = actor.userId || actor.user_id || createdRequest.createdBy || sourceRequest.created_by || null
  const targetPrincipals = collectRequestTargetPrincipals(mergedRequest)
  const accessEntries = collectSelectedAccessEntries(mergedRequest)
  const targetRows = targetPrincipals
    .map((principal) =>
      principalToTargetRow({
        transactionId,
        documentRequestId,
        principal,
        actorUserId,
        createdAt,
        metadata: { source: 'additional_document_request' },
      }),
    )
    .filter(Boolean)

  const grantRows = []
  if (actorUserId) {
    grantRows.push(
      principalToGrantRow({
        transactionId,
        resourceType: 'document_request',
        resourceId: documentRequestId,
        principal: { principalType: 'user', userId: actorUserId, label: 'Requester' },
        permissions: { canView: true, canDownload: true, canManage: true },
        grantSource: 'document_request',
        sourceDetail: 'requester',
        actorUserId,
        createdAt,
        metadata: { source: 'additional_document_request' },
      }),
    )
  }

  for (const principal of targetPrincipals) {
    grantRows.push(
      principalToGrantRow({
        transactionId,
        resourceType: 'document_request',
        resourceId: documentRequestId,
        principal,
        permissions: { canView: true, canUpload: true },
        grantSource: 'document_request',
        sourceDetail: 'request_target',
        actorUserId,
        createdAt,
        metadata: { source: 'additional_document_request' },
      }),
    )
  }

  for (const { principal, permissions } of accessEntries) {
    grantRows.push(
      principalToGrantRow({
        transactionId,
        resourceType: 'document_request',
        resourceId: documentRequestId,
        principal,
        permissions,
        grantSource: 'document_request',
        sourceDetail: 'selected_access',
        actorUserId,
        createdAt,
        metadata: { source: 'additional_document_request' },
      }),
    )
  }

  return {
    targetRows: uniqueBy(targetRows, targetKey),
    grantRows: uniqueBy(grantRows.filter(Boolean), grantKey),
  }
}

async function filterExistingTargetRows(client, rows = []) {
  if (!rows.length) return { rows, skipped: false }
  const ids = [...new Set(rows.map((row) => row.document_request_id).filter(Boolean))]
  const result = await client
    .from(DOCUMENT_REQUEST_TARGETS_TABLE)
    .select('document_request_id, target_type, participant_id, user_id, email, role_type, legal_role, client_group')
    .in('document_request_id', ids)

  if (result.error) {
    if (isMissingSchemaError(result.error) || isMissingTableError(result.error, DOCUMENT_REQUEST_TARGETS_TABLE)) {
      return { rows: [], skipped: true }
    }
    throw result.error
  }

  const existing = new Set((result.data || []).map(targetKey))
  return { rows: rows.filter((row) => !existing.has(targetKey(row))), skipped: false }
}

async function filterExistingGrantRows(client, rows = [], resourceColumn = '') {
  if (!rows.length) return { rows, skipped: false }
  const ids = [...new Set(rows.map((row) => row[resourceColumn]).filter(Boolean))]
  if (!ids.length) return { rows: [], skipped: false }

  const result = await client
    .from(ACCESS_GRANTS_TABLE)
    .select(
      'resource_type, document_id, document_request_id, requirement_instance_id, principal_type, participant_id, user_id, email, role_type, legal_role, client_group, can_view, can_download, can_upload, can_review, can_manage, grant_source, source_detail',
    )
    .in(resourceColumn, ids)
    .is('revoked_at', null)

  if (result.error) {
    if (isMissingSchemaError(result.error) || isMissingTableError(result.error, ACCESS_GRANTS_TABLE)) {
      return { rows: [], skipped: true }
    }
    throw result.error
  }

  const existing = new Set((result.data || []).map(grantKey))
  return { rows: rows.filter((row) => !existing.has(grantKey(row))), skipped: false }
}

async function insertRowsIfPossible(client, tableName, rows = []) {
  if (!rows.length) return { insertedCount: 0, skipped: false }
  const result = await client.from(tableName).insert(rows)
  if (result.error) {
    if (isMissingSchemaError(result.error) || isMissingTableError(result.error, tableName)) {
      return { insertedCount: 0, skipped: true }
    }
    if (isDuplicateError(result.error)) {
      return { insertedCount: 0, skipped: false, duplicateSkipped: true }
    }
    throw result.error
  }
  return { insertedCount: rows.length, skipped: false }
}

export async function fetchTransactionDocumentAccessGrants({
  client,
  transactionId,
  resourceType,
  resourceId,
  includeRevoked = false,
} = {}) {
  const normalizedResourceType = normalizeResourceType(resourceType)
  const resourceColumn = resourceColumnForType(normalizedResourceType)
  if (!client || !transactionId || !normalizedResourceType || !resourceColumn || !resourceId) {
    return { rows: [], available: true }
  }

  let query = client
    .from(ACCESS_GRANTS_TABLE)
    .select(
      'id, transaction_id, resource_type, document_id, document_request_id, requirement_instance_id, principal_type, participant_id, user_id, email, role_type, legal_role, client_group, principal_label, can_view, can_download, can_upload, can_review, can_manage, grant_source, source_detail, expires_at, revoked_at, revoked_by, revoked_reason, granted_by, granted_at, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .eq('resource_type', normalizedResourceType)
    .eq(resourceColumn, resourceId)

  if (!includeRevoked) {
    query = query.is('revoked_at', null)
  }

  const result = await query

  if (result.error) {
    if (isMissingSchemaError(result.error) || isMissingTableError(result.error, ACCESS_GRANTS_TABLE)) {
      return { rows: [], available: false }
    }
    throw result.error
  }

  const now = Date.now()
  return {
    rows: (result.data || []).filter((grant) => {
      if (includeRevoked && grant.revoked_at) return true
      if (!grant.expires_at) return true
      const expiry = new Date(grant.expires_at).getTime()
      return Number.isFinite(expiry) ? expiry > now : true
    }),
    available: true,
  }
}

export async function replaceTransactionDocumentManualAccessGrants({
  client,
  transactionId,
  resourceType,
  resourceId,
  accessGrants = [],
  actorUserId = null,
  createdAt = null,
  revokedReason = 'manual_access_replaced',
} = {}) {
  const normalizedResourceType = normalizeResourceType(resourceType)
  const resourceColumn = resourceColumnForType(normalizedResourceType)
  if (!client || !transactionId || !normalizedResourceType || !resourceColumn || !resourceId) {
    return { grantCount: 0, revokedCount: 0, skipped: false }
  }

  const now = createdAt || new Date().toISOString()
  const active = await fetchTransactionDocumentAccessGrants({
    client,
    transactionId,
    resourceType: normalizedResourceType,
    resourceId,
  })
  if (!active.available) {
    return { grantCount: 0, revokedCount: 0, skipped: true }
  }

  const editableIds = active.rows
    .filter((row) => isEditableAccessGrantRow(row))
    .map((row) => row.id)
    .filter(Boolean)

  let revokedCount = 0
  if (editableIds.length) {
    const revoke = await client
      .from(ACCESS_GRANTS_TABLE)
      .update({
        revoked_at: now,
        revoked_by: actorUserId || null,
        revoked_reason: revokedReason,
        updated_at: now,
      })
      .in('id', editableIds)

    if (revoke.error) {
      if (isMissingSchemaError(revoke.error) || isMissingTableError(revoke.error, ACCESS_GRANTS_TABLE)) {
        return { grantCount: 0, revokedCount: 0, skipped: true }
      }
      throw revoke.error
    }
    revokedCount = editableIds.length
  }

  const grantRows = uniqueBy(
    accessGrants
      .map((grant) => ({
        principal: principalFromTarget(grant),
        permissions: selectedPermissionFlags(grant),
      }))
      .filter((entry) => entry.principal)
      .map(({ principal, permissions }) =>
        principalToGrantRow({
          transactionId,
          resourceType: normalizedResourceType,
          resourceId,
          principal,
          permissions,
          grantSource: 'manual',
          sourceDetail: 'manual_access',
          actorUserId,
          createdAt: now,
          metadata: { source: 'manual_access_update' },
        }),
      )
      .filter(Boolean),
    grantKey,
  )

  const filtered = await filterExistingGrantRows(client, grantRows, resourceColumn)
  const insert = await insertRowsIfPossible(client, ACCESS_GRANTS_TABLE, filtered.rows)

  return {
    grantCount: insert.insertedCount,
    revokedCount,
    skipped: filtered.skipped || insert.skipped,
  }
}

async function loadRequirementInstanceForAccessSync(client, requirementInstanceId) {
  const query = await client
    .from('document_requirement_instances')
    .select('id, transaction_id, context_type, context_id, requested_from_role, visible_to_roles, uploadable_by_roles, created_at')
    .eq('id', requirementInstanceId)
    .maybeSingle()

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingTableError(query.error, 'document_requirement_instances')) {
      return null
    }
    throw query.error
  }
  return query.data || null
}

async function fetchActiveRequirementAccessGrantRows(client, requirementInstanceId) {
  const query = await client
    .from(ACCESS_GRANTS_TABLE)
    .select('*')
    .eq('requirement_instance_id', requirementInstanceId)
    .is('revoked_at', null)

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingTableError(query.error, ACCESS_GRANTS_TABLE)) {
      return { rows: [], skipped: true }
    }
    throw query.error
  }

  return { rows: query.data || [], skipped: false }
}

export async function syncDocumentRequestPermissionRows({
  client,
  transactionId,
  createdRequests = [],
  sourceRequests = [],
  actor = {},
  createdAt = null,
} = {}) {
  if (!client || !transactionId || !createdRequests.length) {
    return { targetCount: 0, grantCount: 0, skipped: false }
  }

  const built = createdRequests.map((createdRequest, index) =>
    buildDocumentRequestPermissionRows({
      transactionId,
      createdRequest,
      sourceRequest: sourceRequests[index] || {},
      actor,
      createdAt,
    }),
  )
  const targetRows = uniqueBy(built.flatMap((item) => item.targetRows), targetKey)
  const grantRows = uniqueBy(built.flatMap((item) => item.grantRows), grantKey)
  const filteredTargets = await filterExistingTargetRows(client, targetRows)
  const filteredGrants = await filterExistingGrantRows(client, grantRows, 'document_request_id')
  const targetInsert = await insertRowsIfPossible(client, DOCUMENT_REQUEST_TARGETS_TABLE, filteredTargets.rows)
  const grantInsert = await insertRowsIfPossible(client, ACCESS_GRANTS_TABLE, filteredGrants.rows)

  return {
    targetCount: targetInsert.insertedCount,
    grantCount: grantInsert.insertedCount,
    skipped: filteredTargets.skipped || filteredGrants.skipped || targetInsert.skipped || grantInsert.skipped,
  }
}

function shouldInheritRequestGrantToDocument(grant = {}) {
  if (grant.source_detail === 'request_target' && !grant.can_download && !grant.can_review && !grant.can_manage) {
    return false
  }
  return Boolean(grant.can_download || grant.can_review || grant.can_manage || grant.source_detail === 'selected_access' || grant.source_detail === 'requester')
}

function shouldInheritRequirementGrantToDocument(grant = {}) {
  if (grant.source_detail === 'canonical_uploadable_by_roles' && !grant.can_download && !grant.can_review && !grant.can_manage) {
    return false
  }
  return Boolean(grant.can_download || grant.can_review || grant.can_manage || grant.source_detail === 'canonical_visible_to_roles')
}

function principalFromGrantRow(grant = {}) {
  if (!grant.principal_type) return null
  return {
    principalType: grant.principal_type,
    participantId: grant.participant_id || null,
    userId: grant.user_id || null,
    email: grant.email || null,
    roleType: grant.role_type || null,
    legalRole: grant.legal_role || null,
    clientGroup: grant.client_group || null,
    label: grant.principal_label || null,
  }
}

function inheritedDocumentGrantRow({ transactionId, documentId, grant = {}, sourceDetail, actorUserId = null, createdAt = null, metadata = {} }) {
  return principalToGrantRow({
    transactionId,
    resourceType: 'document',
    resourceId: documentId,
    principal: principalFromGrantRow(grant),
    permissions: {
      canView: true,
      canDownload: Boolean(grant.can_download),
      canReview: Boolean(grant.can_review),
      canManage: Boolean(grant.can_manage),
    },
    grantSource: 'upload_inheritance',
    sourceDetail,
    actorUserId: actorUserId || grant.granted_by || null,
    createdAt,
    metadata,
  })
}

export async function syncDocumentAccessGrantsFromRequest({
  client,
  transactionId,
  documentId,
  documentRequestId,
  actorUserId = null,
  createdAt = null,
} = {}) {
  if (!client || !transactionId || !documentId || !documentRequestId) {
    return { grantCount: 0, targetCount: 0, skipped: false }
  }

  const query = await client
    .from(ACCESS_GRANTS_TABLE)
    .select('*')
    .eq('document_request_id', documentRequestId)
    .is('revoked_at', null)

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingTableError(query.error, ACCESS_GRANTS_TABLE)) {
      return { grantCount: 0, targetCount: 0, skipped: true }
    }
    throw query.error
  }

  const grantRows = uniqueBy(
    (query.data || [])
      .filter(shouldInheritRequestGrantToDocument)
      .map((grant) =>
        inheritedDocumentGrantRow({
          transactionId,
          documentId,
          grant,
          sourceDetail: 'document_request_upload',
          actorUserId,
          createdAt,
          metadata: { document_request_id: documentRequestId },
        }),
      )
      .filter(Boolean),
    grantKey,
  )
  const filteredGrants = await filterExistingGrantRows(client, grantRows, 'document_id')
  const grantInsert = await insertRowsIfPossible(client, ACCESS_GRANTS_TABLE, filteredGrants.rows)
  const now = createdAt || new Date().toISOString()
  const targetUpdate = await client
    .from(DOCUMENT_REQUEST_TARGETS_TABLE)
    .update({
      status: 'uploaded',
      completed_document_id: documentId,
      completed_at: now,
      updated_at: now,
    })
    .eq('document_request_id', documentRequestId)

  if (targetUpdate.error && !(isMissingSchemaError(targetUpdate.error) || isMissingTableError(targetUpdate.error, DOCUMENT_REQUEST_TARGETS_TABLE))) {
    throw targetUpdate.error
  }

  return {
    grantCount: grantInsert.insertedCount,
    targetCount: targetUpdate.error ? 0 : 1,
    skipped: grantInsert.skipped || Boolean(targetUpdate.error),
  }
}

export async function syncDocumentAccessGrantsFromRequirement({
  client,
  transactionId,
  documentId,
  requirementInstanceId,
  actorUserId = null,
  createdAt = null,
} = {}) {
  if (!client || !transactionId || !documentId || !requirementInstanceId) {
    return { grantCount: 0, skipped: false }
  }

  let query = await fetchActiveRequirementAccessGrantRows(client, requirementInstanceId)
  if (query.skipped) {
    return { grantCount: 0, skipped: true }
  }
  if (!query.rows.length) {
    const requirement = await loadRequirementInstanceForAccessSync(client, requirementInstanceId)
    if (requirement) {
      await syncCanonicalRequirementAccessGrants({ client, instances: [requirement] })
      query = await fetchActiveRequirementAccessGrantRows(client, requirementInstanceId)
    }
  }
  if (query.skipped) {
    return { grantCount: 0, skipped: true }
  }

  const grantRows = uniqueBy(
    (query.rows || [])
      .filter(shouldInheritRequirementGrantToDocument)
      .map((grant) =>
        inheritedDocumentGrantRow({
          transactionId,
          documentId,
          grant,
          sourceDetail: 'canonical_requirement_upload',
          actorUserId,
          createdAt,
          metadata: { requirement_instance_id: requirementInstanceId },
        }),
      )
      .filter(Boolean),
    grantKey,
  )
  const filteredGrants = await filterExistingGrantRows(client, grantRows, 'document_id')
  const grantInsert = await insertRowsIfPossible(client, ACCESS_GRANTS_TABLE, filteredGrants.rows)
  return {
    grantCount: grantInsert.insertedCount,
    skipped: filteredGrants.skipped || grantInsert.skipped,
  }
}

function roleValuesFromRequirementInstance(instance = {}) {
  const visible = normalizeArray(instance.visible_to_roles || instance.visibleToRoles)
  const uploadable = normalizeArray(instance.uploadable_by_roles || instance.uploadableByRoles)
  const requestedFrom = normalizeText(instance.requested_from_role || instance.requestedFromRole)
  return {
    visible,
    uploadable: uploadable.length ? uploadable : requestedFrom ? [requestedFrom] : [],
  }
}

function transactionIdFromRequirementInstance(instance = {}) {
  return instance.transaction_id || (instance.context_type === 'transaction' ? instance.context_id : null)
}

function buildRequirementAccessRows(instance = {}) {
  const transactionId = transactionIdFromRequirementInstance(instance)
  const requirementInstanceId = instance.id || instance.requirement_instance_id || null
  if (!transactionId || !requirementInstanceId) return []

  const { visible, uploadable } = roleValuesFromRequirementInstance(instance)
  const rows = []
  const createdAt = instance.created_at || new Date().toISOString()

  for (const value of visible) {
    const principal = principalFromRoleValue(value)
    rows.push(
      principalToGrantRow({
        transactionId,
        resourceType: 'requirement_instance',
        resourceId: requirementInstanceId,
        principal,
        permissions: { canView: true, canDownload: true },
        grantSource: 'requirement_policy',
        sourceDetail: 'canonical_visible_to_roles',
        createdAt,
        metadata: { source: 'canonical_requirement_policy' },
      }),
    )
  }

  for (const value of uploadable) {
    const principal = principalFromRoleValue(value)
    rows.push(
      principalToGrantRow({
        transactionId,
        resourceType: 'requirement_instance',
        resourceId: requirementInstanceId,
        principal,
        permissions: { canView: true, canUpload: true },
        grantSource: 'requirement_policy',
        sourceDetail: 'canonical_uploadable_by_roles',
        createdAt,
        metadata: { source: 'canonical_requirement_policy' },
      }),
    )
  }

  return uniqueBy(rows.filter(Boolean), grantKey)
}

export async function syncCanonicalRequirementAccessGrants({ client, instances = [] } = {}) {
  if (!client || !instances.length) {
    return { grantCount: 0, skipped: false }
  }

  const grantRows = uniqueBy(instances.flatMap(buildRequirementAccessRows), grantKey)
  const filteredGrants = await filterExistingGrantRows(client, grantRows, 'requirement_instance_id')
  const grantInsert = await insertRowsIfPossible(client, ACCESS_GRANTS_TABLE, filteredGrants.rows)
  return {
    grantCount: grantInsert.insertedCount,
    skipped: filteredGrants.skipped || grantInsert.skipped,
  }
}

function resolveAccessForResources({ resources = [], grants = [], resourceColumn = '', actor = {}, participantsByTransaction = new Map() } = {}) {
  const byResourceId = new Map()
  const grantRowsByResourceId = new Map()

  for (const grant of grants) {
    const resourceId = grant[resourceColumn]
    if (!resourceId) continue
    if (!grantRowsByResourceId.has(resourceId)) grantRowsByResourceId.set(resourceId, [])
    grantRowsByResourceId.get(resourceId).push(grant)
  }

  for (const resource of resources) {
    const resourceId = resourceIdForType(resource)
    if (!resourceId) continue
    const grantRows = grantRowsByResourceId.get(resourceId) || []
    const access = emptyAccess({
      hasGrantRows: grantRows.length > 0,
      source: grantRows.length > 0 ? 'grant' : 'legacy_visibility',
    })

    for (const grant of grantRows) {
      if (!grantMatchesActor(grant, actor, participantsByTransaction)) continue
      applyGrantPermission(access, grant)
    }

    if (access.canManage) {
      const summary = summarizeDocumentAccessGrants(grantRows)
      access.summary = summary.summary
      access.downloadLabels = summary.downloadLabels
      access.uploadSummary = summary.uploadSummary
      access.manageSummary = summary.manageSummary
    }

    byResourceId.set(resourceId, access)
  }

  return byResourceId
}

export async function resolveTransactionDocumentResourceAccess({
  client,
  documents = [],
  documentRequests = [],
  actor = {},
} = {}) {
  const normalizedDocuments = normalizeArray(documents).filter(Boolean)
  const normalizedRequests = normalizeArray(documentRequests).filter(Boolean)
  const actorUserId = actor.userId || actor.user_id || null
  const actorEmail = normalizeEmail(actor.email || actor.userEmail || actor.user_email)

  if (!client || (!normalizedDocuments.length && !normalizedRequests.length) || (!actorUserId && !actorEmail)) {
    return {
      available: false,
      documents: new Map(),
      documentRequests: new Map(),
    }
  }

  const documentIds = normalizedDocuments.map(resourceIdForType).filter(Boolean)
  const requestIds = normalizedRequests.map(resourceIdForType).filter(Boolean)
  const transactionIds = [
    ...normalizedDocuments.map(resourceTransactionId),
    ...normalizedRequests.map(resourceTransactionId),
  ].filter(Boolean)

  const [documentGrants, requestGrants, participantsByTransaction] = await Promise.all([
    fetchActiveAccessGrants(client, 'document_id', documentIds),
    fetchActiveAccessGrants(client, 'document_request_id', requestIds),
    fetchCurrentActorParticipants(client, transactionIds, actor),
  ])

  const available =
    (!documentIds.length || documentGrants.available) &&
    (!requestIds.length || requestGrants.available)
  if (!available) {
    return {
      available: false,
      documents: new Map(),
      documentRequests: new Map(),
    }
  }

  return {
    available: true,
    documents: resolveAccessForResources({
      resources: normalizedDocuments,
      grants: documentGrants.rows,
      resourceColumn: 'document_id',
      actor,
      participantsByTransaction,
    }),
    documentRequests: resolveAccessForResources({
      resources: normalizedRequests,
      grants: requestGrants.rows,
      resourceColumn: 'document_request_id',
      actor,
      participantsByTransaction,
    }),
  }
}
