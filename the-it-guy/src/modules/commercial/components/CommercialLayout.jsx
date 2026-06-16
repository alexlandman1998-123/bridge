import { Bell, ChevronDown, Search } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import QuickCreateDropdown from '../../../components/QuickCreateDropdown'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import {
  COMMERCIAL_MOBILE_MORE_NAV_ITEMS,
  COMMERCIAL_MOBILE_PRIMARY_NAV_ITEMS,
  isCommercialNavItemActive,
  isCommercialNavItemAvailable,
} from '../commercialNavigation'
import { isCommercialPlatformInstallError, resolveCommercialAccessContext } from '../services/commercialApi'
import CommercialBranding from './CommercialBranding'
import CommercialEnablementExperience from './CommercialEnablementExperience'
import CommercialSidebar from './CommercialSidebar'

function getUserInitials(user) {
  const fullName = String(
    user?.fullName ||
      user?.full_name ||
      [user?.firstName || user?.first_name, user?.lastName || user?.last_name].filter(Boolean).join(' ') ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      '',
  ).trim()
  if (fullName) {
    return fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('')
  }

  const email = String(user?.email || '').trim()
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }

  return 'CU'
}

function getUserAvatarUrl(user) {
  return String(
    user?.avatarUrl ||
      user?.avatar_url ||
      user?.profilePhotoUrl ||
      user?.profile_photo_url ||
      user?.photoUrl ||
      user?.photo_url ||
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      '',
  ).trim()
}

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

function CommercialLayout({ onLogout = null, user = null }) {
  const location = useLocation()
  const navigate = useNavigate()
  const contentScrollRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [accessState, setAccessState] = useState({ loading: true, allowed: false, reason: '', message: '', scope: null })
  const [profileOpen, setProfileOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const currentPath = `${location.pathname}${location.search || ''}`
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const mobilePrimaryItems = useMemo(() => COMMERCIAL_MOBILE_PRIMARY_NAV_ITEMS, [])
  const mobileMoreItems = useMemo(() => COMMERCIAL_MOBILE_MORE_NAV_ITEMS, [])
  const visibleMobilePrimaryItems = useMemo(
    () => mobilePrimaryItems.filter((item) => isCommercialNavItemAvailable(item, accessState.scope)),
    [accessState.scope, mobilePrimaryItems],
  )
  const visibleMobileMoreItems = useMemo(
    () => mobileMoreItems.filter((item) => isCommercialNavItemAvailable(item, accessState.scope)),
    [accessState.scope, mobileMoreItems],
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
            message: platformInstallMissing
              ? error?.details || error?.message || 'Commercial workspace access could not be verified.'
              : error?.message || 'Commercial workspace access could not be verified.',
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

  useEffect(() => {
    function handlePointerDown(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setProfileOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  function handleSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    const query = searchTerm.trim()
    navigate(query ? `/commercial/sales/listings?search=${encodeURIComponent(query)}` : '/commercial/sales/listings')
  }

  const userInitials = getUserInitials(user)
  const userAvatarUrl = getUserAvatarUrl(user)
  const profileControl = (
    <div className="relative flex-none" ref={profileMenuRef}>
      <button
        type="button"
        className="ui-shell-avatar-trigger h-[44px]"
        aria-label="Profile"
        onClick={() => setProfileOpen((previous) => !previous)}
      >
        <span className="inline-grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-textStrong text-secondary font-semibold text-textInverse">
          {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : userInitials}
        </span>
        <ChevronDown size={14} />
      </button>

      {profileOpen ? (
        <div className="ui-surface-floating absolute right-0 top-[calc(100%+12px)] z-50 flex min-w-[200px] flex-col p-2">
          <Link className="rounded-control px-3 py-2 text-sm font-medium text-textStrong hover:bg-surfaceAlt" to="/settings/account" onClick={() => setProfileOpen(false)}>
            Profile
          </Link>
          <Link className="rounded-control px-3 py-2 text-sm font-medium text-textStrong hover:bg-surfaceAlt" to="/settings" onClick={() => setProfileOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            className="rounded-control px-3 py-2 text-left text-sm font-medium text-textStrong hover:bg-surfaceAlt"
            onClick={() => {
              setProfileOpen(false)
              onLogout?.()
            }}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )

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
    <div className="flex h-screen min-h-0 overflow-hidden bg-[#f6f8fb] text-[#102236]">
      <CommercialSidebar scope={accessState.scope} />
      <main ref={contentScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <CommercialBranding compact />
            <div className="flex items-center gap-2">
              <div className="w-[190px]">
                <WorkspaceSwitcher currentPath={currentPath} onSelectWorkspace={(path) => navigate(path)} />
              </div>
              {profileControl}
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
            {visibleMobilePrimaryItems.map((item) => {
              const Icon = item.icon
              const active = isCommercialNavItemActive(`${location.pathname}${location.hash || ''}`, item)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMoreOpen(false)}
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
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMobileMoreOpen((previous) => !previous)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:border-[#cfe0ef] hover:bg-[#eef5fb] hover:text-[#123b61]"
                aria-expanded={mobileMoreOpen}
              >
                More
                <ChevronDown size={14} className={`transition ${mobileMoreOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileMoreOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[210px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                  <div className="grid gap-1">
                    {visibleMobileMoreItems.map((item) => {
                      const Icon = item.icon
                      const active = isCommercialNavItemActive(`${location.pathname}${location.hash || ''}`, item)
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMoreOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={[
                            'inline-flex min-h-10 items-center gap-2 rounded-[14px] px-3 text-sm font-semibold transition-colors duration-150',
                            active ? 'bg-[#eef5fb] text-[#123b61]' : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
                          ].join(' ')}
                        >
                          <Icon size={15} />
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
        <div className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-10 xl:px-12 lg:block">
          <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex min-h-11 w-full max-w-[760px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm">
                <Search size={16} className="shrink-0" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#102236] outline-none"
                  placeholder="Search listings, properties, landlords, areas, brokers..."
                />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <QuickCreateDropdown className="relative z-[80]" />
              <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-600" aria-label="Notifications">
                <Bell size={17} />
              </button>
              {profileControl}
            </div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10 xl:px-12">
          <Suspense fallback={<CommercialPageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

export default CommercialLayout
