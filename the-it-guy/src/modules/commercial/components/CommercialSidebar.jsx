import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_NAV_ITEMS } from '../commercialNavigation'
import CommercialBranding from './CommercialBranding'

function CommercialSidebar() {
  const location = useLocation()
  const navigate = useNavigate()

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
        {COMMERCIAL_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/commercial/dashboard'}
              className={({ isActive }) =>
                [
                  'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition',
                  isActive
                    ? 'border border-[#cfe0ef] bg-[#eef5fb] text-[#123b61] shadow-[0_10px_24px_rgba(17,58,107,0.08)]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-[#123b61]',
                ].join(' ')
              }
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-4 rounded-3xl border border-[#d9e6f2] bg-[#f7fafc] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Phase 2</p>
        <p className="mt-1 text-sm font-semibold text-[#102236]">Commercial foundation</p>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">Shell only. Data workflows remain intentionally isolated for now.</p>
      </div>
    </aside>
  )
}

export default CommercialSidebar
