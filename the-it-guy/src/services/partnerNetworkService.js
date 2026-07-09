import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getOrganizationTypeLabel, normalizeOrganizationType } from './organizationService'

export const PARTNER_CONNECTION_STATUSES = Object.freeze({
  pending: 'pending',
  connected: 'connected',
  suspended: 'suspended',
  disconnected: 'disconnected',
  declined: 'declined',
  blocked: 'blocked',
  removed: 'removed',
})

export const PARTNER_NETWORK_PARTNER_TYPES = Object.freeze({
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
  bondOriginator: 'bond_originator',
  developer: 'developer',
  municipalPartner: 'municipal_partner',
  complianceProvider: 'compliance_provider',
  other: 'other',
})

export const PARTNER_NETWORK_SERVICE_TYPES = Object.freeze({
  propertyTransfers: 'property_transfers',
  bondRegistrations: 'bond_registrations',
  bondCancellations: 'bond_cancellations',
  bondOrigination: 'bond_origination',
  developmentSales: 'development_sales',
  stockFeeds: 'stock_feeds',
  municipalServices: 'municipal_services',
  complianceServices: 'compliance_services',
  other: 'other',
})

export const PARTNER_DELIVERY_PATHS = Object.freeze({
  existingConnectedPartner: 'existing_connected_partner',
  externalPartnerOnboarding: 'external_partner_onboarding',
})

export const PARTNER_WORK_DELIVERY_TYPES = Object.freeze({
  attorneyInstruction: 'attorney_instruction',
  bondApplicationRequest: 'bond_application_request',
  developmentCollaboration: 'development_collaboration',
  manualExternalContact: 'manual_external_contact',
})

export const TRANSACTION_PARTNER_ASSIGNMENT_STATUSES = Object.freeze({
  pendingOnboarding: 'pending_onboarding',
  active: 'active',
  declined: 'declined',
  cancelled: 'cancelled',
  completed: 'completed',
})

export const TRANSACTION_PARTNER_ASSIGNMENT_SOURCES = Object.freeze({
  routing: 'routing',
  manual: 'manual',
  override: 'override',
  import: 'import',
  fallback: 'fallback',
})

const PARTNER_SERVICE_LABELS = Object.freeze({
  [PARTNER_NETWORK_SERVICE_TYPES.propertyTransfers]: 'Property Transfers',
  [PARTNER_NETWORK_SERVICE_TYPES.bondRegistrations]: 'Bond Registrations',
  [PARTNER_NETWORK_SERVICE_TYPES.bondCancellations]: 'Bond Cancellations',
  [PARTNER_NETWORK_SERVICE_TYPES.bondOrigination]: 'Bond Origination',
  [PARTNER_NETWORK_SERVICE_TYPES.developmentSales]: 'Development Sales',
  [PARTNER_NETWORK_SERVICE_TYPES.stockFeeds]: 'Stock Feeds',
  [PARTNER_NETWORK_SERVICE_TYPES.municipalServices]: 'Municipal Services',
  [PARTNER_NETWORK_SERVICE_TYPES.complianceServices]: 'Compliance Services',
  [PARTNER_NETWORK_SERVICE_TYPES.other]: 'Other',
})

const ROUTING_ROLE_SERVICES = Object.freeze({
  transfer_attorney: [PARTNER_NETWORK_SERVICE_TYPES.propertyTransfers],
  bond_attorney: [PARTNER_NETWORK_SERVICE_TYPES.bondRegistrations],
  cancellation_attorney: [PARTNER_NETWORK_SERVICE_TYPES.bondCancellations],
  bond_originator: [PARTNER_NETWORK_SERVICE_TYPES.bondOrigination],
  developer: [PARTNER_NETWORK_SERVICE_TYPES.developmentSales, PARTNER_NETWORK_SERVICE_TYPES.stockFeeds],
  developer_contact: [PARTNER_NETWORK_SERVICE_TYPES.developmentSales, PARTNER_NETWORK_SERVICE_TYPES.stockFeeds],
})

