import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import AddDevelopmentModal from './components/AddDevelopmentModal'
import CommandPalette from './components/CommandPalette'
import HeaderBar from './components/HeaderBar'
import MobileExecutiveLayout from './components/mobile/MobileExecutiveLayout'
import AgentNewDealWizard from './components/AgentNewDealWizard'
import NewTransactionWizard from './components/NewTransactionWizard'
import Sidebar from './components/Sidebar'
import AppErrorBoundary from './components/AppErrorBoundary'
import PermissionGate from './components/PermissionGate'
import TokenRouteGate from './components/routing/TokenRouteGate'
import { AuthSessionProvider, useAuthSession } from './context/AuthSessionContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { useWorkspace } from './context/WorkspaceContext'
import { APP_ROLE_LABELS } from './lib/roles'
import { isAttorneyDemoModeActiveForWorkspace } from './lib/attorneyDemoContext'
import { FEATURE_FLAGS, SHOW_INTELLIGENCE_BETA } from './lib/featureFlags'
import { clearLegacyAgentDemoSeedData, ensureAgentModuleDemoSeed } from './lib/agentDemoSeed'
import { MOCK_DATA_ENABLED } from './lib/mockData'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from './lib/organisationAccess'
import {
  isSupabaseConfigured,
} from './lib/supabaseClient'
import { getRuntimeEnvValidation } from './lib/envValidation'
import { markRouteFirstVisibleContent, markRouteRendered } from './lib/performanceTrace'
import { decideAuthRedirect, isOnboardingRoute } from './lib/onboardingRouting'
import { fetchOrganisationSettings } from './lib/settingsApi'
import { getCurrentUserAttorneyMembership } from './lib/attorneyPermissions'
import Auth from './pages/Auth'
import AuthCallback from './pages/AuthCallback'
import OnboardingProfileSetup from './pages/OnboardingProfileSetup'
import RoleModuleOnboarding from './pages/RoleModuleOnboarding'
import Dashboard from './pages/Dashboard'
import DeveloperIntelligenceDashboardPage from './pages/developer-intelligence/DashboardPage'
import DeveloperIntelligenceOpportunityEnginePage from './pages/developer-intelligence/OpportunityEnginePage'
import DeveloperIntelligenceFeasibilityPage from './pages/developer-intelligence/FeasibilityPage'
import DeveloperIntelligenceMarketDemandPage from './pages/developer-intelligence/MarketDemandPage'
import DeveloperIntelligencePricingSimulatorPage from './pages/developer-intelligence/PricingSimulatorPage'
import DeveloperIntelligencePortfolioPerformancePage from './pages/developer-intelligence/PortfolioPerformancePage'
import DeveloperIntelligenceGrowthNetworkPage from './pages/developer-intelligence/GrowthNetworkPage'
import AttorneyIntelligenceDashboardPage from './pages/attorney-intelligence/DashboardPage'
import AttorneyIntelligenceOpportunityEnginePage from './pages/attorney-intelligence/OpportunityEnginePage'
import AttorneyIntelligencePartnerPage from './pages/attorney-intelligence/PartnerIntelligencePage'
import AttorneyIntelligenceMarketPositionPage from './pages/attorney-intelligence/MarketPositionPage'
import AttorneyIntelligenceRevenueForecastPage from './pages/attorney-intelligence/RevenueForecastPage'
import AgentIntelligenceOverviewPage from './pages/agent-intelligence/OverviewPage'
import AgentIntelligenceOpportunitiesPage from './pages/agent-intelligence/OpportunitiesPage'
import AgentIntelligenceMarketPage from './pages/agent-intelligence/MarketPage'
import AgentIntelligencePricingPage from './pages/agent-intelligence/PricingPage'
import AgentIntelligencePipelinePage from './pages/agent-intelligence/PipelinePage'
import AgentIntelligencePerformancePage from './pages/agent-intelligence/PerformancePage'
import AgentIntelligenceNetworkPage from './pages/agent-intelligence/NetworkPage'
import AttorneyTransactionDetail from './pages/AttorneyTransactionDetail'
import ConveyancerDevelopments from './pages/ConveyancerDevelopments'
import DevelopmentDetail from './pages/DevelopmentDetail'
import Developments from './pages/Developments'
import Documents from './pages/Documents'
import ClientPortal from './pages/ClientPortal'
import ClientOtpSigning from './pages/ClientOtpSigning'
import ClientOnboarding from './pages/ClientOnboarding'
import BuyerOfferSubmission from './pages/BuyerOfferSubmission'
import ClientModulePage from './pages/ClientModulePage'
import ClientProfile from './pages/ClientProfile'
import AgentListings from './pages/AgentListings'
import AgentListingDetail from './pages/AgentListingDetail'
import AgentInviteOnboarding from './pages/AgentInviteOnboarding'
import AgentsPage, { AgentWorkspacePage } from './pages/Agents'
import AgentReportingPage from './pages/AgentReportingPage'
import AgencyAnalyticsPage from './pages/agency/AgencyAnalyticsPage'
import AgencyBranchesPage from './pages/agency/AgencyBranchesPage'
import AgencyBranchWorkspacePage from './pages/agency/AgencyBranchWorkspacePage'
import ExecutiveSnapshot from './pages/ExecutiveSnapshot'
import ExternalTransactionPortal from './pages/ExternalTransactionPortal'
import Financials from './pages/Financials'
import LegalDocumentWorkspacePage from './pages/LegalDocumentWorkspacePage'
import NewTransactionPage from './pages/NewTransactionPage'
import PlaceholderPage from './pages/PlaceholderPage'
import Pipeline from './pages/Pipeline'
import PipelineCanvassingPage from './pages/PipelineCanvassingPage'
import Report from './pages/Report'
import Clients from './pages/Clients'
import Snags from './pages/Snags'
import SettingsAccountPage from './pages/settings/SettingsAccountPage'
import SettingsBillingPage from './pages/settings/SettingsBillingPage'
import SettingsDevelopmentsPage from './pages/settings/SettingsDevelopmentsPage'
import SettingsLanding from './pages/settings/SettingsLanding'
import SettingsLayout from './pages/settings/SettingsLayout'
import SettingsCommissionStructuresPage from './pages/settings/SettingsCommissionStructuresPage'
import SettingsOrganisationPage from './pages/settings/SettingsOrganisationPage'
import SettingsPreferredPartnersPage from './pages/settings/SettingsPreferredPartnersPage'
import SettingsUsersPage from './pages/settings/SettingsUsersPage'
import SettingsWorkflowsPage from './pages/settings/SettingsWorkflowsPage'
import SettingsCommunicationsTemplatesPage from './pages/settings/SettingsCommunicationsTemplatesPage'
import SettingsSigningTemplatesPage from './pages/settings/SettingsSigningTemplatesPage'
import Team from './pages/Team'
import SignerPortal from './pages/SignerPortal'
import SellerPortal, { SellerWorkspace } from './pages/SellerPortal'
import TransactionStatusShare from './pages/TransactionStatusShare'
import StakeholderInviteAccept from './pages/StakeholderInviteAccept'
import UnitDetail from './pages/UnitDetail'
import Units from './pages/Units'
import AttorneyOnboardingPage from './pages/AttorneyOnboardingPage'
import AppointmentRsvpPage from './pages/AppointmentRsvpPage'
import AttorneyDashboardPage from './pages/AttorneyDashboardPage'
import AttorneyOperationsPage from './pages/AttorneyOperationsPage'
import AttorneySchedulingPage from './pages/AttorneySchedulingPage'
import AttorneyFirmSettingsPage from './pages/AttorneyFirmSettingsPage'
import PostDashboardSetup from './pages/PostDashboardSetup'
import MobileDevelopmentDetailPage from './pages/mobile/MobileDevelopmentDetailPage'
import MobileDevelopmentsPage from './pages/mobile/MobileDevelopmentsPage'
import MobileTransactionDetailPage from './pages/mobile/MobileTransactionDetailPage'
import BridgeLanding, {
  BridgeAgentsPage,
  BridgeBuyersPage,
  BridgeContactPage,
  BridgeConveyancersPage,
  BridgeDevelopersPage,
  BridgeHowItWorksPage,
  BridgeProductPage,
  BridgeSolutionsPage,
} from './pages/BridgeLanding'
import { useEffect, useRef, useState } from 'react'
import { getCurrentUserPrimaryAttorneyFirm } from './services/attorneyFirms'

