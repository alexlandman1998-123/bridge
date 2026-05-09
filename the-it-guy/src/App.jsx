import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AddDevelopmentModal from './components/AddDevelopmentModal'
import CommandPalette from './components/CommandPalette'
import HeaderBar from './components/HeaderBar'
import MobileExecutiveLayout from './components/mobile/MobileExecutiveLayout'
import AgentNewDealWizard from './components/AgentNewDealWizard'
import NewTransactionWizard from './components/NewTransactionWizard'
import Sidebar from './components/Sidebar'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { useWorkspace } from './context/WorkspaceContext'
import { APP_ROLE_LABELS } from './lib/roles'
import { isAttorneyDemoModeActiveForWorkspace } from './lib/attorneyDemoContext'
import { SHOW_INTELLIGENCE_BETA } from './lib/featureFlags'
import { ensureAgentModuleDemoSeed } from './lib/agentDemoSeed'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from './lib/organisationAccess'
import {
  clearSupabaseLocalAuthState,
  isSupabaseConfigured,
  isUnsupportedJwtAlgorithmError,
  supabase,
} from './lib/supabaseClient'
import { clearStoredDevAuthRole, createDevAuthSession, getStoredDevAuthRole } from './lib/devAuth'
import { markRouteFirstVisibleContent, markRouteRendered } from './lib/performanceTrace'
import { fetchOrganisationSettings } from './lib/settingsApi'
import { getCurrentUserAttorneyMembership } from './lib/attorneyPermissions'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
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
import ExecutiveSnapshot from './pages/ExecutiveSnapshot'
import ExternalTransactionPortal from './pages/ExternalTransactionPortal'
import Financials from './pages/Financials'
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
import TransactionStatusShare from './pages/TransactionStatusShare'
import StakeholderInviteAccept from './pages/StakeholderInviteAccept'
import UnitDetail from './pages/UnitDetail'
import Units from './pages/Units'
import AttorneyOnboardingPage from './pages/AttorneyOnboardingPage'
import AttorneyDashboardPage from './pages/AttorneyDashboardPage'
import AttorneyOperationsPage from './pages/AttorneyOperationsPage'
import AttorneySchedulingPage from './pages/AttorneySchedulingPage'
import AttorneyFirmSettingsPage from './pages/AttorneyFirmSettingsPage'
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentUserPrimaryAttorneyFirm } from './services/attorneyFirms'

