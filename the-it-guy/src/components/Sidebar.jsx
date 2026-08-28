import {
  AlertTriangle,
  BriefcaseBusiness,
  BrainCircuit,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  FileCheck2,
  FileBarChart2,
  FileText,
  Files,
  Handshake,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LoaderCircle,
  ChevronDown,
  Network,
  Megaphone,
  PlusCircle,
  Settings,
  ShieldUser,
  SwitchCamera,
  Trophy,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useOrganisation } from '../context/OrganisationContext'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyModuleSettings from '../hooks/useAttorneyModuleSettings'
import { filterAttorneyModuleNavigationItems } from '../lib/attorneyModuleSettings'
import { getRoleNavItems } from '../lib/roles'
import { normalizeOrganisationMembershipRole } from '../lib/organisationAccess'
import { inferWorkspaceTypeFromAppRole } from '../constants/workspaceTypes'
import { trackWorkspaceBrandingMetric } from '../services/observability/monitoring'
import { filterNavigationItems } from '../auth/permissions/navigationPermissions'
import { BUSINESS_WORKSPACES, resolveBusinessWorkspaceRoute } from '../lib/businessWorkspaceAccess'
import { prefetchRouteModule, scheduleIdleRoutePrefetch } from '../lib/routePrefetch'

const ICON_BY_KEY = {
  dashboard: LayoutDashboard,
  deals: SwitchCamera,
  developments: Building2,
  bond_developments: Building2,
  listings: Building2,
  listings_private: Building2,
  listings_developments: Building2,
  rental_dashboard: LayoutDashboard,
  rental_tenancies: KeyRound,
  rental_pipeline: KanbanSquare,
  rental_pipeline_leads: Users,
  rental_pipeline_applications: ClipboardList,
  rental_pipeline_calendar: CalendarDays,
  rental_listings: Building2,
  rental_agency: BriefcaseBusiness,
  rental_agency_branches: Building2,
  rental_agency_people: BriefcaseBusiness,
  rental_agency_partners: Handshake,
  rental_agency_commission: Wallet,
  rental_clients: Users,
  rental_reports: FileBarChart2,
  agents: BriefcaseBusiness,
  transactions: SwitchCamera,
  transfers: SwitchCamera,
  applications: ClipboardList,
  tasks: ClipboardList,
  bond_calendar: CalendarDays,
  bond_pipeline: KanbanSquare,
  clients: Users,
  clients_buyers: Users,
  clients_companies: BriefcaseBusiness,
  clients_contact_history: ClipboardList,
  financials: Wallet,
  marketing: Megaphone,
  new_transaction: PlusCircle,
  pipeline: KanbanSquare,
  agency_pipeline: KanbanSquare,
  developer_pipeline: KanbanSquare,
  developer_leads: Users,
  leads: Users,
  enquiries: ClipboardList,
  pipeline_overview: KanbanSquare,
  pipeline_leads: KanbanSquare,
  pipeline_enquiries: ClipboardList,
  pipeline_canvassing: ClipboardList,
  pipeline_calendar: CalendarDays,
  calendar: CalendarDays,
  agency: BriefcaseBusiness,
  agency_overview: LayoutDashboard,
  agency_branches: Building2,
  agency_people: Users,
  agency_agents: Users,
  agency_partners: Handshake,
  agency_commission: Wallet,
  agency_branding: Megaphone,
  agency_roles: ShieldUser,
  agency_activity: FileText,
  agency_analytics: FileText,
  teams: ShieldUser,
  teams_consultants: Users,
  teams_processors: ShieldUser,
  teams_compliance: ShieldUser,
  teams_branches: Building2,
  teams_regions: Building2,
  banks: Building2,
  banks_performance: Building2,
  banks_submissions: ClipboardList,
  banks_approvals: FileCheck2,
  banks_turnaround: CalendarDays,
  banks_contacts: Users,
  documents_missing: Files,
  documents_requested: FileText,
  documents_review: FileCheck2,
  documents_completed: FileCheck2,
  documents_templates: FileText,
  partners_developers: Building2,
  partners_agents: Users,
  partners_attorneys: BriefcaseBusiness,
  partners_connected: Network,
  reports_pipeline_performance: KanbanSquare,
  reports_conversion: FileBarChart2,
  reports_team_performance: ShieldUser,
  reports_bank_analytics: Building2,
  reports_commission: Wallet,
  reports_export: FileText,
  performance: Trophy,
  agents_directory: BriefcaseBusiness,
  agents_reporting: FileText,
  intelligence_beta: BrainCircuit,
  documents: Files,
  partners: Handshake,
  developer_partners: Handshake,
  organizations: Building2,
  attorney_matters: SwitchCamera,
  attorney_matters_all: Files,
  attorney_matters_transfer: SwitchCamera,
  attorney_matters_bond: FileCheck2,
  attorney_matters_cancellation: AlertTriangle,
  attorney_matters_registered: FileCheck2,
  attorney_matters_archived: Files,
  attorney_pipeline: KanbanSquare,
  attorney_incoming_matters: ClipboardList,
  attorney_leads: Users,
  attorney_firm: Building2,
  attorney_firm_branches: Building2,
  attorney_firm_users: Users,
  attorney_firm_finance: Wallet,
  scheduling: CalendarDays,
  team_departments: ShieldUser,
  buyer_information: FileCheck2,
  handover: KeyRound,
  reports: FileText,
  bond_applications: ClipboardList,
  bond_applications_active: FileCheck2,
  bond_applications_incoming: ClipboardList,
  bond_applications_completed: FileCheck2,
  bond_developments_current: Building2,
  bond_developments_developers: Users,
  bond_reports: FileBarChart2,
  bond_reports_analytics: FileBarChart2,
  bond_organisation: Network,
  bond_org_overview: LayoutDashboard,
  partner_intelligence: BrainCircuit,
  consultant_performance: Trophy,
  branch_operations: Building2,
  regional_operations: LineChart,
  hq_command_centre: LayoutDashboard,
  bank_relationships: Building2,
  revenue_commissions: Wallet,
  automation_rules: Workflow,
  predictive_intelligence: BrainCircuit,
  bond_regions: Building2,
  bond_branches: Building2,
  bond_branches_regions: Building2,
  bond_consultants: Users,
  audit_logs: FileText,
  snags: AlertTriangle,
  client_snags: AlertTriangle,
  developer_snags: AlertTriangle,
  team: ShieldUser,
  users: ShieldUser,
  settings: Settings,
  settings_workspace: Settings,
  intelligence_dashboard: LayoutDashboard,
  intelligence_opportunity_engine: BrainCircuit,
  intelligence_partner_intelligence: Users,
  intelligence_market_position: Building2,
  intelligence_revenue_forecast: Wallet,
  dev_intelligence_dashboard: LayoutDashboard,
  dev_intelligence_opportunity: BrainCircuit,
  dev_intelligence_feasibility: BrainCircuit,
  dev_intelligence_market_demand: KanbanSquare,
  dev_intelligence_pricing: Wallet,
  dev_intelligence_portfolio: Building2,
  dev_intelligence_growth: Users,
  agent_intelligence_overview: LayoutDashboard,
  agent_intelligence_opportunities: BrainCircuit,
  agent_intelligence_market: Building2,
  agent_intelligence_pricing: Wallet,
  agent_intelligence_pipeline: KanbanSquare,
  agent_intelligence_performance: BriefcaseBusiness,
  agent_intelligence_network: Users,
  platform_demo_enquiries: ClipboardList,
  platform_diagnostics: ShieldUser,
  platform_transaction_routing: Workflow,
  mission_control: LayoutDashboard,
}

