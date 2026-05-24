import { APP_ROLES } from '../../constants/appRoles'
import { ORG_ROLES } from '../../constants/orgRoles'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'

export const ACCESS_SCOPES = Object.freeze({
  allWorkspace: 'all_workspace',
  branchOnly: 'branch_only',
  departmentOnly: 'department_only',
  teamOnly: 'team_only',
  assignedOnly: 'assigned_only',
  clientLinkOnly: 'client_link_only',
  none: 'none',
})

export const PERMISSIONS = Object.freeze({
  viewDashboard: 'view_dashboard',
  manageWorkspaceSettings: 'manage_workspace_settings',
  inviteUsers: 'invite_users',
  manageUsers: 'manage_users',
  manageBilling: 'manage_billing',
  viewReports: 'view_reports',
  exportReports: 'export_reports',
  viewAuditLog: 'view_audit_log',

  viewAgencyDashboard: 'view_agency_dashboard',
  viewLeads: 'view_leads',
  createLeads: 'create_leads',
  editLeads: 'edit_leads',
  deleteLeads: 'delete_leads',
  assignLeads: 'assign_leads',
  viewListings: 'view_listings',
  createListings: 'create_listings',
  editListings: 'edit_listings',
  deleteListings: 'delete_listings',
  publishListings: 'publish_listings',
  viewClients: 'view_clients',
  createClients: 'create_clients',
  editClients: 'edit_clients',
  viewTransactions: 'view_transactions',
  createTransactions: 'create_transactions',
  editTransactions: 'edit_transactions',
  advanceTransactionStage: 'advance_transaction_stage',
  manageAppointments: 'manage_appointments',
  manageBranches: 'manage_branches',

  viewDeveloperDashboard: 'view_developer_dashboard',
  viewDevelopments: 'view_developments',
  createDevelopments: 'create_developments',
  editDevelopments: 'edit_developments',
  deleteDevelopments: 'delete_developments',
  manageUnits: 'manage_units',
  viewSalesPipeline: 'view_sales_pipeline',
  manageDeveloperTransactions: 'manage_developer_transactions',
  viewDeveloperFinancials: 'view_developer_financials',
  exportDeveloperReports: 'export_developer_reports',
  manageDevelopmentTeam: 'manage_development_team',

  viewAttorneyDashboard: 'view_attorney_dashboard',
  viewMatters: 'view_matters',
  createMatters: 'create_matters',
  editMatters: 'edit_matters',
  manageTransferWorkflow: 'manage_transfer_workflow',
  requestDocuments: 'request_documents',
  approveDocuments: 'approve_documents',
  rejectDocuments: 'reject_documents',
  publishClientDocuments: 'publish_client_documents',
  manageSigningAppointments: 'manage_signing_appointments',
  exportMatterReports: 'export_matter_reports',
  manageAttorneyTeam: 'manage_attorney_team',

  viewBondDashboard: 'view_bond_dashboard',
  viewApplications: 'view_applications',
  createApplications: 'create_applications',
  editApplications: 'edit_applications',
  updateBondStatus: 'update_bond_status',
  submitToBanks: 'submit_to_banks',
  manageBankFeedback: 'manage_bank_feedback',
  requestFinanceDocs: 'request_finance_docs',
  exportBondReports: 'export_bond_reports',
  manageBondTeam: 'manage_bond_team',

  viewClientPortal: 'view_client_portal',
  uploadRequestedDocuments: 'upload_requested_documents',
  viewClientTransactionProgress: 'view_client_transaction_progress',
  commentOnClientThread: 'comment_on_client_thread',
  completeClientForms: 'complete_client_forms',

  platformViewAll: 'platform_view_all',
  platformManageAll: 'platform_manage_all',
  platformSupportImpersonation: 'platform_support_impersonation',
  platformAuditAccess: 'platform_audit_access',
})

export const PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS))

const GENERAL_READ = [
  PERMISSIONS.viewDashboard,
  PERMISSIONS.viewReports,
]

