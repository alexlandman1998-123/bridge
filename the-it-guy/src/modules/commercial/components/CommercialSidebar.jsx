import { ChevronDown } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_BOTTOM_NAV_ITEMS, COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_GROUPS, isCommercialNavItemActive } from '../commercialNavigation'
import CommercialBranding from './CommercialBranding'

function CommercialSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentFullPath = `${location.pathname}${location.hash || ''}`
  const currentWorkspacePath = `${location.pathname}${location.search || ''}`
  const DashboardIcon = COMMERCIAL_DASHBOARD_NAV_ITEM.icon
  const activeGroupId = useMemo(() => {
    const activeGroup = COMMERCIAL_NAV_GROUPS.find((group) =>
      group.items.some((item) => isCommercialNavItemActive(currentFullPath, item)),
    )
    return activeGroup?.id || ''
  }, [currentFullPath])
  const [expandedGroups, setExpandedGroups] = useState(() => activeGroupId ? { [activeGroupId]: true } : {})

  function toggleGroup(groupId) {
    setExpandedGroups((previous) => ({ ...previous, [groupId]: !previous[groupId] }))
  }

  return (
    <aside className="hidden h-screen w-[278px] shrink-0 border-r border-slate-200 bg-white shadow-[12px_0_36px_rgba(15,23,42,0.035)] lg:flex">
      <div className="flex min-h-0 w-full flex-col px-4 py-5">
        <div className="shrink-0">
          <CommercialBranding />

          <WorkspaceSwitcher
            currentPath={currentWorkspacePath}
            onSelectWorkspace={(path) => navigate(path)}
          />
        </div>

        <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Commercial Navigation">
          <Link
            to={COMMERCIAL_DASHBOARD_NAV_ITEM.to}
            aria-current={isCommercialNavItemActive(currentFullPath, COMMERCIAL_DASHBOARD_NAV_ITEM) ? 'page' : undefined}
            className={[
              'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors duration-150',
              isCommercialNavItemActive(currentFullPath, COMMERCIAL_DASHBOARD_NAV_ITEM)
                ? 'border border-[#cfe0ef] bg-[#eef5fb] text-[#123b61] shadow-[0_10px_24px_rgba(17,58,107,0.08)]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
            ].join(' ')}
          >
            <DashboardIcon size={17} />
            <span>{COMMERCIAL_DASHBOARD_NAV_ITEM.label}</span>
          </Link>

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
                        const active = isCommercialNavItemActive(currentFullPath, item)
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            aria-current={active ? 'page' : undefined}
                            className={[
                              'flex min-h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-150',
                              active
                                ? 'bg-[#eef5fb] text-[#123b61] shadow-[0_8px_18px_rgba(17,58,107,0.07)]'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
                            ].join(' ')}
                          >
                            <ItemIcon size={15} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </nav>

        <nav className="mt-3 shrink-0 border-t border-slate-200 pt-3" aria-label="Commercial Settings">
          {COMMERCIAL_BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isCommercialNavItemActive(currentFullPath, item)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors duration-150',
                  active
                    ? 'border border-[#cfe0ef] bg-[#eef5fb] text-[#123b61] shadow-[0_10px_24px_rgba(17,58,107,0.08)]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
                ].join(' ')}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

export default memo(CommercialSidebar)