const ROLE_WORK_DELIVERY = Object.freeze({
  transfer_attorney: {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.attorneyInstruction,
    label: 'Instruction to Attorney / Transfer Matter',
    serviceType: PARTNER_NETWORK_SERVICE_TYPES.propertyTransfers,
  },
  bond_attorney: {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.attorneyInstruction,
    label: 'Instruction to Bond Attorney / Bond Registration Matter',
    serviceType: PARTNER_NETWORK_SERVICE_TYPES.bondRegistrations,
  },
  cancellation_attorney: {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.attorneyInstruction,
    label: 'Instruction to Cancellation Attorney / Cancellation Matter',
    serviceType: PARTNER_NETWORK_SERVICE_TYPES.bondCancellations,
  },
  bond_originator: {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.bondApplicationRequest,
    label: 'Application Request / Bond Application',
    serviceType: PARTNER_NETWORK_SERVICE_TYPES.bondOrigination,
  },
  developer: {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.developmentCollaboration,
    label: 'Development Collaboration / Stock or Sale Context',
    serviceType: PARTNER_NETWORK_SERVICE_TYPES.developmentSales,
  },
  developer_contact: {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.developmentCollaboration,
    label: 'Development Collaboration / Stock or Sale Context',
    serviceType: PARTNER_NETWORK_SERVICE_TYPES.developmentSales,
  },
})

export const RELATIONSHIP_TYPE_LABELS = Object.freeze({
  agency_attorney: 'Agency to Attorney',
  agency_bond_originator: 'Agency to Bond Originator',
  agency_developer: 'Agency to Developer',
  developer_attorney: 'Developer to Attorney',
  developer_bond_originator: 'Developer to Bond Originator',
  other: 'Partner Relationship',
})

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for partner connections.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeRoleType(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === 'attorney' || normalized === 'conveyancer' || normalized === 'transfer') return 'transfer_attorney'
  if (normalized === 'bond' || normalized === 'originator' || normalized === 'bondoriginator') return 'bond_originator'
  if (normalized === 'registration_attorney' || normalized === 'bond_registration_attorney') return 'bond_attorney'
  if (normalized === 'bond_cancellation_attorney' || normalized === 'cancellation') return 'cancellation_attorney'
  if (normalized === 'developer_contact_person') return 'developer_contact'
  return normalized
}

export function normalizeConnectionStatus(value) {
  const normalized = normalizeLower(value)
  if (normalized === 'accepted' || normalized === 'approved') return PARTNER_CONNECTION_STATUSES.connected
  if (normalized === 'rejected') return PARTNER_CONNECTION_STATUSES.declined
  if (normalized === 'inactive') return PARTNER_CONNECTION_STATUSES.suspended
  if (normalized === 'removed') return PARTNER_CONNECTION_STATUSES.disconnected
  if (Object.values(PARTNER_CONNECTION_STATUSES).includes(normalized)) return normalized
  return PARTNER_CONNECTION_STATUSES.pending
}

export function getPartnerRoleTypeForOrganizationType(value) {
  const organizationType = normalizeOrganizationType(value)
  if (organizationType === 'attorney_firm') return 'transfer_attorney'
  if (organizationType === 'bond_originator') return 'bond_originator'
  if (organizationType === 'developer') return 'developer'
  return 'other'
}

