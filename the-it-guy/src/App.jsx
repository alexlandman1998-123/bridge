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
import { APP_ROLE_LABELS } from './lib/appRoleMetadata'
import { FEATURE_FLAGS, SHOW_INTELLIGENCE_BETA } from './lib/featureFlags'
import {
  isSupabaseConfigured,
} from './lib/supabaseClient'
import { getFeatureFlags, getRuntimeEnvValidation } from './lib/envValidation'
import { markRouteFirstVisibleContent, markRouteRendered } from './lib/performanceTrace'
import { isOnboardingRoute } from './lib/onboardingRouting'
import { buildPartnerInviteAutoAcceptPath, readPendingPartnerInvitePath } from './lib/pendingPartnerInvite'
import { ONBOARDING_REQUIRED_REASONS } from './constants/onboardingStatuses'
import { resolveSignupIntentRoute } from './lib/signupIntent'
import { storePostLoginRedirect } from './lib/resolveMobileAwareRedirect'
import { evaluateAccessRequirement, getRouteAccessRequirement } from './auth/permissions/permissionResolver'
import { canAccessHQ } from './auth/hqAccess'
import { PERMISSIONS } from './auth/permissions/permissionRegistry'
import { createRoutePerformanceMarker } from './services/observability/performanceMetrics'
import { reportError } from './services/observability/errorTracking'
import { trackPermissionMetric } from './services/observability/monitoring'
import {
  hasCommercialAccessMarker,
  isCommercialProfessionalMember,
} from './lib/commercialAccess'
import { BUSINESS_WORKSPACES, resolveBusinessWorkspaceRoute } from './lib/businessWorkspaceAccess'
import { RentalModuleBoundary } from './modules/rentals/shell/RentalModuleBoundary'
import {
  RentalApplicationsPage,
  RentalCalendarPage,
  ShortTermRentalCalendarPage,
  ShortTermRentalDashboardPage,
  ShortTermRentalInventoryPage,
  ShortTermBookingsPage,
  ShortTermTurnoversPage,
  ShortTermRatesPage,
  RentalViewingsPage,
  RentalLeadsPage,
  RentalListingCreatePage,
  RentalListingDetailPage,
  RentalListingsPage,
  RentalOperationsDashboardPage,
  RentalPilotReadinessPage,
  RentalRolloutControlsPage,
  RentalFinancialReconciliationPage,
  RentalPilotLaunchPage,
  RentalPilotExecutionPage,
  RentalPilotReviewsPage,
  RentalMaintenancePage,
  RentalMaintenanceQuotesPage,
  RentalMaintenanceExecutionPage,
  RentalInspectionsPage,
  RentalInspectionExecutionPage,
  RentalInspectionFollowUpPage,
  RentalMoveOutPage,
  RentalTenancyClosurePage,
  RentalNotificationsPage,
  RentalRemindersPage,
  RentalScreeningPage,
  RentalReportsPage,
  RentalPortfolioDetailPage,
  RentalPortfoliosPage,
  RentalPropertiesPage,
  RentalPropertyDetailPage,
  RentalTenanciesPage,
  RentalTenancyDetailPage,
  RentalVacanciesPage,
  RentalVacancyCreatePage,
  RentalVacancyDetailPage,
} from './modules/rentals/shell/rentalRouteLoaders'
import { RENTAL_MODULES, resolveRentalModuleAvailability } from './services/rentals/rentalModuleAvailability'
import { getRentalOperatingModeHomeRoute, RENTAL_OPERATING_MODES } from './services/rentals/shortTermRentalFoundation'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import LeadsRouteShell from './components/leads/LeadsRouteShell'
import LeadWorkspaceRouteLoadingShell from './components/leads/LeadWorkspaceRouteLoadingShell'
import TransactionDetailRouteShell from './components/transactions/TransactionDetailRouteShell'
import TransactionsRouteShell from './components/transactions/TransactionsRouteShell'
import { loadAgencyLeadListRouteModule, loadAgencyLeadWorkspaceRouteModule } from './routes/leadsRouteLoader'
import { loadTransactionsRouteModule } from './routes/transactionsRouteLoader'

const INACTIVITY_TIMEOUT_MINUTES = 15
const WARNING_BEFORE_LOGOUT_MINUTES = 1
const INACTIVITY_TIMEOUT_MS = INACTIVITY_TIMEOUT_MINUTES * 60 * 1000
const WARNING_BEFORE_LOGOUT_MS = WARNING_BEFORE_LOGOUT_MINUTES * 60 * 1000
const WARNING_DELAY_MS = Math.max(INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS, 0)
const ACTIVITY_TIMER_RESET_THROTTLE_MS = 1000
const RELEASE_REFRESH_STORAGE_PREFIX = 'arch9:release-refresh'

const lazyNamed = (loader, exportName) => lazy(() => loader().then((module) => ({ default: module[exportName] })))

const PUBLIC_WEBSITE_HOSTS = new Set(['arch9.co.za', 'www.arch9.co.za'])
const ARCH9_JOIN_URL = import.meta.env.VITE_ARCH9_JOIN_URL || 'https://admin.arch9.co.za/join'

function resetLockedShellWindowScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const scrollTargets = [document.scrollingElement, document.documentElement, document.body].filter(Boolean)
  scrollTargets.forEach((target) => {
    try {
      if (typeof target.scrollTo === 'function') {
        target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      } else {
        target.scrollTop = 0
        target.scrollLeft = 0
      }
    } catch {
      // Some browser-controlled contexts expose read-only scroll properties during focus restoration.
    }
  })
  if (typeof window.scrollTo === 'function') {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } catch {
      // Keep shell recovery best-effort; a failed scroll reset must not blank the route.
    }
  }
}

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

function buildArch9JoinUrl(search = '') {
  try {
    const targetUrl = new URL(ARCH9_JOIN_URL)
    const sourceParams = new URLSearchParams(search)
    sourceParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value)
    })
    return targetUrl.toString()
  } catch {
    return `${ARCH9_JOIN_URL}${search || ''}`
  }
}

function Arch9JoinRedirect() {
  const location = useLocation()
  const targetUrl = buildArch9JoinUrl(location.search)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.location.replace(targetUrl)
  }, [targetUrl])

  return (
    <main className="center-shell">
      <PageSkeleton label="Opening Arch9 join" />
      <a href={targetUrl}>Continue to Arch9 join</a>
    </main>
  )
}

function getLoadedReleaseId() {
  if (typeof document === 'undefined') return ''
  return String(document.querySelector('meta[name="arch9-release"]')?.getAttribute('content') || '').trim()
}

function buildReleaseRefreshUrl() {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('arch9_release_refresh', String(Date.now()))
    return url.toString()
  } catch {
    const separator = window.location.href.includes('?') ? '&' : '?'
    return `${window.location.href}${separator}arch9_release_refresh=${Date.now()}`
  }
}

function ReleaseFreshnessGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    window.__arch9MarkBootstrapReady?.()

    let cancelled = false
    let timerId = null

    async function checkReleaseFreshness() {
      const loadedReleaseId = getLoadedReleaseId()
      if (!loadedReleaseId) return
      try {
        const response = await fetch(`/release-manifest.json?release_check=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const manifest = await response.json()
        const latestReleaseId = String(manifest?.releaseId || '').trim()
        if (!latestReleaseId || latestReleaseId === loadedReleaseId || cancelled) return
        const refreshKey = `${RELEASE_REFRESH_STORAGE_PREFIX}:${latestReleaseId}`
        try {
          if (window.sessionStorage?.getItem(refreshKey) === 'true') return
          window.sessionStorage?.setItem(refreshKey, 'true')
        } catch {
          // A single cache-busted reload is still safe if session storage is unavailable.
        }
        const nextUrl = buildReleaseRefreshUrl()
        window.location.replace(nextUrl || window.location.href)
      } catch (error) {
        console.debug('[RELEASE] freshness check skipped', error)
      }
    }

    void checkReleaseFreshness()
    timerId = window.setInterval(() => {
      void checkReleaseFreshness()
    }, 60000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkReleaseFreshness()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      if (timerId) window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}

const AddDevelopmentModal = lazy(() => import('./components/AddDevelopmentModal'))
const AgentNewDealWizard = lazy(() => import('./components/AgentNewDealWizard'))
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
const AttorneyFirmPage = lazy(() => import('./pages/AttorneyFirmPage'))
const AttorneyFirmSettingsPage = lazy(() => import('./pages/AttorneyFirmSettingsPage'))
const AttorneyIntelligenceDashboardPage = lazy(() => import('./pages/attorney-intelligence/DashboardPage'))
const AttorneyIntelligenceMarketPositionPage = lazy(() => import('./pages/attorney-intelligence/MarketPositionPage'))
const AttorneyIntelligenceOpportunityEnginePage = lazy(() => import('./pages/attorney-intelligence/OpportunityEnginePage'))
const AttorneyIntelligencePartnerPage = lazy(() => import('./pages/attorney-intelligence/PartnerIntelligencePage'))
const AttorneyIntelligenceRevenueForecastPage = lazy(() => import('./pages/attorney-intelligence/RevenueForecastPage'))
const AttorneyLeadsPage = lazy(() => import('./pages/AttorneyLeadsPage'))
const AttorneyMattersPage = lazy(() => import('./pages/AttorneyMattersPage'))
const AttorneyOnboardingPage = lazy(() => import('./pages/AttorneyOnboardingPage'))
const AttorneyOperationsPage = lazy(() => import('./pages/AttorneyOperationsPage'))
const AttorneyPublicIntakePage = lazy(() => import('./pages/AttorneyPublicIntakePage'))
const AttorneyQuoteDecisionPage = lazy(() => import('./pages/AttorneyQuoteDecisionPage'))
const AttorneySchedulingPage = lazy(() => import('./pages/AttorneySchedulingPage'))
const AttorneyTransactionDetail = lazy(() => import('./pages/AttorneyTransactionDetail'))
const Auth = lazy(() => import('./pages/Auth'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
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
const BuyerViewingPreferencesPage = lazy(() => import('./pages/BuyerViewingPreferencesPage'))
const SellerViewingCoordinationPage = lazy(() => import('./pages/SellerViewingCoordinationPage'))
const PublicAgencyIntakePage = lazy(() => import('./pages/PublicAgencyIntakePage'))
const PublicAgentDigitalCardPage = lazy(() => import('./pages/PublicAgentDigitalCardPage'))
const RentalApplicantJourneyPage = lazy(() => import('./pages/rentals/RentalApplicantJourneyPage'))
const RentalApplicationWorkspacePage = lazy(() => import('./pages/rentals/RentalApplicationWorkspacePage'))
const RentalApplicationDetailPage = lazy(() => import('./pages/rentals/RentalApplicationDetailPage'))
const RetiredOfferWorkflowPage = lazy(() => import('./pages/RetiredOfferWorkflowPage'))
const ClientModulePage = lazy(() => import('./pages/ClientModulePage'))
const ClientOnboarding = lazy(() => import('./pages/ClientOnboarding'))
const ClientPortal = lazy(() => import('./pages/ClientPortal'))
const ProspectBuyerDemo = lazy(() => import('./pages/ProspectBuyerDemo'))
const ClientProfile = lazy(() => import('./pages/ClientProfile'))
const Clients = lazy(() => import('./pages/Clients'))
const ConveyancerDevelopments = lazy(() => import('./pages/ConveyancerDevelopments'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const YoungLawCalculatorsPage = lazy(() => import('./pages/YoungLawCalculatorsPage'))
const TuckersAttorneysCalculatorsPage = lazy(() => import('./pages/TuckersAttorneysCalculatorsPage'))
const HomeSeekersDemo = lazy(() => import('./pages/HomeSeekersDemo'))
const HomeSeekersBuy = lazy(() => import('./pages/HomeSeekersBuy'))
const HomeSeekersSell = lazy(() => import('./pages/HomeSeekersSell'))
const HomeSeekersRent = lazy(() => import('./pages/HomeSeekersRent'))
const HomeSeekersDevelopments = lazy(() => import('./pages/HomeSeekersDevelopments'))
const HomeSeekersPeople = lazy(() => import('./pages/HomeSeekersPeople'))
const HomeSeekersAbout = lazy(() => import('./pages/HomeSeekersAbout'))
const HomeSeekersContact = lazy(() => import('./pages/HomeSeekersContact'))
const PublicDevelopmentLandingPage = lazy(() => import('./pages/PublicDevelopmentResponsiveRoute'))
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
const DeveloperAccessInvitePage = lazy(() => import('./pages/DeveloperAccessInvitePage'))
const DeveloperDocumentPortalPage = lazy(() => import('./pages/DeveloperDocumentPortalPage'))
const DeveloperLeadsPage = lazy(() => import('./pages/DeveloperLeadsPage'))
const DeveloperPartnersPage = lazy(() => import('./pages/DeveloperPartnersPage'))
const Developments = lazy(() => import('./pages/Developments'))
const Documents = lazy(() => import('./pages/Documents'))
const ExecutiveSnapshot = lazy(() => import('./pages/ExecutiveSnapshot'))
const ExternalTransactionPortal = lazy(() => import('./pages/ExternalTransactionPortal'))
const Financials = lazy(() => import('./pages/Financials'))
const LegalDocumentWorkspacePage = lazy(() => import('./pages/LegalDocumentWorkspacePage'))
const MobileDemoLayout = lazy(() => import('./components/mobile-shell/MobileDemoLayout'))
const MobileLayout = lazy(() => import('./components/mobile-shell/MobileLayout'))
const MobileDevelopmentDetailPage = lazy(() => import('./pages/mobile/MobileDevelopmentDetailPage'))
const MobileDevelopmentsPage = lazy(() => import('./pages/mobile/MobileDevelopmentsPage'))
const MobileDemoHomePage = lazy(() => import('./pages/mobile/MobileDemoHomePage'))
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
const MarketingComingSoonPage = lazy(() => import('./pages/MarketingComingSoonPage'))
const MarketingEventRsvpPage = lazy(() => import('./pages/MarketingEventRsvpPage'))
const AuctionsPage = lazy(() => import('./pages/AuctionsPage'))
const NewTransactionPage = lazy(() => import('./pages/NewTransactionPage'))
const OnboardingProfileSetup = lazy(() => import('./pages/OnboardingProfileSetup'))
const OnboardingLinksDemoPage = lazy(() => import('./pages/OnboardingLinksDemoPage'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const AgencyLeadListRoutePage = lazy(loadAgencyLeadListRouteModule)
const AgencyLeadWorkspaceRoutePage = lazy(loadAgencyLeadWorkspaceRouteModule)
const PipelineCanvassingPage = lazy(() => import('./pages/PipelineCanvassingPage'))
const PipelineOverviewPage = lazy(() => import('./pages/PipelineOverviewPage'))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'))
const PartnerPortalPage = lazy(() => import('./pages/PartnerPortalPage'))
const PartnerInvitationAcceptPage = lazy(() => import('./pages/PartnerInvitationAcceptPage'))
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
const SettingsActivityPage = lazy(() => import('./pages/settings/SettingsActivityPage'))
const SettingsBillingPage = lazy(() => import('./pages/settings/SettingsBillingPage'))
const SettingsCommissionStructuresPage = lazy(() => import('./pages/settings/SettingsCommissionStructuresPage'))
const SettingsCommunicationsTemplatesPage = lazy(() => import('./pages/settings/SettingsCommunicationsTemplatesPage'))
const SettingsDevelopmentsPage = lazy(() => import('./pages/settings/SettingsDevelopmentsPage'))
const SettingsLanding = lazy(() => import('./pages/settings/SettingsLanding'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'))
const SettingsLeadCapturePage = lazy(() => import('./pages/settings/SettingsLeadCapturePage'))
const SettingsOrganisationPage = lazy(() => import('./pages/settings/SettingsOrganisationPage'))
const SettingsPreferredPartnersPage = lazy(() => import('./pages/settings/SettingsPreferredPartnersPage'))
const SettingsPartnerProspectsPage = lazy(() => import('./pages/settings/SettingsPartnerProspectsPage'))
const SettingsPartnerRoutingRulesPage = lazy(() => import('./pages/settings/SettingsPartnerRoutingRulesPage'))
const SettingsProperty24Page = lazy(() => import('./pages/settings/SettingsProperty24Page'))
const SettingsPrivatePropertyPage = lazy(() => import('./pages/settings/SettingsPrivatePropertyPage'))
const SettingsSyndicationPage = lazy(() => import('./pages/settings/SettingsSyndicationPage'))
const SettingsSigningTemplatesPage = lazy(() => import('./pages/settings/SettingsSigningTemplatesPage'))
const SettingsUsersPage = lazy(() => import('./pages/settings/SettingsUsersPage'))
const SettingsWorkflowsPage = lazy(() => import('./pages/settings/SettingsWorkflowsPage'))
const SignerPortal = lazy(() => import('./pages/SignerPortal'))
const Snags = lazy(() => import('./pages/Snags'))
const Team = lazy(() => import('./pages/Team'))
const TransactionStatusShare = lazy(() => import('./pages/TransactionStatusShare'))
const TransactionPartnerInvitePage = lazy(() => import('./pages/TransactionPartnerInvitePage'))
const UnitDetail = lazy(() => import('./pages/UnitDetail'))
const Units = lazy(loadTransactionsRouteModule)

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

function getStableRouteContentKey(pathname = '') {
  if (pathname.startsWith('/settings')) return 'settings-shell'
  if (pathname.startsWith('/pipeline/leads/')) return pathname

  const rentalListingMatch = pathname.match(/^\/agent\/rentals\/listings\/([^/]+)(?:\/[^/]+)?$/)
  if (rentalListingMatch && rentalListingMatch[1] !== 'new') {
    return `/agent/rentals/listings/${rentalListingMatch[1]}`
  }

  // Search parameters are in-place UI state (for example an active lead tab).
  // Keying the outlet on them remounts the whole route and discards in-flight
  // requests, which makes navigation look like a blank page reload.
  return pathname
}

function TransactionDetailRoute() {
  return (
    <Suspense fallback={<TransactionDetailRouteShell />}>
      <AttorneyTransactionDetail />
    </Suspense>
  )
}

function AppLayout({ onLogout, session = null, user }) {
  const {
    workspace,
    role,
    profile,
    retryWorkspaceBootstrap,
    workspaceAccessDegraded,
    workspaceDegradedMessage,
  } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const mainScrollRef = useRef(null)
  const inactivityTimerRef = useRef(null)
  const warningTimerRef = useRef(null)
  const lastActivityAtRef = useRef(0)
  const lastTimerResetAtRef = useRef(0)
  const resetInactivityTimerRef = useRef(null)
  const securityLogoutInProgressRef = useRef(false)
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false)
  const sessionWarningOpenRef = useRef(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardInitialDevelopmentId, setWizardInitialDevelopmentId] = useState('')
  const [wizardInitialListingId, setWizardInitialListingId] = useState('')
  const [wizardInitialUnitId, setWizardInitialUnitId] = useState('')
  const [wizardInitialPropertyMode, setWizardInitialPropertyMode] = useState('')
  const [developmentModalOpen, setDevelopmentModalOpen] = useState(false)
  const isLegalWorkspaceRoute =
    /^\/transactions\/[^/]+\/legal\/[^/]+/.test(location.pathname) ||
    /^\/legal-documents\/[^/]+/.test(location.pathname) ||
    /^\/pipeline\/leads\/[^/]+\/legal\/[^/]+/.test(location.pathname)
  const isCommercialRoute = location.pathname.startsWith('/commercial')
  const isBondRoute = location.pathname.startsWith('/bond')
  const isLeadWorkspaceRoute = /^\/pipeline\/leads\/[^/]+/.test(location.pathname)
  const routeContentKey = getStableRouteContentKey(location.pathname)
  const hideSharedHeader =
    isLegalWorkspaceRoute ||
    location.pathname === '/command-center' ||
    location.pathname === '/attorney/scheduling'
  const isAttorneyDashboardRoute = role === 'attorney' && location.pathname === '/attorney/dashboard'
  const isDashboardRoute = location.pathname === '/dashboard' || location.pathname === '/'
  const defaultDevelopmentId = workspace.id === 'all' ? '' : workspace.id

  useEffect(() => {
    const documentElement = document.documentElement
    documentElement.classList.add('ui-shell-scroll-locked')
    resetLockedShellWindowScroll()

    return () => {
      documentElement.classList.remove('ui-shell-scroll-locked')
    }
  }, [])

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
      const requestedUnitId = event?.detail?.initialUnitId
      const requestedPropertyMode = event?.detail?.initialPropertyMode
      setWizardInitialDevelopmentId(requestedDevelopmentId ?? defaultDevelopmentId)
      setWizardInitialListingId(requestedListingId || '')
      setWizardInitialUnitId(requestedUnitId || '')
      setWizardInitialPropertyMode(requestedPropertyMode || '')
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
      resetLockedShellWindowScroll()
    })
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [routeContentKey])

  useEffect(() => {
    function resetShellScrollIfLocked() {
      if (!document.documentElement.classList.contains('ui-shell-scroll-locked')) return
      // The app shell owns the visible scroll position. Returning focus to the
      // tab should only clean up accidental body/html scroll, not move the user
      // away from their current workspace section.
      resetLockedShellWindowScroll()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        resetShellScrollIfLocked()
      }
    }

    window.addEventListener('focus', resetShellScrollIfLocked)
    window.addEventListener('pageshow', resetShellScrollIfLocked)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', resetShellScrollIfLocked)
      window.removeEventListener('pageshow', resetShellScrollIfLocked)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function handleOpenNewTransaction(initialDevelopmentId = defaultDevelopmentId) {
    setWizardInitialDevelopmentId(initialDevelopmentId)
    setWizardInitialListingId('')
    setWizardInitialUnitId('')
    setWizardInitialPropertyMode('')
    setWizardOpen(true)
  }

  function handleCloseNewTransaction() {
    setWizardOpen(false)
    setWizardInitialDevelopmentId(defaultDevelopmentId)
    setWizardInitialListingId('')
    setWizardInitialUnitId('')
    setWizardInitialPropertyMode('')
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
  const degradedWorkspaceBanner = workspaceAccessDegraded ? (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {workspaceDegradedMessage || 'Workspace data is refreshing from your last successful session.'}
        </p>
        <button
          type="button"
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
          onClick={() => retryWorkspaceBootstrap?.()}
        >
          Retry
        </button>
      </div>
    </div>
  ) : null

  if (isCommercialRoute) {
    return (
      <div className="h-screen overflow-hidden bg-[#f6f8fb] text-textStrong">
        {sessionTimeoutWarning}
        {degradedWorkspaceBanner}
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
        {degradedWorkspaceBanner}

        <main
          ref={mainScrollRef}
          data-app-shell-scroll="main"
          data-scroll-stability={isLeadWorkspaceRoute ? 'hydrating-workspace' : undefined}
          className={`ui-main-content ui-page-scroll ${isLeadWorkspaceRoute ? 'ui-page-scroll-stable' : ''} ${hideSharedHeader ? 'pt-6' : ''}`.trim()}
        >
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
              initialUnitId={wizardInitialUnitId}
              initialPropertyMode={wizardInitialPropertyMode}
            />
          ) : (
            <NewTransactionWizard
              open={wizardOpen}
              onClose={handleCloseNewTransaction}
              initialDevelopmentId={wizardInitialDevelopmentId}
              initialUnitId={wizardInitialUnitId}
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

    </div>
  )
}

const WORKSPACE_GATE_SLOW_MS = 30000

function AccessDenied({ title = 'Access restricted', message = 'You do not have access to this area.' }) {
  return <AccessState type="denied" title={title} description={message} />
}

function ReportsRoute() {
  const { role } = useWorkspace()

  if (role === 'agent') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator']}>
      <PermissionGate capability="view_reports">
        <AppErrorBoundary scope="reports" title="Reports module encountered an error">
          <Report />
        </AppErrorBoundary>
      </PermissionGate>
    </RoleRoute>
  )
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
  const normalizedProfileError = String(profileError || '').toLowerCase()
  const baseRole = authState.appRole
  const onboardingCompleted = authState.onboardingComplete
  const recoverableSessionRestoreFailure =
    !session &&
    authState.status === 'error' &&
    (
      normalizedProfileError.includes('auth session missing') ||
      normalizedProfileError.includes('lock') ||
      normalizedProfileError.includes('network') ||
      normalizedProfileError.includes('fetch') ||
      normalizedProfileError.includes('timed out')
    )
  const waitingOnWorkspace = authState.status === 'loading' || recoverableSessionRestoreFailure

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
              onClick={() => {
                onRetryBootstrap?.()
                retryWorkspaceBootstrap?.()
              }}
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

  if (authState.status === 'unauthenticated') {
    console.debug('[REDIRECT] auth:missing-session', { target: '/auth', from: location.pathname })
    storePostLoginRedirect(`${location.pathname || '/'}${location.search || ''}${location.hash || ''}`)
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  if (!session) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Recovering your secure session…</h2>
          <p>We are confirming your sign-in before opening the workspace.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="auth-primary-cta"
              onClick={() => {
                onRetryBootstrap?.()
                retryWorkspaceBootstrap?.()
              }}
            >
              Retry
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
  const hasResolvedWorkspaceMembership = Boolean(
    baseRole === 'client' ||
      (
        authState.activeMemberships.length > 0 &&
        authState.currentMembership?.id &&
        authState.currentWorkspace?.id
      ),
  )
  const hasCommercialAccess =
    hasCommercialAccessMarker(authState.currentMembership) ||
    (authState.activeMemberships || []).some((membership) => hasCommercialAccessMarker(membership))
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

  if (onAnyOnboardingRoute && onboardingCompleted && hasResolvedWorkspaceMembership) {
    const pendingPartnerInvitePath = readPendingPartnerInvitePath()
    const target = pendingPartnerInvitePath
      ? buildPartnerInviteAutoAcceptPath(pendingPartnerInvitePath)
      : hasCommercialAccess ? '/commercial' : baseRole === 'attorney' ? '/attorney/dashboard' : '/dashboard'
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

function RentalWorkspaceGuard({ children }) {
  const {
    availableBusinessWorkspaceIds = [],
    businessWorkspaceId,
    businessWorkspaceSplitEnabled,
    setBusinessWorkspace,
  } = useWorkspace()
  const location = useLocation()
  const hasRentalAccess = availableBusinessWorkspaceIds.includes(BUSINESS_WORKSPACES.rentals)
  const hasSalesAccess = availableBusinessWorkspaceIds.includes(BUSINESS_WORKSPACES.sales)
  const isRentalWorkspace = businessWorkspaceId === BUSINESS_WORKSPACES.rentals

  useEffect(() => {
    if (!businessWorkspaceSplitEnabled || !hasRentalAccess || isRentalWorkspace) return
    setBusinessWorkspace?.(BUSINESS_WORKSPACES.rentals)
  }, [businessWorkspaceSplitEnabled, hasRentalAccess, isRentalWorkspace, setBusinessWorkspace])

  if (!businessWorkspaceSplitEnabled) {
    return <AccessDenied message="Rentals workspace navigation is not enabled for this workspace." />
  }

  if (!hasRentalAccess) {
    if (hasSalesAccess) {
      return (
        <Navigate
          to={resolveBusinessWorkspaceRoute({
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
            targetWorkspace: BUSINESS_WORKSPACES.sales,
          })}
          replace
        />
      )
    }
    return <AccessDenied message="Your Arch9 access is not enabled for Rentals." />
  }

  if (!isRentalWorkspace) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Opening Rentals workspace…</h2>
          <p>Preparing the rental navigation context.</p>
        </div>
      </section>
    )
  }

  return children
}

function SalesWorkspaceGuard({ children }) {
  const {
    availableBusinessWorkspaceIds = [],
    businessWorkspaceId,
    businessWorkspaceSplitEnabled,
    role,
    setBusinessWorkspace,
  } = useWorkspace()
  const location = useLocation()
  const hasSalesAccess = availableBusinessWorkspaceIds.includes(BUSINESS_WORKSPACES.sales)
  const hasRentalAccess = availableBusinessWorkspaceIds.includes(BUSINESS_WORKSPACES.rentals)
  const isSalesWorkspace = businessWorkspaceId === BUSINESS_WORKSPACES.sales

  useEffect(() => {
    if (role !== 'agent' || !businessWorkspaceSplitEnabled || !hasSalesAccess || isSalesWorkspace) return
    setBusinessWorkspace?.(BUSINESS_WORKSPACES.sales)
  }, [businessWorkspaceSplitEnabled, hasSalesAccess, isSalesWorkspace, role, setBusinessWorkspace])

  if (role !== 'agent' || !businessWorkspaceSplitEnabled) {
    return children
  }

  if (!hasSalesAccess) {
    if (hasRentalAccess) {
      return (
        <Navigate
          to={resolveBusinessWorkspaceRoute({
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
            targetWorkspace: BUSINESS_WORKSPACES.rentals,
          })}
          replace
        />
      )
    }
    return <AccessDenied message="Your Arch9 access is not enabled for Sales." />
  }

  if (!isSalesWorkspace) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Opening Sales workspace…</h2>
          <p>Preparing the sales navigation context.</p>
        </div>
      </section>
    )
  }

  return children
}

function RentalWorkspacePlaceholder({ title, description }) {
  return (
    <RentalWorkspaceGuard>
      <PlaceholderPage title={title} description={description} />
    </RentalWorkspaceGuard>
  )
}

function RentalOperatingModeEntryRoute() {
  const { rentalOperatingMode } = useWorkspace()
  return <Navigate to={getRentalOperatingModeHomeRoute(rentalOperatingMode)} replace />
}

function RentalOperatingModeGuard({ mode = RENTAL_OPERATING_MODES.longTerm, children }) {
  const { availableRentalOperatingModeIds = [], rentalOperatingMode, setRentalOperatingMode } = useWorkspace()
  // Preserve the existing module-gate disabled state when Rentals itself is off;
  // otherwise a legacy dashboard link would redirect to itself forever.
  const allowed = availableRentalOperatingModeIds.includes(mode) || (
    mode === RENTAL_OPERATING_MODES.longTerm && availableRentalOperatingModeIds.length === 0
  )

  useEffect(() => {
    if (allowed && rentalOperatingMode !== mode) setRentalOperatingMode?.(mode)
  }, [allowed, mode, rentalOperatingMode, setRentalOperatingMode])

  if (!allowed) return <Navigate to={getRentalOperatingModeHomeRoute(rentalOperatingMode)} replace />
  return children
}

function RentalModuleGate({ moduleId = RENTAL_MODULES.dashboard, children }) {
  const availability = resolveRentalModuleAvailability(getFeatureFlags(), moduleId)
  if (availability.enabled) return <RentalModuleBoundary>{children}</RentalModuleBoundary>
  return (
    <RentalWorkspacePlaceholder
      title={availability.title}
      description={availability.description}
    />
  )
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

function OrganisationSettingsManageRoute({ children, permission = PERMISSIONS.manageWorkspaceSettings }) {
  const workspaceContext = useWorkspace()
  const { workspaceReady, profileLoading } = workspaceContext
  const canManage = evaluateAccessRequirement({ permission }, workspaceContext).ok

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

function SetupProtectedLayout({ session }) {
  if (isSupabaseConfigured && !session) {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className="setup-module-shell">
      <Suspense fallback={<PageSkeleton label="Preparing setup" />}>
        <Outlet />
      </Suspense>
    </div>
  )
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
  const { loading, error, refreshOrganisation, state: organisationState } = useOrganisation()
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

  if (shouldHydrateOrganisation && error && !organisationState) {
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
    const partnerInvitePath = readPendingPartnerInvitePath()
    if (partnerInvitePath) return partnerInvitePath
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
          <Route path="/join" element={<Arch9JoinRedirect />} />
          <Route path="/buy" element={<BridgeBuyPage />} />
          <Route path="/buy/:slug" element={<BridgeBuyPage />} />
          <Route path="/development/:slug" element={<AppErrorBoundary scope="public-development-landing" title="Development page failed to load"><PublicDevelopmentLandingPage /></AppErrorBoundary>} />
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
          <Route path="/card/:cardSlug" element={<AppErrorBoundary scope="agent-digital-card" title="Agent digital card failed to load"><PublicAgentDigitalCardPage /></AppErrorBoundary>} />
          <Route path="/rental-application/:token" element={<AppErrorBoundary scope="rental-applicant-journey" title="Rental application failed to load"><RentalApplicantJourneyPage /></AppErrorBoundary>} />
          <Route path="/intake/:agencySlug" element={<AppErrorBoundary scope="agency-public-intake" title="Agency intake page failed to load"><PublicAgencyIntakePage /></AppErrorBoundary>} />
          <Route path="/a/:agencySlug" element={<AppErrorBoundary scope="agency-public-intake" title="Agency intake page failed to load"><PublicAgencyIntakePage /></AppErrorBoundary>} />
          <Route path="/young-law" element={<AppErrorBoundary scope="young-law-calculators" title="Young Law calculators failed to load"><YoungLawCalculatorsPage /></AppErrorBoundary>} />
          <Route path="/young-law/calculators" element={<AppErrorBoundary scope="young-law-calculators" title="Young Law calculators failed to load"><YoungLawCalculatorsPage /></AppErrorBoundary>} />
          <Route path="/demo/young-law" element={<AppErrorBoundary scope="young-law-calculators" title="Young Law calculators failed to load"><YoungLawCalculatorsPage /></AppErrorBoundary>} />
          <Route path="/tuckers-attorneys" element={<AppErrorBoundary scope="tuckers-attorneys-calculators" title="Tuckers Attorneys calculators failed to load"><TuckersAttorneysCalculatorsPage /></AppErrorBoundary>} />
          <Route path="/tuckers-attorneys/calculators" element={<AppErrorBoundary scope="tuckers-attorneys-calculators" title="Tuckers Attorneys calculators failed to load"><TuckersAttorneysCalculatorsPage /></AppErrorBoundary>} />
          <Route path="/demo/tuckers-attorneys" element={<AppErrorBoundary scope="tuckers-attorneys-calculators" title="Tuckers Attorneys calculators failed to load"><TuckersAttorneysCalculatorsPage /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers" element={<AppErrorBoundary scope="homeseekers-demo" title="HomeSeekers demo failed to load"><HomeSeekersDemo /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/buy" element={<AppErrorBoundary scope="homeseekers-buy" title="HomeSeekers buy page failed to load"><HomeSeekersBuy /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/sell" element={<AppErrorBoundary scope="homeseekers-sell" title="HomeSeekers sell page failed to load"><HomeSeekersSell /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/rent" element={<AppErrorBoundary scope="homeseekers-rent" title="HomeSeekers rent page failed to load"><HomeSeekersRent /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/developments" element={<AppErrorBoundary scope="homeseekers-developments" title="HomeSeekers developments page failed to load"><HomeSeekersDevelopments /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/people" element={<AppErrorBoundary scope="homeseekers-people" title="HomeSeekers people page failed to load"><HomeSeekersPeople /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/about" element={<AppErrorBoundary scope="homeseekers-about" title="HomeSeekers about page failed to load"><HomeSeekersAbout /></AppErrorBoundary>} />
          <Route path="/demo/homeseekers/contact" element={<AppErrorBoundary scope="homeseekers-contact" title="HomeSeekers contact page failed to load"><HomeSeekersContact /></AppErrorBoundary>} />
          <Route path="/referrals/invite/:token" element={<AppErrorBoundary scope="referral-invite" title="Referral invite failed to load"><ReferralInvitePage /></AppErrorBoundary>} />
          <Route element={<MobileExecutiveLayout />}>
            <Route path="/m/developments" element={<MobileDevelopmentsPage />} />
            <Route path="/m/developments/:developmentId" element={<MobileDevelopmentDetailPage />} />
            <Route path="/m/transactions/:transactionId" element={<MobileTransactionDetailPage />} />
          </Route>
          <Route element={<MobileDemoLayout />}>
            <Route path="/mobile-demo" element={<Navigate to="/mobile-demo/home" replace />} />
            <Route path="/mobile-demo/home" element={<AppErrorBoundary scope="mobile-demo-home" title="Mobile demo home failed to load"><MobileDemoHomePage /></AppErrorBoundary>} />
            <Route path="/mobile-demo/search" element={<AppErrorBoundary scope="mobile-demo-search" title="Mobile demo search failed to load"><MobileSearchPage routePrefix="/mobile-demo" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/transaction/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-transaction-workspace" title="Mobile demo transaction failed to load"><MobileWorkspacePage workspaceType="transaction" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/lead/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-lead-workspace" title="Mobile demo lead failed to load"><MobileWorkspacePage workspaceType="lead" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/matter/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-matter-workspace" title="Mobile demo matter failed to load"><MobileWorkspacePage workspaceType="matter" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/application/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-application-workspace" title="Mobile demo application failed to load"><MobileWorkspacePage workspaceType="application" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/deal/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-deal-workspace" title="Mobile demo deal failed to load"><MobileWorkspacePage workspaceType="deal" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/commercial-lead/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-commercial-lead-workspace" title="Mobile demo commercial lead failed to load"><MobileWorkspacePage workspaceType="commercialLead" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/listing/:workspaceId" element={<AppErrorBoundary scope="mobile-demo-listing-workspace" title="Mobile demo listing failed to load"><MobileWorkspacePage workspaceType="listing" /></AppErrorBoundary>} />
            <Route path="/mobile-demo/*" element={<Navigate to="/mobile-demo/transaction/demo-transaction" replace />} />
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

              <Route element={<OrganisationGate><SetupProtectedLayout session={session} /></OrganisationGate>}>
                <Route path="/setup" element={<PostDashboardSetup />} />
                <Route path="/setup/recovery" element={<PostDashboardSetup />} />
              </Route>

              <Route element={<OrganisationGate><ProtectedLayout onLogout={logout} session={session} /></OrganisationGate>}>
              <Route path="/dashboard" element={<SalesWorkspaceGuard><AppErrorBoundary scope="dashboard-shell" title="Dashboard failed to render"><ClientAwareDashboard /></AppErrorBoundary></SalesWorkspaceGuard>} />
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
                  element={<Navigate to="/commercial/settings" replace />}
                />
                <Route path="*" element={<Navigate to="/commercial" replace />} />
              </Route>
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
                path="/attorney/cost-calculator"
                element={<Navigate to="/attorney/dashboard" replace />}
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
                path="/attorney/leads"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneyLeadsPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/matters"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <AttorneyMattersPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/transactions"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
                      <Navigate to="/attorney/transactions/all" replace />
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
                path="/developments/:developmentId/transactions/:transactionId"
                element={
                  <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="development-transaction-workspace" title="Transaction workspace failed to load">
                      <TransactionDetailRoute />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/developer/developments"
                element={
                  <RoleRoute allowedRoles={['developer']}>
                    <Developments />
                  </RoleRoute>
                }
              />
              <Route
                path="/developer/developments/:developmentId"
                element={
                  <RoleRoute allowedRoles={['developer']}>
                    <DevelopmentDetail />
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
                path="/developer/leads"
                element={
                  <RoleRoute allowedRoles={['developer']}>
                    <AppErrorBoundary scope="developer-leads-workspace" title="Developer leads failed to load">
                      <DeveloperLeadsPage />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/developer/leads/:developerLeadId"
                element={
                  <RoleRoute allowedRoles={['developer']}>
                    <AppErrorBoundary scope="developer-lead-workspace" title="Developer lead workspace failed to load">
                      <DeveloperLeadsPage />
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
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <Units />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route path="/transactions" element={<SalesWorkspaceGuard><ClientAwareTransactions /></SalesWorkspaceGuard>} />
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
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <AppErrorBoundary scope="legal-document-workspace" title="Legal document workspace failed to load">
                        <LegalDocumentWorkspacePage />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
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
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <AppErrorBoundary scope="transaction-workspace" title="Transaction workspace failed to load">
                        <TransactionDetailRoute />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/transactions/:transactionId/transfer/:workflowDetailKey"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <AppErrorBoundary scope="transaction-workflow-detail" title="Transaction workflow detail failed to load">
                        <TransactionDetailRoute />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/bond/files/:transactionId"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-file-workspace" title="Bond file workspace failed to load">
                      <TransactionDetailRoute />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/bond/files/:transactionId/transfer/:workflowDetailKey"
                element={
                  <RoleRoute allowedRoles={['bond_originator']}>
                    <AppErrorBoundary scope="bond-file-workflow-detail" title="Bond workflow detail failed to load">
                      <TransactionDetailRoute />
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
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <AppErrorBoundary scope="transaction-workspace" title="Unit workspace failed to load">
                        <UnitDetail />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent', 'bond_originator']}>
                      <PipelineEntryRoute />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/agent/rentals"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalOperatingModeEntryRoute />
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/dashboard"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalOperatingModeEntryRoute />
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route path="/agent/rentals/long-term" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><Navigate to="/agent/rentals/long-term/dashboard" replace /></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/long-term/dashboard" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.longTerm}><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalOperationsDashboardPage /></RentalModuleGate></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><Navigate to="/agent/rentals/short-term/dashboard" replace /></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term/dashboard" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.shortTerm}><Suspense fallback={<PageSkeleton label="Loading Short-Term Rentals" />}><ShortTermRentalDashboardPage /></Suspense></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term/calendar" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.shortTerm}><Suspense fallback={<PageSkeleton label="Loading Short-Term calendar" />}><ShortTermRentalCalendarPage /></Suspense></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term/properties" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.shortTerm}><Suspense fallback={<PageSkeleton label="Loading Short-Term properties" />}><ShortTermRentalInventoryPage /></Suspense></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term/bookings" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.shortTerm}><Suspense fallback={<PageSkeleton label="Loading Short-Term bookings" />}><ShortTermBookingsPage /></Suspense></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term/turnovers" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.shortTerm}><Suspense fallback={<PageSkeleton label="Loading Short-Term turnovers" />}><ShortTermTurnoversPage /></Suspense></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/short-term/rates" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalOperatingModeGuard mode={RENTAL_OPERATING_MODES.shortTerm}><Suspense fallback={<PageSkeleton label="Loading Short-Term rates" />}><ShortTermRatesPage /></Suspense></RentalOperatingModeGuard></RentalWorkspaceGuard></RoleRoute>} />
              <Route
                path="/agent/rentals/tenancies"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.tenancies}>
                        <RentalTenanciesPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route path="/agent/rentals/tenancies/:tenancyId" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.tenancies}><RentalTenancyDetailPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route
                path="/agent/rentals/pipeline/leads"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.leads}>
                        <RentalLeadsPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/pipeline/viewings"
                element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.leads}><RentalViewingsPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>}
              />
              <Route
                path="/agent/rentals/pipeline"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <Navigate to="/agent/rentals/pipeline/leads" replace />
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/pipeline/applications"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.applications}>
                        <RentalApplicationsPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route path="/agent/rentals/applications" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.applications}><RentalApplicationWorkspacePage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/applications/:applicationId" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.applications}><RentalApplicationDetailPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route
                path="/agent/rentals/pipeline/calendar"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.calendar}>
                        <RentalCalendarPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/operations"
                element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalOperationsDashboardPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>}
              />
              <Route path="/agent/rentals/pilot-readiness" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalPilotReadinessPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/rollout-controls" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalRolloutControlsPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/pilot-launch" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalPilotLaunchPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/pilot-execution" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalPilotExecutionPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/pilot-reviews" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.dashboard}><RentalPilotReviewsPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/maintenance" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalMaintenancePage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/maintenance/quotes" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalMaintenanceQuotesPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/maintenance/execution" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalMaintenanceExecutionPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/inspections" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalInspectionsPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/inspections/:inspectionId" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalInspectionExecutionPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/inspections/:inspectionId/follow-up" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalInspectionFollowUpPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/tenancies/:tenancyId/move-out" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalMoveOutPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/tenancies/:tenancyId/closure" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalTenancyClosurePage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/notifications" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalNotificationsPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/reminders" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalRemindersPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/screening" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalScreeningPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/reports" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalReportsPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route path="/agent/rentals/financial-reconciliation" element={<RoleRoute allowedRoles={['agent']}><RentalWorkspaceGuard><RentalModuleGate moduleId={RENTAL_MODULES.management}><RentalFinancialReconciliationPage /></RentalModuleGate></RentalWorkspaceGuard></RoleRoute>} />
              <Route
                path="/agent/rentals/vacancies/new"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalVacancyCreatePage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/vacancies/:vacancyId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalVacancyDetailPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/vacancies"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalVacanciesPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/portfolio/:portfolioId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalPortfolioDetailPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/portfolio/properties/:propertyId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalPropertyDetailPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/portfolio"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalPortfoliosPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/portfolio/properties"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.properties}>
                        <RentalPropertiesPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/listings/new"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.listings}>
                        <RentalListingCreatePage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/listings/:listingId/:detailTab?"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.listings}>
                        <RentalListingDetailPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/agent/rentals/listings"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <RentalWorkspaceGuard>
                      <RentalModuleGate moduleId={RENTAL_MODULES.listings}>
                        <RentalListingsPage />
                      </RentalModuleGate>
                    </RentalWorkspaceGuard>
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/leads"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <Suspense fallback={<LeadsRouteShell />}>
                        <AgencyLeadListRoutePage />
                      </Suspense>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/leads/:leadId/legal/:packetType"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <AppErrorBoundary scope="legal-document-workspace" title="Legal document workspace failed to load">
                        <LegalDocumentWorkspacePage />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/leads/:leadId"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <Suspense fallback={<LeadWorkspaceRouteLoadingShell loadStage="route_chunk_loading" />}>
                        <AgencyLeadWorkspaceRoutePage />
                      </Suspense>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/enquiries"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentEnquiriesPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/overview"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <PipelineOverviewPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/canvassing"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <PipelineCanvassingPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/canvassing/property-search"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <PipelineCanvassingPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/canvassing/property-reports"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <PipelineCanvassingPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/canvassing/prospects/:prospectId"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <PipelineCanvassingPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/pipeline/calendar"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <Pipeline key="pipeline-calendar" initialAgentViewMode="calendar" />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/marketing"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <MarketingComingSoonPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/auctions"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <AuctionsPage />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/calendar"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <Navigate to="/pipeline/calendar" replace />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/listings/:listingId/edit"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <AgentListings />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/listings/:listingSection?"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <AgentListings />
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/agent/listings/:listingId/legal/:packetType"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['agent']}>
                      <AppErrorBoundary scope="legal-document-workspace" title="Legal document workspace failed to load">
                        <LegalDocumentWorkspacePage />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
                }
              />
              <Route
                path="/agent/listings/:listingId"
                element={
                  <SalesWorkspaceGuard>
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <AppErrorBoundary
                        scope="agent-listing-detail"
                        title="Listing workspace failed to load"
                        fallbackPath="/listings"
                        fallbackLabel="Back to Listings"
                        resetKey={`${location.pathname}${location.search}`}
                      >
                        <AgentListingDetail />
                      </AppErrorBoundary>
                    </RoleRoute>
                  </SalesWorkspaceGuard>
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
                path="/agency/overview"
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
                path="/agency/commission"
                element={
                  <OrganisationSettingsManageRoute permission={PERMISSIONS.viewCommissionStructures}>
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsCommissionStructuresPage />
                    </RoleRoute>
                  </OrganisationSettingsManageRoute>
                }
              />
              <Route
                path="/agency/branding"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/settings/branding" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/agency/roles"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/settings/roles" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/agency/activity"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/settings/activity" replace />
                  </RoleRoute>
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
                path="/agency/partners"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AppErrorBoundary scope="agency-partners-module" title="Partners module failed to load">
                        <PartnersPage />
                      </AppErrorBoundary>
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
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/dashboard" replace />
                  </RoleRoute>
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
                element={<ReportsRoute />}
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
                path="/users/branches/:branchId"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmPage />
                  </RoleRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmPage />
                  </RoleRoute>
                }
              />
              <Route path="/settings" element={<ClientAwareSettingsLayout />}>
                <Route index element={<SettingsLanding />} />
                <Route path="overview" element={<Navigate to="/settings" replace />} />
                <Route path="account" element={<SettingsAccountPage section="profile" />} />
                <Route path="profile" element={<SettingsAccountPage section="profile" />} />
                <Route path="security" element={<SettingsAccountPage section="security" />} />
                <Route
                  path="organisation"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <SettingsOrganisationPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="business-lines"
                  element={
                    <RoleRoute allowedRoles={['agent']}>
                      <SettingsOrganisationPage section="business-lines" />
                    </RoleRoute>
                  }
                />
                <Route
                  path="branding"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <SettingsOrganisationPage section="branding" />
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
                  path="syndication"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['agent']}>
                        <SettingsSyndicationPage />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route
                  path="syndication/property24"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['agent']}>
                        <SettingsProperty24Page />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route
                  path="syndication/private-property"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['agent']}>
                        <SettingsPrivatePropertyPage />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route path="property24" element={<Navigate to="/settings/syndication/property24" replace />} />
                <Route
                  path="commission"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <Navigate to="/agency/commission" replace />
                    </RoleRoute>
                  }
                />
                <Route
                  path="commission-structures"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <Navigate to="/agency/commission" replace />
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
                  path="signing-templates"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['developer', 'agent']}>
                        <Navigate to="/settings" replace />
                      </RoleRoute>
                    </OrganisationSettingsManageRoute>
                  }
                />
                <Route
                  path="legal-templates/*"
                  element={
                    <OrganisationSettingsManageRoute>
                      <RoleRoute allowedRoles={['developer', 'agent']}>
                        <Navigate to="/settings" replace />
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
                <Route
                  path="roles"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <PermissionGate capability="manage_users">
                        <SettingsUsersPage />
                      </PermissionGate>
                    </RoleRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <PermissionGate capability="manage_users">
                        <SettingsUsersPage />
                      </PermissionGate>
                    </RoleRoute>
                  }
                />
                <Route
                  path="activity"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <PermissionGate capability="manage_workspace_settings">
                        <SettingsActivityPage />
                      </PermissionGate>
                    </RoleRoute>
                  }
                />
                <Route
                  path="billing"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent', 'attorney', 'bond_originator']}>
                      <PermissionGate capability="manage_billing">
                        <SettingsBillingPage />
                      </PermissionGate>
                    </RoleRoute>
                  }
                />
              </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
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
          <Route path="/partners/invite/:invitationId" element={<AppErrorBoundary scope="partner-invite-route" title="Partner invite failed to load"><PartnerInvitationAcceptPage /></AppErrorBoundary>} />
          <Route path="/developer/access-invite/:token" element={<AppErrorBoundary scope="developer-access-invite-route" title="Developer access invite failed to load"><DeveloperAccessInvitePage /></AppErrorBoundary>} />
          <Route path="/developer/partner-invite/:token" element={<TokenRouteGate><AppErrorBoundary scope="developer-partner-invite-route" title="Developer partner invite failed to load"><DeveloperPartnerInvitePage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/developer/document-portal/:token" element={<TokenRouteGate><AppErrorBoundary scope="developer-document-portal-route" title="Developer document portal failed to load"><DeveloperDocumentPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/commercial/portal/:token" element={<TokenRouteGate><AppErrorBoundary scope="commercial-portal-route" title="Commercial portal failed to load"><CommercialExternalPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/commercial/onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="commercial-onboarding-route" title="Commercial onboarding failed to load"><CommercialOnboardingPortalPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/commercial/landlord-onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="commercial-landlord-onboarding-route" title="Landlord onboarding failed to load"><CommercialLandlordOnboardingPage /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/sign/:token" element={<SignerPortal />} />
          <Route path="/appointment-rsvp/:token" element={<AppointmentRsvpPage />} />
          <Route path="/marketing/rsvp/:token" element={<MarketingEventRsvpPage />} />
          <Route path="/journey/:slug" element={<AppErrorBoundary scope="attorney-public-intake" title="Attorney enquiry page failed to load"><AttorneyPublicIntakePage /></AppErrorBoundary>} />
          <Route path="/quote/:token" element={<AppErrorBoundary scope="attorney-quote-decision" title="Attorney quote failed to load"><AttorneyQuoteDecisionPage /></AppErrorBoundary>} />
          <Route path="/demo/onboarding-links" element={<AppErrorBoundary scope="demo-onboarding-links" title="Demo onboarding links failed to load"><OnboardingLinksDemoPage /></AppErrorBoundary>} />
          <Route path="/demo/:token/onboarding" element={<AppErrorBoundary scope="client-portal-route" title="Buyer onboarding demo failed to load"><ClientOnboarding /></AppErrorBoundary>} />
          <Route path="/demo/:token/buyer" element={<AppErrorBoundary scope="prospect-buyer-demo-route" title="Buyer portal demo failed to load"><ProspectBuyerDemo /></AppErrorBoundary>} />
          <Route path="/demo/:token/buyer/:section" element={<AppErrorBoundary scope="prospect-buyer-demo-route" title="Buyer portal demo failed to load"><ProspectBuyerDemo /></AppErrorBoundary>} />
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
          <Route path="/client/:token/otp-signing" element={<TokenRouteGate><LegacyOtpSigningRedirect /></TokenRouteGate>} />
          <Route path="/client/offer/:token" element={<AppErrorBoundary scope="buyer-offer-route" title="Offer workflow retired"><RetiredOfferWorkflowPage /></AppErrorBoundary>} />
          <Route path="/viewing-preferences/:token" element={<AppErrorBoundary scope="buyer-viewing-preferences-route" title="Viewing preferences failed to load"><BuyerViewingPreferencesPage /></AppErrorBoundary>} />
          <Route path="/seller-viewing/:token" element={<AppErrorBoundary scope="seller-viewing-coordination-route" title="Viewing coordination failed to load"><SellerViewingCoordinationPage /></AppErrorBoundary>} />
          <Route path="/offers/session/:token" element={<AppErrorBoundary scope="post-viewing-offer-route" title="Offer workflow retired"><RetiredOfferWorkflowPage /></AppErrorBoundary>} />
          <Route path="/offers/:token" element={<AppErrorBoundary scope="buyer-offer-route" title="Offer workflow retired"><RetiredOfferWorkflowPage /></AppErrorBoundary>} />
          <Route path="/seller/offers/review/:token" element={<AppErrorBoundary scope="seller-offer-review-route" title="Offer workflow retired"><RetiredOfferWorkflowPage /></AppErrorBoundary>} />
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
    <BrowserRouter unstable_useTransitions={false}>
      <ReleaseFreshnessGuard />
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
  const { role } = workspaceContext
  if (role === 'client') {
    return <ClientModulePage />
  }
  if (role === 'attorney') {
    return <Navigate to="/attorney/dashboard" replace />
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

function LegacyOtpSigningRedirect() {
  const { token = '' } = useParams()
  const safeToken = String(token || '').trim()
  return <Navigate to={safeToken ? `/client/${encodeURIComponent(safeToken)}/documents` : '/auth'} replace />
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
      <Suspense fallback={<TransactionsRouteShell />}>
        <Units />
      </Suspense>
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
  if (role === 'developer') {
    return <Navigate to="/developer/leads?view=pipeline" replace />
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