const GENERAL_ADMIN = [
  PERMISSIONS.manageWorkspaceSettings,
  PERMISSIONS.inviteUsers,
  PERMISSIONS.manageUsers,
  PERMISSIONS.manageBilling,
  PERMISSIONS.viewReports,
  PERMISSIONS.exportReports,
  PERMISSIONS.viewAuditLog,
]

const AGENCY_PERMISSIONS = [
  PERMISSIONS.viewAgencyDashboard,
  PERMISSIONS.viewLeads,
  PERMISSIONS.createLeads,
  PERMISSIONS.editLeads,
  PERMISSIONS.deleteLeads,
  PERMISSIONS.assignLeads,
  PERMISSIONS.viewListings,
  PERMISSIONS.createListings,
  PERMISSIONS.editListings,
  PERMISSIONS.deleteListings,
  PERMISSIONS.publishListings,
  PERMISSIONS.viewClients,
  PERMISSIONS.createClients,
  PERMISSIONS.editClients,
  PERMISSIONS.viewTransactions,
  PERMISSIONS.createTransactions,
  PERMISSIONS.editTransactions,
  PERMISSIONS.advanceTransactionStage,
  PERMISSIONS.manageAppointments,
  PERMISSIONS.manageBranches,
]

const DEVELOPER_PERMISSIONS = [
  PERMISSIONS.viewDeveloperDashboard,
  PERMISSIONS.viewDevelopments,
  PERMISSIONS.createDevelopments,
  PERMISSIONS.editDevelopments,
  PERMISSIONS.deleteDevelopments,
  PERMISSIONS.manageUnits,
  PERMISSIONS.viewSalesPipeline,
  PERMISSIONS.manageDeveloperTransactions,
  PERMISSIONS.viewDeveloperFinancials,
  PERMISSIONS.exportDeveloperReports,
  PERMISSIONS.manageDevelopmentTeam,
  PERMISSIONS.viewClients,
  PERMISSIONS.viewTransactions,
  PERMISSIONS.requestDocuments,
]

const ATTORNEY_PERMISSIONS = [
  PERMISSIONS.viewAttorneyDashboard,
  PERMISSIONS.viewDevelopments,
  PERMISSIONS.viewMatters,
  PERMISSIONS.createMatters,
  PERMISSIONS.editMatters,
  PERMISSIONS.manageTransferWorkflow,
  PERMISSIONS.requestDocuments,
  PERMISSIONS.approveDocuments,
  PERMISSIONS.rejectDocuments,
  PERMISSIONS.publishClientDocuments,
  PERMISSIONS.manageSigningAppointments,
  PERMISSIONS.exportMatterReports,
  PERMISSIONS.manageAttorneyTeam,
  PERMISSIONS.manageBranches,
  PERMISSIONS.viewClients,
  PERMISSIONS.viewTransactions,
]

const BOND_PERMISSIONS = [
  PERMISSIONS.viewBondDashboard,
  PERMISSIONS.viewDevelopments,
  PERMISSIONS.viewApplications,
  PERMISSIONS.createApplications,
  PERMISSIONS.editApplications,
  PERMISSIONS.updateBondStatus,
  PERMISSIONS.submitToBanks,
  PERMISSIONS.manageBankFeedback,
  PERMISSIONS.requestFinanceDocs,
  PERMISSIONS.exportBondReports,
  PERMISSIONS.manageBondTeam,
  PERMISSIONS.manageBranches,
  PERMISSIONS.viewClients,
  PERMISSIONS.viewTransactions,
]

function grant(scope, permissions = []) {
  return Object.freeze(
    permissions.reduce((accumulator, permission) => {
      accumulator[permission] = scope
      return accumulator
    }, {}),
  )
}

function mergeGrants(...entries) {
  return Object.freeze(Object.assign({}, ...entries))
}

const readOnlyGeneral = grant(ACCESS_SCOPES.allWorkspace, GENERAL_READ)
const allGeneral = grant(ACCESS_SCOPES.allWorkspace, [...GENERAL_READ, ...GENERAL_ADMIN])