function normalizeServiceKey(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (!normalized) return ''
  if (normalized === 'transfer' || normalized === 'transfers' || normalized === 'property_transfer') return PARTNER_NETWORK_SERVICE_TYPES.propertyTransfers
  if (normalized === 'bond_registration' || normalized === 'bond_attorney' || normalized === 'bond') return PARTNER_NETWORK_SERVICE_TYPES.bondRegistrations
  if (normalized === 'bond_cancellation' || normalized === 'cancellation' || normalized === 'cancellation_attorney') return PARTNER_NETWORK_SERVICE_TYPES.bondCancellations
  if (normalized === 'bond_originator' || normalized === 'bond_origination' || normalized === 'finance_origination') return PARTNER_NETWORK_SERVICE_TYPES.bondOrigination
  if (normalized === 'developer' || normalized === 'development' || normalized === 'development_sales') return PARTNER_NETWORK_SERVICE_TYPES.developmentSales
  if (normalized === 'stock' || normalized === 'stock_feed') return PARTNER_NETWORK_SERVICE_TYPES.stockFeeds
  if (normalized === 'municipal_partner') return PARTNER_NETWORK_SERVICE_TYPES.municipalServices
  if (normalized === 'compliance_provider') return PARTNER_NETWORK_SERVICE_TYPES.complianceServices
  if (Object.values(PARTNER_NETWORK_SERVICE_TYPES).includes(normalized)) return normalized
  return normalized
}

function serviceFromInput(input = {}) {
  const key = normalizeServiceKey(
    typeof input === 'string'
      ? input
      : input.serviceType || input.service_type || input.type || input.key || input.roleType || input.role_type,
  )
  if (!key) return null
  const isActive = typeof input === 'object' && input !== null
    ? input.isActive !== false && input.is_active !== false && normalizeLower(input.status) !== 'inactive'
    : true
  return {
    key,
    label: normalizeText(
      typeof input === 'object' && input !== null
        ? input.label || input.name || input.serviceName || input.service_name
        : '',
    ) || PARTNER_SERVICE_LABELS[key] || key.replace(/_/g, ' '),
    isActive,
  }
}

export function normalizePartnerServices(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const rawServices = [
    row.services,
    row.service_offerings,
    row.serviceOfferings,
    row.partner_services,
    row.partnerServices,
    row.provided_services,
    row.providedServices,
    row.capabilities,
    metadata.services,
    metadata.service_offerings,
    metadata.capabilities,
  ].find(Array.isArray) || []

  const services = rawServices
    .map(serviceFromInput)
    .filter(Boolean)
    .filter((service, index, list) => list.findIndex((item) => item.key === service.key) === index)

  if (services.length) return services

  const roleType = getPartnerRoleTypeForOrganizationType(
    row.partner_organization_type || row.partnerOrganizationType || row.organization_type || row.organizationType,
  )
  return (ROUTING_ROLE_SERVICES[roleType] || []).map((key) => ({
    key,
    label: PARTNER_SERVICE_LABELS[key] || key.replace(/_/g, ' '),
    isActive: true,
  }))
}

export function partnerConnectionSupportsRoleType(connection = {}, roleType = '') {
  const normalizedRoleType = normalizeRoleType(roleType)
  if (!normalizedRoleType) return true
  const services = Array.isArray(connection.services)
    ? connection.services
    : normalizePartnerServices(connection)
  const requiredServices = ROUTING_ROLE_SERVICES[normalizedRoleType] || []
  const partnerRoleTypes = Array.isArray(connection.partnerRoleTypes) ? connection.partnerRoleTypes : []
  const partnerRoleType = normalizeRoleType(connection.partnerRoleType || connection.partner_role_type)
  if (requiredServices.length && services.length) {
    return services.some((service) => service?.isActive !== false && requiredServices.includes(normalizeServiceKey(service.key || service.serviceType || service.service_type)))
  }
  if (partnerRoleTypes.length || partnerRoleType) {
    return partnerRoleTypes.map(normalizeRoleType).includes(normalizedRoleType) || partnerRoleType === normalizedRoleType
  }
  return true
}

export function getPartnerServiceTypesForRoleType(roleType = '') {
  return [...(ROUTING_ROLE_SERVICES[normalizeRoleType(roleType)] || [])]
}

export function getPartnerWorkDeliveryForRoleType(roleType = '') {
  const normalizedRoleType = normalizeRoleType(roleType)
  const config = ROLE_WORK_DELIVERY[normalizedRoleType] || {
    deliveryType: PARTNER_WORK_DELIVERY_TYPES.attorneyInstruction,
    label: 'Partner Work Item',
    serviceType: getPartnerServiceTypesForRoleType(normalizedRoleType)[0] || PARTNER_NETWORK_SERVICE_TYPES.other,
  }
  return {
    roleType: normalizedRoleType,
    deliveryType: config.deliveryType,
    label: config.label,
    serviceType: config.serviceType,
  }
}

