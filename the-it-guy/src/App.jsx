import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import AppErrorBoundary from './components/AppErrorBoundary'
import AccessState from './components/access/AccessState'
import MobileLoginRedirectGate from './components/mobile-shell/MobileLoginRedirectGate'
import MobileRouteGuard from './components/mobile-shell/MobileRouteGuard'
import PermissionGate from './components/PermissionGate'
import TokenRouteGate from './components/routing/TokenRouteGate'
import { AuthSessionProvider, useAuthSession } from './context/AuthSessionContext'
import { OrganisationProvider, useOrganisation } from './context/OrganisationContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { useWorkspace } from './context/WorkspaceContext'
import { APP_ROLE_LABELS } from './lib/roles'
import { FEATURE_FLAGS, SHOW_INTELLIGENCE_BETA } from './lib/featureFlags'
import {
  isSupabaseConfigured,
} from './lib/supabaseClient'
import { getRuntimeEnvValidation } from './lib/envValidation'
import { markRouteFirstVisibleContent, markRouteRendered } from './lib/performanceTrace'
import { isOnboardingRoute } from './lib/onboardingRouting'
import { ONBOARDING_REQUIRED_REASONS } from './constants/onboardingStatuses'
import { resolveSignupIntentRoute } from './lib/signupIntent'
import { storePostLoginRedirect } from './lib/resolveMobileAwareRedirect'
import { evaluateAccessRequirement, getRouteAccessRequirement } from './auth/permissions/permissionResolver'
import { canAccessHQ } from './auth/hqAccess'
import { PERMISSIONS } from './auth/permissions/permissionRegistry'
import { createRoutePerformanceMarker } from './services/observability/performanceMetrics'
import { reportError } from './services/observability/errorTracking'
import { trackPermissionMetric } from './services/observability/monitoring'
import { isCommercialProfessionalMember } from './modules/commercial/utils/resolveCommercialRole'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

const INACTIVITY_TIMEOUT_MINUTES = 15
const WARNING_BEFORE_LOGOUT_MINUTES = 1
const INACTIVITY_TIMEOUT_MS = INACTIVITY_TIMEOUT_MINUTES * 60 * 1000
const WARNING_BEFORE_LOGOUT_MS = WARNING_BEFORE_LOGOUT_MINUTES * 60 * 1000
const WARNING_DELAY_MS = Math.max(INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS, 0)
const ACTIVITY_TIMER_RESET_THROTTLE_MS = 1000

const lazyNamed = (loader, exportName) => lazy(() => loader().then((module) => ({ default: module[exportName] })))

const COMMERCIAL_MODULE_MARKERS = new Set(['commercial', 'commercial_brokerage', 'commercial_agency'])
const WORKSPACE_SWITCHER_STORAGE_KEY = 'bridge:active-workspace'
const PUBLIC_WEBSITE_HOSTS = new Set(['arch9.co.za', 'www.arch9.co.za'])

function normalizeRouteText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isPublicWebsiteHost() {
  if (typeof window === 'undefined') return false
  const hostname = normalizeRouteText(window.location.hostname)
  return PUBLIC_WEBSITE_HOSTS.has(hostname) || hostname.startsWith('bridge-website-')
}

function PublicAwareRootRoute() {
  return isPublicWebsiteHost() ? <BridgeLanding /> : <Navigate to="/dashboard" replace />
}

function getPreferredWorkspaceMode() {
  if (typeof window === 'undefined' || !window.localStorage) return ''
  try {
    const value = normalizeRouteText(window.localStorage.getItem(WORKSPACE_SWITCHER_STORAGE_KEY))
    return value === 'residential' || value === 'commercial' ? value : ''
  } catch {
    return ''
  }
}

function hasCommercialMembershipMarker(membership = {}) {
  const safeMembership = membership && typeof membership === 'object' ? membership : {}
  const raw = safeMembership.raw && typeof safeMembership.raw === 'object' ? safeMembership.raw : {}
  const metadata =
    (raw.module_metadata && typeof raw.module_metadata === 'object' ? raw.module_metadata : null) ||
    (raw.moduleMetadata && typeof raw.moduleMetadata === 'object' ? raw.moduleMetadata : null) ||
    (raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null) ||
    (safeMembership.module_metadata && typeof safeMembership.module_metadata === 'object' ? safeMembership.module_metadata : null) ||
    (safeMembership.moduleMetadata && typeof safeMembership.moduleMetadata === 'object' ? safeMembership.moduleMetadata : null) ||
    (safeMembership.metadata && typeof safeMembership.metadata === 'object' ? safeMembership.metadata : {}) ||
    {}
  const moduleValue = normalizeRouteText(
    raw.module_context ||
      raw.moduleContext ||
      raw.module ||
      raw.module_type ||
      safeMembership.module_context ||
      safeMembership.moduleContext ||
      safeMembership.module ||
      safeMembership.module_type ||
      metadata.module_context ||
      metadata.moduleContext ||
      metadata.module ||
      metadata.module_type,
  )
  if (COMMERCIAL_MODULE_MARKERS.has(moduleValue)) return true

  const commercialRole = normalizeRouteText(
    metadata.commercial_role ||
      metadata.commercialRole ||
      metadata.broker_role ||
      metadata.brokerRole,
  )
  if (commercialRole === 'broker' || commercialRole.startsWith('commercial_')) return true

  const workspaceType = normalizeRouteText(
    safeMembership.workspaceType ||
      safeMembership.workspace_type ||
      raw.workspace_type ||
      raw.workspaceType ||
      safeMembership.workspace?.type ||
      raw.workspace?.type,
  )
  if (COMMERCIAL_MODULE_MARKERS.has(workspaceType)) return true

  const role = normalizeRouteText(
    safeMembership.role ||
      safeMembership.workspaceRole ||
      safeMembership.workspace_role ||
      safeMembership.organisationRole ||
      safeMembership.organisation_role ||
      raw.workspace_role ||
      raw.organisation_role ||
      raw.role ||
      metadata.role,
  )
  return role.startsWith('commercial_') || role.includes('commercial_broker')
}

function isCommercialBrokerMembership(membership = {}) {
  const safeMembership = membership && typeof membership === 'object' ? membership : {}
  const raw = safeMembership.raw && typeof safeMembership.raw === 'object' ? safeMembership.raw : {}
  const metadata =
    (raw.module_metadata && typeof raw.module_metadata === 'object' ? raw.module_metadata : null) ||
    (raw.moduleMetadata && typeof raw.moduleMetadata === 'object' ? raw.moduleMetadata : null) ||
    (raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null) ||
    (safeMembership.module_metadata && typeof safeMembership.module_metadata === 'object' ? safeMembership.module_metadata : null) ||
    (safeMembership.moduleMetadata && typeof safeMembership.moduleMetadata === 'object' ? safeMembership.moduleMetadata : null) ||
    (safeMembership.metadata && typeof safeMembership.metadata === 'object' ? safeMembership.metadata : {}) ||
    {}
  const commercialRole = normalizeRouteText(
    metadata.commercial_role ||
      metadata.commercialRole ||
      metadata.broker_role ||
      metadata.brokerRole,
  )
  if (commercialRole === 'broker' || commercialRole === 'commercial broker' || commercialRole === 'commercial_broker') return true
  if (!hasCommercialMembershipMarker(membership)) return false
  const role = normalizeRouteText(
    safeMembership.role ||
      safeMembership.workspaceRole ||
      safeMembership.workspace_role ||
      safeMembership.organisationRole ||
      safeMembership.organisation_role ||
      raw.workspace_role ||
      raw.organisation_role ||
      raw.role ||
      metadata.role,
  )
  return role === 'agent' || role === 'broker' || role === 'commercial_broker' || role.includes('broker')
}