export const permissionsByWorkspaceRole = Object.freeze({
  [WORKSPACE_TYPES.agency]: Object.freeze({
    [ORG_ROLES.owner]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, AGENCY_PERMISSIONS)),
    [ORG_ROLES.principal]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, AGENCY_PERMISSIONS)),
    [ORG_ROLES.branchManager]: mergeGrants(
      grant(ACCESS_SCOPES.branchOnly, [...GENERAL_READ, ...AGENCY_PERMISSIONS.filter((permission) => permission !== PERMISSIONS.manageBranches && permission !== PERMISSIONS.manageBilling)]),
      grant(ACCESS_SCOPES.branchOnly, [PERMISSIONS.inviteUsers, PERMISSIONS.manageUsers]),
    ),
    [ORG_ROLES.manager]: mergeGrants(
      grant(ACCESS_SCOPES.branchOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAgencyDashboard, PERMISSIONS.viewLeads, PERMISSIONS.createLeads, PERMISSIONS.editLeads, PERMISSIONS.assignLeads, PERMISSIONS.viewListings, PERMISSIONS.createListings, PERMISSIONS.editListings, PERMISSIONS.viewClients, PERMISSIONS.createClients, PERMISSIONS.editClients, PERMISSIONS.viewTransactions, PERMISSIONS.createTransactions, PERMISSIONS.editTransactions, PERMISSIONS.manageAppointments, PERMISSIONS.viewReports]),
    ),
    [ORG_ROLES.agent]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAgencyDashboard, PERMISSIONS.viewLeads, PERMISSIONS.createLeads, PERMISSIONS.editLeads, PERMISSIONS.viewListings, PERMISSIONS.createListings, PERMISSIONS.editListings, PERMISSIONS.viewClients, PERMISSIONS.createClients, PERMISSIONS.editClients, PERMISSIONS.viewTransactions, PERMISSIONS.createTransactions, PERMISSIONS.editTransactions, PERMISSIONS.manageAppointments]),
    [ORG_ROLES.adminStaff]: mergeGrants(readOnlyGeneral, grant(ACCESS_SCOPES.branchOnly, [PERMISSIONS.viewAgencyDashboard, PERMISSIONS.viewLeads, PERMISSIONS.createLeads, PERMISSIONS.editLeads, PERMISSIONS.viewListings, PERMISSIONS.viewClients, PERMISSIONS.createClients, PERMISSIONS.editClients, PERMISSIONS.viewTransactions, PERMISSIONS.manageAppointments])),
    [ORG_ROLES.viewer]: mergeGrants(readOnlyGeneral, grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewAgencyDashboard, PERMISSIONS.viewLeads, PERMISSIONS.viewListings, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions])),
  }),
  [WORKSPACE_TYPES.developerCompany]: Object.freeze({
    [ORG_ROLES.owner]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, DEVELOPER_PERMISSIONS)),
    [ORG_ROLES.director]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, DEVELOPER_PERMISSIONS)),
    [ORG_ROLES.salesManager]: mergeGrants(grant(ACCESS_SCOPES.allWorkspace, [PERMISSIONS.viewDashboard, PERMISSIONS.viewDeveloperDashboard, PERMISSIONS.viewDevelopments, PERMISSIONS.editDevelopments, PERMISSIONS.manageUnits, PERMISSIONS.viewSalesPipeline, PERMISSIONS.manageDeveloperTransactions, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions, PERMISSIONS.viewReports, PERMISSIONS.exportDeveloperReports, PERMISSIONS.manageDevelopmentTeam])),
    [ORG_ROLES.developmentManager]: mergeGrants(grant(ACCESS_SCOPES.allWorkspace, [PERMISSIONS.viewDashboard, PERMISSIONS.viewDeveloperDashboard, PERMISSIONS.viewDevelopments, PERMISSIONS.createDevelopments, PERMISSIONS.editDevelopments, PERMISSIONS.manageUnits, PERMISSIONS.viewSalesPipeline, PERMISSIONS.manageDeveloperTransactions, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions, PERMISSIONS.viewReports])),
    [ORG_ROLES.salesAgent]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewDeveloperDashboard, PERMISSIONS.viewDevelopments, PERMISSIONS.viewSalesPipeline, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.adminStaff]: mergeGrants(readOnlyGeneral, grant(ACCESS_SCOPES.teamOnly, [PERMISSIONS.viewDeveloperDashboard, PERMISSIONS.viewDevelopments, PERMISSIONS.manageUnits, PERMISSIONS.viewSalesPipeline, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions])),
    [ORG_ROLES.viewer]: mergeGrants(readOnlyGeneral, grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDeveloperDashboard, PERMISSIONS.viewDevelopments, PERMISSIONS.viewSalesPipeline, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions])),
  }),
  [WORKSPACE_TYPES.attorneyFirm]: Object.freeze({
    [ORG_ROLES.owner]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, ATTORNEY_PERMISSIONS)),
    [ORG_ROLES.partner]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, ATTORNEY_PERMISSIONS)),
    [ORG_ROLES.director]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, ATTORNEY_PERMISSIONS)),
    [ORG_ROLES.branchManager]: mergeGrants(
      grant(ACCESS_SCOPES.branchOnly, [
        PERMISSIONS.viewDashboard,
        PERMISSIONS.viewAttorneyDashboard,
        PERMISSIONS.viewMatters,
        PERMISSIONS.createMatters,
        PERMISSIONS.editMatters,
        PERMISSIONS.manageTransferWorkflow,
        PERMISSIONS.requestDocuments,
        PERMISSIONS.approveDocuments,
        PERMISSIONS.rejectDocuments,
        PERMISSIONS.publishClientDocuments,
        PERMISSIONS.manageSigningAppointments,
        PERMISSIONS.viewClients,
        PERMISSIONS.viewTransactions,
        PERMISSIONS.viewReports,
        PERMISSIONS.exportMatterReports,
        PERMISSIONS.manageAttorneyTeam,
        PERMISSIONS.inviteUsers,
        PERMISSIONS.manageUsers,
      ]),
    ),
    [ORG_ROLES.attorney]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAttorneyDashboard, PERMISSIONS.viewMatters, PERMISSIONS.createMatters, PERMISSIONS.editMatters, PERMISSIONS.manageTransferWorkflow, PERMISSIONS.requestDocuments, PERMISSIONS.approveDocuments, PERMISSIONS.rejectDocuments, PERMISSIONS.publishClientDocuments, PERMISSIONS.manageSigningAppointments, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions, PERMISSIONS.viewReports]),
    [ORG_ROLES.conveyancer]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAttorneyDashboard, PERMISSIONS.viewMatters, PERMISSIONS.editMatters, PERMISSIONS.manageTransferWorkflow, PERMISSIONS.requestDocuments, PERMISSIONS.manageSigningAppointments, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.paralegal]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAttorneyDashboard, PERMISSIONS.viewMatters, PERMISSIONS.requestDocuments, PERMISSIONS.manageSigningAppointments, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.adminStaff]: grant(ACCESS_SCOPES.branchOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAttorneyDashboard, PERMISSIONS.viewMatters, PERMISSIONS.manageSigningAppointments, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.viewer]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewAttorneyDashboard, PERMISSIONS.viewMatters, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
  }),
  [WORKSPACE_TYPES.bondOriginator]: Object.freeze({
    [ORG_ROLES.owner]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, BOND_PERMISSIONS)),
    [ORG_ROLES.director]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, BOND_PERMISSIONS)),
    [ORG_ROLES.manager]: mergeGrants(allGeneral, grant(ACCESS_SCOPES.allWorkspace, BOND_PERMISSIONS)),
    [ORG_ROLES.branchManager]: mergeGrants(
      grant(ACCESS_SCOPES.branchOnly, [
        PERMISSIONS.viewDashboard,
        PERMISSIONS.viewBondDashboard,
        PERMISSIONS.viewApplications,
        PERMISSIONS.createApplications,
        PERMISSIONS.editApplications,
        PERMISSIONS.updateBondStatus,
        PERMISSIONS.submitToBanks,
        PERMISSIONS.manageBankFeedback,
        PERMISSIONS.requestFinanceDocs,
        PERMISSIONS.viewClients,
        PERMISSIONS.viewTransactions,
        PERMISSIONS.viewReports,
        PERMISSIONS.exportBondReports,
        PERMISSIONS.manageBondTeam,
        PERMISSIONS.inviteUsers,
        PERMISSIONS.manageUsers,
      ]),
    ),
    [ORG_ROLES.bondOriginator]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewBondDashboard, PERMISSIONS.viewApplications, PERMISSIONS.createApplications, PERMISSIONS.editApplications, PERMISSIONS.updateBondStatus, PERMISSIONS.requestFinanceDocs, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.consultant]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewBondDashboard, PERMISSIONS.viewApplications, PERMISSIONS.createApplications, PERMISSIONS.editApplications, PERMISSIONS.updateBondStatus, PERMISSIONS.requestFinanceDocs, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.processor]: grant(ACCESS_SCOPES.branchOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewBondDashboard, PERMISSIONS.viewApplications, PERMISSIONS.editApplications, PERMISSIONS.updateBondStatus, PERMISSIONS.manageBankFeedback, PERMISSIONS.requestFinanceDocs, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.adminStaff]: grant(ACCESS_SCOPES.branchOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewBondDashboard, PERMISSIONS.viewApplications, PERMISSIONS.requestFinanceDocs, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
    [ORG_ROLES.viewer]: grant(ACCESS_SCOPES.assignedOnly, [PERMISSIONS.viewDashboard, PERMISSIONS.viewBondDashboard, PERMISSIONS.viewApplications, PERMISSIONS.viewClients, PERMISSIONS.viewTransactions]),
  }),
})

