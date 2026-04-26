import {
  AlertTriangle,
  BrainCircuit,
  Building2,
  FileCheck2,
  FileText,
  Files,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  PlusCircle,
  Settings,
  ShieldUser,
  SwitchCamera,
  Users,
  Wallet,
} from 'lucide-react'
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { getNavItemsForRole } from '../lib/roles'

const ICON_BY_KEY = {
  dashboard: LayoutDashboard,
  developments: Building2,
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
}

function Sidebar() {
  const { workspace, setWorkspace, allWorkspace, role } = useWorkspace()
  const roleNavItems = getNavItemsForRole(role)
  const secondaryItems =
    role === 'developer'
      ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
      : role === 'attorney'
        ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'users', label: 'Users', to: '/users' }]
        : role === 'client'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
          : [{ key: 'settings', label: 'Settings', to: '/settings' }]

  useEffect(() => {
    if (role === 'client' || workspace.id === 'all') {
      return
    }

    setWorkspace(allWorkspace)
  }, [allWorkspace, role, setWorkspace, workspace.id])

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
