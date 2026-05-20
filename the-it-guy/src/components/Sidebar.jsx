import {
  AlertTriangle,
  BriefcaseBusiness,
  BrainCircuit,
  Building2,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  FileText,
  Files,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  ChevronDown,
  Megaphone,
  PlusCircle,
  Settings,
  ShieldUser,
  SwitchCamera,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { getRoleNavItems } from '../lib/roles'
import { normalizeOrganisationMembershipRole } from '../lib/organisationAccess'
import { fetchAgencyOnboardingSettings, fetchOrganisationSettings } from '../lib/settingsApi'
import WorkspaceSwitcher from './WorkspaceSwitcher'

const ICON_BY_KEY = {
  dashboard: LayoutDashboard,
  deals: SwitchCamera,
  developments: Building2,
  listings: Building2,
  listings_private: Building2,
  listings_developments: Building2,
  agents: BriefcaseBusiness,
  transactions: SwitchCamera,
  transfers: SwitchCamera,
  applications: SwitchCamera,
  clients: Users,
  financials: Wallet,
  marketing: Megaphone,
  new_transaction: PlusCircle,
  pipeline: KanbanSquare,
  leads: Users,
  pipeline_overview: KanbanSquare,
  pipeline_leads: KanbanSquare,
  pipeline_canvassing: ClipboardList,
  pipeline_calendar: CalendarDays,
  calendar: CalendarDays,
  agency: BriefcaseBusiness,
  agency_branches: Building2,
  agency_agents: Users,
  agency_analytics: FileText,
  agents_directory: BriefcaseBusiness,
  agents_reporting: FileText,
  intelligence_beta: BrainCircuit,
  documents: Files,
  attorney_matters: Files,
  attorney_matters_all: Files,
  attorney_matters_transfer: SwitchCamera,
  attorney_matters_bond: FileCheck2,
  attorney_matters_cancellation: AlertTriangle,
  attorney_workflow_board: KanbanSquare,
  team_departments: ShieldUser,
  buyer_information: FileCheck2,
  handover: KeyRound,
  reports: FileText,
  audit_logs: FileText,
  snags: AlertTriangle,
  team: ShieldUser,
  users: ShieldUser,
  settings: Settings,
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
}

const BRANDING_REFRESH_EVENT = 'itg:organisation-branding-updated'
const BRIDGE_BRAND_MARK = 'bridge.'
const BRIDGE_BRAND_SUBTITLE = 'Property Transaction OS'
const BRIDGE_POWERED_LABEL = 'Powered by Bridge'

function routeMatches(pathname, target = '') {
  return pathname === target || pathname.startsWith(`${target}/`)
}

function isParentNavActive(item, pathname) {
  if (!Array.isArray(item?.children) || !item.children.length) {
    return false
  }

  const childActive = item.children.some((child) => routeMatches(pathname, child.to))
  const customActive = Array.isArray(item.activeMatch)
    ? item.activeMatch.some((path) => routeMatches(pathname, path))
    : false

  return (
    childActive ||
    customActive ||
    (item.key === 'agents' && routeMatches(pathname, '/agents')) ||
    (item.key === 'agency' && (routeMatches(pathname, '/agency') || routeMatches(pathname, '/agents/reporting')))
  )
}

function normalizeBrandText(value) {
  return String(value || '').trim()
}

function resolveSidebarBranding(snapshot) {
  const onboarding = snapshot?.onboarding || {}
  const organisation = snapshot?.organisation || {}
  const branding = onboarding?.branding || {}
  const agencyInformation = onboarding?.agencyInformation || {}

  const logoLightUrl = normalizeBrandText(branding.logoLight)
  const logoDarkUrl = normalizeBrandText(branding.logoDark)
  const organisationLogoUrl = normalizeBrandText(organisation.logoUrl)
  const logoUrl = logoDarkUrl || organisationLogoUrl || logoLightUrl
  const organisationLabel =
    normalizeBrandText(agencyInformation.tradingName) ||
    normalizeBrandText(agencyInformation.agencyName) ||
    normalizeBrandText(organisation.displayName) ||
    normalizeBrandText(organisation.name)

  return {
    logoUrl,
    organisationLabel,
  }
}

function Sidebar() {
  const { workspace, setWorkspace, allWorkspace, role, baseRole, profile } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const roleNavItems = useMemo(
    () => getRoleNavItems(role, { baseRole, profile, membershipRole }),
    [baseRole, membershipRole, profile, role],
  )
  const isIntelligencePath =
    location.pathname.startsWith('/attorney/intelligence') ||
    location.pathname.startsWith('/developer/intelligence') ||
    location.pathname.startsWith('/agent/intelligence')
  const [expandedMenus, setExpandedMenus] = useState(() => ({
    intelligence_beta: isIntelligencePath,
  }))
  const [sidebarBranding, setSidebarBranding] = useState(() => ({
    logoUrl: '',
    organisationLabel: '',
  }))
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
  const secondaryItems =
    role === 'developer'
      ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
      : role === 'attorney'
        ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'audit_logs', label: 'Audit Logs', to: '/attorney/audit-logs' }]
        : role === 'agent'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
        : role === 'client'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
          : [{ key: 'settings', label: 'Settings', to: '/settings' }]

  const loadSidebarBranding = useCallback(async () => {
    const [settingsResult, contextResult] = await Promise.allSettled([fetchAgencyOnboardingSettings(), fetchOrganisationSettings()])
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const context = contextResult.status === 'fulfilled' ? contextResult.value : null
    const snapshot = settings || context

    if (snapshot) {
      setSidebarBranding(resolveSidebarBranding(snapshot))
    }

    setMembershipRole((previous) =>
      normalizeOrganisationMembershipRole(
        context?.membershipRole || settings?.membershipRole || previous || 'viewer',
      ),
    )
  }, [])

  useEffect(() => {
    if (role === 'client' || workspace.id === 'all') {
      return
    }

    setWorkspace(allWorkspace)
  }, [allWorkspace, role, setWorkspace, workspace.id])

  const showOrganisationBranding = Boolean(sidebarBranding.logoUrl) && !logoLoadFailed

  useEffect(() => {
    let active = true

    async function load() {
      if (!active) return
      await loadSidebarBranding()
    }

    void load()

    return () => {
      active = false
    }
  }, [loadSidebarBranding, profile?.id])

  useEffect(() => {
    function handleBrandingRefresh() {
      void loadSidebarBranding()
    }

    window.addEventListener(BRANDING_REFRESH_EVENT, handleBrandingRefresh)
    return () => {
      window.removeEventListener(BRANDING_REFRESH_EVENT, handleBrandingRefresh)
    }
  }, [loadSidebarBranding])

  useEffect(() => {
    let active = true
    window.queueMicrotask(() => {
      if (!active) return
      setExpandedMenus((previous) => {
        const next = {}
        let changed = false

        for (const item of roleNavItems) {
          if (!Array.isArray(item.children) || !item.children.length) continue
          const isActive = isParentNavActive(item, location.pathname)
          if (isActive) {
            next[item.key] = true
          }
          if (Boolean(previous[item.key]) !== Boolean(next[item.key])) {
            changed = true
          }
        }

        const previousKeys = Object.keys(previous)
        if (previousKeys.length !== Object.keys(next).length) {
          changed = true
        }

        return changed ? next : previous
      })
    })

    return () => {
      active = false
    }
  }, [location.pathname, roleNavItems])

  return (
    <aside className="ui-sidebar no-print">
      <div className="ui-sidebar-top">
        <div className="ui-sidebar-brand">
          {showOrganisationBranding ? (
            <div className="ui-sidebar-brand-org">
              <div className="ui-sidebar-brand-logo-wrap">
                <img
                  key={sidebarBranding.logoUrl}
                  src={sidebarBranding.logoUrl}
                  alt={`${sidebarBranding.organisationLabel || 'Organisation'} logo`}
                  className="ui-sidebar-brand-logo"
                  loading="lazy"
                  onLoad={() => setLogoLoadFailed(false)}
                  onError={() => setLogoLoadFailed(true)}
                />
              </div>
              <p className="ui-sidebar-brand-powered">{BRIDGE_POWERED_LABEL}</p>
            </div>
          ) : (
            <>
              <h1 className="ui-sidebar-brand-mark">{BRIDGE_BRAND_MARK}</h1>
              <p className="ui-sidebar-brand-copy">{BRIDGE_BRAND_SUBTITLE}</p>
            </>
          )}
        </div>
        <div className="ui-sidebar-workspace">
          <WorkspaceSwitcher
            currentPath={`${location.pathname}${location.search || ''}`}
            onSelectWorkspace={(path) => navigate(path)}
          />
        </div>
      </div>

      <div className="ui-sidebar-nav-scroll" aria-label="Primary Navigation">
        <nav className={`ui-nav-stack ${role === 'client' ? 'mt-3' : 'mt-2.5'}`}>
          {roleNavItems.map((item) => {
            const Icon = ICON_BY_KEY[item.key] || LayoutDashboard
            const hasChildren = Array.isArray(item.children) && item.children.length > 0
            const isParentActive = hasChildren ? isParentNavActive(item, location.pathname) : false
            const menuExpanded = Boolean(expandedMenus[item.key] ?? isParentActive)

            if (!hasChildren) {
              const matchesCustomActive = Array.isArray(item.activeMatch)
                ? item.activeMatch.some(
                    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
                  )
                : false
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  className={({ isActive }) =>
                    `ui-sidebar-link ${isActive || matchesCustomActive ? 'ui-sidebar-link-active' : ''}`.trim()
                  }
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              )
            }

            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMenus((previous) => ({
                      ...previous,
                      [item.key]: !(previous[item.key] ?? isParentActive),
                    }))
                  }
                  className={`ui-sidebar-link w-full justify-between ${menuExpanded ? 'ui-sidebar-link-open' : ''}`.trim()}
                  aria-expanded={menuExpanded}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </span>
                  <ChevronDown size={14} className={`transition ${menuExpanded ? 'rotate-180' : ''}`} />
                </button>

                {menuExpanded ? (
                  <div className="space-y-1 pl-3">
                    {item.children.map((child) => {
                      const ChildIcon = ICON_BY_KEY[child.key] || LayoutDashboard
                      return (
                        <NavLink
                          key={child.label}
                          to={child.to}
                          className={({ isActive }) =>
                            `ui-sidebar-link py-2.5 text-[0.86rem] ${isActive ? 'ui-sidebar-link-active' : ''}`.trim()
                          }
                        >
                          <ChildIcon size={14} />
                          <span>{child.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>
      </div>

      {secondaryItems.length ? <div className="ui-sidebar-divider" /> : null}

      <nav className="ui-nav-stack ui-sidebar-secondary" aria-label="Secondary Navigation">
        {secondaryItems.map((item) => {
          const Icon = ICON_BY_KEY[item.key] || Settings

          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `ui-sidebar-link ${isActive ? 'ui-sidebar-link-active' : ''}`.trim()
              }
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
