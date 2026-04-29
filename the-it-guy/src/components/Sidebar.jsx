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
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { getRoleNavItems } from '../lib/roles'

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
}

function Sidebar() {
  const { workspace, setWorkspace, allWorkspace, role, baseRole, profile } = useWorkspace()
  const location = useLocation()
  const roleNavItems = getRoleNavItems(role, { baseRole, profile })
  const [intelligenceExpanded, setIntelligenceExpanded] = useState(
    location.pathname.startsWith('/attorney/intelligence') || location.pathname.startsWith('/developer/intelligence'),
  )
  const secondaryItems =
    role === 'developer'
      ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
      : role === 'attorney'
        ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'users', label: 'Users', to: '/users' }]
        : role === 'agent'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'team', label: 'Team', to: '/team' }]
        : role === 'client'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
          : [{ key: 'settings', label: 'Settings', to: '/settings' }]

  useEffect(() => {
    if (role === 'client' || workspace.id === 'all') {
      return
    }

    setWorkspace(allWorkspace)
  }, [allWorkspace, role, setWorkspace, workspace.id])

  const intelligenceMenuExpanded =
    intelligenceExpanded ||
    location.pathname.startsWith('/attorney/intelligence') ||
    location.pathname.startsWith('/developer/intelligence')

  return (
    <aside className="ui-sidebar no-print">
      <div className="ui-sidebar-top">
        <div className="ui-sidebar-brand">
          <h1 className="ui-sidebar-brand-mark">bridge.</h1>
          <p className="ui-sidebar-brand-copy">Property Transaction OS</p>
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
