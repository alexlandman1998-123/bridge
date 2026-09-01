import { NavLink } from 'react-router-dom'

const CANVASSING_WORKSPACE_TABS = [
  { id: 'prospects', label: 'Current Prospects', to: '/pipeline/canvassing', end: true },
  { id: 'property-search', label: 'Property Search', to: '/pipeline/canvassing/property-search' },
  { id: 'property-reports', label: 'Property Reports', to: '/pipeline/canvassing/property-reports' },
]

export default function CanvassingWorkspaceTabs() {
  return (
    <nav className="mt-5 overflow-x-auto border-t border-slate-100 pt-1" aria-label="Canvassing workspaces">
      <div className="flex min-w-max items-center gap-1">
        {CANVASSING_WORKSPACE_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `relative inline-flex min-h-12 items-center px-3 text-sm font-semibold transition ${
              isActive
                ? 'text-[#1769dc] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#1769dc]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