function getConnectionOrganisationId(connection = {}) {
  return normalizeText(
    connection.partnerOrganizationId ||
    connection.partnerOrganisationId ||
    connection.partner_organization_id ||
    connection.organisationId ||
    connection.organizationId ||
    connection.id,
  )
}

function getConnectionPersonId(input = {}) {
  return normalizeText(input.personId || input.userId || input.targetUserId || input.target_user_id || input.assignedUserId || input.assigned_user_id)
}

function getConnectionQueueId(input = {}) {
  return normalizeText(input.queueId || input.targetQueueId || input.target_queue_id || input.assignedQueueId || input.assigned_queue_id)
}

function normalizeAssignmentStatus(value = '', fallback = TRANSACTION_PARTNER_ASSIGNMENT_STATUSES.active) {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  return Object.values(TRANSACTION_PARTNER_ASSIGNMENT_STATUSES).includes(normalized) ? normalized : fallback
}

function normalizeAssignmentSource(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  return Object.values(TRANSACTION_PARTNER_ASSIGNMENT_SOURCES).includes(normalized) ? normalized : TRANSACTION_PARTNER_ASSIGNMENT_SOURCES.manual
}

function buildTransactionPartnerAssignment({
  input = {},
  connection = null,
  roleType = '',
  serviceType = '',
  deliveryType = '',
  status = TRANSACTION_PARTNER_ASSIGNMENT_STATUSES.active,
  pendingWorkDelivery = null,
} = {}) {
  const partnerOrganisationId = normalizeText(
    input.partnerOrganisationId ||
    input.partnerOrganizationId ||
    (connection ? getConnectionOrganisationId(connection) : ''),
  )
  return {
    transaction_id: normalizeText(input.transactionId || input.transaction_id),
    agency_organisation_id: normalizeText(input.agencyOrganisationId || input.agencyOrganizationId || input.agency_organisation_id || input.agency_organization_id || input.sourceOrganisationId || input.source_organisation_id),
    partner_organisation_id: partnerOrganisationId || null,
    partner_connection_id: normalizeText(input.partnerConnectionId || input.partner_connection_id || connection?.id || connection?.connectionId || connection?.connection_id) || null,
    partner_service_type: serviceType,
    partner_role: roleType,
    assigned_person_id: getConnectionPersonId(input) || null,
    assigned_queue_id: getConnectionQueueId(input) || null,
    delivery_type: deliveryType || PARTNER_WORK_DELIVERY_TYPES.manualExternalContact,
    assignment_status: normalizeAssignmentStatus(input.assignmentStatus || input.assignment_status, status),
    onboarding_invite_id: normalizeText(input.onboardingInviteId || input.onboarding_invite_id || input.inviteId || input.invite_id) || null,
    work_item_id: normalizeText(input.workItemId || input.work_item_id) || null,
    source: normalizeAssignmentSource(input.source || input.assignmentSource || input.assignment_source),
    routing_rule_id: normalizeText(input.routingRuleId || input.routing_rule_id) || null,
    created_by: normalizeText(input.createdBy || input.created_by || input.actorUserId || input.actor_user_id) || null,
    accepted_at: input.acceptedAt || input.accepted_at || null,
    activated_at: input.activatedAt || input.activated_at || null,
    cancelled_at: input.cancelledAt || input.cancelled_at || null,
    ...(pendingWorkDelivery ? { pending_work_delivery: pendingWorkDelivery } : {}),
  }
}

