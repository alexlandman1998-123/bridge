import {
  AlertTriangle,
  BriefcaseBusiness,
  BrainCircuit,
  Building2,
  FileCheck2,
  FileText,
  Files,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  ChevronDown,
  PlusCircle,
  Settings,
  ShieldUser,
  SwitchCamera,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { getRoleNavItems } from '../lib/roles'
import { fetchAgencyOnboardingSettings } from '../lib/settingsApi'

const ICON_BY_KEY = {
  dashboard: LayoutDashboard,
  deals: SwitchCamera,
  developments: Building2,
  listings: Building2,
  agents: BriefcaseBusiness,
  transactions: SwitchCamera,
  transfers: SwitchCamera,
  applications: SwitchCamera,
  clients: Users,
  financials: Wallet,
  new_transaction: PlusCircle,
  pipeline: KanbanSquare,
  intelligence_beta: BrainCircuit,
  documents: Files,
  buyer_information: FileCheck2,
  handover: KeyRound,
  reports: FileText,
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
  const logoUrl = logoLightUrl || organisationLogoUrl || logoDarkUrl
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
  const roleNavItems = getRoleNavItems(role, { baseRole, profile })
  const isIntelligencePath =
    location.pathname.startsWith('/attorney/intelligence') ||
    location.pathname.startsWith('/developer/intelligence') ||
    location.pathname.startsWith('/agent/intelligence')
  const [intelligenceExpanded, setIntelligenceExpanded] = useState(
    isIntelligencePath,
  )
  const [sidebarBranding, setSidebarBranding] = useState(() => ({
    logoUrl: '',
    organisationLabel: '',
  }))
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
  const secondaryItems =
    role === 'developer'
      ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
      : role === 'attorney'
        ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'users', label: 'Users', to: '/users' }]
        : role === 'agent'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
        : role === 'client'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
          : [{ key: 'settings', label: 'Settings', to: '/settings' }]

  const loadSidebarBranding = useCallback(async () => {
    try {
      const settings = await fetchAgencyOnboardingSettings()
      setSidebarBranding(resolveSidebarBranding(settings))
    } catch {
      setSidebarBranding({ logoUrl: '', organisationLabel: '' })
    }
  }, [])

  useEffect(() => {
    if (role === 'client' || workspace.id === 'all') {
      return
    }

    setWorkspace(allWorkspace)
  }, [allWorkspace, role, setWorkspace, workspace.id])

  const intelligenceMenuExpanded =
    intelligenceExpanded ||
    isIntelligencePath
  const showOrganisationBranding = Boolean(sidebarBranding.logoUrl) && !logoLoadFailed

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const settings = await fetchAgencyOnboardingSettings()
        if (!active) return
        setSidebarBranding(resolveSidebarBranding(settings))
      } catch {
        if (!active) return
        setSidebarBranding({ logoUrl: '', organisationLabel: '' })
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [profile?.id])

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
    setLogoLoadFailed(false)
  }, [sidebarBranding.logoUrl])

  return (
    <aside className="ui-sidebar no-print">
      <div className="ui-sidebar-top">
        <div className="ui-sidebar-brand">
          {showOrganisationBranding ? (
            <div className="ui-sidebar-brand-org">
              <div className="ui-sidebar-brand-logo-wrap">
                <img
                  src={sidebarBranding.logoUrl}
                  alt={`${sidebarBranding.organisationLabel || 'Organisation'} logo`}
                  className="ui-sidebar-brand-logo"
                  loading="lazy"
                  onError={() => setLogoLoadFailed(true)}
                />
              </div>
              <p className="ui-sidebar-brand-org-title">
                {sidebarBranding.organisationLabel || 'Organisation Workspace'}
              </p>
              <p className="ui-sidebar-brand-powered">{BRIDGE_POWERED_LABEL}</p>
            </div>
          ) : (
            <>
              <h1 className="ui-sidebar-brand-mark">{BRIDGE_BRAND_MARK}</h1>
              <p className="ui-sidebar-brand-copy">{BRIDGE_BRAND_SUBTITLE}</p>
            </>
          )}
        </div>
      </div>

      <div className="ui-sidebar-nav-scroll" aria-label="Primary Navigation">
        <nav className={`ui-nav-stack ${role === 'client' ? 'mt-3' : 'mt-2.5'}`}>
          {roleNavItems.map((item) => {
            const Icon = ICON_BY_KEY[item.key] || LayoutDashboard
            const hasChildren = Array.isArray(item.children) && item.children.length > 0
            const isParentActive = hasChildren
              ? item.children.some((child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`))
              : false

            if (!hasChildren) {
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  className={({ isActive }) =>
                    `ui-sidebar-link ${isActive ? 'ui-sidebar-link-active' : ''}`.trim()
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
                  onClick={() => setIntelligenceExpanded((prev) => !prev)}
                  className={`ui-sidebar-link w-full justify-between ${isParentActive ? 'ui-sidebar-link-active' : ''}`.trim()}
                  aria-expanded={intelligenceMenuExpanded}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </span>
                  <ChevronDown size={14} className={`transition ${intelligenceMenuExpanded ? 'rotate-180' : ''}`} />
                </button>

                {intelligenceMenuExpanded ? (
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