const AddDevelopmentModal = lazy(() => import('./components/AddDevelopmentModal'))
const AgentNewDealWizard = lazy(() => import('./components/AgentNewDealWizard'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const HeaderBar = lazy(() => import('./components/HeaderBar'))
const MobileExecutiveLayout = lazy(() => import('./components/mobile/MobileExecutiveLayout'))
const NewTransactionWizard = lazy(() => import('./components/NewTransactionWizard'))
const Sidebar = lazy(() => import('./components/Sidebar'))

const InviteResolver = lazy(() => import('./pages/InviteResolver'))
const ReferralInvitePage = lazy(() => import('./pages/ReferralInvitePage'))
const AgentIntelligenceMarketPage = lazy(() => import('./pages/agent-intelligence/MarketPage'))
const AgentIntelligenceNetworkPage = lazy(() => import('./pages/agent-intelligence/NetworkPage'))
const AgentIntelligenceOpportunitiesPage = lazy(() => import('./pages/agent-intelligence/OpportunitiesPage'))
const AgentIntelligenceOverviewPage = lazy(() => import('./pages/agent-intelligence/OverviewPage'))
const AgentIntelligencePerformancePage = lazy(() => import('./pages/agent-intelligence/PerformancePage'))
const AgentIntelligencePipelinePage = lazy(() => import('./pages/agent-intelligence/PipelinePage'))
const AgentIntelligencePricingPage = lazy(() => import('./pages/agent-intelligence/PricingPage'))
const AgentListingDetail = lazy(() => import('./pages/AgentListingDetail'))
const AgentListings = lazy(() => import('./pages/AgentListings'))
const AgentEnquiriesPage = lazy(() => import('./pages/AgentEnquiriesPage'))
const AgentLeadsPage = lazy(() => import('./pages/AgentLeadsPage'))
const AgentReportingPage = lazy(() => import('./pages/AgentReportingPage'))
const AgentsPage = lazy(() => import('./pages/Agents'))
const AgentWorkspacePage = lazyNamed(() => import('./pages/Agents'), 'AgentWorkspacePage')
const AgencyAnalyticsPage = lazy(() => import('./pages/agency/AgencyAnalyticsPage'))
const AgencyBranchesPage = lazy(() => import('./pages/agency/AgencyBranchesPage'))
const AgencyGovernancePage = lazy(() => import('./pages/agency/AgencyGovernancePage'))
const AgencyBranchWorkspacePage = lazy(() => import('./pages/agency/AgencyBranchWorkspacePage'))
const AssistantDashboardPage = lazy(() => import('./pages/agency/AssistantDashboardPage'))
const BranchCommandCentrePage = lazy(() => import('./pages/agency/BranchCommandCentrePage'))
const AppointmentRsvpPage = lazy(() => import('./pages/AppointmentRsvpPage'))
const AttorneyDashboardPage = lazy(() => import('./pages/AttorneyDashboardPage'))
const AttorneyFirmSettingsPage = lazy(() => import('./pages/AttorneyFirmSettingsPage'))
const AttorneyIntelligenceDashboardPage = lazy(() => import('./pages/attorney-intelligence/DashboardPage'))
const AttorneyIntelligenceMarketPositionPage = lazy(() => import('./pages/attorney-intelligence/MarketPositionPage'))
const AttorneyIntelligenceOpportunityEnginePage = lazy(() => import('./pages/attorney-intelligence/OpportunityEnginePage'))
const AttorneyIntelligencePartnerPage = lazy(() => import('./pages/attorney-intelligence/PartnerIntelligencePage'))
const AttorneyIntelligenceRevenueForecastPage = lazy(() => import('./pages/attorney-intelligence/RevenueForecastPage'))
const AttorneyMattersPage = lazy(() => import('./pages/AttorneyMattersPage'))
const AttorneyOnboardingPage = lazy(() => import('./pages/AttorneyOnboardingPage'))
const AttorneyOperationsPage = lazy(() => import('./pages/AttorneyOperationsPage'))
const AttorneySchedulingPage = lazy(() => import('./pages/AttorneySchedulingPage'))
const AttorneyTransactionDetail = lazy(() => import('./pages/AttorneyTransactionDetail'))
const Auth = lazy(() => import('./pages/Auth'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Arch9LaunchConcierge = lazy(() => import('./pages/Arch9LaunchConcierge'))
const BridgeAgentsPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeAgentsPage')
const BridgeAboutPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeAboutPage')
const BridgeBuyPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeBuyPage')
const BridgeBuyersPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeBuyersPage')
const BridgeContactPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeContactPage')
const BridgeConveyancersPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeConveyancersPage')
const BridgeDevelopersPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeDevelopersPage')
const BridgeHowItWorksPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeHowItWorksPage')
const BridgeLanding = lazy(() => import('./pages/BridgeLanding'))
const BridgePricingPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgePricingPage')
const BridgeProductPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeProductPage')
const BridgeResourcesPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeResourcesPage')
const BridgeSolutionsPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeSolutionsPage')
const BridgeToolsPage = lazyNamed(() => import('./pages/BridgeLanding'), 'BridgeToolsPage')
const BuyerOfferSubmission = lazy(() => import('./pages/BuyerOfferSubmission'))
const PostViewingOfferPortal = lazy(() => import('./pages/PostViewingOfferPortal'))
const SellerOfferReviewPage = lazy(() => import('./pages/SellerOfferReviewPage'))
const ClientModulePage = lazy(() => import('./pages/ClientModulePage'))
const ClientOnboarding = lazy(() => import('./pages/ClientOnboarding'))
const ClientOtpSigning = lazy(() => import('./pages/ClientOtpSigning'))
const ClientPortal = lazy(() => import('./pages/ClientPortal'))
const ClientProfile = lazy(() => import('./pages/ClientProfile'))
const Clients = lazy(() => import('./pages/Clients'))
const ConveyancerDevelopments = lazy(() => import('./pages/ConveyancerDevelopments'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const BondDashboardPage = lazy(() => import('./pages/bond/BondDashboardPage'))
const BondDevelopmentsPage = lazy(() => import('./pages/bond/BondDevelopmentsPage'))
const BondTransactionsPage = lazy(() => import('./pages/bond/BondTransactionsPage'))
const BondModuleHubPage = lazy(() => import('./pages/bond/BondModuleHubPage'))
const BondReportsAnalyticsPage = lazy(() => import('./pages/bond/BondReportsAnalyticsPage'))
const BondOrganisationPage = lazy(() => import('./pages/bond/BondOrganisationPage'))
const BondPartnerCollaborationPage = lazy(() => import('./pages/bond/BondPartnerCollaborationPage'))
const BondPartnerProfilePage = lazy(() => import('./pages/bond/BondPartnerProfilePage'))
const BondPartnerIntelligencePage = lazy(() => import('./pages/bond/BondPartnerIntelligencePage'))
const BondConsultantPerformancePage = lazy(() => import('./pages/bond/BondConsultantPerformancePage'))
const BondBranchOperationsPage = lazy(() => import('./pages/bond/BondBranchOperationsPage'))
const BondRegionalOperationsPage = lazy(() => import('./pages/bond/BondRegionalOperationsPage'))
const BondHQCommandCentrePage = lazy(() => import('./pages/bond/BondHQCommandCentrePage'))
const BondBankRelationshipsPage = lazy(() => import('./pages/bond/BondBankRelationshipsPage'))
const BondRevenueManagementPage = lazy(() => import('./pages/bond/BondRevenueManagementPage'))
const BondAutomationCentrePage = lazy(() => import('./pages/bond/BondAutomationCentrePage'))
const BondPredictiveIntelligencePage = lazy(() => import('./pages/bond/BondPredictiveIntelligencePage'))
const CommercialLayout = lazy(() => import('./modules/commercial/components/CommercialLayout'))
const CommercialManagerRouteGate = lazy(() => import('./modules/commercial/components/CommercialManagerRouteGate'))
const CommercialActivityPage = lazy(() => import('./modules/commercial/pages/CommercialActivityPage'))
const CommercialBrokerAssignmentsPage = lazy(() => import('./modules/commercial/pages/CommercialBrokerAssignmentsPage'))
const CommercialBrokerBranchesPage = lazy(() => import('./modules/commercial/pages/CommercialBrokerBranchesPage'))
const CommercialBrokerOverviewPage = lazy(() => import('./modules/commercial/pages/CommercialBrokerOverviewPage'))
const CommercialBrokersPage = lazy(() => import('./modules/commercial/pages/CommercialBrokersPage'))
const CommercialBrokerTeamsPage = lazy(() => import('./modules/commercial/pages/CommercialBrokerTeamsPage'))
const CommercialCalendarPage = lazy(() => import('./modules/commercial/pages/CommercialCalendarPage'))
const CommercialCanvassingPage = lazy(() => import('./modules/commercial/pages/CommercialCanvassingPage'))
const CommercialCompanyWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialCompanyWorkspacePage'))
const CommercialContactWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialContactWorkspacePage'))
const CommercialClientsPage = lazy(() => import('./modules/commercial/pages/CommercialClientsPage'))
const CommercialBulkUploadSettingsPage = lazy(() => import('./modules/commercial/pages/CommercialBulkUploadSettingsPage'))
const CommercialDashboard = lazy(() => import('./modules/commercial/pages/CommercialDashboard'))
const CommercialDealsPipelinePage = lazy(() => import('./modules/commercial/pages/CommercialDealsPipelinePage'))
const CommercialDealsPage = lazy(() => import('./modules/commercial/pages/CommercialDealsPage'))
const CommercialDocumentsPage = lazy(() => import('./modules/commercial/pages/CommercialDocumentsPage'))
const CommercialDocumentGeneratorPage = lazy(() => import('./modules/commercial/pages/CommercialDocumentGeneratorPage'))
const CommercialExpiringOccupiersPage = lazy(() => import('./modules/commercial/pages/CommercialExpiringOccupiersPage'))
const CommercialExternalPortalPage = lazy(() => import('./modules/commercial/pages/CommercialExternalPortalPage'))
const CommercialOnboardingPortalPage = lazy(() => import('./modules/commercial/pages/CommercialOnboardingPortalPage'))
const CommercialLandlordsPage = lazy(() => import('./modules/commercial/pages/CommercialLandlordsPage'))
const CommercialLandlordOnboardingPage = lazy(() => import('./modules/commercial/pages/CommercialLandlordOnboardingPage'))
const CommercialLandlordWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialLandlordWorkspacePage'))
const CommercialLeadDetailPage = lazy(() => import('./modules/commercial/pages/CommercialLeadDetailPage'))
const CommercialLeadsPage = lazy(() => import('./modules/commercial/pages/CommercialLeadsPage'))
const CommercialLeaseExpiryWatchPage = lazy(() => import('./modules/commercial/pages/CommercialLeaseExpiryWatchPage'))
const CommercialLeaseTenantWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialLeaseTenantWorkspacePage'))
const CommercialLeasingTenantsPage = lazy(() => import('./modules/commercial/pages/CommercialLeasingTenantsPage'))
const CommercialLeasingPage = lazy(() => import('./modules/commercial/pages/CommercialLeasingPage'))
const CommercialListingWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialListingWorkspacePage'))
const CommercialListingsPage = lazy(() => import('./modules/commercial/pages/CommercialListingsPage'))
const CommercialMarketIntelligencePage = lazy(() => import('./modules/commercial/pages/CommercialMarketIntelligencePage'))
const CommercialPropertyWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialPropertyWorkspacePage'))
const CommercialPropertiesPage = lazy(() => import('./modules/commercial/pages/CommercialPropertiesPage'))
const CommercialRequirementsPipelinePage = lazy(() => import('./modules/commercial/pages/CommercialRequirementsPipelinePage'))
const CommercialPipelinePage = lazy(() => import('./modules/commercial/pages/CommercialPipelinePage'))
const CommercialReportsPage = lazy(() => import('./modules/commercial/pages/CommercialReportsPage'))
const CommercialSalesListingsPage = lazy(() => import('./modules/commercial/pages/CommercialSalesListingsPage'))
const CommercialSalesPage = lazy(() => import('./modules/commercial/pages/CommercialSalesPage'))
const CommercialSettingsPage = lazy(() => import('./modules/commercial/pages/CommercialSettingsPage'))
const CommercialTransactionWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialTransactionWorkspacePage'))
const CommercialVacancyWorkspacePage = lazy(() => import('./modules/commercial/pages/CommercialVacancyWorkspacePage'))
const CommercialVacanciesPage = lazy(() => import('./modules/commercial/pages/CommercialVacanciesPage'))
const CommercialViewingsPage = lazy(() => import('./modules/commercial/pages/CommercialViewingsPage'))
const CommandCenterPage = lazy(() => import('./pages/CommandCenterPage'))
const DeveloperIntelligenceDashboardPage = lazy(() => import('./pages/developer-intelligence/DashboardPage'))
const DeveloperIntelligenceFeasibilityPage = lazy(() => import('./pages/developer-intelligence/FeasibilityPage'))
const DeveloperIntelligenceGrowthNetworkPage = lazy(() => import('./pages/developer-intelligence/GrowthNetworkPage'))
const DeveloperIntelligenceMarketDemandPage = lazy(() => import('./pages/developer-intelligence/MarketDemandPage'))
const DeveloperIntelligenceOpportunityEnginePage = lazy(() => import('./pages/developer-intelligence/OpportunityEnginePage'))
const DeveloperIntelligencePortfolioPerformancePage = lazy(() => import('./pages/developer-intelligence/PortfolioPerformancePage'))
const DeveloperIntelligencePricingSimulatorPage = lazy(() => import('./pages/developer-intelligence/PricingSimulatorPage'))
const DevelopmentDetail = lazy(() => import('./pages/DevelopmentDetail'))
const DeveloperPartnerInvitePage = lazy(() => import('./pages/DeveloperPartnerInvitePage'))
const DeveloperPartnersPage = lazy(() => import('./pages/DeveloperPartnersPage'))
const Developments = lazy(() => import('./pages/Developments'))
const Documents = lazy(() => import('./pages/Documents'))
const ExecutiveSnapshot = lazy(() => import('./pages/ExecutiveSnapshot'))
const ExternalTransactionPortal = lazy(() => import('./pages/ExternalTransactionPortal'))
const Financials = lazy(() => import('./pages/Financials'))
const LegalDocumentWorkspacePage = lazy(() => import('./pages/LegalDocumentWorkspacePage'))
const MobileLayout = lazy(() => import('./components/mobile-shell/MobileLayout'))
const MobileDevelopmentDetailPage = lazy(() => import('./pages/mobile/MobileDevelopmentDetailPage'))
const MobileDevelopmentsPage = lazy(() => import('./pages/mobile/MobileDevelopmentsPage'))
const MobileHome = lazy(() => import('./pages/mobile/MobileHome'))
const MobileModulePage = lazy(() => import('./pages/mobile/MobileModulePage'))
const MobileMore = lazy(() => import('./pages/mobile/MobileMore'))
const MobileActivityPage = lazy(() => import('./pages/mobile/MobileActivityPage'))
const MobileDocumentsPage = lazy(() => import('./pages/mobile/MobileDocumentsPage'))
const MobileInboxPage = lazy(() => import('./pages/mobile/MobileInboxPage'))
const MobileOnboardingPage = lazy(() => import('./pages/mobile/MobileOnboardingPage'))
const MobileSearchPage = lazy(() => import('./pages/mobile/MobileSearchPage'))
const MobileTasksPage = lazy(() => import('./pages/mobile/MobileTasksPage'))
const MobileTransactionDetailPage = lazy(() => import('./pages/mobile/MobileTransactionDetailPage'))
const MobileWorkspacePage = lazy(() => import('./pages/mobile/MobileWorkspacePage'))
const NewTransactionPage = lazy(() => import('./pages/NewTransactionPage'))
const OnboardingProfileSetup = lazy(() => import('./pages/OnboardingProfileSetup'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const PipelineCanvassingPage = lazy(() => import('./pages/PipelineCanvassingPage'))
const PipelineOverviewPage = lazy(() => import('./pages/PipelineOverviewPage'))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'))
const PartnerPortalPage = lazy(() => import('./pages/PartnerPortalPage'))
const PartnersPage = lazy(() => import('./pages/PartnersPage'))
const OrganizationWorkspacePage = lazy(() => import('./pages/OrganizationWorkspacePage'))
const PlatformDemoEnquiriesPage = lazy(() => import('./pages/PlatformDemoEnquiriesPage'))
const PlatformDiagnosticsPage = lazy(() => import('./pages/PlatformDiagnosticsPage'))
const TransactionRoutingRolloutPage = lazy(() => import('./pages/TransactionRoutingRolloutPage'))
const WorkflowMigrationValidationPage = lazy(() => import('./pages/WorkflowMigrationValidationPage'))
const PostDashboardSetup = lazy(() => import('./pages/PostDashboardSetup'))
const Report = lazy(() => import('./pages/Report'))
const RoleModuleOnboarding = lazy(() => import('./pages/RoleModuleOnboarding'))
const SellerOnboarding = lazy(() => import('./pages/SellerOnboarding'))
const SettingsAccountPage = lazy(() => import('./pages/settings/SettingsAccountPage'))
const SettingsAuditLogPage = lazy(() => import('./pages/settings/SettingsAuditLogPage'))
const SettingsBillingPage = lazy(() => import('./pages/settings/SettingsBillingPage'))
const SettingsCommissionStructuresPage = lazy(() => import('./pages/settings/SettingsCommissionStructuresPage'))
const SettingsCommunicationsTemplatesPage = lazy(() => import('./pages/settings/SettingsCommunicationsTemplatesPage'))
const SettingsDevelopmentsPage = lazy(() => import('./pages/settings/SettingsDevelopmentsPage'))
const SettingsIntegrationsPage = lazy(() => import('./pages/settings/SettingsIntegrationsPage'))
const SettingsLanding = lazy(() => import('./pages/settings/SettingsLanding'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'))
const SettingsLeadCapturePage = lazy(() => import('./pages/settings/SettingsLeadCapturePage'))
const SettingsOrganisationPage = lazy(() => import('./pages/settings/SettingsOrganisationPage'))
const SettingsPreferredPartnersPage = lazy(() => import('./pages/settings/SettingsPreferredPartnersPage'))
const SettingsPartnerProspectsPage = lazy(() => import('./pages/settings/SettingsPartnerProspectsPage'))
const SettingsPartnerRoutingRulesPage = lazy(() => import('./pages/settings/SettingsPartnerRoutingRulesPage'))
const SettingsSigningTemplatesPage = lazy(() => import('./pages/settings/SettingsSigningTemplatesPage'))
const SettingsUsersPage = lazy(() => import('./pages/settings/SettingsUsersPage'))
const SettingsWorkflowsPage = lazy(() => import('./pages/settings/SettingsWorkflowsPage'))
const SignerPortal = lazy(() => import('./pages/SignerPortal'))
const Snags = lazy(() => import('./pages/Snags'))
const Team = lazy(() => import('./pages/Team'))
const TransactionStatusShare = lazy(() => import('./pages/TransactionStatusShare'))
const TransactionPartnerInvitePage = lazy(() => import('./pages/TransactionPartnerInvitePage'))
const UnitDetail = lazy(() => import('./pages/UnitDetail'))
const Units = lazy(() => import('./pages/Units'))

function PageSkeleton({ label = 'Preparing workspace' }) {
  return (
    <section className="min-h-[52vh] w-full rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-8 w-56 animate-pulse rounded-2xl bg-slate-200" />
          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="hidden h-12 w-12 animate-pulse rounded-2xl bg-slate-100 sm:block" />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
            <div className="h-3 w-20 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-5 h-9 w-24 animate-pulse rounded-2xl bg-slate-200" />
            <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="mt-7 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
        <div className="h-4 w-44 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
      <p className="mt-5 text-sm font-semibold text-slate-500">{label}</p>
    </section>
  )
}

function ModalSkeleton() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-white/60 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 h-8 w-64 max-w-full animate-pulse rounded-2xl bg-slate-200" />
        <div className="mt-5 space-y-3">
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[268px] shrink-0 overflow-hidden border-r border-[#e5edf6] bg-white px-4 py-4 shadow-[12px_0_32px_rgba(15,23,42,0.03)] lg:block">
      <div className="border-b border-[#edf2f7] pb-3 pt-[0.95rem]">
        <div className="flex min-h-[96px] items-center">
          <div className="h-16 w-44 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="mt-4 h-12 animate-pulse rounded-[14px] border border-[#d9e4ef] bg-slate-50" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="h-11 animate-pulse rounded-[12px] bg-slate-100" />
        ))}
      </div>
    </aside>
  )
}

function HeaderSkeleton() {
  return (
    <header className="flex h-[76px] items-center gap-4 border-b border-slate-200 bg-white px-5">
      <div className="h-11 w-36 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-11 w-48 animate-pulse rounded-2xl bg-slate-100" />
      <div className="ml-auto h-11 w-80 max-w-[35vw] animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-11 w-11 animate-pulse rounded-2xl bg-slate-100" />
    </header>
  )
}

function AppLayout({ onLogout, session = null, user }) {
  const { workspace, role, profile } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const mainScrollRef = useRef(null)
  const inactivityTimerRef = useRef(null)
  const warningTimerRef = useRef(null)
  const lastActivityAtRef = useRef(Date.now())
  const lastTimerResetAtRef = useRef(0)
  const resetInactivityTimerRef = useRef(null)
  const securityLogoutInProgressRef = useRef(false)
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false)
  const sessionWarningOpenRef = useRef(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardInitialDevelopmentId, setWizardInitialDevelopmentId] = useState('')
  const [wizardInitialListingId, setWizardInitialListingId] = useState('')
  const [developmentModalOpen, setDevelopmentModalOpen] = useState(false)
  const isLegalWorkspaceRoute =
    /^\/transactions\/[^/]+\/legal\/[^/]+/.test(location.pathname) ||
    /^\/legal-documents\/[^/]+/.test(location.pathname) ||
    /^\/pipeline\/leads\/[^/]+\/legal\/[^/]+/.test(location.pathname)
  const isCommercialRoute = location.pathname.startsWith('/commercial')
  const isBondRoute = location.pathname.startsWith('/bond')
  const isSettingsRoute = location.pathname === '/settings' || location.pathname.startsWith('/settings/')
  const routeContentKey = isSettingsRoute
    ? '/settings'
    : isBondRoute
      ? location.pathname
      : location.pathname
  const hideSharedHeader =
    isLegalWorkspaceRoute ||
    location.pathname === '/command-center' ||
    (role === 'developer' && (location.pathname === '/dashboard' || location.pathname === '/'))
  const isAttorneyDashboardRoute = role === 'attorney' && location.pathname === '/attorney/dashboard'
  const isDashboardRoute = location.pathname === '/dashboard' || location.pathname === '/'
  const defaultDevelopmentId = workspace.id === 'all' ? '' : workspace.id

  useEffect(() => {
    function clearSessionTimers() {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current)
      if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current)
      inactivityTimerRef.current = null
      warningTimerRef.current = null
    }

    async function performSecurityLogout() {
      if (securityLogoutInProgressRef.current) return
      securityLogoutInProgressRef.current = true
      clearSessionTimers()
      sessionWarningOpenRef.current = false
      setSessionWarningOpen(false)
      try {
        await Promise.resolve(onLogout?.())
      } catch (logoutError) {
        console.error('[SESSION] security logout failed', logoutError)
      } finally {
        navigate('/auth?security=1', { replace: true })
      }
    }

    function scheduleInactivityTimers() {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current)
      if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current)
      const now = Date.now()
      const inactiveForMs = now - lastActivityAtRef.current
      const nextWarningDelayMs = Math.max(WARNING_DELAY_MS - inactiveForMs, 0)
      const nextLogoutDelayMs = Math.max(INACTIVITY_TIMEOUT_MS - inactiveForMs, 0)
      warningTimerRef.current = window.setTimeout(() => {
        const latestInactiveForMs = Date.now() - lastActivityAtRef.current
        if (latestInactiveForMs < WARNING_DELAY_MS) {
          scheduleInactivityTimers()
          return
        }
        sessionWarningOpenRef.current = true
        setSessionWarningOpen(true)
      }, nextWarningDelayMs)
      inactivityTimerRef.current = window.setTimeout(() => {
        const latestInactiveForMs = Date.now() - lastActivityAtRef.current
        if (latestInactiveForMs < INACTIVITY_TIMEOUT_MS) {
          scheduleInactivityTimers()
          return
        }
        void performSecurityLogout()
      }, nextLogoutDelayMs)
    }

    function resetInactivityTimer() {
      if (securityLogoutInProgressRef.current) return
      const now = Date.now()
      lastActivityAtRef.current = now
      if (now - lastTimerResetAtRef.current < ACTIVITY_TIMER_RESET_THROTTLE_MS && !sessionWarningOpenRef.current) return
      lastTimerResetAtRef.current = now
      sessionWarningOpenRef.current = false
      setSessionWarningOpen(false)
      scheduleInactivityTimers()
    }
    resetInactivityTimerRef.current = resetInactivityTimer

    clearSessionTimers()
    securityLogoutInProgressRef.current = false
    sessionWarningOpenRef.current = false
    lastActivityAtRef.current = Date.now()
    lastTimerResetAtRef.current = 0
    scheduleInactivityTimers()

    const activityEvents = [
      'pointermove',
      'pointerdown',
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'wheel',
      'scroll',
      'touchstart',
      'touchmove',
      'input',
      'change',
      'dragstart',
      'drop',
    ]
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer, { passive: true })
    })
    document.addEventListener('scroll', resetInactivityTimer, { passive: true, capture: true })

    return () => {
      clearSessionTimers()
      resetInactivityTimerRef.current = null
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer)
      })
      document.removeEventListener('scroll', resetInactivityTimer, true)
    }
  }, [navigate, onLogout, session?.access_token])

  function handleStaySignedIn() {
    resetInactivityTimerRef.current?.()
  }

  useEffect(() => {
    function openNewTransaction(event) {
      const requestedDevelopmentId = event?.detail?.initialDevelopmentId
      const requestedListingId = event?.detail?.listingId
      setWizardInitialDevelopmentId(requestedDevelopmentId ?? defaultDevelopmentId)
      setWizardInitialListingId(requestedListingId || '')
      setWizardOpen(true)
    }

    function openNewDevelopment() {
      setDevelopmentModalOpen(true)
    }

    window.addEventListener('itg:open-new-transaction', openNewTransaction)
    window.addEventListener('itg:open-new-development', openNewDevelopment)

    return () => {
      window.removeEventListener('itg:open-new-transaction', openNewTransaction)
      window.removeEventListener('itg:open-new-development', openNewDevelopment)
    }
  }, [defaultDevelopmentId])

  useEffect(() => {
    markRouteRendered(location.pathname)
    const frameId = window.requestAnimationFrame(() => {
      markRouteFirstVisibleContent(location.pathname)
    })
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [location.pathname])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const mainEl = mainScrollRef.current
      if (mainEl && typeof mainEl.scrollTo === 'function') {
        mainEl.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      }
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      }
    })
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [location.pathname])

  function handleOpenNewTransaction(initialDevelopmentId = defaultDevelopmentId) {
    setWizardInitialDevelopmentId(initialDevelopmentId)
    setWizardInitialListingId('')
    setWizardOpen(true)
  }

  function handleCloseNewTransaction() {
    setWizardOpen(false)
    setWizardInitialDevelopmentId(defaultDevelopmentId)
    setWizardInitialListingId('')
  }

  const sessionTimeoutWarning = sessionWarningOpen ? (
    <div className="fixed bottom-5 right-5 z-[1000] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[#d8e2ef] bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
      <p className="text-sm font-semibold text-[#10243a]">You’ve been inactive for a while.</p>
      <p className="mt-1.5 text-sm leading-6 text-[#60758d]">For your security, you’ll be signed out soon.</p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0f2742] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173a5e]"
          onClick={handleStaySignedIn}
        >
          Stay signed in
        </button>
      </div>
    </div>
  ) : null

  if (isCommercialRoute) {
    return (
      <div className="h-screen overflow-hidden bg-[#f6f8fb] text-textStrong">
        {sessionTimeoutWarning}
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-textStrong lg:h-screen lg:overflow-hidden">
      {sessionTimeoutWarning}
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>

      <div className="ui-main-region min-h-screen overflow-hidden lg:h-screen">
        {!hideSharedHeader ? (
          <Suspense fallback={<HeaderSkeleton />}>
            <HeaderBar
              onNewTransaction={() => handleOpenNewTransaction()}
              onNewDevelopment={() => setDevelopmentModalOpen(true)}
              onLogout={onLogout}
              user={{ ...(user || {}), ...(profile || {}) }}
            />
          </Suspense>
        ) : null}

        <main ref={mainScrollRef} className={`ui-main-content ui-page-scroll ${hideSharedHeader ? 'pt-6' : ''}`.trim()}>
          <div
            key={routeContentKey}
            className={`ui-content-container ${isDashboardRoute ? 'ui-content-container-dashboard' : ''} ${isAttorneyDashboardRoute ? 'ui-content-container-edge' : ''}`.trim()}
          >
            <Suspense key={routeContentKey} fallback={<PageSkeleton label={isBondRoute ? 'Loading bond workspace' : 'Preparing workspace'} />}>
              <Outlet key={routeContentKey} />
            </Suspense>
          </div>
        </main>
      </div>

      {wizardOpen ? (
        <Suspense fallback={<ModalSkeleton />}>
          {role === 'agent' ? (
            <AgentNewDealWizard
              open={wizardOpen}
              onClose={handleCloseNewTransaction}
	              initialDevelopmentId={wizardInitialDevelopmentId}
	              initialPrivateListingId={wizardInitialListingId}
	            />
          ) : (
            <NewTransactionWizard
              open={wizardOpen}
              onClose={handleCloseNewTransaction}
              initialDevelopmentId={wizardInitialDevelopmentId}
            />
          )}
        </Suspense>
      ) : null}

      {developmentModalOpen ? (
        <Suspense fallback={<ModalSkeleton />}>
          <AddDevelopmentModal
            open={developmentModalOpen}
            onClose={() => setDevelopmentModalOpen(false)}
            contextRole={role}
            onCreated={() => {
              window.dispatchEvent(new Event('itg:developments-changed'))
              window.dispatchEvent(new Event('itg:listings-updated'))
            }}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <CommandPalette
          onNewTransaction={() => handleOpenNewTransaction()}
          onNewDevelopment={() => setDevelopmentModalOpen(true)}
        />
      </Suspense>
    </div>
  )
}

const WORKSPACE_GATE_SLOW_MS = 30000

function AccessDenied({ title = 'Access restricted', message = 'You do not have access to this area.' }) {
  return <AccessState type="denied" title={title} description={message} />
}

function isSetupPath(pathname = '') {
  return (
    pathname === '/setup' ||
    pathname.startsWith('/setup/') ||
    pathname === '/client-access' ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/attorney/onboarding') ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/agent/invite/') ||
    pathname.startsWith('/referrals/invite/')
  )
}

function AuthGate({ onRetryBootstrap = null, onLogout = null }) {
  const location = useLocation()
  const { authState } = useAuthSession()
  const { retryWorkspaceBootstrap } = useWorkspace()
  const [loadingSlow, setLoadingSlow] = useState(false)
  const didHandleSessionMismatchRef = useRef(false)
  const authLoading = authState.status === 'loading'
  const session = authState.session
  const profileError = authState.bootError
  const baseRole = authState.appRole
  const onboardingCompleted = authState.onboardingComplete
  const waitingOnWorkspace = authState.status === 'loading'

  useEffect(() => {
    if (!waitingOnWorkspace) {
      const resetFrameId = window.requestAnimationFrame(() => {
        setLoadingSlow(false)
      })
      return () => window.cancelAnimationFrame(resetFrameId)
    }
    const timeoutId = window.setTimeout(() => {
      setLoadingSlow(true)
      console.warn('[AUTH] gate:slow', {
        authLoading,
        hasSession: Boolean(session),
        authStatus: authState.status,
        path: location.pathname,
      })
    }, WORKSPACE_GATE_SLOW_MS)
    return () => window.clearTimeout(timeoutId)
  }, [authLoading, authState.status, location.pathname, session, waitingOnWorkspace])

  useEffect(() => {
    console.debug('[AUTH] gate:state', {
      path: location.pathname,
      authStatus: authState.status,
      hasSession: Boolean(session),
      hasProfileError: Boolean(profileError),
      baseRole,
      onboardingCompleted,
      onboardingRequiredReason: authState.onboardingRequiredReason || null,
      activeMemberships: authState.activeMemberships.length,
    })
  }, [authState.activeMemberships.length, authState.onboardingRequiredReason, authState.status, baseRole, location.pathname, onboardingCompleted, profileError, session])

  const normalizedProfileError = String(profileError || '').toLowerCase()
  const sessionOutOfSync =
    normalizedProfileError.includes('user from sub claim in jwt does not exist')
    || normalizedProfileError.includes('session is out of sync')

  useEffect(() => {
    if (!sessionOutOfSync || didHandleSessionMismatchRef.current) {
      return
    }
    didHandleSessionMismatchRef.current = true
    console.debug('[REDIRECT] auth:session-out-of-sync', { target: '/auth' })
    void Promise.resolve(onLogout?.()).finally(() => {
      window.location.assign('/auth')
    })
  }, [onLogout, sessionOutOfSync])

  if (waitingOnWorkspace) {
    if (loadingSlow) {
      return (
        <section className="auth-loading-screen">
          <div className="auth-loading-card">
            <h2>Still preparing your workspace…</h2>
            <p>Arch9 is still loading your profile, workspace, and permissions. This can take longer after schema updates.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="auth-primary-cta"
                onClick={() => {
                  setLoadingSlow(false)
                  onRetryBootstrap?.()
                  retryWorkspaceBootstrap?.()
                }}
              >
                Retry
              </button>
              <button
                type="button"
                className="auth-secondary-cta"
                onClick={() => {
                  onLogout?.()
                  window.location.assign('/auth')
                }}
              >
                Restart Sign-in
              </button>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Loading secure workspace…</h2>
          <p>Authenticating session and preparing your dashboard.</p>
        </div>
      </section>
    )
  }

  if (authState.status === 'unauthenticated' || !session) {
    console.debug('[REDIRECT] auth:missing-session', { target: '/auth', from: location.pathname })
    storePostLoginRedirect(`${location.pathname || '/'}${location.search || ''}${location.hash || ''}`)
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  if (authState.status === 'error') {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>We couldn’t load your Arch9 account.</h2>
          <p>{profileError || 'Authentication boot failed.'}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="auth-primary-cta"
              onClick={() => retryWorkspaceBootstrap?.()}
            >
              Retry
            </button>
            <button
              type="button"
              className="auth-secondary-cta"
              onClick={() => window.location.assign('/auth')}
            >
              Go to Sign-in
            </button>
          </div>
        </div>
      </section>
    )
  }

  const onAnyOnboardingRoute = isOnboardingRoute(location.pathname)
  if (baseRole !== 'client' && (onAnyOnboardingRoute || !onboardingCompleted)) {
    console.debug('[ONBOARDING] gate:setup-state', {
      path: location.pathname,
      onboardingRequiredReason: authState.onboardingRequiredReason || null,
    })
  }

  const reason = authState.onboardingRequiredReason
  const hasCommercialAccess =
    hasCommercialMembershipMarker(authState.currentMembership) ||
    (authState.activeMemberships || []).some((membership) => hasCommercialMembershipMarker(membership))
  const commercialRecoveryCanContinue =
    hasCommercialAccess &&
    (
      reason === ONBOARDING_REQUIRED_REASONS.missingBranch ||
      reason === ONBOARDING_REQUIRED_REASONS.missingSettings ||
      reason === ONBOARDING_REQUIRED_REASONS.completionValidationFailed ||
      reason === ONBOARDING_REQUIRED_REASONS.invalidOnboardingState
    )
  if (commercialRecoveryCanContinue) {
    if (!location.pathname.startsWith('/commercial')) {
      return <Navigate to="/commercial" replace />
    }
    return <Outlet />
  }

  if (
    reason === ONBOARDING_REQUIRED_REASONS.noProfile ||
    reason === ONBOARDING_REQUIRED_REASONS.profileIncomplete ||
    reason === ONBOARDING_REQUIRED_REASONS.appRoleMissing
  ) {
    if (!location.pathname.startsWith('/onboarding/profile')) {
      return <Navigate to="/onboarding/profile" replace />
    }
    return <Outlet />
  }

  if (reason === ONBOARDING_REQUIRED_REASONS.onboardingIncomplete) {
    const target =
      authState.signupIntent
        ? resolveSignupIntentRoute(authState.signupIntent)
        : baseRole === 'attorney'
        ? '/attorney/onboarding'
        : baseRole === 'client'
          ? '/client-access'
          : '/setup'
    if (!isSetupPath(location.pathname) && location.pathname !== target) {
      return <Navigate to={target} replace />
    }
    return <Outlet />
  }

  if (
    reason === ONBOARDING_REQUIRED_REASONS.noActiveMembership ||
    reason === ONBOARDING_REQUIRED_REASONS.workspaceMissing ||
    reason === ONBOARDING_REQUIRED_REASONS.pendingApproval ||
    reason === ONBOARDING_REQUIRED_REASONS.missingBranch ||
    reason === ONBOARDING_REQUIRED_REASONS.missingDepartment ||
    reason === ONBOARDING_REQUIRED_REASONS.missingSettings ||
    reason === ONBOARDING_REQUIRED_REASONS.completionValidationFailed ||
    reason === ONBOARDING_REQUIRED_REASONS.invalidOnboardingState
  ) {
    const target = baseRole === 'client' ? '/client-access' : '/setup/recovery'
    if (!isSetupPath(location.pathname) && location.pathname !== target) {
      return <Navigate to={target} replace />
    }
    return <Outlet />
  }

  if (onAnyOnboardingRoute && onboardingCompleted) {
    const target = hasCommercialAccess ? '/commercial' : baseRole === 'attorney' ? '/attorney/dashboard' : '/dashboard'
    return <Navigate to={target} replace />
  }

  return <Outlet />
}

function RoleRoute({ allowedRoles, requiredPermission = '', requiredWorkspaceType = '', children }) {
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const { role, workspaceReady, profileLoading, activeMemberships, onboardingRequiredReason } = workspaceContext

  if (!workspaceReady || profileLoading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating access for this area.</p>
        </div>
      </section>
    )
  }

  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return children
  }

  const commercialMembershipAccess =
    location.pathname.startsWith('/commercial') &&
    allowedRoles.some((allowedRole) => String(allowedRole || '').startsWith('commercial_')) &&
    (
      isCommercialProfessionalMember(workspaceContext.currentMembership) ||
      activeMemberships.some((membership) => isCommercialProfessionalMember(membership))
    )

  if (!allowedRoles.includes(role) && !commercialMembershipAccess) {
    return <AccessDenied message="Your Arch9 role does not include access to this module." />
  }

  const canAccessWithoutMembership =
    role === 'client' ||
    role === 'platform_admin' ||
      location.pathname === '/setup' ||
      location.pathname.startsWith('/setup/') ||
    location.pathname.startsWith('/onboarding') ||
    location.pathname.startsWith('/attorney/onboarding') ||
    location.pathname.startsWith('/invite/') ||
    location.pathname.startsWith('/agent/invite/') ||
    location.pathname.startsWith('/referrals/invite/')

  if (!canAccessWithoutMembership && !activeMemberships.length && onboardingRequiredReason) {
    return <Navigate to="/setup" replace state={{ from: location }} />
  }

  const routeRequirement = getRouteAccessRequirement(location.pathname)
  const access = evaluateAccessRequirement(
    {
      ...routeRequirement,
      permission: requiredPermission || routeRequirement?.permission,
      workspaceType: requiredWorkspaceType || routeRequirement?.workspaceType,
    },
    workspaceContext,
  )

  if (!access.ok) {
    void trackPermissionMetric('permission_denied', {
      userId: workspaceContext.profile?.id || '',
      workspaceId: workspaceContext.currentWorkspace?.id || '',
      route: location.pathname,
      metadata: { reason: access.reason, requiredPermission: requiredPermission || routeRequirement?.permission || '' },
    })
    if (access.reason === 'membership_blocked') {
      return <AccessState type="suspended" description={access.message} />
    }
    return <AccessState type="permission_required" description={access.message} />
  }

  return children
}

