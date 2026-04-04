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
import { fetchDevelopmentOptions } from '../lib/api'
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
      void loadOptions()
    }

    window.addEventListener('itg:developments-changed', onDevelopmentsChanged)
    return () => window.removeEventListener('itg:developments-changed', onDevelopmentsChanged)
  }, [loadOptions])

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
    <aside className="no-print fixed left-0 top-0 z-30 flex h-dvh w-[268px] flex-col overflow-hidden bg-[#152432] px-5 py-4 text-slate-100 [background-image:radial-gradient(circle_at_18%_-6%,rgba(108,152,193,0.18)_0%,transparent_34%),linear-gradient(180deg,#243c4f_0%,#152432_100%)]">
      <div className="border-b border-white/10 pb-3 pt-[1.2rem]">
        <h1 className="text-[3rem] font-bold leading-none tracking-[-0.05em] text-[#f8fbff] [text-shadow:0_1px_0_rgba(12,23,34,0.18)]">bridge.</h1>
        <p className="mt-2.5 text-[0.82rem] tracking-[0.02em] text-[#c8d5e3]">Property Transaction OS</p>
      </div>

      {role !== 'client' ? (
        <div className="mt-3 grid gap-1.5">
          <label htmlFor="workspace-select" className="text-[0.72rem] uppercase tracking-[0.12em] text-slate-400">Workspace</label>
          <select
            id="workspace-select"
            className="w-full rounded-[16px] border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 outline-none transition duration-150 ease-out focus:border-slate-300/30 focus:ring-4 focus:ring-white/10"
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

      <nav className={`grid gap-1 ${role === 'client' ? 'mt-5' : 'mt-3'}`}>
        {roleNavItems.map((item) => {
          const Icon = ICON_BY_KEY[item.key] || LayoutDashboard

          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                [
                  'relative flex min-h-[44px] items-center gap-3 rounded-[14px] border px-3 py-2 text-[0.9rem] font-medium transition duration-150 ease-out',
                  isActive
                    ? 'border-[rgba(52,211,153,0.42)] bg-[rgba(2,6,23,0.25)] text-white shadow-[inset_3px_0_0_#2fd18a]'
                    : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {secondaryItems.length ? <div className="my-4 border-t border-white/10" /> : null}

      <nav className="grid gap-1">
        {secondaryItems.map((item) => {
          const Icon = ICON_BY_KEY[item.key] || Settings

          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                [
                  'relative flex min-h-[44px] items-center gap-3 rounded-[14px] border px-3 py-2 text-[0.9rem] font-medium transition duration-150 ease-out',
                  isActive
                    ? 'border-[rgba(52,211,153,0.42)] bg-[rgba(2,6,23,0.25)] text-white shadow-[inset_3px_0_0_#2fd18a]'
                    : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                ].join(' ')
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
