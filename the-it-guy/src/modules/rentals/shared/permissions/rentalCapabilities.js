import { ACCESS_SCOPES, PERMISSIONS } from '../../../../auth/permissions/permissionRegistry.js'
import { can, getPermissionScope, resolvePermissionContext } from '../../../../auth/permissions/permissionResolver.js'
import { buildWorkspaceQueryScope } from '../../../../auth/permissions/queryScope.js'
import { ORG_ROLES } from '../../../../constants/orgRoles.js'

export const RENTAL_CAPABILITY_CONTRACT_VERSION = 'arch9_rentals_capability_contract_v1'

export const RENTAL_CAPABILITIES = Object.freeze({
  portfolioView: 'rentals.portfolio.view',
  portfolioManage: 'rentals.portfolio.manage',
  vacancyView: 'rentals.vacancy.view',
  vacancyManage: 'rentals.vacancy.manage',
  vacancyPublish: 'rentals.vacancy.publish',
  applicationView: 'rentals.application.view',
  applicationManage: 'rentals.application.manage',
  applicationReview: 'rentals.application.review',
  applicationApprove: 'rentals.application.approve',
  tenancyView: 'rentals.tenancy.view',
  tenancyManage: 'rentals.tenancy.manage',
  tenancyActivate: 'rentals.tenancy.activate',
  collectionsView: 'rentals.collections.view',
  collectionsCapturePayment: 'rentals.collections.capture_payment',
  collectionsReversePayment: 'rentals.collections.reverse_payment',
  maintenanceView: 'rentals.maintenance.view',
  maintenanceManage: 'rentals.maintenance.manage',
  inspectionsView: 'rentals.inspections.view',
  inspectionsManage: 'rentals.inspections.manage',
  reportsView: 'rentals.reports.view',
  reportsExport: 'rentals.reports.export',
})

const RENTAL_AUTHORITY_ROLES = Object.freeze([
  ORG_ROLES.owner,
  ORG_ROLES.principal,
  ORG_ROLES.director,
  ORG_ROLES.partner,
  ORG_ROLES.hqManager,
  ORG_ROLES.branchManager,
  ORG_ROLES.manager,
])

const FINANCE_AUTHORITY_ROLES = Object.freeze([
  ORG_ROLES.owner,
  ORG_ROLES.principal,
  ORG_ROLES.director,
  ORG_ROLES.partner,
  ORG_ROLES.hqManager,
  ORG_ROLES.branchManager,
  ORG_ROLES.manager,
  ORG_ROLES.adminStaff,
])

const capabilityDefinitions = Object.freeze({
  [RENTAL_CAPABILITIES.portfolioView]: { basePermission: PERMISSIONS.viewListings },
  [RENTAL_CAPABILITIES.portfolioManage]: { basePermission: PERMISSIONS.editListings },
  [RENTAL_CAPABILITIES.vacancyView]: { basePermission: PERMISSIONS.viewListings },
  [RENTAL_CAPABILITIES.vacancyManage]: { basePermission: PERMISSIONS.editListings },
  [RENTAL_CAPABILITIES.vacancyPublish]: { basePermission: PERMISSIONS.publishListings },
  [RENTAL_CAPABILITIES.applicationView]: { basePermission: PERMISSIONS.viewLeads },
  [RENTAL_CAPABILITIES.applicationManage]: { basePermission: PERMISSIONS.editLeads },
  [RENTAL_CAPABILITIES.applicationReview]: { basePermission: PERMISSIONS.editLeads, authorityRoles: RENTAL_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.applicationApprove]: { basePermission: PERMISSIONS.editLeads, authorityRoles: RENTAL_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.tenancyView]: { basePermission: PERMISSIONS.viewTransactions },
  [RENTAL_CAPABILITIES.tenancyManage]: { basePermission: PERMISSIONS.editTransactions, authorityRoles: RENTAL_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.tenancyActivate]: { basePermission: PERMISSIONS.advanceTransactionStage, authorityRoles: RENTAL_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.collectionsView]: { basePermission: PERMISSIONS.viewReports, authorityRoles: FINANCE_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.collectionsCapturePayment]: { basePermission: PERMISSIONS.editTransactions, authorityRoles: FINANCE_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.collectionsReversePayment]: { basePermission: PERMISSIONS.editTransactions, authorityRoles: RENTAL_AUTHORITY_ROLES },
  [RENTAL_CAPABILITIES.maintenanceView]: { basePermission: PERMISSIONS.viewTransactions },
  [RENTAL_CAPABILITIES.maintenanceManage]: { basePermission: PERMISSIONS.editTransactions },
  [RENTAL_CAPABILITIES.inspectionsView]: { basePermission: PERMISSIONS.viewTransactions },
  [RENTAL_CAPABILITIES.inspectionsManage]: { basePermission: PERMISSIONS.manageAppointments },
  [RENTAL_CAPABILITIES.reportsView]: { basePermission: PERMISSIONS.viewReports },
  [RENTAL_CAPABILITIES.reportsExport]: { basePermission: PERMISSIONS.exportReports },
})