export function resolvePartnerDeliveryWorkflow(input = {}) {
  const roleType = normalizeRoleType(input.roleType || input.targetRoleType || input.role_type || input.target_role_type)
  const workDelivery = getPartnerWorkDeliveryForRoleType(roleType)
  const connection = input.connection || input.partnerConnection || null
  const normalizedConnection = connection
    ? connection.partnerName || connection.partnerOrganizationId || connection.partner_organization_id
      ? connection
      : toPartnerConnection(connection)
    : null
  const isConnectedPartner =
    normalizedConnection &&
    normalizeConnectionStatus(normalizedConnection.status || normalizedConnection.connectionStatus) === PARTNER_CONNECTION_STATUSES.connected &&
    partnerConnectionSupportsRoleType(normalizedConnection, roleType)
  const selectedServiceType = normalizeServiceKey(input.serviceType || input.service_type) || workDelivery.serviceType
  const deliveryPayload =
    input.deliveryPayload && typeof input.deliveryPayload === 'object'
      ? input.deliveryPayload
      : input.payload && typeof input.payload === 'object'
        ? input.payload
        : {}

  if (isConnectedPartner) {
    return {
      path: PARTNER_DELIVERY_PATHS.existingConnectedPartner,
      requiresPlatformInvite: false,
      assignment: buildTransactionPartnerAssignment({
        input,
        connection: normalizedConnection,
        roleType,
        serviceType: selectedServiceType,
        deliveryType: workDelivery.deliveryType,
        status: TRANSACTION_PARTNER_ASSIGNMENT_STATUSES.active,
      }),
      workDelivery: {
        ...workDelivery,
        serviceType: selectedServiceType,
        createImmediately: true,
        payload: deliveryPayload,
      },
      onboarding: {
        createInvite: false,
        reason: 'Partner is already connected on Arch9. Deliver work through assignment and partner-side work item.',
      },
    }
  }

  return {
      path: PARTNER_DELIVERY_PATHS.externalPartnerOnboarding,
      requiresPlatformInvite: true,
    assignment: buildTransactionPartnerAssignment({
      input,
      connection: normalizedConnection,
      roleType,
      serviceType: selectedServiceType,
      deliveryType: workDelivery.deliveryType,
      status: TRANSACTION_PARTNER_ASSIGNMENT_STATUSES.pendingOnboarding,
      pendingWorkDelivery: {
        ...workDelivery,
        serviceType: selectedServiceType,
        payload: deliveryPayload,
      },
    }),
    workDelivery: {
      ...workDelivery,
      serviceType: selectedServiceType,
      createImmediately: false,
      payload: deliveryPayload,
    },
    onboarding: {
      createInvite: true,
      reason: 'Partner is not connected on Arch9. Create onboarding invite, then activate assignment and deliver work after acceptance.',
    },
  }
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function assertRpcSuccess(result, fallbackMessage) {
  if (result.error) throw result.error
  if (result.data?.success === false) {
    throw new Error(result.data.code || fallbackMessage)
  }
  return result.data || {}
}

export function toPartnerConnection(row = {}) {
  const partnerOrganizationType = normalizeOrganizationType(
    row.partner_organization_type || row.partnerOrganizationType || row.organization_type || row.organizationType,
  )
  const status = normalizeConnectionStatus(row.status || row.connection_status || row.connectionStatus)
  const relationshipType = normalizeLower(row.relationship_type || row.relationshipType) || 'other'
  const services = normalizePartnerServices(row)
  const partnerRoleType = getPartnerRoleTypeForOrganizationType(partnerOrganizationType)
  const partnerRoleTypes = [
    partnerRoleType,
    ...Object.entries(ROUTING_ROLE_SERVICES)
      .filter(([, serviceKeys]) => services.some((service) => service?.isActive !== false && serviceKeys.includes(service.key)))
      .map(([roleType]) => roleType),
  ].filter(Boolean).filter((roleType, index, list) => roleType !== 'other' && list.indexOf(roleType) === index)
  return {
    id: row.id || row.connection_id || row.connectionId || '',
    sourceOrganizationId: row.source_organization_id || row.sourceOrganizationId || null,
    targetOrganizationId: row.target_organization_id || row.targetOrganizationId || null,
    partnerOrganizationId: row.partner_organization_id || row.partnerOrganizationId || row.id || null,
    partnerName: normalizeText(row.partner_display_name || row.partnerDisplayName || row.partner_name || row.partnerName || row.name),
    partnerType: partnerOrganizationType,
    partnerTypeLabel: getOrganizationTypeLabel(partnerOrganizationType),
    partnerSubtype: normalizeText(row.partner_organization_subtype || row.partnerOrganizationSubtype || row.organization_subtype || row.organizationSubtype),
    partnerRoleType,
    partnerRoleTypes,
    services,
    serviceLabels: services.filter((service) => service.isActive !== false).map((service) => service.label),
    relationshipType,
    relationshipTypeLabel: RELATIONSHIP_TYPE_LABELS[relationshipType] || RELATIONSHIP_TYPE_LABELS.other,
    status,
    direction: normalizeLower(row.direction) || 'outgoing',
    isPreferred: row.is_preferred === true || row.isPreferred === true,
    sourcePreferred: row.source_preferred === true || row.sourcePreferred === true,
    targetPreferred: row.target_preferred === true || row.targetPreferred === true,
    transactionCount: toNumber(row.transaction_count || row.transactionCount),
    activeTransactionCount: toNumber(row.active_transaction_count || row.activeTransactionCount),
    completedTransactionCount: toNumber(row.completed_transaction_count || row.completedTransactionCount),
    firstTransactionDate: row.first_transaction_date || row.firstTransactionDate || null,
    lastTransactionDate: row.last_transaction_date || row.lastTransactionDate || null,
    createdAt: row.created_at || row.createdAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
  }
}

export function toPartnerCandidate(row = {}) {
  const organizationType = normalizeOrganizationType(row.organization_type || row.organizationType || row.type)
  return {
    id: row.id || row.organization_id || row.organizationId || '',
    name: normalizeText(row.display_name || row.displayName || row.name),
    type: organizationType,
    typeLabel: getOrganizationTypeLabel(organizationType),
    subtype: normalizeText(row.organization_subtype || row.organizationSubtype),
    status: normalizeLower(row.status) || 'active',
    website: normalizeText(row.website),
    connectionId: row.connection_id || row.connectionId || null,
    connectionStatus: row.connection_status || row.connectionStatus ? normalizeConnectionStatus(row.connection_status || row.connectionStatus) : '',
    connectionDirection: normalizeLower(row.connection_direction || row.connectionDirection),
    connectionCount: toNumber(row.connection_count || row.connectionCount),
  }
}

export function toTransactionPartnerOption(connection = {}) {
  const normalized = connection.partnerName ? connection : toPartnerConnection(connection)
  return {
    id: `partner-connection:${normalized.id}`,
    source: 'partner_connection',
    connectionId: normalized.id,
    relationshipId: null,
    relationshipType: normalized.isPreferred ? 'preferred' : 'connected',
    companyName: normalized.partnerName,
    email: '',
    organisationId: normalized.partnerOrganizationId,
    partnerOrganisationId: normalized.partnerOrganizationId,
    partnerOrganizationId: normalized.partnerOrganizationId,
    partnerRoleType: normalized.partnerRoleType,
    partnerRoleTypes: Array.isArray(normalized.partnerRoleTypes) ? normalized.partnerRoleTypes : [normalized.partnerRoleType].filter(Boolean),
    services: Array.isArray(normalized.services) ? normalized.services : [],
    preferred: normalized.isPreferred,
    transactionCount: normalized.transactionCount,
    activeTransactionCount: normalized.activeTransactionCount,
    completedTransactionCount: normalized.completedTransactionCount,
  }
}

export async function listPartnerConnections(organizationId) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase4_list_partner_connections', {
    p_organization_id: organizationId,
  })
  if (result.error) {
    if (result.error.code === '42883') return { connections: [], recommendations: [], canManage: false }
    throw result.error
  }
  const data = assertRpcSuccess(result, 'Unable to load partner connections.')
  return {
    connections: (Array.isArray(data.connections) ? data.connections : []).map(toPartnerConnection),
    recommendations: (Array.isArray(data.recommendations) ? data.recommendations : []).map(toPartnerCandidate),
    canManage: data.canManage === true,
  }
}

