import { NavLink } from 'react-router-dom'

const EMPTY_ITEMS = Object.freeze([])

export default function ModuleSegmentedNav({ items = EMPTY_ITEMS, ariaLabel = 'Module navigation', className = '', singleRow = false }) {
  const layoutStyle = singleRow ? { gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` } : undefined
  return (
    <nav className={`grid min-h-11 w-full ${singleRow ? 'max-w-none' : 'max-w-[640px] grid-cols-3'} gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 ${className}`.trim()} style={layoutStyle} aria-label={ariaLabel}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[9px] border px-2.5 text-xs font-semibold transition sm:px-5 sm:text-sm ${
              isActive
                ? 'border-slate-200 bg-white text-slate-950 shadow-[0_3px_10px_rgba(15,23,42,0.09)]'
                : 'border-transparent bg-transparent text-slate-500 hover:bg-white/65 hover:text-slate-800'
            }`}
          >
            {Icon ? <Icon className="shrink-0 opacity-80" size={17} aria-hidden="true" /> : null}
            <span className="truncate">{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
