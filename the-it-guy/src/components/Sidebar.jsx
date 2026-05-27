import {
  AlertTriangle,
  BriefcaseBusiness,
  BrainCircuit,
  Building2,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  FileBarChart2,
  FileText,
  Files,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
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
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useOrganisation } from '../context/OrganisationContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { getRoleNavItems } from '../lib/roles'
import { normalizeOrganisationMembershipRole } from '../lib/organisationAccess'
import { filterNavigationItems } from '../auth/permissions/permissionResolver'
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
  applications: ClipboardList,
  applications_new: PlusCircle,
  applications_all: SwitchCamera,
  applications_mine: SwitchCamera,
  applications_ready: FileCheck2,
  applications_docs: Files,
  applications_bank_feedback: Building2,
  applications_approved: FileCheck2,
  applications_declined: AlertTriangle,
  clients: Users,
  clients_buyers: Users,
  clients_companies: BriefcaseBusiness,
  clients_contact_history: ClipboardList,
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
  bond_transactions_active: SwitchCamera,
  bond_transactions_awaiting_instruction: AlertTriangle,
  bond_transactions_approved: FileCheck2,
  bond_transactions_grant_signed: FileCheck2,
  bond_transactions_instruction_sent: SwitchCamera,
  bond_transactions_registered: KeyRound,
  bond_transactions_risk: AlertTriangle,
  agents_directory: BriefcaseBusiness,
  agents_reporting: FileText,
  intelligence_beta: BrainCircuit,
  documents: Files,
  partners: Network,
  attorney_matters: Files,
  attorney_matters_all: Files,
  attorney_matters_transfer: SwitchCamera,
  attorney_matters_bond: FileCheck2,
  attorney_matters_cancellation: AlertTriangle,
  attorney_matters_registered: FileCheck2,
  attorney_matters_archived: Files,
  attorney_workflow_board: KanbanSquare,
  scheduling: CalendarDays,
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
  platform_diagnostics: ShieldUser,
}

const BRIDGE_BRAND_MARK = 'bridge.'
const BRIDGE_BRAND_SUBTITLE = 'Property Transaction OS'
const BRIDGE_POWERED_LABEL = 'Powered by Bridge'
const ATTORNEY_SECONDARY_KEYS = new Set(['financials', 'team_departments', 'reports'])
const BOND_NAV_SECTIONS = [
  { key: 'main', label: 'Main', itemKeys: ['dashboard', 'pipeline', 'transactions', 'clients'] },
  { key: 'operations', label: 'Operations', itemKeys: ['documents', 'banks', 'partners', 'teams'] },
  { key: 'insights', label: 'Insights', itemKeys: ['reports', 'performance'] },
  { key: 'admin', label: 'Admin', itemKeys: ['settings'] },
]

