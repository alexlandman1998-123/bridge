import {
  AlertTriangle,
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
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDevelopmentOptions, invalidateDevelopmentOptionsCache } from '../lib/api'
import { getNavItemsForRole } from '../lib/roles'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const ICON_BY_KEY = {
  dashboard: LayoutDashboard,
  developments: Building2,
  transactions: SwitchCamera,
  transfers: SwitchCamera,
  applications: SwitchCamera,
  clients: Users,
  financials: FileText,
  new_transaction: PlusCircle,
  pipeline: KanbanSquare,
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
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const roleNavItems = getNavItemsForRole(role)
  const secondaryItems =
    role === 'developer'
      ? [{ key: 'team', label: 'Team', to: '/team' }, { key: 'settings', label: 'Settings', to: '/settings' }]
      : role === 'attorney'
        ? [{ key: 'settings', label: 'Settings', to: '/settings' }, { key: 'users', label: 'Users', to: '/users' }]
        : role === 'client'
          ? [{ key: 'settings', label: 'Settings', to: '/settings' }]
          : [{ key: 'settings', label: 'Settings', to: '/settings' }]

  const loadOptions = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return
    }

    try {
      const options = await fetchDevelopmentOptions()
      setDevelopmentOptions(options)
    } catch {
      setDevelopmentOptions([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    function onDevelopmentsChanged() {
      invalidateDevelopmentOptionsCache()
      void loadOptions()
    }

    window.addEventListener('itg:developments-changed', onDevelopmentsChanged)
    return () => window.removeEventListener('itg:developments-changed', onDevelopmentsChanged)
  }, [loadOptions])

  useEffect(() => {
    if (workspace.id === 'all') {
      return
    }

    if (!developmentOptions.length) {
      return
    }

    const hasWorkspaceMatch = developmentOptions.some((option) => option.id === workspace.id)
    if (!hasWorkspaceMatch) {
      setWorkspace(allWorkspace)
    }
  }, [allWorkspace, developmentOptions, setWorkspace, workspace.id])

  function handleWorkspaceChange(event) {
    const selectedId = event.target.value

    if (selectedId === 'all') {
      setWorkspace(allWorkspace)
      return
    }

    const match = developmentOptions.find((option) => option.id === selectedId)
    setWorkspace({ id: selectedId, name: match?.name || 'Selected Development' })
  }

  return (
    <aside className="ui-sidebar no-print">
      <div className="ui-sidebar-brand">
        <h1 className="ui-sidebar-brand-mark">bridge.</h1>
        <p className="ui-sidebar-brand-copy">Property Transaction OS</p>
      </div>

      {role !== 'client' ? (
        <div className="ui-sidebar-workspace">
          <label htmlFor="workspace-select" className="ui-sidebar-section-label">Workspace</label>
          <select
            id="workspace-select"
            className="ui-select-dark"
            value={workspace.id}
            onChange={handleWorkspaceChange}
          >
            <option value="all">All Developments</option>
            {developmentOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <nav className={`ui-nav-stack ${role === 'client' ? 'mt-5' : 'mt-3'}`}>
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
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {secondaryItems.length ? <div className="ui-sidebar-divider" /> : null}

      <nav className="ui-nav-stack">
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
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

    </aside>
  )
}

export default Sidebar