const BRIDGE_BRAND_MARK = 'Arch9'
const BRIDGE_BRAND_SUBTITLE = 'Property Transaction OS'
const ATTORNEY_SECONDARY_KEYS = new Set()
const BOND_NAV_SECTIONS = [
  {
    key: 'workspace',
    label: 'Overview',
    itemKeys: ['dashboard', 'bond_applications', 'bond_developments', 'partners', 'clients'],
  },
  {
    key: 'organisation',
    label: 'Organisation',
    itemKeys: [
      'revenue_commissions',
      'bond_organisation',
      'bank_relationships',
    ],
  },
]

function routeMatches(pathname, target = '') {
  return pathname === target || pathname.startsWith(`${target}/`)
}

function isSellerPortalShellRoute(pathname = '') {
  const normalizedPath = String(pathname || '')
  return /^\/seller(?:\/|$)/.test(normalizedPath) || /^\/client\/[^/]+\/selling(?:\/|$)/.test(normalizedPath)
}

function normalizeQuery(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  return [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = leftKey.localeCompare(rightKey)
      if (keyCompare !== 0) return keyCompare
      return leftValue.localeCompare(rightValue)
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

function targetMatchesLocation(location, target = '') {
  const [targetWithoutHash] = String(target || '').split('#')
  const [targetPathname, targetSearch = ''] = targetWithoutHash.split('?')
  if (!routeMatches(location.pathname, targetPathname)) return false
  if (!targetSearch) return true
  return normalizeQuery(location.search) === normalizeQuery(targetSearch)
}

function isParentNavActive(item, location) {
  if (!Array.isArray(item?.children) || !item.children.length) {
    return false
  }

  const pathname = location?.pathname || ''
  const childActive = item.children.some((child) => targetMatchesLocation(location, child.to))
  const customActive = Array.isArray(item.activeMatch)
    ? item.activeMatch.some((path) => routeMatches(pathname, path))
    : false

  return (
    childActive ||
    customActive ||
    (item.key === 'agents' && routeMatches(pathname, '/agents')) ||
    (item.key === 'agency' && routeMatches(pathname, '/agency'))
  )
}

function BusinessWorkspaceSwitcher({
  currentWorkspace = null,
  workspaces = [],
  onChange,
  visible = false,
}) {
  const [open, setOpen] = useState(false)
  const switcherRef = useRef(null)
  const currentId = currentWorkspace?.id || 'sales'
  const currentLabel = currentWorkspace?.label || 'Sales'

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const handlePointerDown = (event) => {
      if (!switcherRef.current || switcherRef.current.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  if (!visible || !Array.isArray(workspaces) || workspaces.length < 2) return null

  return (
    <div ref={switcherRef} className="ui-business-workspace-switcher" aria-label="Business line">
      <button
        type="button"
        className={`ui-business-workspace-trigger ${open ? 'ui-business-workspace-trigger-open' : ''}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ui-business-workspace-current">{currentLabel}</span>
        <ChevronDown size={15} className={`ui-business-workspace-chevron ${open ? 'ui-business-workspace-chevron-open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="ui-business-workspace-menu" role="menu" aria-label="Switch business line">
          <p className="ui-business-workspace-menu-heading">Switch</p>
          {workspaces.map((workspace) => {
            const active = workspace.id === currentId
            return (
              <button
                key={workspace.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`ui-business-workspace-option ${active ? 'ui-business-workspace-option-active' : ''}`.trim()}
                onClick={() => {
                  setOpen(false)
                  if (!active) onChange?.(workspace.id)
                }}
              >
                <span className="ui-business-workspace-option-check" aria-hidden="true">
                  {active ? <Check size={14} /> : null}
                </span>
                <span className="ui-business-workspace-option-label">{workspace.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function Sidebar({ onNavigateStart = null, pendingNavigationTarget = '' }) {
  const workspaceContext = useWorkspace()
  const { workspace, setWorkspace, allWorkspace, role, baseRole, profile } = workspaceContext
  const { branding, loading: organisationLoading, membershipRole: organisationMembershipRole } = useOrganisation()
  const attorneyModuleState = useAttorneyModuleSettings({ enabled: role === 'attorney' })
  const location = useLocation()
  const navigate = useNavigate()
  const navigateFromMenu = useCallback((event, target, label) => {
    const destination = String(target || '').trim()
    if (!destination) return false
    if (
      event?.button > 0 ||
      event?.metaKey ||
      event?.altKey ||
      event?.ctrlKey ||
      event?.shiftKey
    ) {
      return false
    }
    event?.preventDefault?.()
    if (targetMatchesLocation(location, destination)) return false
    if (pendingNavigationTarget === destination) return false
    onNavigateStart?.({ target: destination, label })
    navigate(destination, { flushSync: true })
    return true
  }, [location, navigate, onNavigateStart, pendingNavigationTarget])
  const handleBusinessWorkspaceChange = useCallback((nextWorkspaceId) => {
    workspaceContext.setBusinessWorkspace?.(nextWorkspaceId)
    const nextRoute = resolveBusinessWorkspaceRoute({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      targetWorkspace: nextWorkspaceId,
    })
    const currentRoute = `${location.pathname}${location.search}${location.hash}`
    if (nextRoute && nextRoute !== currentRoute) {
      onNavigateStart?.({ target: nextRoute, label: 'workspace' })
      navigate(nextRoute, { flushSync: true })
    }
  }, [location.hash, location.pathname, location.search, navigate, onNavigateStart, workspaceContext])
  const inferredRoleWorkspaceType = inferWorkspaceTypeFromAppRole(role)
  const navWorkspaceType =
    inferredRoleWorkspaceType && workspaceContext.currentWorkspace?.type !== inferredRoleWorkspaceType
      ? inferredRoleWorkspaceType
      : workspaceContext.currentWorkspace?.type || workspaceContext.workspaceType || inferredRoleWorkspaceType
  const membershipRole = normalizeOrganisationMembershipRole(organisationMembershipRole || 'viewer', {
    appRole: role,
    workspaceType: navWorkspaceType,
  })
  const navCurrentMembership = useMemo(() => {
    const currentMembership = workspaceContext.currentMembership || null
    if (!currentMembership || !navWorkspaceType) return currentMembership
    const shouldPromotePrincipalForModuleNav = role === 'developer' && membershipRole === 'principal'
    const workspaceRole = shouldPromotePrincipalForModuleNav ? 'owner' : currentMembership.workspaceRole || currentMembership.workspace_role || membershipRole
    return {
      ...currentMembership,
      role: workspaceRole,
      workspaceRole,
      workspace_role: workspaceRole,
      workspaceType: navWorkspaceType,
      workspace_type: navWorkspaceType,
      workspace: {
        ...(currentMembership.workspace || {}),
        id: currentMembership.workspace?.id || workspaceContext.currentWorkspace?.id || currentMembership.workspaceId || currentMembership.workspace_id || '',
        type: navWorkspaceType,
      },
    }
  }, [membershipRole, navWorkspaceType, role, workspaceContext.currentMembership, workspaceContext.currentWorkspace?.id])
  const navPermissionContext = useMemo(() => ({
    ...workspaceContext,
    appRole: role,
    role,
    workspaceType: navWorkspaceType,
    currentWorkspace: workspaceContext.currentWorkspace
      ? { ...workspaceContext.currentWorkspace, type: navWorkspaceType }
      : { id: workspace.id || '', name: workspace.name || 'Organisation', type: navWorkspaceType },
    currentMembership: navCurrentMembership,
  }), [navCurrentMembership, navWorkspaceType, role, workspace.id, workspace.name, workspaceContext])
  const roleNavItems = useMemo(
    () => {
      const items = getRoleNavItems(role, {
        baseRole,
        profile,
        membershipRole,
        currentMembership: navCurrentMembership,
        businessWorkspace: workspaceContext.businessWorkspaceId,
      })
      const moduleFilteredItems = role === 'attorney'
        ? filterAttorneyModuleNavigationItems(items, attorneyModuleState.modules)
        : items
      return filterNavigationItems(moduleFilteredItems, navPermissionContext)
    },
    [attorneyModuleState.modules, baseRole, membershipRole, navCurrentMembership, navPermissionContext, profile, role, workspaceContext.businessWorkspaceId],
  )
  const isIntelligencePath =
    location.pathname.startsWith('/attorney/intelligence') ||
    location.pathname.startsWith('/developer/intelligence') ||
    location.pathname.startsWith('/agent/intelligence')
  const [expandedMenus, setExpandedMenus] = useState(() => ({
    intelligence_beta: isIntelligencePath,
  }))
  const [logoLoadState, setLogoLoadState] = useState({ url: '', status: 'idle' })
  const secondaryItems = useMemo(
    () =>
      filterNavigationItems(
        role === 'developer'
          ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
          : role === 'attorney'
            ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
            : role === 'agent'
              ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
              : role === 'client'
                ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
                : role === 'bond_originator'
                  ? [{ key: 'organizations', label: 'Organizations', to: '/organizations' }, { key: 'settings', label: 'Settings', to: '/settings' }]
                  : [{ key: 'settings', label: 'Settings', to: '/settings' }],
        workspaceContext,
      ),
    [role, workspaceContext],
  )
  const roleSecondaryNavItems = useMemo(
    () => roleNavItems.filter((item) => item.navSection === 'secondary'),
    [roleNavItems],
  )
  const isRentalsBusinessLine = role === 'agent' && workspaceContext.businessWorkspaceId === BUSINESS_WORKSPACES.rentals
  const primaryNavItems = useMemo(
    () => {
      if (role === 'attorney') return roleNavItems.filter((item) => !ATTORNEY_SECONDARY_KEYS.has(item.key))
      if (role === 'bond_originator') return roleNavItems.filter((item) => item.navSection !== 'secondary')
      if (isRentalsBusinessLine) return roleNavItems
      if (role === 'agent') return roleNavItems.filter((item) => item.navSection !== 'secondary')
      return roleNavItems
    },
    [isRentalsBusinessLine, role, roleNavItems],
  )
  const firmNavItems = useMemo(
    () => {
      if (role === 'attorney') return [...roleNavItems.filter((item) => ATTORNEY_SECONDARY_KEYS.has(item.key)), ...secondaryItems]
      if (role === 'bond_originator') return roleSecondaryNavItems.length ? roleSecondaryNavItems : secondaryItems
      if (isRentalsBusinessLine) return secondaryItems
      if (role === 'agent') return roleSecondaryNavItems.length ? [...roleSecondaryNavItems, ...secondaryItems] : secondaryItems
      return secondaryItems
    },
    [isRentalsBusinessLine, role, roleNavItems, roleSecondaryNavItems, secondaryItems],
  )
  const bondGroupedNavSections = useMemo(() => {
    if (role !== 'bond_originator') return []
    const allItems = [...primaryNavItems, ...firmNavItems]
    return BOND_NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.itemKeys
          .map((key) => allItems.find((item) => item.key === key))
          .filter(Boolean),
      }))
      .filter((section) => section.items.length)
  }, [firmNavItems, primaryNavItems, role])

  const prefetchNavigationItem = useCallback((target) => {
    void prefetchRouteModule(target, { role })
  }, [role])

  useEffect(() => {
    const targets = primaryNavItems.flatMap((item) => [
      item.to,
      ...(Array.isArray(item.children) ? item.children.map((child) => child.to) : []),
    ])
      .filter(Boolean)
      .filter((target) => !targetMatchesLocation(location, target))

    return scheduleIdleRoutePrefetch(targets, { role }, { maxRoutes: 4 })
  }, [location.pathname, location.search, primaryNavItems, role])

  const renderNavItem = (item, { child = false } = {}) => {
    const Icon = item.icon || ICON_BY_KEY[item.key] || LayoutDashboard
    const hasChildren = item.key !== 'clients' && Array.isArray(item.children) && item.children.length > 0
    const isParentActive = hasChildren ? isParentNavActive(item, location) : false
    const menuExpanded = Boolean(expandedMenus[item.key] ?? isParentActive)

    if (!hasChildren) {
      const matchesCustomActive = Array.isArray(item.activeMatch)
        ? item.activeMatch.some(
            (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
          )
        : false
      const matchesTarget = targetMatchesLocation(location, item.to)
      const targetHasQuery = String(item.to || '').includes('?')
      const navigationPending = pendingNavigationTarget === String(item.to || '')
      return (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.to === '/dashboard'}
          aria-busy={navigationPending}
          aria-disabled={navigationPending}
          onPointerEnter={() => prefetchNavigationItem(item.to)}
          onFocus={() => prefetchNavigationItem(item.to)}
          onClick={(event) => navigateFromMenu(event, item.to, item.label)}
          className={({ isActive }) =>
            `ui-sidebar-link ${child ? 'ui-sidebar-link-child' : ''} ${navigationPending ? 'ui-sidebar-link-pending' : ''} ${((targetHasQuery ? matchesTarget : isActive) || matchesCustomActive || matchesTarget) ? 'ui-sidebar-link-active' : ''}`.trim()
          }
        >
          <Icon size={child ? 13 : 15} />
          <span>{item.label}</span>
          {navigationPending ? <LoaderCircle className="ui-sidebar-link-spinner ml-auto animate-spin" size={14} aria-hidden="true" /> : null}
        </NavLink>
      )
    }

    return (
      <div key={item.label} className="space-y-1">
        <button
          type="button"
          onPointerEnter={() => prefetchNavigationItem(item.to)}
          onFocus={() => prefetchNavigationItem(item.to)}
          onClick={(event) => {
            const nextExpanded = !menuExpanded
            if (item.to && nextExpanded) {
              navigateFromMenu(event, item.to, item.label)
            }
            setExpandedMenus((previous) => ({
              ...previous,
              [item.key]: nextExpanded,
            }))
          }}
          className={`ui-sidebar-link w-full justify-between ${pendingNavigationTarget === String(item.to || '') ? 'ui-sidebar-link-pending' : ''} ${menuExpanded ? 'ui-sidebar-link-open' : ''}`.trim()}
          aria-expanded={menuExpanded}
          aria-busy={pendingNavigationTarget === String(item.to || '')}
        >
          <span className="inline-flex items-center gap-2.5">
            <Icon size={15} />
            <span>{item.label}</span>
          </span>
          {pendingNavigationTarget === String(item.to || '') ? (
            <LoaderCircle className="ui-sidebar-link-spinner animate-spin" size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} className={`transition ${menuExpanded ? 'rotate-180' : ''}`} />
          )}
        </button>

        {menuExpanded ? (
          <div className="space-y-1 pl-3">
            {item.children.map((childItem) => renderNavItem(childItem, { child: true }))}
          </div>
        ) : null}
      </div>
    )
  }

  useEffect(() => {
    if (role === 'client' || role === 'attorney' || workspace.id === 'all') {
      return
    }

    setWorkspace(allWorkspace)
  }, [allWorkspace, role, setWorkspace, workspace.id])

  const currentLogoLoadStatus = logoLoadState.url === branding.logoUrl ? logoLoadState.status : 'loading'
  const logoLoadFailed = currentLogoLoadStatus === 'failed'
  const logoLoaded = currentLogoLoadStatus === 'loaded'
  const usesPlatformPortalBranding = isSellerPortalShellRoute(location.pathname)
  const showOrganisationBranding = !usesPlatformPortalBranding && Boolean(branding.logoUrl) && !logoLoadFailed
  const showBrandPlaceholder = !usesPlatformPortalBranding && organisationLoading && !logoLoadFailed
  const handleLogoLoadFailure = () => {
    setLogoLoadState({ url: branding.logoUrl, status: 'failed' })
    void trackWorkspaceBrandingMetric('workspace_branding_image_failed', {
      userId: workspaceContext.profile?.id,
      workspaceId: workspaceContext.currentWorkspace?.id,
      workspaceType: workspaceContext.workspaceType,
      membershipSource: workspaceContext.currentMembership?.source,
      membershipSources: workspaceContext.currentMemberships?.map((membership) => membership?.source),
      brandingSource: workspaceContext.currentWorkspace?.brandingSource,
      logoPresent: Boolean(branding.logoUrl),
      severity: 'warning',
    })
  }

  useEffect(() => {
    const logoUrl = String(branding.logoUrl || '').trim()
    if (!logoUrl) return undefined

    const timeoutId = window.setTimeout(() => {
      setLogoLoadState((previous) => {
        if (previous.url === logoUrl && ['loaded', 'failed'].includes(previous.status)) return previous
        return { url: logoUrl, status: 'failed' }
      })
    }, 8000)

    return () => window.clearTimeout(timeoutId)
  }, [branding.logoUrl])

  useEffect(() => {
    let active = true
    window.queueMicrotask(() => {
      if (!active) return
      setExpandedMenus((previous) => {
        const next = { ...previous }
        let changed = false

        for (const item of roleNavItems) {
          if (!Array.isArray(item.children) || !item.children.length) continue
          const isActive = isParentNavActive(item, location)
          if (isActive && previous[item.key] === undefined) {
            next[item.key] = true
            changed = true
          }
          if (!isActive && previous[item.key] !== undefined) {
            delete next[item.key]
            changed = true
          }
        }

        return changed ? next : previous
      })
    })

    return () => {
      active = false
    }
  }, [location, roleNavItems])

  return (
    <aside className={`ui-sidebar no-print ${role === 'bond_originator' ? 'ui-sidebar-bond' : ''}`.trim()}>
      <div className="ui-sidebar-top">
        <div className="ui-sidebar-brand">
          {showOrganisationBranding ? (
            <div className="ui-sidebar-brand-org">
              <div className={`ui-sidebar-brand-logo-wrap ${logoLoaded ? 'ui-sidebar-brand-logo-wrap-loaded' : 'ui-sidebar-brand-logo-wrap-loading'}`.trim()}>
                {!logoLoaded ? <span className="ui-sidebar-brand-logo-placeholder" aria-hidden="true" /> : null}
                <img
                  key={branding.logoUrl}
                  src={branding.logoUrl}
                  alt={`${branding.organisationLabel || 'Organisation'} logo`}
                  className={`ui-sidebar-brand-logo ${logoLoaded ? 'ui-sidebar-brand-logo-loaded' : 'ui-sidebar-brand-logo-pending'}`.trim()}
                  loading="eager"
                  decoding="async"
                  onLoad={() => setLogoLoadState({ url: branding.logoUrl, status: 'loaded' })}
                  onError={handleLogoLoadFailure}
                />
              </div>
            </div>
          ) : showBrandPlaceholder ? (
            <div className="ui-sidebar-brand-org" aria-label="Loading organisation branding">
              <div className="ui-sidebar-brand-logo-wrap ui-sidebar-brand-logo-wrap-loading">
                <span className="ui-sidebar-brand-logo-placeholder" />
              </div>
            </div>
          ) : (
            <>
              <h1 className="ui-sidebar-brand-mark">{BRIDGE_BRAND_MARK}</h1>
              <p className="ui-sidebar-brand-copy">{BRIDGE_BRAND_SUBTITLE}</p>
            </>
          )}
          <BusinessWorkspaceSwitcher
            currentWorkspace={workspaceContext.businessWorkspace}
            workspaces={workspaceContext.availableBusinessWorkspaces}
            visible={workspaceContext.showBusinessWorkspaceSwitcher}
            onChange={handleBusinessWorkspaceChange}
          />
        </div>
      </div>

      <div className="ui-sidebar-nav-scroll" aria-label="Primary Navigation">
        {role === 'bond_originator' ? (
          <div className="space-y-4">
            {bondGroupedNavSections.map((section) => (
              <nav key={section.key} className="ui-nav-stack ui-sidebar-bond-section">
                <p className="ui-sidebar-section-label px-3">{section.label}</p>
                {section.items.map((item) => renderNavItem(item))}
              </nav>
            ))}
          </div>
        ) : (
          <nav className={`ui-nav-stack ${role === 'client' ? 'mt-3' : 'mt-2.5'}`}>
            {role === 'attorney' ? <p className="ui-sidebar-section-label px-3 pt-2">Primary</p> : null}
            {primaryNavItems.map((item) => renderNavItem(item))}
          </nav>
        )}
      </div>

      {firmNavItems.length ? <div className="ui-sidebar-divider" /> : null}

      {firmNavItems.length ? (
        <nav className="ui-nav-stack ui-sidebar-secondary" aria-label="Secondary Navigation">
          {firmNavItems.map((item) => renderNavItem(item))}
        </nav>
      ) : null}
    </aside>
  )
}

export default Sidebar
