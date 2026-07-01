import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { BOND_PARTNER_TYPES } from './bondPartnerManagementService'

export const BOND_PARTNER_PORTAL_EVENTS = Object.freeze({
  login: 'PARTNER_LOGIN',
  documentUploaded: 'PARTNER_DOCUMENT_UPLOADED',
  documentDownloaded: 'PARTNER_DOCUMENT_DOWNLOADED',
  commentAdded: 'PARTNER_COMMENT_ADDED',
  supportCreated: 'PARTNER_SUPPORT_CREATED',
})

export const BOND_PARTNER_SUPPORT_STATUSES = Object.freeze({
  open: 'open',
  pending: 'pending',
  resolved: 'resolved',
})

export const PARTNER_PORTAL_TABLES = Object.freeze({
  assignments: 'transaction_partner_assignments',
  documents: 'partner_portal_uploads',
  documentRequests: 'partner_portal_document_requests',
  comments: 'partner_portal_comments',
  supportTickets: 'partner_portal_support_tickets',
  audit: 'partner_portal_audit_logs',
  notifications: 'partner_portal_notifications',
  invites: 'invites',
  transactionPartnerInvitations: 'transaction_partner_invitations',
  organisations: 'organisations',
  profiles: 'profiles',
  transactions: 'transactions',
})