function routeMatches(pathname, target = '') {
  return pathname === target || pathname.startsWith(`${target}/`)
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
  const [targetPathname, targetSearch = ''] = String(target || '').split('?')
  if (!routeMatches(location.pathname, targetPathname)) return false
  if (!targetSearch) return true
  return normalizeQuery(location.search) === normalizeQuery(targetSearch)
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

function Sidebar() {
  const workspaceContext = useWorkspace()
  const { workspace, setWorkspace, allWorkspace, role, baseRole, profile } = workspaceContext
  const { branding, loading: organisationLoading, membershipRole: organisationMembershipRole } = useOrganisation()
  const location = useLocation()
  const navigate = useNavigate()
  const membershipRole = normalizeOrganisationMembershipRole(organisationMembershipRole || 'viewer')
  const roleNavItems = useMemo(
    () => filterNavigationItems(getRoleNavItems(role, { baseRole, profile, membershipRole }), workspaceContext),
    [baseRole, membershipRole, profile, role, workspaceContext],
  )
  const isIntelligencePath =
    location.pathname.startsWith('/attorney/intelligence') ||
    location.pathname.startsWith('/developer/intelligence') ||
    location.pathname.startsWith('/agent/intelligence')
  const [expandedMenus, setExpandedMenus] = useState(() => ({
    intelligence_beta: isIntelligencePath,
  }))
  const [logoLoadFailure, setLogoLoadFailure] = useState({ url: '', failed: false })
  const secondaryItems = useMemo(
    () =>
      filterNavigationItems(
        role === 'developer'
          ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
          : role === 'attorney'
            ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'audit_logs', label: 'Audit Logs', to: '/attorney/audit-logs' }]
            : role === 'agent'
              ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
              : role === 'client'
                ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
                : [{ key: 'settings', label: 'Settings', to: '/settings' }],
        workspaceContext,
      ),
    [role, workspaceContext],
  )
  const primaryNavItems = useMemo(
    () => (role === 'attorney' ? roleNavItems.filter((item) => !ATTORNEY_SECONDARY_KEYS.has(item.key)) : roleNavItems),
    [role, roleNavItems],
  )
  const firmNavItems = useMemo(
    () => (role === 'attorney' ? [...roleNavItems.filter((item) => ATTORNEY_SECONDARY_KEYS.has(item.key)), ...secondaryItems] : secondaryItems),
    [role, roleNavItems, secondaryItems],
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

  const renderNavItem = (item, { child = false } = {}) => {
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
      const matchesTarget = targetMatchesLocation(location, item.to)
      return (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.to === '/dashboard'}
          className={({ isActive }) =>
            `ui-sidebar-link ${child ? 'ui-sidebar-link-child' : ''} ${isActive || matchesCustomActive || matchesTarget ? 'ui-sidebar-link-active' : ''}`.trim()
          }
        >
          <Icon size={child ? 13 : 15} />
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
            {item.children.map((childItem) => renderNavItem(childItem, { child: true }))}
          </div>
        ) : null}
      </div>
    )
  }

  useEffect(() => {
    if (role === 'client' || workspace.id === 'all') {
      return
    }

    setWorkspace(allWorkspace)
  }, [allWorkspace, role, setWorkspace, workspace.id])

  const logoLoadFailed = logoLoadFailure.url === branding.logoUrl && logoLoadFailure.failed
  const showOrganisationBranding = Boolean(branding.logoUrl) && !logoLoadFailed
  const showBrandPlaceholder = organisationLoading || (Boolean(branding.logoUrl) && logoLoadFailed)

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
    <aside className={`ui-sidebar no-print ${role === 'bond_originator' ? 'ui-sidebar-bond' : ''}`.trim()}>
      <div className="ui-sidebar-top">
        <div className="ui-sidebar-brand">
          {showOrganisationBranding ? (
            <div className="ui-sidebar-brand-org">
              <div className="ui-sidebar-brand-logo-wrap">
                <img
                  key={branding.logoUrl}
                  src={branding.logoUrl}
                  alt={`${branding.organisationLabel || 'Organisation'} logo`}
                  className="ui-sidebar-brand-logo"
                  loading="eager"
                  decoding="async"
                  onLoad={() => setLogoLoadFailure({ url: branding.logoUrl, failed: false })}
                  onError={() => setLogoLoadFailure({ url: branding.logoUrl, failed: true })}
                />
              </div>
              <p className="ui-sidebar-brand-powered">{BRIDGE_POWERED_LABEL}</p>
            </div>
          ) : showBrandPlaceholder ? (
            <div className="ui-sidebar-brand-org" aria-label="Loading organisation branding">
              <div className="ui-sidebar-brand-logo-wrap ui-sidebar-brand-logo-wrap-loading">
                <span className="ui-sidebar-brand-logo-placeholder" />
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

      {role !== 'bond_originator' && firmNavItems.length ? <div className="ui-sidebar-divider" /> : null}

      {role !== 'bond_originator' ? (
        <nav className="ui-nav-stack ui-sidebar-secondary" aria-label="Secondary Navigation">
          {role === 'attorney' ? <p className="ui-sidebar-section-label px-3">Firm</p> : null}
          {firmNavItems.map((item) => renderNavItem(item))}
        </nav>
      ) : null}
    </aside>
  )
}

export default Sidebar