function AppLayout({ onLogout, user }) {
  const { workspace, role, profile, agencyWorkflowMode } = useWorkspace()
  const location = useLocation()
  const mainScrollRef = useRef(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardInitialDevelopmentId, setWizardInitialDevelopmentId] = useState('')
  const [developmentModalOpen, setDevelopmentModalOpen] = useState(false)
  const isLegalWorkspaceRoute =
    /^\/transactions\/[^/]+\/legal\/[^/]+/.test(location.pathname) ||
    /^\/legal-documents\/[^/]+/.test(location.pathname) ||
    /^\/pipeline\/leads\/[^/]+\/legal\/[^/]+/.test(location.pathname)
  const hideSharedHeader = isLegalWorkspaceRoute || (role === 'developer' && (location.pathname === '/dashboard' || location.pathname === '/'))
  const defaultDevelopmentId = workspace.id === 'all' ? '' : workspace.id

  useEffect(() => {
    function openNewTransaction(event) {
      const requestedDevelopmentId = event?.detail?.initialDevelopmentId
      setWizardInitialDevelopmentId(requestedDevelopmentId ?? defaultDevelopmentId)
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
    if (MOCK_DATA_ENABLED) return
    const didCleanup = clearLegacyAgentDemoSeedData()
    if (didCleanup && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:transaction-created'))
      window.dispatchEvent(new Event('itg:pipeline-updated'))
      window.dispatchEvent(new Event('itg:listings-updated'))
    }
  }, [])

  useEffect(() => {
    if (!MOCK_DATA_ENABLED) return
    const profileEmail = String(profile?.email || user?.email || '').trim().toLowerCase()
    const didSeed = ensureAgentModuleDemoSeed({ profileEmail })
    if (didSeed && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:transaction-created'))
      window.dispatchEvent(new Event('itg:pipeline-updated'))
      window.dispatchEvent(new Event('itg:listings-updated'))
    }
  }, [profile?.email, user?.email])

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
    setWizardOpen(true)
  }

  function handleCloseNewTransaction() {
    setWizardOpen(false)
    setWizardInitialDevelopmentId(defaultDevelopmentId)
  }

  return (
    <div className="h-screen overflow-hidden bg-app text-textStrong">
      <Sidebar />

      <div className="ui-main-region h-screen overflow-hidden">
        {!hideSharedHeader ? (
          <HeaderBar
            onNewTransaction={() => handleOpenNewTransaction()}
            onNewDevelopment={() => setDevelopmentModalOpen(true)}
            onLogout={onLogout}
            user={user}
          />
        ) : null}

        <main ref={mainScrollRef} className={`ui-main-content ui-page-scroll ${hideSharedHeader ? 'pt-6' : ''}`.trim()}>
          <div className="ui-content-container">
            <Outlet key={location.pathname} />
          </div>
        </main>
      </div>

      {role === 'agent' && agencyWorkflowMode !== 'principal' ? (
        <AgentNewDealWizard
          open={wizardOpen}
          onClose={handleCloseNewTransaction}
          initialDevelopmentId={wizardInitialDevelopmentId}
        />
      ) : (
        <NewTransactionWizard
          open={wizardOpen}
          onClose={handleCloseNewTransaction}
          initialDevelopmentId={wizardInitialDevelopmentId}
        />
      )}

      <AddDevelopmentModal
        open={developmentModalOpen}
        onClose={() => setDevelopmentModalOpen(false)}
        contextRole={role}
        onCreated={() => {
          window.dispatchEvent(new Event('itg:developments-changed'))
          window.dispatchEvent(new Event('itg:listings-updated'))
        }}
      />

      <CommandPalette
        onNewTransaction={() => handleOpenNewTransaction()}
        onNewDevelopment={() => setDevelopmentModalOpen(true)}
      />
    </div>
  )
}