const ACTIVE_APPLICATION_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress']
const APPROVED_APPLICATION_TERMS = ['approved', 'grant', 'accepted', 'registered']
const DECLINED_APPLICATION_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_APPLICATION_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const FINANCE_STAGE_ORDER = [
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Review' },
  { key: 'submission', label: 'Submission' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'approval', label: 'Approval' },
  { key: 'instruction', label: 'Instruction' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function requireClient(options = {}) {
  if (options.client) return options.client
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for the partner portal.')
  }
  return supabase
}

function isMissingTableError(error, table = '') {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return String(error?.code || '').toUpperCase() === '42P01' || (table && message.includes(table.toLowerCase()))
}

function isMissingColumnError(error, column = '') {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return String(error?.code || '').toUpperCase() === '42703' || (column && message.includes(column.toLowerCase()))
}

async function maybeSingle(query, { missingOk = false, table = '' } = {}) {
  const result = await query
  if (result.error) {
    if (missingOk && (isMissingTableError(result.error, table) || isMissingColumnError(result.error))) return null
    throw result.error
  }
  return result.data || null
}

async function listRows(query, { missingOk = false, table = '' } = {}) {
  const result = await query
  if (result.error) {
    if (missingOk && (isMissingTableError(result.error, table) || isMissingColumnError(result.error))) return []
    throw result.error
  }
  return Array.isArray(result.data) ? result.data : []
}

async function insertRow(query, { missingOk = false, table = '' } = {}) {
  const result = await query
  if (result.error) {
    if (missingOk && (isMissingTableError(result.error, table) || isMissingColumnError(result.error))) return null
    throw result.error
  }
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null
}

function createPermissionError() {
  const error = new Error('Partner portal access is not permitted for this record.')
  error.code = 'permission_denied'
  return error
}

function isMissingRpcError(error, functionName = '') {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return ['42883', 'PGRST202'].includes(String(error?.code || '').toUpperCase()) || (functionName && message.includes(functionName.toLowerCase()))
}

function getSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.assignment_status || ''}`)
}

function isActiveApplication(row = {}) {
  const signal = getSignal(row)
  if (row.active === false || row.is_active === false) return false
  if (['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'lost'].some((term) => signal.includes(term))) return false
  if (!signal) return true
  return ACTIVE_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  const signal = getSignal(row)
  return APPROVED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isDeclinedApplication(row = {}) {
  const signal = getSignal(row)
  return DECLINED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isSubmittedApplication(row = {}) {
  const signal = getSignal(row)
  return SUBMITTED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isPendingDocuments(row = {}) {
  const signal = getSignal(row)
  return signal.includes('doc') || signal.includes('payslip') || signal.includes('statement') || normalizeLower(row.nextAction).includes('document')
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function getDateValue(row = {}) {
  return normalizeText(row.lastActivityAt || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.transaction?.updated_at || row.transaction?.created_at)
}

function getLeadDays(row = {}) {
  const created = new Date(row.createdAt || row.created_at || row.transaction?.created_at || '')
  const updated = new Date(getDateValue(row))
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) return 0
  return Math.max(1, Math.round((updated.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)))
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function normalizePartner(row = {}) {
  return {
    ...row,
    id: normalizeText(row.id || row.partnerId || row.partner_id || row.organisationId || row.organisation_id),
    organisationId: normalizeText(row.organisationId || row.organisation_id || row.id),
    name: normalizeText(row.name || row.display_name || row.displayName || row.partnerName || row.partner_name) || 'Partner',
    type: normalizeLower(row.type || row.organization_type || row.organisation_type || row.partnerType || row.partner_type) || BOND_PARTNER_TYPES.agency,
    primaryContactName: normalizeText(row.primaryContactName || row.primary_contact_name),
    primaryContactEmail: normalizeText(row.primaryContactEmail || row.primary_contact_email || row.email),
    status: normalizeLower(row.status) || 'active',
  }
}

function normalizePortalUser(row = {}) {
  return {
    ...row,
    id: normalizeText(row.id || row.userId || row.user_id),
    partnerId: normalizeText(row.partnerId || row.partner_id || row.partnerOrganisationId || row.partner_organisation_id),
    email: normalizeText(row.email),
    name: normalizeText(row.name || row.fullName || row.full_name || row.email) || 'Partner User',
    role: normalizeLower(row.role) || 'partner_user',
    status: normalizeLower(row.status) || 'active',
  }
}

function normalizeAssignment(row = {}) {
  const pendingWorkDelivery = row.pending_work_delivery || row.pendingWorkDelivery || row.pending_delivery_payload || row.work_delivery_payload || null
  return {
    ...row,
    id: normalizeText(row.id),
    transactionId: normalizeText(row.transaction_id || row.transactionId),
    agencyOrganisationId: normalizeText(row.agency_organisation_id || row.agencyOrganisationId || row.agency_organization_id || row.agencyOrganizationId),
    partnerOrganisationId: normalizeText(row.partner_organisation_id || row.partnerOrganisationId || row.partner_organization_id || row.partnerOrganizationId),
    partnerConnectionId: normalizeText(row.partner_connection_id || row.partnerConnectionId),
    partnerServiceType: normalizeText(row.partner_service_type || row.partnerServiceType),
    partnerRole: normalizeText(row.partner_role || row.partnerRole),
    assignedPersonId: normalizeText(row.assigned_person_id || row.assignedPersonId),
    assignedQueueId: normalizeText(row.assigned_queue_id || row.assignedQueueId),
    deliveryType: normalizeText(row.delivery_type || row.deliveryType),
    assignmentStatus: normalizeLower(row.assignment_status || row.assignmentStatus || row.status),
    onboardingInviteId: normalizeText(row.onboarding_invite_id || row.onboardingInviteId),
    workItemId: normalizeText(row.work_item_id || row.workItemId),
    source: normalizeText(row.source),
    routingRuleId: normalizeText(row.routing_rule_id || row.routingRuleId),
    pendingWorkDelivery,
    createdAt: row.created_at || row.createdAt || null,
    activatedAt: row.activated_at || row.activatedAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    cancelledAt: row.cancelled_at || row.cancelledAt || null,
  }
}

function normalizeApplication(row = {}) {
  const assignment = row.assignment ? normalizeAssignment(row.assignment) : null
  const pendingPayload = assignment?.pendingWorkDelivery && typeof assignment.pendingWorkDelivery === 'object' ? assignment.pendingWorkDelivery : {}
  const transaction = row.transaction && typeof row.transaction === 'object' ? row.transaction : {}
  const payload = row.workDeliveryPayload || row.work_delivery_payload || pendingPayload?.payload || pendingPayload || {}
  return {
    ...row,
    assignment,
    id: getApplicationId(row) || assignment?.id || assignment?.transactionId,
    buyer: normalizeText(row.buyer || row.buyerName || row.client || row.buyer?.name || transaction.buyer_name || payload.buyerName || payload.buyer_name) || 'Buyer pending',
    property: normalizeText(row.property || row.propertyAddress || row.property_address || row.address || transaction.property_address_line_1 || transaction.property_description || payload.propertyLabel || payload.property_label) || 'Property pending',
    reference: normalizeText(row.applicationReference || row.application_reference || row.transactionReference || row.transaction_reference || transaction.transaction_reference || transaction.matter_number || assignment?.id) || 'Application',
    consultant: normalizeText(row.consultant || row.consultantName || row.assignedConsultantName || row.assigned_consultant_name || payload.consultantName || payload.consultant_name) || 'Assigned consultant',
    consultantEmail: normalizeText(row.consultantEmail || row.consultant_email || row.assignedUserEmail || row.assigned_user_email || payload.consultantEmail || payload.consultant_email),
    consultantPhone: normalizeText(row.consultantPhone || row.consultant_phone || payload.consultantPhone || payload.consultant_phone),
    branch: normalizeText(row.branch || row.branchName || row.branch_name || payload.branchName || payload.branch_name) || 'Branch',
    status: normalizeText(row.status || row.financeStageLabel || row.finance_stage_label || assignment?.assignmentStatus) || 'In progress',
    bank: normalizeText(row.bank || row.primaryBank || row.primary_bank || payload.bank) || 'Bank pending',
    submittedDate: normalizeText(row.submittedAt || row.submitted_at || row.createdAt || row.created_at || assignment?.createdAt),
    lastActivity: normalizeText(row.lastActivityLabel || row.lastActivityAt || row.updatedAt || row.updated_at || assignment?.activatedAt || assignment?.createdAt) || 'No activity',
    financeStageKey: getFinanceStageKey(row),
    financeStageLabel: normalizeText(row.financeStageLabel || row.finance_stage_label || assignment?.deliveryType) || 'Documents',
    statusRail: getStatusRail(row),
  }
}

function normalizeDocument(row = {}) {
  return {
    id: normalizeText(row.id || row.documentId || row.document_id),
    applicationId: normalizeText(row.transaction_partner_assignment_id || row.assignmentId || row.assignment_id || row.bond_application_id || row.applicationId || row.application_id),
    name: normalizeText(row.document_name || row.documentName || row.name || row.fileName || row.file_name) || 'Document',
    documentType: normalizeText(row.document_type || row.documentType || row.type) || 'other',
    status: normalizeLower(row.status) || 'received',
    uploadedAt: normalizeText(row.uploaded_at || row.uploadedAt || row.created_at || row.createdAt),
    uploadedBy: normalizeText(row.uploaded_by_name || row.uploadedBy || row.uploaded_by) || 'Partner',
    url: normalizeText(row.storage_path || row.url || row.downloadUrl || row.download_url),
  }
}

function normalizeDocumentRequest(row = {}) {
  return {
    id: normalizeText(row.id || row.requestId || row.request_id),
    applicationId: normalizeText(row.transaction_partner_assignment_id || row.assignmentId || row.assignment_id || row.bond_application_id || row.applicationId || row.application_id),
    documentName: normalizeText(row.document_name || row.documentName || row.title) || 'Document',
    requestedBy: normalizeText(row.requested_by_name || row.requestedBy || row.requested_by) || 'Consultant',
    dueDate: normalizeText(row.due_date || row.dueDate),
    status: normalizeLower(row.status) || 'requested',
    notes: normalizeText(row.notes || row.reason),
  }
}

function normalizeComment(row = {}) {
  return {
    id: normalizeText(row.id),
    applicationId: normalizeText(row.transaction_partner_assignment_id || row.assignmentId || row.assignment_id || row.bond_application_id || row.applicationId || row.application_id),
    authorName: normalizeText(row.author_name || row.authorName) || 'Partner',
    authorRole: normalizeText(row.author_role || row.authorRole) || 'Partner',
    message: normalizeText(row.message),
    attachments: normalizeArray(row.attachments),
    createdAt: row.created_at || row.createdAt || null,
  }
}

function getFinanceStageKey(row = {}) {
  const signal = getSignal(row)
  if (signal.includes('instruction')) return 'instruction'
  if (signal.includes('approved') || signal.includes('quote')) return 'approval'
  if (signal.includes('feedback') || signal.includes('bank')) return 'feedback'
  if (signal.includes('submit')) return 'submission'
  if (signal.includes('review')) return 'review'
  return 'documents'
}

function getStatusRail(row = {}) {
  const currentIndex = Math.max(0, FINANCE_STAGE_ORDER.findIndex((stage) => stage.key === getFinanceStageKey(row)))
  return FINANCE_STAGE_ORDER.map((stage, index) => ({
    ...stage,
    status: index < currentIndex ? 'complete' : index === currentIndex ? 'active' : 'pending',
  }))
}

function getPerformanceForApplications(applications = []) {
  const approved = applications.filter(isApprovedApplication).length
  return {
    applicationsSubmitted: applications.length,
    activeApplications: applications.filter(isActiveApplication).length,
    approvals: approved,
    declinedApplications: applications.filter(isDeclinedApplication).length,
    pendingDocuments: applications.filter(isPendingDocuments).length,
    approvalRate: percent(approved, applications.length),
    averageTurnaround: average(applications.map(getLeadDays)),
    averageBankResponse: average(applications.map((row) => row.averageBankResponseTime || row.average_bank_response_time || row.bankResponseDays || row.bank_response_days)),
    submittedApplications: applications.filter(isSubmittedApplication).length,
  }
}

function getDashboardVariant(partner = {}, applications = []) {
  const type = normalizeLower(partner.type)
  const performance = getPerformanceForApplications(applications)
  if (type === BOND_PARTNER_TYPES.development || type === BOND_PARTNER_TYPES.developer || type === 'developer') {
    return {
      type: 'development',
      title: 'Development Performance',
      metrics: {
        unitsSold: applications.length,
        applicationsSubmitted: performance.applicationsSubmitted,
        approvals: performance.approvals,
        approvalRate: performance.approvalRate,
        pendingApplications: performance.activeApplications,
      },
      units: applications.map(normalizeApplication).map((row) => ({
        unit: row.property,
        buyer: row.buyer,
        applicationStatus: row.status,
        approvalStatus: isApprovedApplication(row) ? 'Approved' : isDeclinedApplication(row) ? 'Declined' : 'Pending',
        consultant: row.consultant,
      })),
    }
  }
  if (type === BOND_PARTNER_TYPES.referralPartner || type === 'referral_partner') {
    return {
      type: 'referral',
      title: 'Referral Performance',
      metrics: {
        referredClients: applications.length,
        applications: performance.applicationsSubmitted,
        approvals: performance.approvals,
        activeApplications: performance.activeApplications,
      },
    }
  }
  return {
    type: 'agency',
    title: 'Agency Performance',
    metrics: {
      applicationsSubmitted: performance.applicationsSubmitted,
      approvalRate: performance.approvalRate,
      averageTurnaround: performance.averageTurnaround,
      averageBankResponse: performance.averageBankResponse,
      currentMonth: performance.applicationsSubmitted,
      previousMonth: 0,
    },
  }
}

async function findInviteByToken(client, token = '') {
  const safeToken = normalizeText(token)
  if (!safeToken) return null
  const canonical = await maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.invites)
      .select('id, token, invite_type, status, email, phone, target_transaction_id, target_transaction_role, metadata, accepted_at, accepted_by_user_id, created_at')
      .eq('token', safeToken)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.invites },
  )
  if (canonical?.id) return { source: 'invites', row: canonical }

  const legacy = await maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.transactionPartnerInvitations)
      .select('id, invitation_token, transaction_id, role_type, company_name, contact_name, email, phone, status, accepted_at, accepted_user_id, metadata, created_at')
      .eq('invitation_token', safeToken)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.transactionPartnerInvitations },
  )
  return legacy?.id ? { source: 'transaction_partner_invitations', row: legacy } : null
}

async function findAssignmentByToken(client, token = '') {
  const safeToken = normalizeText(token)
  if (!safeToken) return null
  return maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.assignments)
      .select('*')
      .eq('portal_token', safeToken)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.assignments },
  )
}

async function findAssignmentByInvite(client, invite = null) {
  if (!invite?.row?.id) return null
  const id = invite.row.id
  let assignment = await maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.assignments)
      .select('*')
      .eq('onboarding_invite_id', id)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.assignments },
  )
  if (assignment?.id) return assignment

  const transactionId = invite.row.target_transaction_id || invite.row.transaction_id
  const role = invite.row.target_transaction_role || invite.row.role_type || invite.row.metadata?.transaction_partner_role_type
  if (!transactionId || !role) return null
  assignment = await maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.assignments)
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('partner_role', role)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.assignments },
  )
  return assignment
}

async function lookupPortalContextByTokenRpc(client, token = '') {
  const safeToken = normalizeText(token)
  if (!safeToken || typeof client.rpc !== 'function') return null
  const result = await client.rpc('bridge_lookup_partner_portal_by_token', { p_token: safeToken })
  if (result.error) {
    if (isMissingRpcError(result.error, 'bridge_lookup_partner_portal_by_token')) return null
    throw result.error
  }
  const data = result.data && typeof result.data === 'object' ? result.data : null
  if (!data?.success || !data.assignment?.id) return null
  return {
    assignment: data.assignment,
    invite: data.invite?.id ? { source: 'invites', row: data.invite } : null,
    partner: data.partner || null,
    user: data.user || null,
    transaction: data.transaction || null,
    rows: {
      documents: normalizeArray(data.documents),
      documentRequests: normalizeArray(data.document_requests || data.documentRequests),
      comments: normalizeArray(data.comments),
      supportTickets: normalizeArray(data.support_tickets || data.supportTickets),
      audit: normalizeArray(data.audit),
      notifications: normalizeArray(data.notifications),
    },
  }
}

async function getOrganisation(client, organisationId = '') {
  if (!organisationId) return null
  return maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.organisations)
      .select('id, name, display_name, type, organization_type, status, email, phone, logo_url')
      .eq('id', organisationId)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.organisations },
  )
}

async function getPartnerUser(client, assignment = {}, invite = null) {
  const personId = assignment.assigned_person_id || assignment.assignedPersonId || invite?.row?.accepted_by_user_id || invite?.row?.accepted_user_id
  if (personId) {
    const profile = await maybeSingle(
      client
        .from(PARTNER_PORTAL_TABLES.profiles)
        .select('id, full_name, name, email, role, status')
        .eq('id', personId)
        .maybeSingle(),
      { missingOk: true, table: PARTNER_PORTAL_TABLES.profiles },
    )
    if (profile?.id) return normalizePortalUser({ ...profile, partnerId: assignment.partner_organisation_id || assignment.partnerOrganisationId })
  }
  const metadata = invite?.row?.metadata && typeof invite.row.metadata === 'object' ? invite.row.metadata : {}
  return normalizePortalUser({
    id: personId || invite?.row?.id || assignment.assigned_queue_id || assignment.id,
    partnerId: assignment.partner_organisation_id || assignment.partnerOrganisationId,
    email: invite?.row?.email || metadata.email || '',
    name: invite?.row?.contact_name || metadata.contact_name || metadata.contactName || invite?.row?.email || 'Partner User',
    role: assignment.partner_role || assignment.partnerRole || 'partner_user',
    status: invite?.row?.status === 'accepted' || assignment.assignment_status === 'active' ? 'active' : 'invited',
  })
}

async function getTransaction(client, transactionId = '') {
  if (!transactionId) return null
  return maybeSingle(
    client
      .from(PARTNER_PORTAL_TABLES.transactions)
      .select('id, transaction_reference, matter_number, property_address_line_1, property_description, finance_status, stage, current_main_stage, updated_at, created_at')
      .eq('id', transactionId)
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.transactions },
  )
}

async function resolvePortalContext(context = {}, options = {}) {
  const client = requireClient(options)
  const token = normalizeText(context.token || context.portalToken || options.token)
  const assignmentId = normalizeText(context.assignmentId || context.assignment_id || options.assignmentId || options.assignment_id)
  let invite = null
  let assignment = null
  let rpcContext = null

  if (assignmentId) {
    assignment = await maybeSingle(
      client
        .from(PARTNER_PORTAL_TABLES.assignments)
        .select('*')
        .eq('id', assignmentId)
        .maybeSingle(),
      { table: PARTNER_PORTAL_TABLES.assignments },
    )
  }
  if (!assignment && token) {
    rpcContext = await lookupPortalContextByTokenRpc(client, token)
    if (rpcContext?.assignment?.id) {
      assignment = rpcContext.assignment
      invite = rpcContext.invite
    }
  }
  if (!assignment && token) {
    assignment = await findAssignmentByToken(client, token)
  }
  if (!assignment && token) {
    invite = await findInviteByToken(client, token)
    assignment = await findAssignmentByInvite(client, invite)
  }
  if (!assignment?.id) throw createPermissionError()

  const normalizedAssignment = normalizeAssignment(assignment)
  const partner = normalizePartner(rpcContext?.partner || await getOrganisation(client, normalizedAssignment.partnerOrganisationId))
  if (!partner.id) throw createPermissionError()
  const user = rpcContext?.user ? normalizePortalUser({ ...rpcContext.user, partnerId: normalizedAssignment.partnerOrganisationId }) : await getPartnerUser(client, assignment, invite)
  const transaction = rpcContext?.transaction || await getTransaction(client, normalizedAssignment.transactionId)

  if (!rpcContext) {
    await recordAudit(client, {
      eventType: BOND_PARTNER_PORTAL_EVENTS.login,
      assignment: normalizedAssignment,
      partner,
      actorUserId: user.id,
    })
  }

  return {
    client,
    token,
    invite,
    assignment,
    normalizedAssignment,
    partner,
    user,
    partnerId: partner.id,
    transaction,
    rpcRows: rpcContext?.rows || null,
  }
}

function assignmentMatch(applicationId = '', assignment = {}) {
  const safeId = normalizeText(applicationId)
  return safeId && [assignment.id, assignment.transactionId, assignment.workItemId].map(normalizeText).includes(safeId)
}

function assertApplicationAccess(applicationId = '', portalContext = {}) {
  if (!assignmentMatch(applicationId, portalContext.normalizedAssignment)) throw createPermissionError()
  return buildApplicationFromContext(portalContext)
}

function buildApplicationFromContext(portalContext = {}) {
  return normalizeApplication({
    id: portalContext.normalizedAssignment.id,
    assignment: portalContext.normalizedAssignment,
    transaction: portalContext.transaction,
    workDeliveryPayload: portalContext.normalizedAssignment.pendingWorkDelivery,
    createdAt: portalContext.normalizedAssignment.createdAt,
    updatedAt: portalContext.normalizedAssignment.activatedAt,
    status: portalContext.normalizedAssignment.assignmentStatus,
    financeStageLabel: portalContext.normalizedAssignment.deliveryType,
  })
}

function getPartnerApplicationsForContext(portalContext = {}) {
  return [buildApplicationFromContext(portalContext)]
}

async function getApplicationDocuments(applicationId = '', portalContext = {}) {
  assertApplicationAccess(applicationId, portalContext)
  if (portalContext.rpcRows) return normalizeArray(portalContext.rpcRows.documents)
  return listRows(
    portalContext.client
      .from(PARTNER_PORTAL_TABLES.documents)
      .select('*')
      .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
      .order('uploaded_at', { ascending: false }),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.documents },
  )
}

async function getApplicationDocumentRequests(applicationId = '', portalContext = {}) {
  assertApplicationAccess(applicationId, portalContext)
  if (portalContext.rpcRows) return normalizeArray(portalContext.rpcRows.documentRequests)
  return listRows(
    portalContext.client
      .from(PARTNER_PORTAL_TABLES.documentRequests)
      .select('*')
      .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
      .order('created_at', { ascending: false }),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.documentRequests },
  )
}

async function getApplicationComments(applicationId = '', portalContext = {}) {
  assertApplicationAccess(applicationId, portalContext)
  if (portalContext.rpcRows) return normalizeArray(portalContext.rpcRows.comments)
  return listRows(
    portalContext.client
      .from(PARTNER_PORTAL_TABLES.comments)
      .select('*')
      .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
      .order('created_at', { ascending: true }),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.comments },
  )
}

async function recordAudit(client, { eventType = '', assignment = {}, partner = {}, actorUserId = '', applicationId = '', previousValue = null, newValue = null } = {}) {
  if (!assignment?.id && !assignment?.transactionId) return null
  return insertRow(
    client
      .from(PARTNER_PORTAL_TABLES.audit)
      .insert({
        organisation_id: assignment.agencyOrganisationId || assignment.agency_organisation_id,
        partner_id: partner.id || assignment.partnerOrganisationId || assignment.partner_organisation_id,
        transaction_partner_assignment_id: assignment.id,
        bond_application_id: assignment.workItemId || assignment.work_item_id || null,
        application_reference: applicationId || assignment.transactionId || assignment.transaction_id || assignment.id,
        event_type: eventType,
        actor_user_id: actorUserId || null,
        previous_value: previousValue,
        new_value: newValue,
      })
      .select('*')
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.audit },
  )
}

async function recordNotification(client, { assignment = {}, partner = {}, type = '', title = '', applicationId = '' } = {}) {
  return insertRow(
    client
      .from(PARTNER_PORTAL_TABLES.notifications)
      .insert({
        organisation_id: assignment.agencyOrganisationId || assignment.agency_organisation_id,
        partner_id: partner.id || assignment.partnerOrganisationId || assignment.partner_organisation_id,
        transaction_partner_assignment_id: assignment.id,
        bond_application_id: assignment.workItemId || assignment.work_item_id || null,
        application_reference: applicationId || assignment.transactionId || assignment.transaction_id || assignment.id,
        notification_type: type,
        channel: 'portal',
        title,
      })
      .select('*')
      .maybeSingle(),
    { missingOk: true, table: PARTNER_PORTAL_TABLES.notifications },
  )
}

export async function getPartnerDashboard(context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const applications = getPartnerApplicationsForContext(portalContext)
  const normalizedApplications = applications.map(normalizeApplication)
  const performance = getPerformanceForApplications(applications)
  const documents = (await getApplicationDocuments(portalContext.normalizedAssignment.id, portalContext)).map(normalizeDocument)
  const documentRequests = (await getApplicationDocumentRequests(portalContext.normalizedAssignment.id, portalContext)).map(normalizeDocumentRequest)
  const latestApplication = normalizedApplications[0] || {}
  return {
    partner: portalContext.partner,
    user: portalContext.user,
    assignment: portalContext.normalizedAssignment,
    greeting: `Good Morning, ${portalContext.partner.name}`,
    summaryCards: {
      applicationsSubmitted: performance.applicationsSubmitted,
      activeApplications: performance.activeApplications,
      approvals: performance.approvals,
      pendingDocuments: documentRequests.filter((row) => ['requested', 'outstanding'].includes(row.status)).length,
      averageTurnaround: performance.averageTurnaround,
    },
    statusBreakdown: FINANCE_STAGE_ORDER.map((stage) => ({
      ...stage,
      count: normalizedApplications.filter((row) => row.financeStageKey === stage.key).length,
    })),
    documents: {
      received: documents.filter((row) => ['received', 'reviewed', 'approved'].includes(row.status)).length,
      reviewed: documents.filter((row) => ['reviewed', 'approved'].includes(row.status)).length,
      outstanding: documentRequests.filter((row) => ['requested', 'outstanding'].includes(row.status)).length,
    },
    recentActivity: (await getPartnerActivity(context, options)).slice(0, 6),
    consultantContact: {
      name: latestApplication.consultant || 'Assigned Consultant',
      email: latestApplication.consultantEmail || '',
      phone: latestApplication.consultantPhone || '',
    },
    performance: getDashboardVariant(portalContext.partner, applications),
  }
}

export async function getPartnerApplications(context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const filter = normalizeLower(options.filter || 'all')
  return getPartnerApplicationsForContext(portalContext)
    .map(normalizeApplication)
    .filter((row) => {
      if (filter === 'active') return isActiveApplication(row)
      if (filter === 'approved') return isApprovedApplication(row)
      if (filter === 'declined') return isDeclinedApplication(row)
      if (filter === 'pending_documents') return isPendingDocuments(row)
      return true
    })
}

export async function getPartnerApplication(applicationId = '', context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const id = getApplicationId(application)
  const documentsPayload = await getPartnerDocuments(applicationId, context, options)
  return {
    ...normalizeApplication(application),
    summary: {
      consultant: normalizeApplication(application).consultant,
      branch: normalizeApplication(application).branch,
      submittedDate: normalizeApplication(application).submittedDate,
      lastUpdated: normalizeApplication(application).lastActivity,
    },
    financeProgress: {
      documentsReceived: documentsPayload.documents.filter((row) => normalizeLower(row.status) !== 'outstanding').length,
      documentsOutstanding: documentsPayload.outstandingDocuments.length,
      applicationsSubmitted: isSubmittedApplication(application),
      banksSubmittedTo: normalizeArray(application.banksSubmittedTo || application.banks_submitted_to),
      bankFeedback: normalizeText(application.bankFeedback || application.bank_feedback || application.financeStageLabel),
      approved: isApprovedApplication(application),
      declined: isDeclinedApplication(application),
      instructionSent: getSignal(application).includes('instruction'),
    },
    documents: documentsPayload,
    activity: await getPartnerActivity(context, { ...options, applicationId }),
    comments: (await getApplicationComments(id, portalContext)).map(normalizeComment),
  }
}

export async function getPartnerDocuments(applicationId = '', context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const documents = (await getApplicationDocuments(applicationId, portalContext)).map(normalizeDocument)
  const requests = (await getApplicationDocumentRequests(applicationId, portalContext)).map(normalizeDocumentRequest)
  return {
    documents,
    outstandingDocuments: requests.filter((row) => ['requested', 'outstanding'].includes(row.status)),
    requests,
  }
}

export async function uploadPartnerDocument(applicationId = '', payload = {}, context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const row = await insertRow(
    portalContext.client
      .from(PARTNER_PORTAL_TABLES.documents)
      .insert({
        organisation_id: portalContext.normalizedAssignment.agencyOrganisationId,
        partner_id: portalContext.partner.id,
        transaction_partner_assignment_id: portalContext.normalizedAssignment.id,
        bond_application_id: portalContext.normalizedAssignment.workItemId || null,
        application_reference: application.reference,
        document_name: payload.name || payload.fileName || payload.documentName || 'Uploaded document',
        document_type: payload.documentType || payload.type || 'document',
        storage_path: payload.url || payload.storagePath || payload.storage_path || '',
        status: 'received',
        uploaded_by: portalContext.user?.id || null,
      })
      .select('*')
      .maybeSingle(),
    { table: PARTNER_PORTAL_TABLES.documents },
  )

  if (payload.requestId) {
    const updateResult = await portalContext.client
      .from(PARTNER_PORTAL_TABLES.documentRequests)
      .update({ status: 'uploaded', updated_at: new Date().toISOString() })
      .eq('id', payload.requestId)
      .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
    if (updateResult.error && !isMissingTableError(updateResult.error, PARTNER_PORTAL_TABLES.documentRequests)) throw updateResult.error
  }

  const document = normalizeDocument(row)
  await recordAudit(portalContext.client, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.documentUploaded,
    assignment: portalContext.normalizedAssignment,
    partner: portalContext.partner,
    actorUserId: portalContext.user?.id,
    applicationId,
    newValue: document,
  })
  await recordNotification(portalContext.client, {
    type: BOND_PARTNER_PORTAL_EVENTS.documentUploaded,
    assignment: portalContext.normalizedAssignment,
    partner: portalContext.partner,
    applicationId,
    title: `${document.name} uploaded by ${portalContext.partner.name}`,
  })
  return document
}

export async function getPartnerActivity(context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const selectedApplicationId = normalizeText(options.applicationId)
  const auditRows = portalContext.rpcRows
    ? normalizeArray(portalContext.rpcRows.audit)
    : await listRows(
        portalContext.client
          .from(PARTNER_PORTAL_TABLES.audit)
          .select('*')
          .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
          .order('created_at', { ascending: false }),
        { missingOk: true, table: PARTNER_PORTAL_TABLES.audit },
      )
  const applicationEvents = getPartnerApplicationsForContext(portalContext)
    .filter((row) => !selectedApplicationId || getApplicationId(row) === selectedApplicationId)
    .map((row) => ({
      id: `application-${getApplicationId(row)}`,
      eventType: isApprovedApplication(row) ? 'Quote Approved' : isSubmittedApplication(row) ? 'Application Submitted' : 'Application Updated',
      applicationId: getApplicationId(row),
      title: isApprovedApplication(row) ? 'Approval received' : isSubmittedApplication(row) ? 'Application submitted' : normalizeApplication(row).financeStageLabel,
      createdAt: getDateValue(row) || new Date().toISOString(),
    }))
  const documentEvents = (await getApplicationDocuments(portalContext.normalizedAssignment.id, portalContext))
    .map((row) => ({
      id: `document-${row.id}`,
      eventType: 'Document Uploaded',
      applicationId: normalizeText(row.transaction_partner_assignment_id || row.bond_application_id),
      title: `${normalizeDocument(row).name} uploaded`,
      createdAt: normalizeDocument(row).uploadedAt || new Date().toISOString(),
    }))
  return [...auditRows, ...applicationEvents, ...documentEvents]
    .map((row) => ({
      id: row.id,
      eventType: row.event_type || row.eventType,
      applicationId: row.transaction_partner_assignment_id || row.applicationId,
      title: row.title || row.event_type || row.eventType,
      createdAt: row.created_at || row.createdAt,
      actor: portalContext.partner.name,
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

export async function addPartnerComment(applicationId = '', payload = {}, context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const application = assertApplicationAccess(applicationId, portalContext)
  const message = normalizeText(payload.message || payload.comment)
  if (!message) throw new Error('Comment message is required.')
  const row = await insertRow(
    portalContext.client
      .from(PARTNER_PORTAL_TABLES.comments)
      .insert({
        organisation_id: portalContext.normalizedAssignment.agencyOrganisationId,
        partner_id: portalContext.partner.id,
        transaction_partner_assignment_id: portalContext.normalizedAssignment.id,
        bond_application_id: portalContext.normalizedAssignment.workItemId || null,
        application_reference: application.reference,
        author_user_id: portalContext.user?.id || null,
        author_name: portalContext.user?.name || portalContext.partner.name,
        author_role: 'Partner',
        message,
        attachments: normalizeArray(payload.attachments),
      })
      .select('*')
      .maybeSingle(),
    { table: PARTNER_PORTAL_TABLES.comments },
  )
  const comment = normalizeComment(row)
  await recordAudit(portalContext.client, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.commentAdded,
    assignment: portalContext.normalizedAssignment,
    partner: portalContext.partner,
    actorUserId: portalContext.user?.id,
    applicationId,
    newValue: comment,
  })
  return comment
}

export async function createPartnerSupportTicket(payload = {}, context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const applicationId = normalizeText(payload.applicationId || portalContext.normalizedAssignment.id)
  const application = assertApplicationAccess(applicationId, portalContext)
  const row = await insertRow(
    portalContext.client
      .from(PARTNER_PORTAL_TABLES.supportTickets)
      .insert({
        organisation_id: portalContext.normalizedAssignment.agencyOrganisationId,
        partner_id: portalContext.partner.id,
        transaction_partner_assignment_id: portalContext.normalizedAssignment.id,
        bond_application_id: portalContext.normalizedAssignment.workItemId || null,
        application_reference: application.reference,
        ticket_type: normalizeText(payload.type || 'General Query'),
        subject: normalizeText(payload.subject || payload.type || 'Support request'),
        message: normalizeText(payload.message || payload.description),
        status: BOND_PARTNER_SUPPORT_STATUSES.open,
        created_by: portalContext.user?.id || null,
      })
      .select('*')
      .maybeSingle(),
    { table: PARTNER_PORTAL_TABLES.supportTickets },
  )
  const ticket = {
    id: row?.id || '',
    applicationId: row?.transaction_partner_assignment_id || row?.bond_application_id || '',
    type: row?.ticket_type || '',
    subject: row?.subject || '',
    message: row?.message || '',
    status: row?.status || BOND_PARTNER_SUPPORT_STATUSES.open,
    createdAt: row?.created_at || null,
  }
  await recordAudit(portalContext.client, {
    eventType: BOND_PARTNER_PORTAL_EVENTS.supportCreated,
    assignment: portalContext.normalizedAssignment,
    partner: portalContext.partner,
    actorUserId: portalContext.user?.id,
    applicationId,
    newValue: ticket,
  })
  await recordNotification(portalContext.client, {
    type: BOND_PARTNER_PORTAL_EVENTS.supportCreated,
    assignment: portalContext.normalizedAssignment,
    partner: portalContext.partner,
    applicationId,
    title: `${portalContext.partner.name} created a support ticket.`,
  })
  return ticket
}

async function activatePartnerPortalOnboardingRpc(client, { token = '', profile = {} } = {}) {
  const safeToken = normalizeText(token)
  if (!safeToken || typeof client.rpc !== 'function') return null
  const result = await client.rpc('bridge_activate_partner_portal_onboarding', {
    p_token: safeToken,
    p_profile: profile && typeof profile === 'object' ? profile : {},
  })
  if (result.error) {
    if (isMissingRpcError(result.error, 'bridge_activate_partner_portal_onboarding')) return null
    throw result.error
  }
  const data = result.data && typeof result.data === 'object' ? result.data : null
  if (!data?.success || !data.assignment?.id) return null
  return data.assignment
}

export async function activatePartnerPortalOnboarding({ token = '', profile = {} } = {}, options = {}) {
  const client = requireClient(options)
  const rpcAssignment = await activatePartnerPortalOnboardingRpc(client, { token, profile })
  if (rpcAssignment?.id) return normalizeAssignment(rpcAssignment)

  const invite = await findInviteByToken(client, token)
  const assignment = await findAssignmentByInvite(client, invite)
  if (!assignment?.id) throw createPermissionError()
  const now = new Date().toISOString()
  const workPayload = assignment.pending_work_delivery || assignment.pendingWorkDelivery || {}
  const workItemId = normalizeText(profile.workItemId || profile.work_item_id || workPayload.workItemId || workPayload.work_item_id) || assignment.work_item_id || null
  const update = await client
    .from(PARTNER_PORTAL_TABLES.assignments)
    .update({
      assignment_status: 'active',
      accepted_at: now,
      activated_at: now,
      work_item_id: workItemId,
      pending_work_delivery: workPayload,
    })
    .eq('id', assignment.id)
    .select('*')
    .maybeSingle()
  if (update.error) throw update.error
  return normalizeAssignment(update.data)
}

export async function getPartnerPerformance(context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  return getDashboardVariant(portalContext.partner, getPartnerApplicationsForContext(portalContext))
}

async function getPartnerPortalOperationalRowsFromSupabase(context = {}, options = {}) {
  const portalContext = await resolvePortalContext(context, options)
  const applications = getPartnerApplicationsForContext(portalContext)
  const applicationId = portalContext.normalizedAssignment.id
  return {
    partner: portalContext.partner,
    user: portalContext.user,
    assignment: portalContext.normalizedAssignment,
    partners: [portalContext.partner],
    portalUsers: [portalContext.user],
    applications,
    documents: (await getApplicationDocuments(applicationId, portalContext)).map(normalizeDocument),
    documentRequests: (await getApplicationDocumentRequests(applicationId, portalContext)).map(normalizeDocumentRequest),
    comments: (await getApplicationComments(applicationId, portalContext)).map(normalizeComment),
    supportTickets: portalContext.rpcRows
      ? normalizeArray(portalContext.rpcRows.supportTickets)
      : await listRows(
          portalContext.client
            .from(PARTNER_PORTAL_TABLES.supportTickets)
            .select('*')
            .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
            .order('created_at', { ascending: false }),
          { missingOk: true, table: PARTNER_PORTAL_TABLES.supportTickets },
        ),
    audit: portalContext.rpcRows
      ? normalizeArray(portalContext.rpcRows.audit)
      : await listRows(
          portalContext.client
            .from(PARTNER_PORTAL_TABLES.audit)
            .select('*')
            .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
            .order('created_at', { ascending: false }),
          { missingOk: true, table: PARTNER_PORTAL_TABLES.audit },
        ),
    notifications: portalContext.rpcRows
      ? normalizeArray(portalContext.rpcRows.notifications)
      : await listRows(
          portalContext.client
            .from(PARTNER_PORTAL_TABLES.notifications)
            .select('*')
            .eq('transaction_partner_assignment_id', portalContext.normalizedAssignment.id)
            .order('created_at', { ascending: false }),
          { missingOk: true, table: PARTNER_PORTAL_TABLES.notifications },
        ),
  }
}

export function getPartnerPortalOperationalRows(context = {}, options = {}) {
  if (options.client) {
    return getPartnerPortalOperationalRowsFromSupabase(context, options)
  }

  return {
    partner: null,
    user: null,
    assignment: null,
    partners: normalizeArray(options.partners).map(normalizePartner),
    portalUsers: normalizeArray(options.portalUsers).map(normalizePortalUser),
    applications: normalizeArray(options.applications),
    documents: normalizeArray(options.documents).map(normalizeDocument),
    documentRequests: normalizeArray(options.documentRequests).map(normalizeDocumentRequest),
    comments: normalizeArray(options.comments).map(normalizeComment),
    supportTickets: normalizeArray(options.supportTickets),
    audit: normalizeArray(options.audit),
    notifications: normalizeArray(options.notifications),
  }
}

export const __bondPartnerPortalServiceTestUtils = Object.freeze({
  clearStores() {},
  normalizeApplication,
  normalizeAssignment,
})