function AppLayout({ onLogout, user }) {
  const { workspace, role, profile } = useWorkspace()
  const location = useLocation()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardInitialDevelopmentId, setWizardInitialDevelopmentId] = useState('')
  const [developmentModalOpen, setDevelopmentModalOpen] = useState(false)
  const hideSharedHeader = role === 'developer' && (location.pathname === '/dashboard' || location.pathname === '/')
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

        <main className={`ui-main-content ui-page-scroll ${hideSharedHeader ? 'pt-6' : ''}`.trim()}>
          <div className="ui-content-container">
            <Outlet />
          </div>
        </main>
      </div>

      {role === 'agent' ? (
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

const AUTH_BOOTSTRAP_TIMEOUT_MS = 15000
const WORKSPACE_GATE_TIMEOUT_MS = 15000

function AuthGate({ authLoading, session, authBootstrapError = '', onRetryBootstrap = null, onLogout = null }) {
  const location = useLocation()
  const { profileError, onboardingCompleted, role, baseRole, rolePreviewActive, profile, workspaceReady, retryWorkspaceBootstrap } = useWorkspace()
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const didHandleSessionMismatchRef = useRef(false)

  useEffect(() => {
    const waitingOnWorkspace = authLoading || (isSupabaseConfigured && session && !workspaceReady)
    if (!waitingOnWorkspace) {
      setLoadingTimedOut(false)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setLoadingTimedOut(true)
      console.error('[AuthGate] bootstrap timeout', {
        authLoading,
        hasSession: Boolean(session),
        workspaceReady,
        path: location.pathname,
      })
    }, WORKSPACE_GATE_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [authLoading, location.pathname, session, workspaceReady])

  useEffect(() => {
    console.debug('[AuthGate] state', {
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

  const isOnboardingRoute = location.pathname.startsWith('/onboarding')
  const isAgentOnboardingRoute = location.pathname.startsWith('/agent/onboarding')
  const isDeveloperOnboardingRoute = location.pathname.startsWith('/developer/onboarding')
  const isBondOriginatorOnboardingRoute = location.pathname.startsWith('/bond-originator/onboarding')
  const isAttorneyOnboardingRoute = location.pathname.startsWith('/attorney/onboarding')
  const isRoleSpecificOnboardingRoute =
    isAgentOnboardingRoute || isDeveloperOnboardingRoute || isBondOriginatorOnboardingRoute || isAttorneyOnboardingRoute
  const isAnyOnboardingRoute = isOnboardingRoute || isRoleSpecificOnboardingRoute
  const demoModeBypass = isAttorneyDemoModeActiveForWorkspace({ role, baseRole, rolePreviewActive })

  if (baseRole === 'attorney') {
    const hasAttorneyFirm = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())
    if (!hasAttorneyFirm && !isAttorneyOnboardingRoute && !demoModeBypass) {
      return <Navigate to="/attorney/onboarding" replace />
    }
    if ((hasAttorneyFirm || demoModeBypass) && isAttorneyOnboardingRoute) {
      return <Navigate to="/attorney/dashboard" replace />
    }
  }

  if (baseRole !== 'client' && baseRole !== 'attorney' && !onboardingCompleted && !isAnyOnboardingRoute) {
    if (baseRole === 'agent') {
      return <Navigate to="/agent/onboarding" replace />
    }
    if (baseRole === 'developer') {
      return <Navigate to="/developer/onboarding" replace />
    }
    if (baseRole === 'bond_originator') {
      return <Navigate to="/bond-originator/onboarding" replace />
    }
    return <Navigate to="/onboarding/profile" replace />
  }

  if (baseRole !== 'client' && onboardingCompleted && isAnyOnboardingRoute) {
    if (baseRole === 'attorney') {
      return <Navigate to="/attorney/dashboard" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

function RoleRoute({ allowedRoles, children }) {
  const location = useLocation()
  const { role, baseRole, rolePreviewActive, profile, workspaceReady, profileLoading } = useWorkspace()

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

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  if (role === 'attorney') {
    const hasAttorneyFirm = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())
    const isAttorneyOnboardingRoute = location.pathname.startsWith('/attorney/onboarding')
    const demoModeBypass = isAttorneyDemoModeActiveForWorkspace({ role, baseRole, rolePreviewActive })
    if (!hasAttorneyFirm && !isAttorneyOnboardingRoute && !demoModeBypass) {
      return <Navigate to="/attorney/onboarding" replace state={{ from: location }} />
    }
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

  useEffect(() => {
    let active = true

    async function resolveFirmContext() {
      if (!workspaceReady || profileLoading) {
        return
      }

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
          setHasFirm(Boolean(membership?.firmId))
          setMembershipStatus(String(membership?.status || '').trim().toLowerCase())
          setChecking(false)
          return
        } catch {
          if (!active) return
          setHasFirm(false)
          setMembershipStatus('')
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
          const membership = await getCurrentUserAttorneyMembership(primaryFirm.id)
          if (!active) return
          setHasFirm(Boolean(membership?.firmId))
          setMembershipStatus(String(membership?.status || '').trim().toLowerCase())
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
    }
  }, [demoModeBypass, profile?.primaryAttorneyFirmId, profileLoading, role, workspaceReady])

  if (!workspaceReady || profileLoading || checking) {
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

  if (membershipStatus === 'invited' && requireFirm) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Attorney workspace unavailable</h2>
          <p>You are not an active member of this attorney firm.</p>
        </div>
      </section>
    )
  }

  if (requireFirm && !hasFirm) {
    return <Navigate to="/attorney/onboarding" replace state={{ from: location }} />
  }

  if (!requireFirm && hasFirm) {
    return <Navigate to="/attorney/dashboard" replace state={{ from: location }} />
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

function App() {
  const [devAuthRole, setDevAuthRole] = useState(() => getStoredDevAuthRole())
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(isSupabaseConfigured && supabase && !devAuthRole))
  const [authBootstrapError, setAuthBootstrapError] = useState('')
  const devSession = useMemo(() => (devAuthRole ? createDevAuthSession(devAuthRole) : null), [devAuthRole])
  const effectiveSession = useMemo(() => session || devSession || null, [devSession, session])

  useEffect(() => {
    if (devAuthRole) {
      setAuthBootstrapError('')
      setAuthLoading(false)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      return
    }

    let active = true
    const timeoutError = new Error('Authentication bootstrap timed out. Please retry.')

    async function withTimeout(task) {
      let timeoutId = null
      try {
        return await Promise.race([
          task,
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(timeoutError), AUTH_BOOTSTRAP_TIMEOUT_MS)
          }),
        ])
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId)
        }
      }
    }

    async function loadSession() {
      console.debug('[Auth] bootstrap:start')
      const { data, error } = await withTimeout(supabase.auth.getSession())
      if (!active) {
        return
      }

      if (error) {
        console.error('[Auth] bootstrap:failed', error)
        if (isUnsupportedJwtAlgorithmError(error)) {
          await clearSupabaseLocalAuthState()
        }
        setAuthBootstrapError(String(error?.message || 'Unable to restore your session.'))
        setSession(null)
        setAuthLoading(false)
        return
      }

      console.debug('[Auth] bootstrap:success', { hasSession: Boolean(data?.session) })
      setAuthBootstrapError('')
      setSession(data?.session || null)
      setAuthLoading(false)
    }

    void loadSession()

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.debug('[Auth] state-change', { event, hasSession: Boolean(nextSession) })
      setSession(nextSession)
      setAuthLoading(false)
      setAuthBootstrapError('')
    })

    return () => {
      active = false
      authSubscription.subscription.unsubscribe()
    }
  }, [devAuthRole])

  function retryAuthBootstrap() {
    if (devAuthRole || !isSupabaseConfigured || !supabase) {
      return
    }
    setAuthBootstrapError('')
    setAuthLoading(true)
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthBootstrapError(String(error?.message || 'Unable to restore your session.'))
        setSession(null)
      } else {
        setAuthBootstrapError('')
        setSession(data?.session || null)
      }
      setAuthLoading(false)
    }).catch((error) => {
      setAuthBootstrapError(String(error?.message || 'Unable to restore your session.'))
      setSession(null)
      setAuthLoading(false)
    })
  }

  async function handleLogout() {
    clearStoredDevAuthRole()
    setDevAuthRole(null)

    if (!supabase) {
      setSession(null)
      return
    }

    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <BrowserRouter>
      <WorkspaceProvider user={effectiveSession?.user || null} authBypassRole={devAuthRole}>
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
              <AuthGate
                authLoading={authLoading}
                session={effectiveSession}
                authBootstrapError={authBootstrapError}
                onRetryBootstrap={retryAuthBootstrap}
                onLogout={handleLogout}
              />
            }
          >
            <Route path="/onboarding" element={<Navigate to="/onboarding/profile" replace />} />
            <Route path="/onboarding/profile" element={<OnboardingProfileSetup />} />
            <Route path="/onboarding/persona" element={<OnboardingProfileSetup />} />
            <Route path="/agent/onboarding" element={<Onboarding />} />
            <Route path="/developer/onboarding" element={<RoleModuleOnboarding expectedRole="developer" />} />
            <Route path="/bond-originator/onboarding" element={<RoleModuleOnboarding expectedRole="bond_originator" />} />
            <Route path="/client-access" element={<ClientAccessNotice onLogout={handleLogout} />} />

            <Route element={<ProtectedLayout onLogout={handleLogout} session={effectiveSession} />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ClientAwareDashboard />} />
              <Route
                path="/attorney/onboarding"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute requireFirm={false}>
                      <AttorneyOnboardingPage />
                    </AttorneyFirmRoute>
                  </RoleRoute>
                }
              />
              <Route
                path="/attorney/dashboard"
                element={
                  <RoleRoute allowedRoles={['attorney']}>
                    <AttorneyFirmRoute>
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
                path="/transactions/:transactionId"
                element={
                  <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator']}>
                    <AttorneyTransactionDetail />
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
                    <UnitDetail />
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
                    <Pipeline />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/leads/:leadId"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Pipeline />
                  </RoleRoute>
                }
              />
              <Route
                path="/pipeline/overview"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Pipeline initialAgentViewMode="overview" />
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
                    <Pipeline initialAgentViewMode="calendar" />
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
                path="/agents"
                element={
                  <RoleRoute allowedRoles={['agent']}>
                    <Navigate to="/agents/directory" replace />
                  </RoleRoute>
                }
              />
              <Route
                path="/agents/directory"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentsPage />
                    </RoleRoute>
                  </AgentManagementRoute>
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
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentWorkspacePage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route
                path="/agent/agents/:agentId"
                element={
                  <AgentManagementRoute>
                    <RoleRoute allowedRoles={['agent']}>
                      <AgentWorkspacePage />
                    </RoleRoute>
                  </AgentManagementRoute>
                }
              />
              <Route path="/documents" element={<ClientAwareDocuments />} />
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
                    <Report />
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
                      <SettingsUsersPage />
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

          <Route
            path="/auth"
            element={
              isSupabaseConfigured && effectiveSession ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Auth onDevBypass={(role) => setDevAuthRole(role)} />
              )
            }
          />
          <Route path="/external/:accessToken" element={<ExternalTransactionPortal />} />
          <Route path="/sign/:token" element={<SignerPortal />} />
          <Route path="/client/:token" element={<ClientPortal />} />
          <Route path="/client/:token/buying" element={<ClientPortal />} />
          <Route path="/client/:token/buying/:section" element={<ClientPortal />} />
          <Route path="/client/:token/selling" element={<ClientPortal />} />
          <Route path="/client/:token/selling/:section" element={<ClientPortal />} />
          <Route path="/client/:token/progress" element={<ClientPortal />} />
          <Route path="/client/:token/appointments" element={<ClientPortal />} />
          <Route path="/client/:token/onboarding" element={<ClientPortal />} />
          <Route path="/client/:token/details" element={<ClientPortal />} />
          <Route path="/client/:token/bond-application" element={<ClientPortal />} />
          <Route path="/client/onboarding/:token" element={<ClientOnboarding />} />
          <Route path="/seller/onboarding/:token" element={<ClientPortal />} />
          <Route path="/seller/:token" element={<ClientPortal />} />
          <Route path="/seller/:token/mandate" element={<ClientPortal />} />
          <Route path="/seller/:token/documents" element={<ClientPortal />} />
          <Route path="/seller/:token/property" element={<ClientPortal />} />
          <Route path="/seller/:token/offers" element={<ClientPortal />} />
          <Route path="/seller/:token/progress" element={<ClientPortal />} />
          <Route path="/seller/:token/appointments" element={<ClientPortal />} />
          <Route path="/client/:token/documents" element={<ClientPortal />} />
          <Route path="/client/:token/otp-signing" element={<ClientOtpSigning />} />
          <Route path="/client/offer/:token" element={<BuyerOfferSubmission />} />
          <Route path="/offers/:token" element={<BuyerOfferSubmission />} />
          <Route path="/agent/invite/:token" element={<AgentInviteOnboarding />} />
          <Route path="/client/:token/forms/trust-investment" element={<Navigate to="../documents" replace />} />
          <Route path="/client/:token/handover" element={<ClientPortal />} />
          <Route path="/client/:token/homeowner" element={<ClientPortal />} />
          <Route path="/client/:token/snags" element={<ClientPortal />} />
          <Route path="/client/:token/issues" element={<Navigate to="../snags" replace />} />
          <Route path="/client/:token/settings" element={<ClientPortal />} />
          <Route path="/client/:token/team" element={<ClientPortal />} />
          <Route path="/client/:token/alterations" element={<ClientPortal />} />
          <Route path="/client/:token/review" element={<ClientPortal />} />
          <Route path="/snapshot/:token" element={<ExecutiveSnapshot />} />
          <Route path="/status/:token" element={<TransactionStatusShare />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WorkspaceProvider>
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