export const clientPermissions = Object.freeze(
  grant(ACCESS_SCOPES.clientLinkOnly, [
    PERMISSIONS.viewClientPortal,
    PERMISSIONS.uploadRequestedDocuments,
    PERMISSIONS.viewClientTransactionProgress,
    PERMISSIONS.commentOnClientThread,
    PERMISSIONS.completeClientForms,
  ]),
)

export const platformAdminPermissions = Object.freeze(
  grant(ACCESS_SCOPES.allWorkspace, [
    PERMISSIONS.viewDashboard,
    PERMISSIONS.platformViewAll,
    PERMISSIONS.platformManageAll,
    PERMISSIONS.platformSupportImpersonation,
    PERMISSIONS.platformAuditAccess,
    PERMISSIONS.viewAuditLog,
  ]),
)

export const navPermissionByKey = Object.freeze({
  dashboard: PERMISSIONS.viewDashboard,
  developments: PERMISSIONS.viewDevelopments,
  transactions: PERMISSIONS.viewTransactions,
  transfers: PERMISSIONS.viewMatters,
  applications: PERMISSIONS.viewApplications,
  clients: PERMISSIONS.viewClients,
  financials: PERMISSIONS.viewReports,
  marketing: PERMISSIONS.editDevelopments,
  new_transaction: PERMISSIONS.createTransactions,
  pipeline: PERMISSIONS.viewLeads,
  leads: PERMISSIONS.viewLeads,
  pipeline_overview: PERMISSIONS.viewLeads,
  pipeline_leads: PERMISSIONS.viewLeads,
  pipeline_canvassing: PERMISSIONS.createLeads,
  pipeline_calendar: PERMISSIONS.manageAppointments,
  calendar: PERMISSIONS.manageAppointments,
  listings: PERMISSIONS.viewListings,
  listings_private: PERMISSIONS.viewListings,
  listings_developments: PERMISSIONS.viewDevelopments,
  agency: PERMISSIONS.manageBranches,
  agency_branches: PERMISSIONS.manageBranches,
  agency_agents: PERMISSIONS.manageUsers,
  agency_analytics: PERMISSIONS.viewReports,
  agents: PERMISSIONS.manageUsers,
  agents_directory: PERMISSIONS.manageUsers,
  agents_reporting: PERMISSIONS.viewReports,
  documents: PERMISSIONS.viewTransactions,
  attorney_matters: PERMISSIONS.viewMatters,
  attorney_matters_all: PERMISSIONS.viewMatters,
  attorney_matters_transfer: PERMISSIONS.viewMatters,
  attorney_matters_bond: PERMISSIONS.viewMatters,
  attorney_matters_cancellation: PERMISSIONS.viewMatters,
  attorney_matters_registered: PERMISSIONS.viewMatters,
  attorney_matters_archived: PERMISSIONS.viewMatters,
  attorney_workflow_board: PERMISSIONS.manageTransferWorkflow,
  scheduling: PERMISSIONS.manageSigningAppointments,
  team_departments: PERMISSIONS.manageAttorneyTeam,
  buyer_information: PERMISSIONS.viewClientPortal,
  handover: PERMISSIONS.viewClientPortal,
  reports: PERMISSIONS.viewReports,
  audit_logs: PERMISSIONS.viewAuditLog,
  snags: PERMISSIONS.viewClientPortal,
  team: PERMISSIONS.manageDevelopmentTeam,
  users: PERMISSIONS.manageUsers,
  settings: PERMISSIONS.manageWorkspaceSettings,
})

