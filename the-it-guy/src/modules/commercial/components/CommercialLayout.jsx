import { AlertTriangle, Bell, Building2, CheckCircle2, Home, Loader2, Search } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import QuickCreateDropdown from '../../../components/QuickCreateDropdown'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_BOTTOM_NAV_ITEMS, COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_GROUPS, isCommercialNavItemActive } from '../commercialNavigation'
import { activateCommercialWorkspaceForCurrentUser, isCommercialPlatformInstallError, remindCommercialAccessReviewersForCurrentUser, requestCommercialAccessForCurrentUser, resolveCommercialAccessContext } from '../services/commercialApi'
import CommercialBranding from './CommercialBranding'
import CommercialSidebar from './CommercialSidebar'

function CommercialPageSkeleton() {
  return (
    <div className="grid gap-5">
      <div className="h-28 animate-pulse rounded-3xl border border-slate-200 bg-white" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-white" />
    </div>
  )
}

function CommercialLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const contentScrollRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [accessState, setAccessState] = useState({ loading: true, allowed: false, reason: '', message: '' })
  const [activationState, setActivationState] = useState({ loading: false, error: '', success: false })
  const [requestState, setRequestState] = useState({ loading: false, reminding: false, error: '', success: false, reminderSuccess: false, reusedExistingRequest: false, reviewerCount: 0, emailCount: 0, notificationSkippedReason: '' })
  const currentPath = `${location.pathname}${location.search || ''}`
  const mobileNavItems = useMemo(
    () => [COMMERCIAL_DASHBOARD_NAV_ITEM, ...COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items), ...COMMERCIAL_BOTTOM_NAV_ITEMS],
    [],
  )

  useEffect(() => {
    let cancelled = false
    async function loadCommercialAccess() {
      try {
        const scope = await resolveCommercialAccessContext()
        if (!cancelled) {
          setAccessState({
            loading: false,
            allowed: Boolean(scope?.hasCommercialAccess),
            reason: scope?.hasCommercialAccess
              ? ''
              : scope?.organisationCommercialEnabled === false
                ? scope?.canReviewCommercialAccess && scope?.organisationSettingsCommercialEnabled
                  ? 'organisation_module_ready_to_activate'
                  : 'organisation_module_disabled'
                : 'access_required',
            message: scope?.hasCommercialAccess
              ? ''
              : scope?.organisationCommercialEnabled === false
                ? scope?.canReviewCommercialAccess && scope?.organisationSettingsCommercialEnabled
                  ? 'Commercial is selected in organisation settings. Activate it to finish opening the Commercial brokerage workspace.'
                  : 'Commercial is not enabled for this workspace yet. Ask your principal to enable Commercial for the organisation first.'
                : 'You need Commercial workspace access before opening the Commercial brokerage module.',
          })
        }
      } catch (error) {
        if (!cancelled) {
          const platformInstallMissing = isCommercialPlatformInstallError(error)
          setAccessState({
            loading: false,
            allowed: false,
            reason: platformInstallMissing ? 'platform_install_missing' : 'access_error',
            message: error?.message || 'Commercial workspace access could not be verified.',
          })
        }
      }
    }
    void loadCommercialAccess()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [location.pathname])

  function handleSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    const query = searchTerm.trim()
    navigate(query ? `/commercial/listings?search=${encodeURIComponent(query)}` : '/commercial/listings')
  }

  async function handleActivateCommercial() {
    setActivationState({ loading: true, error: '', success: false })
    try {
      const scope = await activateCommercialWorkspaceForCurrentUser()
      if (!scope?.hasCommercialAccess) {
        throw new Error('Commercial setup was saved, but access could not be verified yet.')
      }
      setAccessState({ loading: false, allowed: true, reason: '', message: '' })
      setActivationState({ loading: false, error: '', success: true })
    } catch (error) {
      setActivationState({
        loading: false,
        error: error?.message || 'Commercial setup could not be completed.',
        success: false,
      })
    }
  }

  async function handleRequestCommercialAccess() {
    setRequestState({ loading: true, reminding: false, error: '', success: false, reminderSuccess: false, reusedExistingRequest: false, reviewerCount: 0, emailCount: 0, notificationSkippedReason: '' })
    try {
      const result = await requestCommercialAccessForCurrentUser()
      setRequestState({
        loading: false,
        reminding: false,
        error: '',
        success: true,
        reminderSuccess: false,
        reusedExistingRequest: Boolean(result?.reusedExistingRequest),
        reviewerCount: Number(result?.reviewerCount || 0),
        emailCount: Number(result?.notificationResult?.emailCount || 0),
        notificationSkippedReason: result?.notificationResult?.skippedReason || '',
      })
    } catch (error) {
      setRequestState({
        loading: false,
        reminding: false,
        error: error?.message || 'Commercial access request could not be sent.',
        success: false,
        reminderSuccess: false,
        reusedExistingRequest: false,
        reviewerCount: 0,
        emailCount: 0,
        notificationSkippedReason: '',
      })
    }
  }

  async function handleRemindCommercialAccessReviewers() {
    setRequestState((previous) => ({ ...previous, reminding: true, error: '', reminderSuccess: false }))
    try {
      const result = await remindCommercialAccessReviewersForCurrentUser()
      setRequestState((previous) => ({
        ...previous,
        reminding: false,
        success: true,
        reminderSuccess: true,
        reusedExistingRequest: true,
        reviewerCount: Number(result?.reviewerCount || 0),
        emailCount: Number(result?.notificationResult?.emailCount || 0),
        notificationSkippedReason: result?.notificationResult?.skippedReason || '',
      }))
    } catch (error) {
      setRequestState((previous) => ({
        ...previous,
        reminding: false,
        error: error?.message || 'Commercial access reminder could not be sent.',
        reminderSuccess: false,
      }))
    }
  }

  if (accessState.loading) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 text-[#102236]">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <h1 className="text-xl font-semibold tracking-[-0.035em]">Checking Commercial access</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Validating your Commercial brokerage membership.</p>
        </div>
      </section>
    )
  }

  if (!accessState.allowed) {
    const platformInstallMissing = accessState.reason === 'platform_install_missing'
    const organisationModuleDisabled = ['organisation_module_disabled', 'organisation_module_ready_to_activate'].includes(accessState.reason)
    const canRequestCommercial = !platformInstallMissing && ['organisation_module_disabled', 'access_required'].includes(accessState.reason)
    const canSelfActivateCommercial = !platformInstallMissing && ['access_error', 'organisation_module_ready_to_activate'].includes(accessState.reason)
    const accessTitle = platformInstallMissing
      ? 'Commercial needs platform setup'
      : organisationModuleDisabled
        ? 'Commercial is not enabled for this workspace'
        : 'Set up Commercial workspace'
    return (
      <section className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 py-8 text-[#102236]">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${platformInstallMissing || organisationModuleDisabled ? 'bg-amber-50 text-amber-700' : 'bg-[#eef5fb] text-[#123b61]'}`}>
              {platformInstallMissing || organisationModuleDisabled ? <AlertTriangle size={22} /> : <Building2 size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-slate-400">Commercial brokerage</p>
              <h1 className="mt-1 text-2xl font-semibold">{accessTitle}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {platformInstallMissing
                  ? `${accessState.message || 'Commercial is not installed on this environment. Contact platform support.'} A platform administrator needs to install the Commercial database setup before any principal or agent can activate it for a workspace.`
                  : organisationModuleDisabled
                    ? `${accessState.message || 'Commercial is not enabled for this workspace yet.'} Once the organisation module is active, eligible users can be assigned Commercial access.`
                    : `${accessState.message || 'Commercial is not active on this account yet.'} Activate Commercial to open the brokerage module for landlords, tenants, vacancies, requirements, deals, Heads of Terms, leases, and documents.`}
              </p>
              <div className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                {['Commercial records and pipeline', 'Brokerage document centre', 'Heads of Terms and lease flow', 'Broker and branch visibility'].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              {activationState.error ? (
                <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  {activationState.error}
                </p>
              ) : null}
              {requestState.error ? (
                <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  {requestState.error}
                </p>
              ) : null}
              {activationState.success ? (
                <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  Commercial is active. Opening your workspace now.
                </p>
              ) : null}
              {requestState.success ? (
                <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  {requestState.reusedExistingRequest
                    ? requestState.reminderSuccess
                      ? requestState.reviewerCount > 0
                        ? `Reminder sent. ${requestState.reviewerCount === 1 ? 'Principal' : `${requestState.reviewerCount} principals`} notified${requestState.emailCount ? requestState.emailCount === 1 ? ' by email too' : `, ${requestState.emailCount} by email` : ''}.`
                        : 'Reminder noted. Ask your principal to approve it in Settings > Users.'
                      : 'Your Commercial access request is already waiting for principal approval.'
                    : requestState.reviewerCount > 0
                      ? requestState.reviewerCount === 1
                        ? `Commercial access request sent. Principal notified${requestState.emailCount ? ' by email too' : ''}.`
                        : `Commercial access request sent. ${requestState.reviewerCount} principals notified${requestState.emailCount ? `, ${requestState.emailCount} by email` : ''}.`
                      : 'Commercial access request sent to your principal. Ask them to approve it in Settings > Users.'}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {canRequestCommercial ? (
                  <button
                    type="button"
                    onClick={handleRequestCommercialAccess}
                    disabled={requestState.loading || requestState.reminding}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestState.loading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                    Request Commercial access
                  </button>
                ) : null}
                {canRequestCommercial && requestState.reusedExistingRequest ? (
                  <button
                    type="button"
                    onClick={handleRemindCommercialAccessReviewers}
                    disabled={requestState.loading || requestState.reminding}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestState.reminding ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                    Remind principal
                  </button>
                ) : null}
                {canSelfActivateCommercial ? (
                  <button
                    type="button"
                    onClick={handleActivateCommercial}
                    disabled={activationState.loading}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {activationState.loading ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                    Activate Commercial
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate('/settings/organisation')}
                  className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:border-blue-200 hover:text-blue-700"
                >
                  Organisation settings
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                >
                  <Home size={16} />
                  Back to Residential
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f8fb] text-[#102236]">
      <CommercialSidebar />
      <main ref={contentScrollRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <CommercialBranding compact />
            <div className="w-[190px]">
              <WorkspaceSwitcher currentPath={currentPath} onSelectWorkspace={(path) => navigate(path)} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <QuickCreateDropdown />
            <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500">
              <Search size={15} className="shrink-0" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
                placeholder="Search listings, properties, landlords..."
              />
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Commercial mobile navigation">
            {mobileNavItems.map((item) => {
              const Icon = item.icon
              const active = isCommercialNavItemActive(`${location.pathname}${location.hash || ''}`, item)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors duration-150',
                    active ? 'border-[#cfe0ef] bg-[#eef5fb] text-[#123b61]' : 'border-slate-200 bg-white text-slate-600',
                  ].join(' ')}
                >
                  <Icon size={14} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur lg:block">
          <div className="mx-auto flex w-full max-w-[1800px] items-center gap-3">
            <QuickCreateDropdown />
            <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm">
              <Search size={16} className="shrink-0" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#102236] outline-none"
                placeholder="Search listings, properties, landlords, areas, brokers..."
              />
            </div>
            <div className="w-[220px] shrink-0">
              <WorkspaceSwitcher currentPath={currentPath} onSelectWorkspace={(path) => navigate(path)} />
            </div>
            <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-600" aria-label="Notifications">
              <Bell size={17} />
            </button>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-5 lg:px-6">
          <Suspense fallback={<CommercialPageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

export default CommercialLayout
