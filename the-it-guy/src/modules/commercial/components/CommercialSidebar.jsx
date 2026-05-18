import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_GROUPS } from '../commercialNavigation'
import CommercialBranding from './CommercialBranding'

function isPathActive(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function CommercialSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const DashboardIcon = COMMERCIAL_DASHBOARD_NAV_ITEM.icon
  const activeGroupId = useMemo(() => {
    const activeGroup = COMMERCIAL_NAV_GROUPS.find((group) =>
      group.items.some((item) => isPathActive(location.pathname, item.to)),
    )
    return activeGroup?.id || ''
  }, [location.pathname])
  const [expandedGroups, setExpandedGroups] = useState(() => activeGroupId ? { [activeGroupId]: true } : {})

  function toggleGroup(groupId) {
    setExpandedGroups((previous) => ({ ...previous, [groupId]: !previous[groupId] }))
  }

  return (
    <aside className="hidden h-screen w-[278px] shrink-0 border-r border-slate-200 bg-white px-4 py-5 shadow-[12px_0_36px_rgba(15,23,42,0.035)] lg:flex lg:flex-col">
      <div className="shrink-0">
        <CommercialBranding />

        <WorkspaceSwitcher
          currentPath={`${location.pathname}${location.search || ''}`}
          onSelectWorkspace={(path) => navigate(path)}
        />
      </div>

      <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Commercial Navigation">
        <NavLink
          to={COMMERCIAL_DASHBOARD_NAV_ITEM.to}
          end
          className={({ isActive }) =>
            [
              'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition',
              isActive
                ? 'border border-[#cfe0ef] bg-[#eef5fb] text-[#123b61] shadow-[0_10px_24px_rgba(17,58,107,0.08)]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
            ].join(' ')
          }
        >
          <DashboardIcon size={17} />
          <span>{COMMERCIAL_DASHBOARD_NAV_ITEM.label}</span>
        </NavLink>

        <div className="pt-2">
          {COMMERCIAL_NAV_GROUPS.map((group) => {
            const Icon = group.icon
            const groupActive = group.id === activeGroupId
            const expanded = groupActive || Boolean(expandedGroups[group.id])
            return (
              <div key={group.id} className="py-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={[
                    'flex min-h-10 w-full items-center gap-3 rounded-2xl px-3 text-left text-xs font-semibold uppercase tracking-[0.11em] transition',
                    groupActive ? 'bg-slate-50 text-[#123b61]' : 'text-slate-500 hover:bg-slate-50 hover:text-[#123b61]',
                  ].join(' ')}
                  aria-expanded={expanded}
                >
                  <Icon size={15} />
                  <span className="min-w-0 flex-1">{group.label}</span>
                  <ChevronDown size={15} className={`transition ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded ? (
                  <div className="mt-1 grid gap-1 border-l border-slate-200 pl-3 ml-5">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            [
                              'flex min-h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                              isActive
                                ? 'bg-[#eef5fb] text-[#123b61] shadow-[0_8px_18px_rgba(17,58,107,0.07)]'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
                            ].join(' ')
                          }
                        >
                          <ItemIcon size={15} />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </nav>

      <div className="mt-4 rounded-3xl border border-[#d9e6f2] bg-[#f7fafc] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Portfolio workspace</p>
        <p className="mt-1 text-sm font-semibold text-[#102236]">Commercial intelligence</p>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">Leasing, vacancy and deal oversight for this organisation.</p>
      </div>
    </aside>
  )
}

export default CommercialSidebar