function AttorneyFirmRoute({ children, requireFirm = true }) {
  const location = useLocation()
  const { role, workspaceReady, profileLoading, currentMembership, activeMemberships, suspendedMemberships } = useWorkspace()
  const attorneyMembership =
    currentMembership?.workspaceType === 'attorney_firm'
      ? currentMembership
      : activeMemberships.find((membership) => membership.workspaceType === 'attorney_firm')
  const suspendedAttorneyMembership = suspendedMemberships.find((membership) => membership.workspaceType === 'attorney_firm')

  if (!workspaceReady || profileLoading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating attorney firm access.</p>
        </div>
      </section>
    )
  }

  if (role !== 'attorney') {
    return <AccessDenied message="Your Arch9 role does not include access to the attorney workspace." />
  }

  if (suspendedAttorneyMembership?.status === 'suspended') {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Access suspended</h2>
          <p>Your access to this firm has been suspended. Please contact your firm administrator.</p>
        </div>
      </section>
    )
  }

  if (['removed', 'deactivated'].includes(suspendedAttorneyMembership?.status)) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Access unavailable</h2>
          <p>You are no longer a member of this firm.</p>
        </div>
      </section>
    )
  }

  if (requireFirm && !attorneyMembership?.workspaceId) {
    return <Navigate to={requireFirm ? '/setup' : '/attorney/onboarding'} replace state={{ from: location }} />
  }

  return children
}