export async function searchPartnerConnectionCandidates({ organizationId, query = '', organizationType = '' } = {}) {
  const client = requireClient()
  const safeQuery = normalizeText(query)
  if (!organizationId) throw new Error('Organization is required.')
  if (safeQuery.length < 2) return []
  const result = await client.rpc('bridge_phase4_search_partner_candidates', {
    p_organization_id: organizationId,
    p_query: safeQuery,
    p_organization_type: organizationType ? normalizeOrganizationType(organizationType) : null,
  })
  const data = assertRpcSuccess(result, 'Unable to search partner organizations.')
  return (Array.isArray(data.organizations) ? data.organizations : []).map(toPartnerCandidate)
}

export async function requestPartnerConnection({ sourceOrganizationId, targetOrganizationId, message = '' } = {}) {
  const client = requireClient()
  if (!sourceOrganizationId) throw new Error('Source organization is required.')
  if (!targetOrganizationId) throw new Error('Target organization is required.')
  const result = await client.rpc('bridge_phase4_request_partner_connection', {
    p_source_organization_id: sourceOrganizationId,
    p_target_organization_id: targetOrganizationId,
    p_message: normalizeText(message) || null,
  })
  const data = assertRpcSuccess(result, 'Unable to request partner connection.')
  return toPartnerConnection(data.connection || {})
}

