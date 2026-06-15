import { memo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_BOTTOM_NAV_ITEMS, COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_SECTIONS, isCommercialNavItemActive } from '../commercialNavigation'
import CommercialBranding from './CommercialBranding'

function CommercialSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentFullPath = `${location.pathname}${location.hash || ''}`
  const currentWorkspacePath = `${location.pathname}${location.search || ''}`
  const DashboardIcon = COMMERCIAL_DASHBOARD_NAV_ITEM.icon

  return (
    <aside className="hidden h-screen w-[268px] shrink-0 border-r border-slate-200 bg-white shadow-[12px_0_32px_rgba(15,23,42,0.03)] lg:flex">
      <div className="flex min-h-0 w-full flex-col px-4 py-4">
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
              'flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-semibold transition-colors duration-150',
              isCommercialNavItemActive(currentFullPath, COMMERCIAL_DASHBOARD_NAV_ITEM)
                ? 'border border-[#cfe0ef] bg-[#eef5fb] text-[#123b61] shadow-[0_10px_24px_rgba(17,58,107,0.08)]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
            ].join(' ')}
          >
            <DashboardIcon size={17} />
            <span>{COMMERCIAL_DASHBOARD_NAV_ITEM.label}</span>
          </Link>

          <div className="space-y-4 pt-3">
            {COMMERCIAL_NAV_SECTIONS.map((section, sectionIndex) => (
              <div key={section.id} className={sectionIndex ? 'border-t border-slate-100 pt-4' : ''}>
                <div className="grid gap-1">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon
                    const active = isCommercialNavItemActive(currentFullPath, item)
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        className={[
                          'flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-semibold transition-colors duration-150',
                          active
                            ? 'border border-[#cfe0ef] bg-[#eef5fb] text-[#123b61] shadow-[0_10px_24px_rgba(17,58,107,0.08)]'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
                        ].join(' ')}
                      >
                        <ItemIcon size={17} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
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
                  'flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-semibold transition-colors duration-150',
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