function AgentManagementRoute({ children, allowBranchOperations = false }) {
  const workspaceContext = useWorkspace()
  const { workspaceReady, profileLoading } = workspaceContext
  const canAccess =
    evaluateAccessRequirement({ permission: PERMISSIONS.manageBranches }, workspaceContext).ok ||
    (allowBranchOperations && evaluateAccessRequirement({ permission: PERMISSIONS.manageUsers }, workspaceContext).ok)

  if (!workspaceReady || profileLoading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating access for this area.</p>
        </div>
      </section>
    )
  }

  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return children
  }

  if (!canAccess) {
    return <AccessDenied message="You need agency management authority to open this area." />
  }

  return children
}

const SUPPORT_OPERATION_ROLES = new Set(['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator', 'admin_staff'])

function SupportOperationsRoute({ children }) {
  const workspaceContext = useWorkspace()
  const { workspaceReady, profileLoading, currentMembership, workspaceRole } = workspaceContext
  const membershipRole = String(
    workspaceRole ||
      currentMembership?.workspaceRole ||
      currentMembership?.workspace_role ||
      currentMembership?.organisationRole ||
      currentMembership?.organisation_role ||
      currentMembership?.role ||
      '',
  ).trim().toLowerCase()
  const canAccess =
    SUPPORT_OPERATION_ROLES.has(membershipRole) &&
    evaluateAccessRequirement({ permission: PERMISSIONS.viewAgencyDashboard }, workspaceContext).ok

  if (!workspaceReady || profileLoading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating support access.</p>
        </div>
      </section>
    )
  }

  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return children
  }

  if (!canAccess) {
    return <AccessDenied message="You need an assistant or coordinator role to open this workspace." />
  }

  return children
}