const WORKSPACE_GATE_TIMEOUT_MS = 15000

function AuthGate({ authLoading, session, authBootstrapError = '', onRetryBootstrap = null, onLogout = null }) {
  const location = useLocation()
  const { profileError, onboardingCompleted, baseRole, profile, workspaceReady, retryWorkspaceBootstrap } = useWorkspace()
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const didHandleSessionMismatchRef = useRef(false)

  useEffect(() => {
    const waitingOnWorkspace = authLoading || (isSupabaseConfigured && session && !workspaceReady)
    if (!waitingOnWorkspace) {
      const resetFrameId = window.requestAnimationFrame(() => {
        setLoadingTimedOut(false)
      })
      return () => window.cancelAnimationFrame(resetFrameId)
    }
    const timeoutId = window.setTimeout(() => {
      setLoadingTimedOut(true)
      console.error('[AUTH] gate:timeout', {
        authLoading,
        hasSession: Boolean(session),
        workspaceReady,
        path: location.pathname,
      })
    }, WORKSPACE_GATE_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [authLoading, location.pathname, session, workspaceReady])

  useEffect(() => {
    console.debug('[AUTH] gate:state', {
      path: location.pathname,
      authLoading,
      hasSession: Boolean(session),
      workspaceReady,
      hasProfileError: Boolean(profileError),
      baseRole,
      onboardingCompleted,
    })
  }, [authLoading, baseRole, location.pathname, onboardingCompleted, profileError, session, workspaceReady])

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

  if (authLoading || (isSupabaseConfigured && session && !workspaceReady)) {
    if (loadingTimedOut) {
      return (
        <section className="auth-loading-screen">
          <div className="auth-loading-card">
            <h2>We couldn’t load your workspace.</h2>
            <p>{authBootstrapError || 'Authentication or workspace setup took too long. Please retry.'}</p>
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
                onClick={() => {
                  window.location.assign('/dashboard')
                }}
              >
                Go to Dashboard
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

  if (isSupabaseConfigured && !session) {
    console.debug('[REDIRECT] auth:missing-session', { target: '/auth', from: location.pathname })
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  if (profileError) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>We couldn’t resolve your account profile.</h2>
          <p>{profileError}</p>
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

  const redirectDecision = decideAuthRedirect({
    pathname: location.pathname,
    hasSession: Boolean(session),
    profile,
    baseRole,
  })

  const onAnyOnboardingRoute = isOnboardingRoute(location.pathname)
  if (baseRole !== 'client' && (onAnyOnboardingRoute || !onboardingCompleted)) {
    console.debug('[ONBOARDING] gate:setup-state', {
      path: location.pathname,
      setupState: redirectDecision.setupState,
    })
  }

  if (redirectDecision.action === 'redirect' && redirectDecision.to !== location.pathname) {
    console.debug('[REDIRECT] onboarding:decision', {
      from: location.pathname,
      to: redirectDecision.to,
      reason: redirectDecision.reason,
      role: baseRole,
    })
    return <Navigate to={redirectDecision.to} replace />
  }

  return <Outlet />
}

function RoleRoute({ allowedRoles, children }) {
  const location = useLocation()
  const { role, workspaceReady, profileLoading } = useWorkspace()

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

  if (FEATURE_FLAGS.disableRoleRestrictions) {
    return children
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  return children
}

function AttorneyFirmRoute({ children, requireFirm = true }) {
  const location = useLocation()
  const { role, baseRole, rolePreviewActive, profile, workspaceReady, profileLoading } = useWorkspace()
  const demoModeBypass = isAttorneyDemoModeActiveForWorkspace({ role, baseRole, rolePreviewActive })
  const [checking, setChecking] = useState(role === 'attorney')
  const [hasFirm, setHasFirm] = useState(Boolean(profile?.primaryAttorneyFirmId) || demoModeBypass)
  const [membershipStatus, setMembershipStatus] = useState(demoModeBypass ? 'active' : '')
  const [guardTimedOut, setGuardTimedOut] = useState(false)

  useEffect(() => {
    let active = true
    const timeoutId = window.setTimeout(() => {
      if (!active) return
      setGuardTimedOut(true)
      if (role === 'attorney' && profile?.primaryAttorneyFirmId) {
        setHasFirm(true)
        setMembershipStatus((current) => current || 'active')
        setChecking(false)
      }
    }, 12000)

    async function resolveFirmContext() {
      if (!workspaceReady || profileLoading) {
        return
      }

      setGuardTimedOut(false)
      if (role !== 'attorney') {
        if (!active) return
        setHasFirm(false)
        setChecking(false)
        return
      }

      if (demoModeBypass) {
        if (!active) return
        setHasFirm(true)
        setMembershipStatus('active')
        setChecking(false)
        return
      }

      const profileFirmId = String(profile?.primaryAttorneyFirmId || '').trim()
      if (profileFirmId) {
        try {
          const membership = await getCurrentUserAttorneyMembership(profileFirmId)
          if (!active) return
          setHasFirm(true)
          const nextStatus = String(membership?.status || '').trim().toLowerCase()
          setMembershipStatus(['suspended', 'removed'].includes(nextStatus) ? nextStatus : 'active')
          setChecking(false)
          return
        } catch {
          if (!active) return
          setHasFirm(true)
          setMembershipStatus('active')
          setChecking(false)
          return
        }
      }

      setChecking(true)
      try {
        const primaryFirm = await getCurrentUserPrimaryAttorneyFirm()
        if (!active) return
        if (!primaryFirm?.id) {
          setHasFirm(false)
          setMembershipStatus('')
        } else {
          const membership = await getCurrentUserAttorneyMembership(primaryFirm.id).catch(() => null)
          if (!active) return
          setHasFirm(true)
          const nextStatus = String(membership?.status || '').trim().toLowerCase()
          setMembershipStatus(['suspended', 'removed'].includes(nextStatus) ? nextStatus : 'active')
        }
      } catch {
        if (!active) return
        setHasFirm(false)
        setMembershipStatus('')
      } finally {
        if (active) setChecking(false)
      }
    }

    void resolveFirmContext()
    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [demoModeBypass, profile?.primaryAttorneyFirmId, profileLoading, role, workspaceReady])

  if ((!guardTimedOut && (!workspaceReady || profileLoading || checking)) || (guardTimedOut && checking && !profile?.primaryAttorneyFirmId)) {
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
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  if (membershipStatus === 'suspended') {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Access suspended</h2>
          <p>Your access to this firm has been suspended. Please contact your firm administrator.</p>
        </div>
      </section>
    )
  }

  if (membershipStatus === 'removed') {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Access unavailable</h2>
          <p>You are no longer a member of this firm.</p>
        </div>
      </section>
    )
  }

  if (!hasFirm) {
    return <Navigate to={requireFirm ? '/setup' : '/attorney/onboarding'} replace state={{ from: location }} />
  }

  return children
}

function AgentManagementRoute({ children }) {
  const location = useLocation()
  const { role, workspaceReady, profileLoading } = useWorkspace()
  const [checking, setChecking] = useState(true)
  const [canAccess, setCanAccess] = useState(false)

  useEffect(() => {
    let active = true

    async function resolveAccess() {
      if (!workspaceReady || profileLoading) return
      if (role === 'developer') {
        if (!active) return
        setCanAccess(true)
        setChecking(false)
        return
      }
      if (role !== 'agent') {
        if (!active) return
        setCanAccess(false)
        setChecking(false)
        return
      }

      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        const nextCanAccess = canManageOrganisationSettings({
          appRole: role,
          membershipRole: normalizeOrganisationMembershipRole(context?.membershipRole),
        })
        setCanAccess(nextCanAccess)
      } catch {
        if (!active) return
        setCanAccess(false)
      } finally {
        if (active) setChecking(false)
      }
    }

    setChecking(true)
    void resolveAccess()

    return () => {
      active = false
    }
  }, [profileLoading, role, workspaceReady])

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

  if (FEATURE_FLAGS.disableRoleRestrictions) {
    return children
  }

  if (checking) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating access for this area.</p>
        </div>
      </section>
    )
  }

  if (!canAccess) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  return children
}

function OrganisationSettingsManageRoute({ children }) {
  const location = useLocation()
  const { role, workspaceReady, profileLoading } = useWorkspace()
  const [checking, setChecking] = useState(true)
  const [canManage, setCanManage] = useState(false)

  useEffect(() => {
    let active = true

    async function resolveAccess() {
      if (!workspaceReady || profileLoading) return
      if (role === 'developer') {
        if (!active) return
        setCanManage(true)
        setChecking(false)
        return
      }
      if (role !== 'agent') {
        if (!active) return
        setCanManage(false)
        setChecking(false)
        return
      }

      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        const allowed = canManageOrganisationSettings({
          appRole: role,
          membershipRole: normalizeOrganisationMembershipRole(context?.membershipRole),
        })
        setCanManage(allowed)
      } catch {
        if (!active) return
        setCanManage(false)
      } finally {
        if (active) setChecking(false)
      }
    }

    void resolveAccess()
    return () => {
      active = false
    }
  }, [profileLoading, role, workspaceReady])

  if (!workspaceReady || profileLoading || checking) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your workspace…</h2>
          <p>Validating access for this area.</p>
        </div>
      </section>
    )
  }

  if (FEATURE_FLAGS.disableRoleRestrictions) {
    return children
  }

  if (!canManage) {
    return <Navigate to="/listings/developments" replace state={{ from: location }} />
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

  return <AppLayout onLogout={onLogout} user={session?.user || null} />
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

function AppRoutes() {
  const { session, authLoading, authError, retryAuthBootstrap, logout, devAuthRole, setDevAuthRole } = useAuthSession()
  const pendingInvitePath = (() => {
    if (typeof window === 'undefined') return ''
    const token = String(window.sessionStorage.getItem('itg:pending-org-invite-token') || '').trim()
    if (!token) return ''
    return `/agent/invite/${token}`
  })()

  return (
    <WorkspaceProvider user={session?.user || null} authBypassRole={devAuthRole}>
      <EnvironmentValidationBanner />
        <Routes>
          <Route path="/bridge" element={<BridgeLanding />} />
          <Route path="/bridge/product" element={<BridgeProductPage />} />
          <Route path="/bridge/solutions" element={<BridgeSolutionsPage />} />
          <Route path="/bridge/how-it-works" element={<BridgeHowItWorksPage />} />
          <Route path="/bridge/contact" element={<BridgeContactPage />} />
          <Route path="/bridge/for-developers" element={<BridgeDevelopersPage />} />
          <Route path="/bridge/for-conveyancers" element={<BridgeConveyancersPage />} />
          <Route path="/bridge/for-agents" element={<BridgeAgentsPage />} />
          <Route path="/bridge/for-buyers" element={<BridgeBuyersPage />} />
          <Route element={<MobileExecutiveLayout />}>
            <Route path="/m/developments" element={<MobileDevelopmentsPage />} />
            <Route path="/m/developments/:developmentId" element={<MobileDevelopmentDetailPage />} />
            <Route path="/m/transactions/:transactionId" element={<MobileTransactionDetailPage />} />
          </Route>
          <Route
            element={
              <AppErrorBoundary scope="main-shell" title="Unable to load application shell">
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

            <Route element={<ProtectedLayout onLogout={logout} session={session} />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<AppErrorBoundary scope="dashboard-shell" title="Dashboard failed to render"><ClientAwareDashboard /></AppErrorBoundary>} />
              <Route path="/setup" element={<PostDashboardSetup />} />
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
                  <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator']}>
                    <AppErrorBoundary scope="transaction-workspace" title="Transaction workspace failed to load">
                      <AttorneyTransactionDetail />
                    </AppErrorBoundary>
                  </RoleRoute>
                }
              />
              <Route
                path="/invite/stakeholder/:token"
                element={
                  <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator', 'agent', 'buyer', 'seller', 'internal_admin']}>
                    <StakeholderInviteAccept />
                  </RoleRoute>
                }
              />
              <Route
                path="/new-transaction"
                element={
                  <RoleRoute allowedRoles={['agent', 'attorney']}>
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
                  <RoleRoute allowedRoles={['developer', 'agent']}>
                    <PipelineEntryRoute />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/leads"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Pipeline key="pipeline-leads" />
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
                    <Pipeline key="pipeline-lead-workspace" />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/overview"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Pipeline key="pipeline-overview" initialAgentViewMode="overview" />
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
                path="/agency/branches"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgencyBranchesPage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agency/branches/:branchId"
                element={
                  <AgentManagementRoute>
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
                <Route path="account" element={<SettingsAccountPage />} />
                <Route
                  path="organisation"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsOrganisationPage />
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
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsSigningTemplatesPage />
                    </RoleRoute>
                  }
                />
                <Route
                  path="signing-templates"
                  element={
                    <RoleRoute allowedRoles={['developer', 'agent']}>
                      <SettingsSigningTemplatesPage />
                    </RoleRoute>
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
          <Route path="/sign/:token" element={<SignerPortal />} />
          <Route path="/appointment-rsvp/:token" element={<AppointmentRsvpPage />} />
          <Route path="/client/:token" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/buying" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/buying/:section" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/selling" element={<ClientSellingRouteCompat />} />
          <Route path="/client/:token/selling/:section" element={<ClientSellingRouteCompat />} />
          <Route path="/client/:token/progress" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/appointments" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/onboarding" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/details" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/bond-application" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/onboarding/:token" element={<ClientOnboarding />} />
          <Route path="/seller/onboarding/:token" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Seller portal failed to load"><SellerPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/seller/:token" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/seller/:token/mandate" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/seller/:token/documents" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/seller/:token/property" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/seller/:token/offers" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/seller/:token/progress" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/seller/:token/appointments" element={<SellerWorkspaceLegacyRedirect />} />
          <Route path="/client/:token/documents" element={<TokenRouteGate><AppErrorBoundary scope="client-portal-route" title="Client portal failed to load"><ClientPortal /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/:token/otp-signing" element={<TokenRouteGate><AppErrorBoundary scope="client-otp-route" title="OTP signing failed to load"><ClientOtpSigning /></AppErrorBoundary></TokenRouteGate>} />
          <Route path="/client/offer/:token" element={<BuyerOfferSubmission />} />
          <Route path="/offers/:token" element={<BuyerOfferSubmission />} />
          <Route
            path="/agent/invite/:token"
            element={FEATURE_FLAGS.enableInviteOnboarding ? <TokenRouteGate><AgentInviteOnboarding /></TokenRouteGate> : <Navigate to="/auth" replace />}
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
  const { role } = useWorkspace()
  if (role === 'client') {
    return <ClientModulePage />
  }
  if (role === 'attorney') {
    return <Navigate to="/attorney/dashboard" replace />
  }
  return <Dashboard />
}

function ClientTokenRootRedirect() {
  const { token = '' } = useParams()
  const safeToken = String(token || '').trim()
  return <Navigate to={safeToken ? `/client/${safeToken}` : '/auth'} replace />
}

function LegacyAgentWorkspaceRedirect() {
  const { agentId = '' } = useParams()
  const safeAgentId = String(agentId || '').trim()
  return <Navigate to={safeAgentId ? `/agency/agents/${encodeURIComponent(safeAgentId)}` : '/agency/agents'} replace />
}

function ClientSellingRouteCompat() {
  const { token = '', section = '' } = useParams()
  const safeToken = String(token || '').trim()
  const safeSection = String(section || '').trim().toLowerCase()
  const isSellerToken = safeToken.toLowerCase().startsWith('seller-')

  if (isSellerToken) {
    if (safeSection === 'onboarding') {
      return <Navigate to={`/seller/onboarding/${safeToken}`} replace />
    }
    return (
      <TokenRouteGate>
        <AppErrorBoundary scope="client-portal-route" title="Client portal failed to load">
          <SellerWorkspace
            tokenOverride={safeToken}
            basePath={`/client/${safeToken}/selling`}
            forcedSection={safeSection || 'overview'}
            clientPortalMode
          />
        </AppErrorBoundary>
      </TokenRouteGate>
    )
  }

  return (
    <TokenRouteGate>
      <AppErrorBoundary scope="client-portal-route" title="Client portal failed to load">
        <ClientPortal />
      </AppErrorBoundary>
    </TokenRouteGate>
  )
}

function SellerWorkspaceLegacyRedirect() {
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
  if (role === 'client') {
    return <ClientModulePage />
  }

  return (
    <RoleRoute allowedRoles={['developer', 'agent', 'attorney']}>
      <Units />
    </RoleRoute>
  )
}

function PipelineEntryRoute() {
  const { role } = useWorkspace()
  if (role === 'agent') {
    return <Navigate to="/pipeline/leads" replace />
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