export const RENTAL_RLS_ENTITY_CONTRACTS = Object.freeze([
  'rental_portfolios',
  'rental_portfolio_properties',
  'rental_properties',
  'rental_units',
  'rental_unit_status_history',
  'rental_property_landlords',
  'rental_property_mandates',
  'rental_vacancies',
  'rental_vacancy_status_history',
  'rental_vacancy_marketing',
  'rental_vacancy_media',
  'rental_vacancy_marketing_status_history',
  'rental_lead_links',
  'rental_applications',
  'rental_application_access_tokens',
  'rental_application_household_members',
  'rental_screening_checks',
  'rental_tenancies',
  'rental_tenancy_parties',
  'rental_leases',
  'rental_charges',
  'rental_payments',
  'rental_payment_allocations',
  'rental_maintenance_requests',
  'rental_maintenance_quotes',
  'rental_inspections',
  'rental_renewals',
  'rental_notices',
  'rental_entity_documents',
  'rental_activity_projections',
  'rental_event_outbox',
  'rental_event_consumer_receipts',
  'rental_job_runs',
  'rental_party_relationships',
  'rental_party_workflow_snapshots',
])

function normalizeRole(context = {}) {
  return resolvePermissionContext(context).organisationRole
}

export function getRentalCapabilityDefinition(capability) {
  return capabilityDefinitions[capability] || null
}

export function getRentalCapabilityScope(capability, context = {}) {
  const definition = getRentalCapabilityDefinition(capability)
  if (!definition || !can(definition.basePermission, context)) return ACCESS_SCOPES.none
  if (definition.authorityRoles && !definition.authorityRoles.includes(normalizeRole(context))) return ACCESS_SCOPES.none
  return getPermissionScope(definition.basePermission, context)
}

export function canUseRentalCapability(capability, context = {}) {
  return getRentalCapabilityScope(capability, context) !== ACCESS_SCOPES.none
}

export function buildRentalCapabilityQueryScope(capability, context = {}) {
  const definition = getRentalCapabilityDefinition(capability)
  const scope = getRentalCapabilityScope(capability, context)
  if (!definition || scope === ACCESS_SCOPES.none) {
    return { capability, canRead: false, scope: ACCESS_SCOPES.none }
  }
  return { ...buildWorkspaceQueryScope(definition.basePermission, context), capability, scope }
}

export function buildRentalRlsContract(tableName) {
  if (!RENTAL_RLS_ENTITY_CONTRACTS.includes(tableName)) return null
  return {
    tableName,
    exposedSchema: 'public',
    requiredColumns: ['organisation_id', 'branch_id', 'created_by', 'updated_at'],
    grants: {
      anon: [],
      authenticated: ['select', 'insert', 'update'],
    },
    rules: [
      'Enable RLS and revoke all grants before granting the minimum authenticated operations.',
      'Use TO authenticated plus an organisation/branch/assigned-user predicate for every policy.',
      'Use both USING and WITH CHECK for updates.',
      'Do not use user_metadata or SECURITY DEFINER to bypass rental authorization.',
      'Add explicit deny/allow SQL tests for anon and authenticated roles before release.',
    ],
  }
}