function HQRoute({ children }) {
  const workspaceContext = useWorkspace()
  const { workspaceReady, profileLoading } = workspaceContext

  if (!workspaceReady || profileLoading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating founder HQ access.</p>
        </div>
      </section>
    )
  }

  if (!canAccessHQ(workspaceContext)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function OrganisationSettingsManageRoute({ children }) {
  const workspaceContext = useWorkspace()
  const { workspaceReady, profileLoading } = workspaceContext
  const canManage = evaluateAccessRequirement({ permission: PERMISSIONS.manageWorkspaceSettings }, workspaceContext).ok

  if (!workspaceReady || profileLoading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating access for this area.</p>
        </div>
      </section>
    )
  }

  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return children
  }

  if (!canManage) {
    return <AccessDenied message="You need workspace management authority to open this area." />
  }

  return children
}

function ClientAccessNotice({ onLogout }) {
  return (
    <section className="auth-loading-screen">
      <div className="auth-loading-card" style={{ maxWidth: '560px' }}>
        <h2>Client Access Uses Shared Transaction Links</h2>
        <p>
          The <strong>{APP_ROLE_LABELS.client}</strong> role does not use the internal module shell. Continue through
          your secure external transaction link.
        </p>
        <button type="button" className="header-secondary-cta" onClick={onLogout} style={{ marginTop: 12 }}>
          Logout
        </button>
      </div>
    </section>
  )
}

function ProtectedLayout({ onLogout, session }) {
  if (isSupabaseConfigured && !session) {
    return <Navigate to="/auth" replace />
  }

  return <AppLayout onLogout={onLogout} session={session} user={session?.user || null} />
}

function MobileProtectedLayout({ onLogout, session }) {
  if (isSupabaseConfigured && !session) {
    return <Navigate to="/auth" replace />
  }

  return <MobileLayout onLogout={onLogout} />
}

function MobilePublicPortalShell({ children }) {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#eef2f0] text-[#101820] antialiased">
      <main className="mx-auto min-h-[100dvh] w-full max-w-[520px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {children}
      </main>
    </div>
  )
}

function OrganisationGate({ children }) {
  const { role, activeMemberships } = useWorkspace()
  const { loading, error, refreshOrganisation } = useOrganisation()
  const shouldHydrateOrganisation = role !== 'client' && activeMemberships.length > 0

  if (shouldHydrateOrganisation && loading) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Loading organisation branding…</h2>
          <p>Preparing your workspace identity.</p>
        </div>
      </section>
    )
  }

  if (shouldHydrateOrganisation && error) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>We couldn’t load organisation branding.</h2>
          <p>{error}</p>
          <button
            type="button"
            className="auth-primary-cta mt-4"
            onClick={() => {
              void refreshOrganisation({ forceRefresh: true }).catch(() => {})
            }}
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  return children
}

function EnvironmentValidationBanner() {
  const validation = getRuntimeEnvValidation()
  if (validation.ok) return null
  if (!import.meta.env.DEV) return null

  return (
    <section className="auth-loading-screen">
      <div className="auth-loading-card">
        <h2>Environment Configuration Error</h2>
        <p>{validation.message || 'Required environment variables are missing.'}</p>
      </div>
    </section>
  )
}

