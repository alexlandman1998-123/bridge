import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_GROUPS } from '../commercialNavigation'
import CommercialBranding from './CommercialBranding'
import CommercialSidebar from './CommercialSidebar'

function CommercialLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const mobileNavItems = [COMMERCIAL_DASHBOARD_NAV_ITEM, ...COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items)]

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f8fb] text-[#102236]">
      <CommercialSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <CommercialBranding compact />
            <div className="w-[190px]">
              <WorkspaceSwitcher
                currentPath={`${location.pathname}${location.search || ''}`}
                onSelectWorkspace={(path) => navigate(path)}
              />
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Commercial mobile navigation">
            {mobileNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/commercial/dashboard'}
                  className={({ isActive }) =>
                    [
                      'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold',
                      isActive ? 'border-[#cfe0ef] bg-[#eef5fb] text-[#123b61]' : 'border-slate-200 bg-white text-slate-600',
                    ].join(' ')
                  }
                >
                  <Icon size={14} />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default CommercialLayout
