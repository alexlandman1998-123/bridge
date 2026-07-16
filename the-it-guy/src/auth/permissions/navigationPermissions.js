import { can } from './permissionResolver'
import { PERMISSIONS } from './permissionRegistry'

export const navPermissionByKey = Object.freeze({
  dashboard: PERMISSIONS.viewDashboard,
  developments: PERMISSIONS.viewDevelopments,
  bond_developments: PERMISSIONS.viewApplications,
  bond_developments_current: PERMISSIONS.viewApplications,
  bond_developments_developers: PERMISSIONS.viewApplications,
  transactions: PERMISSIONS.viewTransactions,
  transfers: PERMISSIONS.viewMatters,
  applications: PERMISSIONS.viewApplications,
  bond_pipeline: PERMISSIONS.viewApplications,
  clients: PERMISSIONS.viewClients,
  financials: PERMISSIONS.viewReports,
  marketing: PERMISSIONS.editDevelopments,
  new_transaction: PERMISSIONS.createTransactions,
  agency_pipeline: PERMISSIONS.viewLeads,
  developer_pipeline: PERMISSIONS.viewSalesPipeline,
  pipeline: PERMISSIONS.viewLeads,
  leads: PERMISSIONS.viewLeads,
  pipeline_overview: PERMISSIONS.viewLeads,
  pipeline_leads: PERMISSIONS.viewLeads,
  pipeline_canvassing: PERMISSIONS.createLeads,
  pipeline_calendar: PERMISSIONS.manageAppointments,
  calendar: PERMISSIONS.manageAppointments,
  bond_calendar: PERMISSIONS.viewApplications,
  tasks: PERMISSIONS.viewApplications,
  listings: PERMISSIONS.viewListings,
  listings_private: PERMISSIONS.viewListings,
  listings_developments: PERMISSIONS.viewDevelopments,
  agency: PERMISSIONS.manageBranches,
  agency_branches: PERMISSIONS.manageBranches,
  agency_agents: PERMISSIONS.manageUsers,
  agency_analytics: PERMISSIONS.viewReports,
  agency_legal_templates: PERMISSIONS.manageWorkspaceSettings,
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
  attorney_firm: PERMISSIONS.manageAttorneyTeam,
  attorney_firm_branches: PERMISSIONS.manageBranches,
  attorney_firm_users: PERMISSIONS.manageAttorneyTeam,
  attorney_firm_finance: PERMISSIONS.viewReports,
  team_departments: PERMISSIONS.manageAttorneyTeam,
  buyer_information: PERMISSIONS.viewClientPortal,
  handover: PERMISSIONS.viewClientPortal,
  reports: PERMISSIONS.viewReports,
  bond_reports: PERMISSIONS.viewApplications,
  bond_organisation: PERMISSIONS.viewApplications,
  partner_intelligence: PERMISSIONS.viewApplications,
  consultant_performance: PERMISSIONS.viewApplications,
  branch_operations: PERMISSIONS.viewApplications,
  regional_operations: PERMISSIONS.viewApplications,
  hq_command_centre: PERMISSIONS.viewApplications,
  bank_relationships: PERMISSIONS.viewApplications,
  revenue_commissions: PERMISSIONS.viewApplications,
  automation_rules: PERMISSIONS.viewApplications,
  predictive_intelligence: PERMISSIONS.viewApplications,
  audit_logs: PERMISSIONS.viewAuditLog,
  client_snags: PERMISSIONS.viewClientPortal,
  developer_snags: PERMISSIONS.viewDevelopments,
  snags: PERMISSIONS.viewClientPortal,
  team: PERMISSIONS.manageDevelopmentTeam,
  users: PERMISSIONS.manageUsers,
  settings_workspace: PERMISSIONS.manageWorkspaceSettings,
})

export function filterNavigationItems(items = [], context = {}) {
  return (items || [])
    .map((item) => {
      const children = Array.isArray(item.children) ? filterNavigationItems(item.children, context) : []
      const permission = navPermissionByKey[item.key]
      const visible = !permission || can(permission, context) || children.length > 0
      if (!visible) return null
      return children.length ? { ...item, children } : { ...item, children: undefined }
    })
    .filter(Boolean)
}