function RouteObservability() {
  const location = useLocation()
  const { authState } = useAuthSession()

  useEffect(() => {
    const marker = createRoutePerformanceMarker(location.pathname)
    const frameId = window.requestAnimationFrame(() => {
      marker.finish({
        userId: authState.user?.id || '',
        workspaceId: authState.currentWorkspace?.id || '',
      })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [authState.currentWorkspace?.id, authState.user?.id, location.pathname])

  useEffect(() => {
    function handleError(event) {
      void reportError(event.error || new Error(event.message || 'Unhandled browser error'), {
        userId: authState.user?.id || '',
        workspaceId: authState.currentWorkspace?.id || '',
        route: location.pathname,
        category: 'ui_error',
        operation: 'window_error',
      })
    }
    function handleRejection(event) {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled promise rejection'))
      void reportError(reason, {
        userId: authState.user?.id || '',
        workspaceId: authState.currentWorkspace?.id || '',
        route: location.pathname,
        category: 'ui_error',
        operation: 'unhandled_rejection',
      })
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [authState.currentWorkspace?.id, authState.user?.id, location.pathname])

  return null
}

function AppRoutes() {
  const location = useLocation()
  const { session, authLoading, authError, retryAuthBootstrap, logout, devAuthRole, setDevAuthRole } = useAuthSession()
  const pendingInvitePath = (() => {
    if (typeof window === 'undefined') return ''
    const token = String(window.sessionStorage.getItem('itg:pending-org-invite-token') || '').trim()
    if (!token) return ''
    return `/invite/${token}`
  })()

  return (
    <WorkspaceProvider user={session?.user || null} authBypassRole={devAuthRole}>
      <OrganisationProvider>
        <EnvironmentValidationBanner />
        <RouteObservability />
        <Suspense fallback={<PageSkeleton label="Loading Arch9" />}>
          <Routes>
          <Route path="/" element={<PublicAwareRootRoute />} />
          <Route path="/buy" element={<BridgeBuyPage />} />
          <Route path="/buy/:slug" element={<BridgeBuyPage />} />
          <Route path="/bridge" element={<BridgeLanding />} />
          <Route path="/bridge/buy" element={<BridgeBuyPage />} />
          <Route path="/bridge/buy/:slug" element={<BridgeBuyPage />} />
          <Route path="/bridge/product" element={<BridgeProductPage />} />
          <Route path="/bridge/solutions" element={<BridgeSolutionsPage />} />
          <Route path="/bridge/tools" element={<BridgeToolsPage />} />
          <Route path="/bridge/resources" element={<BridgeResourcesPage />} />
          <Route path="/bridge/pricing" element={<BridgePricingPage />} />
          <Route path="/bridge/about" element={<BridgeAboutPage />} />
          <Route path="/bridge/how-it-works" element={<BridgeHowItWorksPage />} />
          <Route path="/bridge/contact" element={<BridgeContactPage />} />
          <Route path="/bridge/for-developers" element={<BridgeDevelopersPage />} />
          <Route path="/bridge/for-conveyancers" element={<BridgeConveyancersPage />} />
          <Route path="/bridge/for-agents" element={<BridgeAgentsPage />} />
          <Route path="/bridge/for-buyers" element={<BridgeBuyersPage />} />
          <Route path="/arch9-launch" element={<Arch9LaunchConcierge />} />
          <Route path="/launch/arch9" element={<Arch9LaunchConcierge />} />
          <Route path="/qr/arch9" element={<Arch9LaunchConcierge />} />
          <Route path="/referrals/invite/:token" element={<AppErrorBoundary scope="referral-invite" title="Referral invite failed to load"><ReferralInvitePage /></AppErrorBoundary>} />
          <Route element={<MobileExecutiveLayout />}>
            <Route path="/m/developments" element={<MobileDevelopmentsPage />} />
            <Route path="/m/developments/:developmentId" element={<MobileDevelopmentDetailPage />} />
            <Route path="/m/transactions/:transactionId" element={<MobileTransactionDetailPage />} />
          </Route>
          <Route
            element={
              <AppErrorBoundary scope="main-shell" title="Unable to load application shell" resetKey={`${location.pathname}${location.search}`}>
                <AuthGate
                  authLoading={authLoading}
                  session={session}
                  authBootstrapError={authError}
                  onRetryBootstrap={retryAuthBootstrap}
                  onLogout={logout}
                />
              </AppErrorBoundary>
            }
          >
            <Route path="/onboarding" element={<Navigate to="/onboarding/profile" replace />} />
            <Route path="/onboarding/profile" element={<OnboardingProfileSetup />} />
            <Route path="/onboarding/persona" element={<OnboardingProfileSetup />} />
            <Route path="/agent/onboarding" element={<RoleModuleOnboarding expectedRole="agent" />} />
            <Route path="/developer/onboarding" element={<RoleModuleOnboarding expectedRole="developer" />} />
            <Route path="/bond-originator/onboarding" element={<RoleModuleOnboarding expectedRole="bond_originator" />} />
            <Route path="/client-access" element={<ClientAccessNotice onLogout={logout} />} />

            <Route element={<MobileLoginRedirectGate />}>
              <Route element={<OrganisationGate><MobileRouteGuard /></OrganisationGate>}>
                <Route element={<MobileProtectedLayout onLogout={logout} session={session} />}>
                  <Route path="/mobile" element={<Navigate to="/mobile/home" replace />} />
                  <Route path="/mobile/home" element={<AppErrorBoundary scope="mobile-home" title="Mobile home failed to load"><MobileHome /></AppErrorBoundary>} />
                  <Route path="/mobile/transactions" element={<AppErrorBoundary scope="mobile-transactions" title="Mobile transactions failed to load"><MobileModulePage moduleKey="transactions" /></AppErrorBoundary>} />
                  <Route path="/mobile/leads" element={<AppErrorBoundary scope="mobile-leads" title="Mobile leads failed to load"><MobileModulePage moduleKey="leads" /></AppErrorBoundary>} />
                  <Route path="/mobile/documents" element={<AppErrorBoundary scope="mobile-documents" title="Mobile documents failed to load"><MobileDocumentsPage /></AppErrorBoundary>} />
                  <Route path="/mobile/notifications" element={<AppErrorBoundary scope="mobile-notifications" title="Mobile notifications failed to load"><MobileInboxPage /></AppErrorBoundary>} />
                  <Route path="/mobile/inbox" element={<AppErrorBoundary scope="mobile-inbox" title="Mobile inbox failed to load"><MobileInboxPage /></AppErrorBoundary>} />
                  <Route path="/mobile/search" element={<AppErrorBoundary scope="mobile-search" title="Mobile search failed to load"><MobileSearchPage /></AppErrorBoundary>} />
                  <Route path="/mobile/reports" element={<AppErrorBoundary scope="mobile-reports" title="Mobile reports failed to load"><MobileModulePage moduleKey="reports" /></AppErrorBoundary>} />
                  <Route path="/mobile/matters" element={<AppErrorBoundary scope="mobile-matters" title="Mobile matters failed to load"><MobileModulePage moduleKey="matters" /></AppErrorBoundary>} />
                  <Route path="/mobile/applications" element={<AppErrorBoundary scope="mobile-applications" title="Mobile applications failed to load"><MobileModulePage moduleKey="applications" /></AppErrorBoundary>} />
                  <Route path="/mobile/pipeline" element={<AppErrorBoundary scope="mobile-pipeline" title="Mobile pipeline failed to load"><MobileModulePage moduleKey="pipeline" /></AppErrorBoundary>} />
                  <Route path="/mobile/listings" element={<AppErrorBoundary scope="mobile-listings" title="Mobile listings failed to load"><MobileModulePage moduleKey="listings" /></AppErrorBoundary>} />
                  <Route path="/mobile/deals" element={<AppErrorBoundary scope="mobile-deals" title="Mobile deals failed to load"><MobileModulePage moduleKey="deals" /></AppErrorBoundary>} />
                  <Route path="/mobile/tasks" element={<AppErrorBoundary scope="mobile-tasks" title="Mobile tasks failed to load"><MobileTasksPage /></AppErrorBoundary>} />
                  <Route path="/mobile/activity" element={<AppErrorBoundary scope="mobile-activity" title="Mobile activity failed to load"><MobileActivityPage /></AppErrorBoundary>} />
                  <Route path="/mobile/transaction/:workspaceId" element={<AppErrorBoundary scope="mobile-transaction-workspace" title="Mobile transaction failed to load"><MobileWorkspacePage workspaceType="transaction" /></AppErrorBoundary>} />
                  <Route path="/mobile/lead/:workspaceId" element={<AppErrorBoundary scope="mobile-lead-workspace" title="Mobile lead failed to load"><MobileWorkspacePage workspaceType="lead" /></AppErrorBoundary>} />
                  <Route path="/mobile/matter/:workspaceId" element={<AppErrorBoundary scope="mobile-matter-workspace" title="Mobile matter failed to load"><MobileWorkspacePage workspaceType="matter" /></AppErrorBoundary>} />
                  <Route path="/mobile/application/:workspaceId" element={<AppErrorBoundary scope="mobile-application-workspace" title="Mobile application failed to load"><MobileWorkspacePage workspaceType="application" /></AppErrorBoundary>} />
                  <Route path="/mobile/deal/:workspaceId" element={<AppErrorBoundary scope="mobile-deal-workspace" title="Mobile deal failed to load"><MobileWorkspacePage workspaceType="deal" /></AppErrorBoundary>} />
                  <Route path="/mobile/commercial-lead/:workspaceId" element={<AppErrorBoundary scope="mobile-commercial-lead-workspace" title="Mobile commercial lead failed to load"><MobileWorkspacePage workspaceType="commercialLead" /></AppErrorBoundary>} />
                  <Route path="/mobile/listing/:workspaceId" element={<AppErrorBoundary scope="mobile-listing-workspace" title="Mobile listing failed to load"><MobileWorkspacePage workspaceType="listing" /></AppErrorBoundary>} />
                  <Route path="/mobile/more" element={<AppErrorBoundary scope="mobile-more" title="Mobile more menu failed to load"><MobileMore /></AppErrorBoundary>} />
                  <Route path="/mobile/*" element={<Navigate to="/mobile/home" replace />} />
                </Route>
              </Route>

              <Route element={<OrganisationGate><ProtectedLayout onLogout={logout} session={session} /></OrganisationGate>}>
              <Route path="/dashboard" element={<AppErrorBoundary scope="dashboard-shell" title="Dashboard failed to render"><ClientAwareDashboard /></AppErrorBoundary>} />
              <Route path="/command-center" element={<HQRoute><AppErrorBoundary scope="command-center" title="Mission Control failed to render"><CommandCenterPage /></AppErrorBoundary></HQRoute>} />
              <Route path="/commercial" element={<RoleRoute allowedRoles={['agent', 'commercial_broker', 'commercial_admin', 'commercial_principal', 'platform_admin']}><AppErrorBoundary scope="commercial-workspace" title="Commercial workspace failed to render"><CommercialLayout onLogout={logout} user={session?.user || null} /></AppErrorBoundary></RoleRoute>}>
                <Route index element={<CommercialDashboard />} />
                <Route path="dashboard" element={<CommercialDashboard />} />
                <Route path="command-centre" element={<CommercialDashboard />} />
                <Route path="principal" element={<Navigate to="/commercial/agency" replace />} />
                <Route path="companies" element={<Navigate to="/commercial/clients?tab=companies" replace />} />
                <Route path="companies/:companyId" element={<CommercialCompanyWorkspacePage />} />
                <Route path="contacts" element={<Navigate to="/commercial/clients?tab=contacts" replace />} />
                <Route path="contacts/:contactId" element={<CommercialContactWorkspacePage />} />
                <Route path="tenants" element={<Navigate to="/commercial/leasing/tenants" replace />} />
                <Route path="clients" element={<CommercialClientsPage />} />
                <Route path="expiring-occupiers" element={<CommercialExpiringOccupiersPage />} />
                <Route path="vacancies" element={<CommercialVacanciesPage />} />
                <Route path="leasing/vacancies" element={<CommercialVacanciesPage />} />
                <Route path="leasing/tenants" element={<CommercialLeasingTenantsPage />} />
                <Route path="leasing/tenants/:leaseId" element={<CommercialLeaseTenantWorkspacePage />} />
                <Route path="vacancies/:vacancyId" element={<CommercialVacancyWorkspacePage />} />
                <Route path="listings" element={<CommercialListingsPage />} />
                <Route path="sales/listings" element={<CommercialSalesListingsPage />} />
                <Route path="listings/:listingId" element={<CommercialListingWorkspacePage />} />
                <Route path="landlords" element={<CommercialLandlordsPage />} />
                <Route path="landlords/:landlordId" element={<CommercialLandlordWorkspacePage />} />
                <Route path="properties" element={<CommercialPropertiesPage />} />
                <Route path="properties/:propertyId" element={<CommercialPropertyWorkspacePage />} />
                <Route path="leads" element={<CommercialLeadsPage />} />
                <Route path="canvassing" element={<CommercialCanvassingPage />} />
                <Route path="leasing/leads" element={<CommercialLeadsPage dealType="lease" />} />
                <Route path="leasing/leads/:leadId" element={<CommercialLeadDetailPage dealType="lease" />} />
                <Route path="leasing/canvassing" element={<CommercialCanvassingPage dealType="lease" />} />
                <Route path="sales/leads" element={<CommercialLeadsPage dealType="sale" />} />
                <Route path="sales/leads/:leadId" element={<CommercialLeadDetailPage dealType="sale" />} />
                <Route path="sales/canvassing" element={<CommercialCanvassingPage dealType="sale" />} />
                <Route path="calendar" element={<CommercialCalendarPage />} />
                <Route path="requirements" element={<Navigate to="/commercial/pipeline" replace />} />
                <Route path="pipeline" element={<CommercialPipelinePage />} />
                <Route path="requirements/pipeline" element={<CommercialRequirementsPipelinePage />} />
                <Route path="leasing" element={<CommercialLeasingPage />} />
                <Route path="sales" element={<CommercialSalesPage />} />
                <Route path="sales-listings" element={<CommercialSalesListingsPage />} />
                <Route path="leasing/deals" element={<CommercialDealsPage dealType="lease" pageTitle="Leasing Deals" pageDescription="Track heads of terms, lease negotiations and signed lease deals." />} />
                <Route path="sales/deals" element={<CommercialDealsPage dealType="sale" pageTitle="Sales Deals" pageDescription="Track offers, negotiations and commercial sale transactions." />} />
                <Route path="deals" element={<CommercialDealsPage />} />
                <Route path="deals/pipeline" element={<CommercialDealsPipelinePage />} />
                <Route path="deals/overview" element={<CommercialDealsPage />} />
                <Route path="deals/leasing" element={<Navigate to="/commercial/leasing/deals" replace />} />
                <Route path="deals/sales" element={<Navigate to="/commercial/sales/deals" replace />} />
                <Route path="deals/leasing/pipeline" element={<Navigate to="/commercial/leasing" replace />} />
                <Route path="transactions" element={<Navigate to="/commercial/sales?tab=transactions" replace />} />
                <Route path="transactions/:transactionId" element={<CommercialTransactionWorkspacePage />} />
                <Route path="leases" element={<Navigate to="/commercial/leasing?tab=leases" replace />} />
                <Route path="viewings" element={<CommercialViewingsPage />} />
                <Route path="hot" element={<Navigate to="/commercial/leasing?tab=heads-of-terms" replace />} />
                <Route path="heads-of-terms" element={<Navigate to="/commercial/leasing?tab=heads-of-terms" replace />} />
                <Route path="reports" element={<CommercialManagerRouteGate><CommercialReportsPage /></CommercialManagerRouteGate>} />
                <Route path="lease-expiry-watch" element={<CommercialLeaseExpiryWatchPage />} />
                <Route path="market-intelligence" element={<CommercialMarketIntelligencePage />} />
                <Route path="broker-performance" element={<Navigate to="/commercial/reports" replace />} />
                <Route path="teams" element={<CommercialBrokerTeamsPage />} />
                <Route path="agency" element={<CommercialManagerRouteGate><CommercialBrokerBranchesPage /></CommercialManagerRouteGate>} />
                <Route path="agency/branches" element={<CommercialManagerRouteGate><CommercialBrokerBranchesPage /></CommercialManagerRouteGate>} />
                <Route path="agency/brokers" element={<Navigate to="/commercial/brokers" replace />} />
                <Route path="agency/brokers/:brokerId" element={<LegacyCommercialBrokerRedirect />} />
                <Route path="performance" element={<Navigate to="/commercial/agency" replace />} />
                <Route path="performance/branches" element={<Navigate to="/commercial/agency/branches" replace />} />
                <Route path="performance/brokers" element={<Navigate to="/commercial/brokers" replace />} />
                <Route path="brokers/overview" element={<CommercialManagerRouteGate><CommercialBrokerOverviewPage /></CommercialManagerRouteGate>} />
                <Route path="brokers" element={<CommercialManagerRouteGate><CommercialBrokersPage /></CommercialManagerRouteGate>} />
                <Route path="brokers/teams" element={<CommercialManagerRouteGate><CommercialBrokerTeamsPage /></CommercialManagerRouteGate>} />
                <Route path="brokers/branches" element={<Navigate to="/commercial/agency/branches" replace />} />
                <Route path="brokers/performance" element={<Navigate to="/commercial/reports" replace />} />
                <Route path="brokers/assignments" element={<CommercialManagerRouteGate><CommercialBrokerAssignmentsPage /></CommercialManagerRouteGate>} />
                <Route path="brokers/:brokerId" element={<CommercialManagerRouteGate><CommercialBrokersPage /></CommercialManagerRouteGate>} />
                <Route path="docs" element={<CommercialDocumentsPage />} />
                <Route path="documents" element={<CommercialDocumentsPage />} />
                <Route path="documents/new" element={<CommercialDocumentGeneratorPage />} />
                <Route path="document-generator" element={<CommercialDocumentGeneratorPage />} />
                <Route path="activity" element={<CommercialActivityPage />} />
                <Route path="settings" element={<CommercialSettingsPage />} />
                <Route path="settings/bulk-upload" element={<CommercialManagerRouteGate><CommercialBulkUploadSettingsPage /></CommercialManagerRouteGate>} />
                <Route
                  path="settings/document-templates"
                  element={
                    <SettingsSigningTemplatesPage
                      templateModuleType="commercial"
                      allowedPacketTypes={['commercial_sale', 'commercial_lease']}
                      title="Commercial Template Studio"
                      eyebrow="Commercial / Document Templates"
                      description="Manage commercial sales and leasing templates, merge fields, previews, and publishing."
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/commercial" replace />} />
              </Route>
              <Route path="/setup" element={<PostDashboardSetup />} />
              <Route path="/setup/recovery" element={<PostDashboardSetup />} />
              <Route
                path="/platform/diagnostics"
                element={
                  <RoleRoute allowedRoles={['platform_admin']}>
                    <PlatformDiagnosticsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/platform/demo-enquiries"
                element={
                  <HQRoute>
                    <AppErrorBoundary scope="platform-demo-enquiries" title="Demo enquiries failed to render">
                      <PlatformDemoEnquiriesPage />
                    </AppErrorBoundary>
                  </HQRoute>
                }
              />
              <Route
                path="/platform/workflow-migration-validation"
                element={
                  <RoleRoute allowedRoles={['platform_admin', 'developer']}>
                    <WorkflowMigrationValidationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/platform/transaction-routing-rollout"
                element={
                  <RoleRoute allowedRoles={['platform_admin', 'developer']}>
                    <TransactionRoutingRolloutPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/onboarding"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyOnboardingPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/dashboard"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute requireFirm={false}>
                      <AttorneyDashboardPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/operations"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneyOperationsPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/scheduling"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneySchedulingPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/appointments"
                element={<Navigate to="/attorney/scheduling" replace />}
              />
              <Route
                path="/attorney/firm-settings"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneyFirmSettingsPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/matters"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <Navigate to="/attorney/transactions/active" replace />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/transactions"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <Navigate to="/attorney/transactions/active" replace />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/transactions/:matterType"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneyMattersPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/matters/:matterType"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneyMattersPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/audit-logs"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <PlaceholderPage
                        title="Audit Logs"
                        description="Legal activity, document, and workflow audit trails will appear here."
                      />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              {SHOW_INTELLIGENCE_BETA ? (
                <>
                  <Route
                    path="/intelligence"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <Navigate to="/developer/intelligence/dashboard" replace />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <Navigate to="/developer/intelligence/dashboard" replace />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/dashboard"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligenceDashboardPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/opportunity"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligenceOpportunityEnginePage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/feasibility"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligenceFeasibilityPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/market-demand"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligenceMarketDemandPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/pricing"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligencePricingSimulatorPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/portfolio"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligencePortfolioPerformancePage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/developer/intelligence/growth"
                    element={
                      <RoleRoute allowedRoles={['developer']}>
                        <DeveloperIntelligenceGrowthNetworkPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attorney/intelligence"
                    element={
                      <RoleRoute allowedRoles={['attorney']}>
                        <Navigate to="/attorney/intelligence/dashboard" replace />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attorney/intelligence/dashboard"
                    element={
                      <RoleRoute allowedRoles={['attorney']}>
                        <AttorneyIntelligenceDashboardPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attorney/intelligence/opportunity-engine"
                    element={
                      <RoleRoute allowedRoles={['attorney']}>
                        <AttorneyIntelligenceOpportunityEnginePage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attorney/intelligence/partner-intelligence"
                    element={
                      <RoleRoute allowedRoles={['attorney']}>
                        <AttorneyIntelligencePartnerPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attorney/intelligence/market-position"
                    element={
                      <RoleRoute allowedRoles={['attorney']}>
                        <AttorneyIntelligenceMarketPositionPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attorney/intelligence/revenue-forecast"
                    element={
                      <RoleRoute allowedRoles={['attorney']}>
                        <AttorneyIntelligenceRevenueForecastPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <Navigate to="/agent/intelligence/overview" replace />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/overview"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligenceOverviewPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/opportunities"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligenceOpportunitiesPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/market"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligenceMarketPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/pricing"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligencePricingPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/pipeline"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligencePipelinePage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/performance"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligencePerformancePage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agent/intelligence/network"
                    element={
                      <RoleRoute allowedRoles={['agent']}>
                        <AgentIntelligenceNetworkPage />
                      </RoleRoute>
                    }
                  />
                </>
              ) : null}
              {!SHOW_INTELLIGENCE_BETA ? (
                <>
                  <Route path="/intelligence/*" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/developer/intelligence/*" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/attorney/intelligence/*" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/agent/intelligence/*" element={<Navigate to="/dashboard" replace />} />
                </>
              ) : null}
              <Route
                path="/buyer-information"
                element={
                  <RoleRoute allowedRoles={['client']}>
                    <ClientModulePage />
                  </RoleRoute>
                }
              />
              <Route
                path="/developments"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <ConveyancerOrDeveloperDevelopments />
                  </RoleRoute>
                }
              />
              <Route
                path="/developments/:developmentId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <ConveyancerOrDeveloperDevelopmentDetail />
                  </RoleRoute>
                }
              />
              <Route
                path="/developer/partners"
                element={
                  <RoleRoute allowedRoles={['developer']}>
                    <AppErrorBoundary scope="developer-partners-workspace" title="Developer partners failed to load">
                      <DeveloperPartnersPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/deals"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Units />
                  </RoleRoute>
                }
              />
              <Route
                path="/units"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <Units />
                  </RoleRoute>
                }
              />
              <Route path="/transactions" element={<ClientAwareTransactions />} />
              <Route
                path="/bond/dashboard"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondDashboardPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/applications"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondTransactionsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/transactions"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondApplicationsRedirect />
                  </RoleRoute>
                }
              />
              <Route
                path="/transactions/:transactionId/legal/:packetType"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="legal-document-workspace" title="Legal document workspace failed to load">
                      <LegalDocumentWorkspacePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/legal-documents/:packetId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="legal-document-workspace" title="Legal document workspace failed to load">
                      <LegalDocumentWorkspacePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/transactions/:transactionId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="transaction-workspace" title="Transaction workspace failed to load">
                      <AttorneyTransactionDetail />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/transactions/:transactionId/transfer/:workflowDetailKey"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="transaction-workflow-detail" title="Transaction workflow detail failed to load">
                      <AttorneyTransactionDetail />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/files/:transactionId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-file-workspace" title="Bond file workspace failed to load">
                      <AttorneyTransactionDetail />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/files/:transactionId/transfer/:workflowDetailKey"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-file-workflow-detail" title="Bond workflow detail failed to load">
                      <AttorneyTransactionDetail />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/invite/stakeholder/:token"
                element={<LegacyInviteRedirect />}
              />
              <Route
                path="/new-transaction"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney']}>
                    <NewTransactionPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/applications"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <Units />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/pipeline"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <Units />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/developments"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondDevelopmentsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/developments/:developmentId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondDevelopmentsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/clients"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <Clients />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/clients/:clientId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <ClientProfile />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/partners"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="partners-module" title="Partners module failed to load">
                      <PartnersPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/partners/:relationshipId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-partner-profile" title="Partner profile failed to load">
                      <BondPartnerProfilePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/partner-inbox"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-partner-inbox" title="Partner inbox failed to load">
                      <BondPartnerCollaborationPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/partner-intelligence"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-partner-intelligence" title="Partner intelligence failed to load">
                      <BondPartnerIntelligencePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/consultant-performance"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-consultant-performance" title="Consultant performance failed to load">
                      <BondConsultantPerformancePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/branch-operations"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-branch-operations" title="Branch operations failed to load">
                      <BondBranchOperationsPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/regional-operations"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-regional-operations" title="Regional operations failed to load">
                      <BondRegionalOperationsPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/hq-command-centre"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-hq-command-centre" title="HQ command centre failed to load">
                      <BondHQCommandCentrePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/banks"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-bank-relationships" title="Bank relationships failed to load">
                      <BondBankRelationshipsPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/banks/:bankId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-bank-workspace" title="Bank workspace failed to load">
                      <BondBankRelationshipsPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/revenue"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-revenue-management" title="Revenue & commissions failed to load">
                      <BondRevenueManagementPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/automation"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-automation-centre" title="Automation & rules failed to load">
                      <Navigate to="/settings/automation" replace />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/predictive-intelligence"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-predictive-intelligence" title="Predictive intelligence failed to load">
                      <BondPredictiveIntelligencePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/organisation"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondOrganisationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/organisation/regions/:regionId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondOrganisationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/organisation/branches/:branchId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondOrganisationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/organisation/consultants/:consultantId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-consultant-performance" title="Consultant performance failed to load">
                      <BondConsultantPerformancePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/organisation/partners/:partnerId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondOrganisationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/organisation/applications"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondOrganisationPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/reports"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondReportsAnalyticsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/tasks"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondModuleHubPage section="tasks" />
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/calendar"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondModuleHubPage section="calendar" />
                  </RoleRoute>
                }
              />
              <Route
                path="/teams"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondModuleHubPage section="teams" />
                  </RoleRoute>
                }
              />
              <Route
                path="/banks"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondModuleHubPage section="banks" />
                  </RoleRoute>
                }
              />
              <Route
                path="/performance"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <BondModuleHubPage section="performance" />
                  </RoleRoute>
                }
              />
              <Route
                path="/transfers"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <Navigate to="/transactions" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/clients"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <Clients />
                  </RoleRoute>
                }
              />
              <Route
                path="/clients/:clientId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <ClientProfile />
                  </RoleRoute>
                }
              />
              <Route
                path="/financials"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <Financials />
                  </RoleRoute>
                }
              />
              <Route
                path="/units/:unitId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="transaction-workspace" title="Unit workspace failed to load">
                      <UnitDetail />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'bond_originator']}>
                    <PipelineEntryRoute />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/leads"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AgentLeadsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/leads/:leadId/legal/:packetType"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AppErrorBoundary scope="legal-document-workspace" title="Legal document workspace failed to load">
                      <LegalDocumentWorkspacePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/leads/:leadId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AgentLeadsPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/enquiries"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AgentEnquiriesPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/overview"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <PipelineOverviewPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/canvassing"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <PipelineCanvassingPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/canvassing/prospects/:prospectId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <PipelineCanvassingPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/calendar"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Pipeline key="pipeline-calendar" initialAgentViewMode="calendar" />
                  </RoleRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/pipeline/calendar" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/listings"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AgentListings />
                  </RoleRoute>
                }
              />
              <Route
                path="/listings/developments"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AgentListings initialTab="developments" />
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/listings/:listingId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <AgentListingDetail />
                  </RoleRoute>
                }
              />
              <Route
                path="/agency"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/agency/branches" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/assistant/dashboard"
                element={
                  <SupportOperationsRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AssistantDashboardPage />
                    </RoleRoute>
                  </SupportOperationsRoute>
                }
              />
              <Route
                path="/agency/branches"
                element={
                  <AgentManagementRoute allowBranchOperations>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgencyBranchesPage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/branch-command-centre"
                element={
                  <AgentManagementRoute allowBranchOperations>
                    <RoleRoute allowedRoles={['agent']}>
                      <BranchCommandCentrePage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/branches/:branchId"
                element={
                  <AgentManagementRoute allowBranchOperations>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgencyBranchWorkspacePage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/agents"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentsPage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/agents/:agentId"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentWorkspacePage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/analytics"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgencyAnalyticsPage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/governance"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgencyGovernancePage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agents"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/agency/agents" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/agents/directory"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/agency/agents" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/agents/reporting"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentReportingPage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agents/:agentId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <LegacyAgentWorkspaceRedirect />
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/agents/:agentId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <LegacyAgentWorkspaceRedirect />
                  </RoleRoute>
                }
              />
              <Route path="/documents" element={<AppErrorBoundary scope="documents-module" title="Documents module failed to load"><ClientAwareDocuments /></AppErrorBoundary>} />
              <Route
                path="/partners"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="partners-module" title="Partners module failed to load">
                      <PartnersPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/partners/:partnerId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="partners-module" title="Partners module failed to load">
                      <PartnersPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/organizations"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="organizations-module" title="Organizations module failed to load">
                      <OrganizationWorkspacePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/organizations/:organizationId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="organizations-module" title="Organizations module failed to load">
                      <OrganizationWorkspacePage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/handover"
                element={
                  <RoleRoute allowedRoles={['client']}>
                    <ClientModulePage />
                  </RoleRoute>
                }
              />
              <Route
                path="/snags"
                element={<ClientAwareSnags />}
              />
              <Route
                path="/reports"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <PermissionGate capability="view_reports">
                      <AppErrorBoundary scope="reports" title="Reports module encountered an error">
                        <Report />
                      </AppErrorBoundary>
                    </PermissionGate>
                  </RoleRoute>
                }
              />
              <Route path="/report" element={<Navigate to="/reports" replace />} />
              <Route
                path="/team"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent']}>
                    <Team />
                  </RoleRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <PlaceholderPage
                      title="Users"
                      description="Invite internal staff, manage roles, and control conveyancing team access."
                    />
                  </RoleRoute>
                }
              />
              <Route path="/settings" element={<ClientAwareSettingsLayout />}>
                <Route index element={<SettingsLanding />} />
                <Route path="account" element={<SettingsAccountPage section="profile" />} />
                <Route path="profile" element={<SettingsAccountPage section="profile" />} />
                <Route path="security" element={<SettingsAccountPage section="security" />} />
                <Route path="notifications" element={<SettingsAccountPage section="notifications" />} />
                <Route path="preferences" element={<SettingsAccountPage section="preferences" />} />
                <Route
                  path="organisation"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <SettingsOrganisationPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="automation"
                  element={
                    <RoleRoute allowedRoles={['bond_originator']}>
                      <BondAutomationCentrePage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="preferred-partners"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsPreferredPartnersPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="partner-directory"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsPartnerProspectsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="partner-routing-rules"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <SettingsPartnerRoutingRulesPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="lead-capture"
                  element={
                    <RoleRoute allowedRoles={['agent']}>
                      <SettingsLeadCapturePage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="commission-structures"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsCommissionStructuresPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="developments"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['developer', 'agent']}>
                        <SettingsDevelopmentsPage />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route
                  path="workflows"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsWorkflowsPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="legal-templates"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['developer', 'agent']}>
                        <SettingsSigningTemplatesPage />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route
                  path="signing-templates"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['developer', 'agent']}>
                        <SettingsSigningTemplatesPage />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route
                  path="communications/templates"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsCommunicationsTemplatesPage />
                    </RoleRoute>
                  }
                />
                <Route path="integrations" element={<SettingsIntegrationsPage />} />
                <Route path="audit-log" element={<SettingsAuditLogPage />} />
                <Route
                  path="users"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <PermissionGate capability="manage_users">
                        <SettingsUsersPage />
                      </PermissionGate>
                    </RoleRoute>
                  }
                />
                <Route
                  path="billing"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsBillingPage />
                    </RoleRoute>
                  }
                />
              </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/auth"
            element={
              isSupabaseConfigured && session ? (
                <Navigate to={pendingInvitePath || '/dashboard'} replace />
              ) : (
                <Auth onDevBypass={(role) => setDevAuthRole(role)} />
              )
            }
          />
          <Route
            path="/external/:accessToken"
            element={
              <TokenRouteGate paramKey="accessToken" title="Invalid external access link" retryHref="/auth">
                <AppErrorBoundary scope="external-token-route" title="External workspace failed to load">
                  <ExternalTransactionPortal />
                </AppErrorBoundary>
              </TokenRouteGate>
            }
          />
          <Route path="/partner-portal/:token" element={<TokenRouteGate><AppErrorBoundary scope="partner-portal-route" title="Partner portal failed to load"><PartnerPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/partners/portal/:token" element={<TokenRouteGate><AppErrorBoundary scope="partner-portal-route" title="Partner portal failed to load"><PartnerPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/developer/partner-invite/:token" element={<TokenRouteGate><AppErrorBoundary scope="developer-partner-invite-route" title="Developer partner invite failed to load"><DeveloperPartnerInvitePage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/commercial/portal/:token" element={<TokenRouteGate><AppErrorBoundary scope="commercial-portal-route" title="Commercial portal failed to load"><CommercialExternalPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/commercial/onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="commercial-onboarding-route" title="Commercial onboarding failed to load"><CommercialOnboardingPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/commercial/landlord-onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="commercial-landlord-onboarding-route" title="Landlord onboarding failed to load"><CommercialLandlordOnboardingPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/sign/:token" element={<SignerPortal />} />
          <Route path="/appointment-rsvp/:token" element={<AppointmentRsvpPage />} />
          <Route path="/client/:token" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/buying" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/buying/:section" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/selling" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/selling/:section" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/progress" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/appointments" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/onboarding" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/details" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/bond-application" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/onboarding/:token" element={<ClientOnboarding />} />
          <Route path="/seller/onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Seller onboarding failed to load"><SellerOnboarding /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/mobile/buyer-onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="mobile-buyer-onboarding" title="Mobile buyer onboarding failed to load"><MobilePublicPortalShell><MobileOnboardingPage portalType="buyer" /></MobilePublicPortalShell></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/mobile/seller-onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="mobile-seller-onboarding" title="Mobile seller onboarding failed to load"><MobilePublicPortalShell><MobileOnboardingPage portalType="seller" /></MobilePublicPortalShell></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/seller/:token" element={<SellerLegacyRedirect />} />
          <Route path="/seller/:token/mandate" element={<SellerLegacyRedirect />} />
          <Route path="/seller/:token/documents" element={<SellerLegacyRedirect />} />
          <Route path="/seller/:token/property" element={<SellerLegacyRedirect />} />
          <Route path="/seller/:token/offers" element={<SellerLegacyRedirect />} />
          <Route path="/seller/:token/progress" element={<SellerLegacyRedirect />} />
          <Route path="/seller/:token/appointments" element={<SellerLegacyRedirect />} />
          <Route path="/client/:token/documents" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/otp-signing" element={<TokenRouteGate><AppErrorBoundary scope="client-otp-route" title="OTP signing failed to load"><ClientOtpSigning /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/offer/:token" element={<AppErrorBoundary scope="buyer-offer-route" title="Offer link failed to load"><BuyerOfferSubmission /></AppErrorBoundary>} />
          <Route path="/offers/session/:token" element={<AppErrorBoundary scope="post-viewing-offer-route" title="Offer portal failed to load"><PostViewingOfferPortal /></AppErrorBoundary>} />
          <Route path="/offers/:token" element={<AppErrorBoundary scope="buyer-offer-route" title="Offer link failed to load"><BuyerOfferSubmission /></AppErrorBoundary>} />
          <Route path="/seller/offers/review/:token" element={<AppErrorBoundary scope="seller-offer-review-route" title="Seller offer review failed to load"><SellerOfferReviewPage /></AppErrorBoundary>} />
          <Route path="/transaction-invite/:token" element={<TokenRouteGate><TransactionPartnerInvitePage /></TokenRouteGate>} />
          <Route path="/invite/:token" element={<TokenRouteGate><InviteResolver /></TokenRouteGate>} />
          <Route
            path="/agent/invite/:token"
            element={<LegacyInviteRedirect />}
          />
          <Route path="/client/:token/forms/trust-investment" element={<Navigate to="../documents" replace />} />
          <Route path="/client/:token/handover" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/homeowner" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/snags" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/issues" element={<Navigate to="../snags" replace />} />
          <Route path="/client/:token/settings" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/team" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route
            path="/client/:token/alterations"
            element={FEATURE_FLAGS.enableClientPortalAlterations ? <ClientPortal /> : <ClientTokenRootRedirect />}
          />
          <Route
            path="/client/:token/review"
            element={FEATURE_FLAGS.enableServiceReviews ? <ClientPortal /> : <ClientTokenRootRedirect />}
          />
          <Route
            path="/snapshot/:token"
            element={FEATURE_FLAGS.enableSnapshotLinks ? <TokenRouteGate><AppErrorBoundary scope="snapshot-route" title="Executive snapshot failed to load"><ExecutiveSnapshot /></AppErrorBoundary></TokenRouteGate> : <Navigate to="/dashboard" replace />}
          />
          <Route path="/status/:token" element={<TokenRouteGate><AppErrorBoundary scope="status-share-route" title="Status page failed to load"><TransactionStatusShare /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </OrganisationProvider>
      </WorkspaceProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
    </BrowserRouter>
  )
}

function ConveyancerOrDeveloperDevelopments() {
  const { role } = useWorkspace()
  return role === 'attorney' || role === 'bond_originator' ? <ConveyancerDevelopments /> : <Developments />
}

function ConveyancerOrDeveloperDevelopmentDetail() {
  return <DevelopmentDetail />
}

function ClientAwareDashboard() {
  const workspaceContext = useWorkspace()
  const { role, currentMembership, activeMemberships = [] } = workspaceContext
  const preferredWorkspaceMode = getPreferredWorkspaceMode()
  if (role === 'client') {
    return <ClientModulePage />
  }
  if (role === 'attorney') {
    return <Navigate to="/attorney/dashboard" replace />
  }
  const hasCommercialAccess =
    hasCommercialMembershipMarker(currentMembership) ||
    activeMemberships.some((membership) => hasCommercialMembershipMarker(membership))
  const hasCommercialBrokerAccess =
    isCommercialBrokerMembership(currentMembership) ||
    isCommercialProfessionalMember(currentMembership) ||
    activeMemberships.some((membership) => isCommercialBrokerMembership(membership) || isCommercialProfessionalMember(membership))
  if (
    (preferredWorkspaceMode === 'commercial' || (!preferredWorkspaceMode && hasCommercialBrokerAccess)) &&
    hasCommercialAccess &&
    (role === 'agent' || hasCommercialBrokerAccess)
  ) {
    return <Navigate to="/commercial" replace />
  }
  const dashboardPermission = role === 'agent'
    ? PERMISSIONS.viewAgencyDashboard
    : role === 'developer'
      ? PERMISSIONS.viewDeveloperDashboard
      : role === 'bond_originator'
        ? PERMISSIONS.viewBondDashboard
        : PERMISSIONS.viewDashboard
  const access = evaluateAccessRequirement({ permission: dashboardPermission }, workspaceContext)
  if (!access.ok) {
    return <AccessState type="permission_required" description={access.message} />
  }
  if (role === 'bond_originator') {
    return <BondDashboardPage />
  }
  return <Dashboard />
}

function ClientTokenRootRedirect() {
  const { token = '' } = useParams()
  const safeToken = String(token || '').trim()
  return <Navigate to={safeToken ? `/client/${safeToken}` : '/auth'} replace />
}

function LegacyInviteRedirect() {
  const { token = '' } = useParams()
  const safeToken = String(token || '').trim()
  return <Navigate to={safeToken ? `/invite/${encodeURIComponent(safeToken)}` : '/auth'} replace />
}

function LegacyAgentWorkspaceRedirect() {
  const { agentId = '' } = useParams()
  const safeAgentId = String(agentId || '').trim()
  return <Navigate to={safeAgentId ? `/agency/agents/${encodeURIComponent(safeAgentId)}` : '/agency/agents'} replace />
}

function LegacyCommercialBrokerRedirect() {
  const { brokerId = '' } = useParams()
  const safeBrokerId = String(brokerId || '').trim()
  return <Navigate to={safeBrokerId ? `/commercial/brokers/${encodeURIComponent(safeBrokerId)}` : '/commercial/brokers'} replace />
}

function SellerLegacyRedirect() {
  const { token = '' } = useParams()
  const location = useLocation()
  const safeToken = String(token || '').trim()
  const segments = String(location.pathname || '').split('/').filter(Boolean)
  const rawSection = String(segments[2] || '').trim().toLowerCase()
  const section = rawSection === 'property' ? 'onboarding' : rawSection
  const target = safeToken
    ? `/client/${safeToken}/selling${section ? `/${section}` : ''}`
    : '/auth'
  return <Navigate to={target} replace />
}

function ClientAwareTransactions() {
  const { role } = useWorkspace()
  const location = useLocation()
  if (role === 'client') {
    return <ClientModulePage />
  }
  if (role === 'bond_originator') {
    return <Navigate to={`/bond/applications${location.search || ''}`} replace />
  }

  return (
    <RoleRoute allowedRoles={['developer', 'agent', 'attorney']}>
      <Units />
    </RoleRoute>
  )
}

function BondApplicationsRedirect() {
  const location = useLocation()
  return <Navigate to={`/bond/applications${location.search || ''}`} replace />
}

function PipelineEntryRoute() {
  const { role } = useWorkspace()
  if (role === 'agent') {
    return <Navigate to="/pipeline/leads" replace />
  }
  if (role === 'bond_originator') {
    return <Navigate to="/bond/pipeline" replace />
  }
  return <Pipeline />
}

function ClientAwareDocuments() {
  const { role } = useWorkspace()
  return role === 'client' ? <ClientModulePage /> : <Documents />
}

function ClientAwareSnags() {
  const { role } = useWorkspace()
  if (role === 'client') {
    return <ClientModulePage />
  }

  return (
    <RoleRoute allowedRoles={['developer']}>
      <Snags />
    </RoleRoute>
  )
}

function ClientAwareTeam() {
  const { role } = useWorkspace()
  if (role === 'client') {
    return <ClientModulePage />
  }

  return (
    <RoleRoute allowedRoles={['developer']}>
      <Team />
    </RoleRoute>
  )
}

function ClientAwareSettingsLayout() {
  const { role } = useWorkspace()
  return role === 'client' ? <ClientModulePage /> : <SettingsLayout />
}

export default App
