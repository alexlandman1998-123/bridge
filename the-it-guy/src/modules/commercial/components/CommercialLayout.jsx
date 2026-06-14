import { Search } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import QuickCreateDropdown from '../../../components/QuickCreateDropdown'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_BOTTOM_NAV_ITEMS, COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_GROUPS, isCommercialNavItemActive } from '../commercialNavigation'
import { isCommercialPlatformInstallError, resolveCommercialAccessContext } from '../services/commercialApi'
import CommercialBranding from './CommercialBranding'
import CommercialEnablementExperience from './CommercialEnablementExperience'
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
  const [accessState, setAccessState] = useState({ loading: true, allowed: false, reason: '', message: '', scope: null })
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
            scope,
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
            scope: null,
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
    return (
      <CommercialEnablementExperience
        accessState={accessState}
        onAccessGranted={(scope) => {
          setAccessState({
            loading: false,
            allowed: Boolean(scope?.hasCommercialAccess),
            reason: '',
            message: '',
            scope: scope || null,
          })
        }}
      />
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
