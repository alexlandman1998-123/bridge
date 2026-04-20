import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AddDevelopmentModal from './components/AddDevelopmentModal'
import CommandPalette from './components/CommandPalette'
import HeaderBar from './components/HeaderBar'
import MobileExecutiveLayout from './components/mobile/MobileExecutiveLayout'
import NewTransactionWizard from './components/NewTransactionWizard'
import Sidebar from './components/Sidebar'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { useWorkspace } from './context/WorkspaceContext'
import { APP_ROLE_LABELS } from './lib/roles'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import { clearStoredDevAuthRole, createDevAuthSession, getStoredDevAuthRole } from './lib/devAuth'
import { markRouteFirstVisibleContent, markRouteRendered } from './lib/performanceTrace'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import AttorneyTransactionDetail from './pages/AttorneyTransactionDetail'
import ConveyancerDevelopments from './pages/ConveyancerDevelopments'
import DevelopmentDetail from './pages/DevelopmentDetail'
import Developments from './pages/Developments'
import Documents from './pages/Documents'
import ClientPortal from './pages/ClientPortal'
import ClientOnboarding from './pages/ClientOnboarding'
import ClientModulePage from './pages/ClientModulePage'
import ClientProfile from './pages/ClientProfile'
import ExecutiveSnapshot from './pages/ExecutiveSnapshot'
import ExternalTransactionPortal from './pages/ExternalTransactionPortal'
import Financials from './pages/Financials'
import NewTransactionPage from './pages/NewTransactionPage'
import PlaceholderPage from './pages/PlaceholderPage'
import Pipeline from './pages/Pipeline'
import Report from './pages/Report'
import Clients from './pages/Clients'
import Snags from './pages/Snags'
import SettingsAccountPage from './pages/settings/SettingsAccountPage'
import SettingsBillingPage from './pages/settings/SettingsBillingPage'
import SettingsDevelopmentsPage from './pages/settings/SettingsDevelopmentsPage'
import SettingsLanding from './pages/settings/SettingsLanding'
import SettingsLayout from './pages/settings/SettingsLayout'
import SettingsOrganisationPage from './pages/settings/SettingsOrganisationPage'
import SettingsUsersPage from './pages/settings/SettingsUsersPage'
import SettingsWorkflowsPage from './pages/settings/SettingsWorkflowsPage'
import Team from './pages/Team'
import TransactionStatusShare from './pages/TransactionStatusShare'
import StakeholderInviteAccept from './pages/StakeholderInviteAccept'
import UnitDetail from './pages/UnitDetail'
import Units from './pages/Units'
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
import { useEffect, useMemo, useState } from 'react'

function AppLayout({ onLogout, user }) {
  const { workspace, role } = useWorkspace()
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

      <NewTransactionWizard
        open={wizardOpen}
        onClose={handleCloseNewTransaction}
        initialDevelopmentId={wizardInitialDevelopmentId}
      />

      <AddDevelopmentModal
        open={developmentModalOpen}
        onClose={() => setDevelopmentModalOpen(false)}
        onCreated={() => {
          window.dispatchEvent(new Event('itg:developments-changed'))
        }}
      />

      <CommandPalette
        onNewTransaction={() => handleOpenNewTransaction()}
        onNewDevelopment={() => setDevelopmentModalOpen(true)}
      />
    </div>
  )
}

function AuthGate({ authLoading, session }) {
  const location = useLocation()
  const { profileError, onboardingCompleted, baseRole, workspaceReady } = useWorkspace()

  if (authLoading || (isSupabaseConfigured && session && !workspaceReady)) {
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
          <h2>Workspace profile setup is incomplete</h2>
          <p>{profileError}</p>
          <p>Run <code>sql/schema.sql</code> and reload the app.</p>
        </div>
      </section>
    )
  }

  const isOnboardingRoute = location.pathname.startsWith('/onboarding')
  if (baseRole !== 'client' && !onboardingCompleted && !isOnboardingRoute) {
    return <Navigate to="/onboarding/profile" replace />
  }

  if (baseRole !== 'client' && onboardingCompleted && isOnboardingRoute) {
    return <Navigate to="/dashboard" replace />
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

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />
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
  const devSession = useMemo(() => (devAuthRole ? createDevAuthSession(devAuthRole) : null), [devAuthRole])
  const effectiveSession = useMemo(() => session || devSession || null, [devSession, session])

  useEffect(() => {
    if (devAuthRole) {
      setAuthLoading(false)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      return
    }

    let active = true

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!active) {
        return
      }

      if (error) {
        setSession(null)
        setAuthLoading(false)
        return
      }

      setSession(data?.session || null)
      setAuthLoading(false)
    }

    void loadSession()

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => {
      active = false
      authSubscription.subscription.unsubscribe()
    }
  }, [devAuthRole])

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
          <Route element={<AuthGate authLoading={authLoading} session={effectiveSession} />}>
            <Route path="/onboarding" element={<Navigate to="/onboarding/profile" replace />} />
            <Route path="/onboarding/profile" element={<Onboarding />} />
            <Route path="/onboarding/persona" element={<Onboarding />} />
            <Route path="/client-access" element={<ClientAccessNotice onLogout={handleLogout} />} />

            <Route element={<ProtectedLayout onLogout={handleLogout} session={effectiveSession} />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ClientAwareDashboard />} />
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
                  <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator']}>
                    <ConveyancerOrDeveloperDevelopments />
                  </RoleRoute>
                }
              />
              <Route
                path="/developments/:developmentId"
                element={
                  <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator']}>
                    <ConveyancerOrDeveloperDevelopmentDetail />
                  </RoleRoute>
                }
              />
              <Route path="/units" element={<Units />} />
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
              <Route path="/units/:unitId" element={<UnitDetail />} />
              <Route
                path="/pipeline"
                element={
                  <RoleRoute allowedRoles={['developer']}>
                    <Pipeline />
                  </RoleRoute>
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
                  <RoleRoute allowedRoles={['developer', 'attorney', 'bond_originator']}>
                    <Report />
                  </RoleRoute>
                }
              />
              <Route path="/report" element={<Navigate to="/reports" replace />} />
              <Route
                path="/team"
                element={
                  <RoleRoute allowedRoles={['developer']}>
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
                <Route path="organisation" element={<SettingsOrganisationPage />} />
                <Route path="developments" element={<SettingsDevelopmentsPage />} />
                <Route path="workflows" element={<SettingsWorkflowsPage />} />
                <Route path="users" element={<SettingsUsersPage />} />
                <Route path="billing" element={<SettingsBillingPage />} />
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
          <Route path="/client/:token" element={<ClientPortal />} />
          <Route path="/client/:token/progress" element={<ClientPortal />} />
          <Route path="/client/:token/onboarding" element={<ClientPortal />} />
          <Route path="/client/:token/details" element={<ClientPortal />} />
          <Route path="/client/:token/bond-application" element={<ClientPortal />} />
          <Route path="/client/onboarding/:token" element={<ClientOnboarding />} />
          <Route path="/client/:token/documents" element={<ClientPortal />} />
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
  return role === 'client' ? <ClientModulePage /> : <Dashboard />
}

function ClientAwareTransactions() {
  const { role } = useWorkspace()
  if (role === 'client') {
    return <ClientModulePage />
  }

  return (
    <RoleRoute allowedRoles={['developer', 'attorney']}>
      <Units />
    </RoleRoute>
  )
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