export const routePermissionRules = Object.freeze([
  { prefix: '/attorney/firm-settings', appRole: APP_ROLES.attorney, workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.manageWorkspaceSettings },
  { prefix: '/attorney/audit-logs', appRole: APP_ROLES.attorney, workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.viewAuditLog },
  { prefix: '/attorney/scheduling', appRole: APP_ROLES.attorney, workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.manageSigningAppointments },
  { prefix: '/attorney/operations', appRole: APP_ROLES.attorney, workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.manageTransferWorkflow },
  { prefix: '/attorney/matters', appRole: APP_ROLES.attorney, workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.viewMatters },
  { prefix: '/attorney/dashboard', appRole: APP_ROLES.attorney, workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.viewAttorneyDashboard },
  { prefix: '/agency/branches', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.manageBranches },
  { prefix: '/agency/agents', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.manageUsers },
  { prefix: '/agency/analytics', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.viewReports },
  { prefix: '/agents/reporting', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.viewReports },
  { prefix: '/pipeline/calendar', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.manageAppointments },
  { prefix: '/pipeline/canvassing', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.createLeads },
  { prefix: '/pipeline', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.viewLeads },
  { prefix: '/listings', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.viewListings },
  { prefix: '/agent/listings', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.viewListings },
  { prefix: '/new-transaction', workspaceType: WORKSPACE_TYPES.agency, permission: PERMISSIONS.createTransactions },
  { prefix: '/applications', appRole: APP_ROLES.bondOriginator, workspaceType: WORKSPACE_TYPES.bondOriginator, permission: PERMISSIONS.viewApplications },
  { prefix: '/developments', permission: PERMISSIONS.viewDevelopments },
  { prefix: '/units', permission: PERMISSIONS.viewTransactions },
  { prefix: '/transactions', permission: PERMISSIONS.viewTransactions },
  { prefix: '/clients', permission: PERMISSIONS.viewClients },
  { prefix: '/financials', workspaceType: WORKSPACE_TYPES.attorneyFirm, permission: PERMISSIONS.viewReports },
  { prefix: '/documents', permission: PERMISSIONS.viewTransactions },
  { prefix: '/reports', permission: PERMISSIONS.viewReports },
  { prefix: '/team', permission: PERMISSIONS.manageDevelopmentTeam },
  { prefix: '/settings/users', permission: PERMISSIONS.manageUsers },
  { prefix: '/settings/billing', permission: PERMISSIONS.manageBilling },
  { prefix: '/settings/developments', permission: PERMISSIONS.manageWorkspaceSettings },
  { prefix: '/settings', permission: PERMISSIONS.manageWorkspaceSettings },
  { prefix: '/buyer-information', appRole: APP_ROLES.client, permission: PERMISSIONS.viewClientPortal },
  { prefix: '/handover', appRole: APP_ROLES.client, permission: PERMISSIONS.viewClientPortal },
])

export function normalizePermission(permission = '') {
  const normalized = String(permission || '').trim().toLowerCase()
  return PERMISSION_VALUES.includes(normalized) ? normalized : ''
}