export async function reviewPartnerConnection({ connectionId, action } = {}) {
  const client = requireClient()
  if (!connectionId) throw new Error('Connection is required.')
  const result = await client.rpc('bridge_phase4_review_partner_connection', {
    p_connection_id: connectionId,
    p_action: action,
  })
  const data = assertRpcSuccess(result, 'Unable to update partner connection.')
  return toPartnerConnection(data.connection || {})
}

export async function setPartnerConnectionPreferred({ organizationId, connectionId, preferred } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!connectionId) throw new Error('Connection is required.')
  const result = await client.rpc('bridge_phase4_set_partner_preferred', {
    p_organization_id: organizationId,
    p_connection_id: connectionId,
    p_preferred: Boolean(preferred),
  })
  const data = assertRpcSuccess(result, 'Unable to update preferred partner.')
  return toPartnerConnection(data.connection || {})
}

export async function removePartnerConnection({ organizationId, connectionId } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!connectionId) throw new Error('Connection is required.')
  const result = await client.rpc('bridge_phase4_remove_partner_connection', {
    p_organization_id: organizationId,
    p_connection_id: connectionId,
  })
  const data = assertRpcSuccess(result, 'Unable to remove partner connection.')
  return toPartnerConnection(data.connection || {})
}

export async function listTransactionPartnerConnectionOptions({ organizationId, roleType } = {}) {
  if (!organizationId) return []
  const { connections } = await listPartnerConnections(organizationId)
  return connections
    .filter((connection) => connection.status === PARTNER_CONNECTION_STATUSES.connected)
    .filter((connection) => !roleType || partnerConnectionSupportsRoleType(connection, roleType))
    .sort((left, right) => {
      if (left.isPreferred !== right.isPreferred) return left.isPreferred ? -1 : 1
      return right.transactionCount - left.transactionCount || left.partnerName.localeCompare(right.partnerName)
    })
    .map(toTransactionPartnerOption)
}

export const __partnerNetworkServiceTestUtils = {
  toPartnerCandidate,
  toPartnerConnection,
  toTransactionPartnerOption,
  normalizePartnerServices,
  partnerConnectionSupportsRoleType,
  getPartnerServiceTypesForRoleType,
  getPartnerWorkDeliveryForRoleType,
  resolvePartnerDeliveryWorkflow,
}
