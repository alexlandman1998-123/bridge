import { BriefcaseBusiness, Compass, Home, Search, ShieldCheck } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const DEMO_NAV_ITEMS = [
  { key: 'workspace', label: 'Workspace', to: '/mobile-demo/transaction/demo-transaction', icon: BriefcaseBusiness },
  { key: 'search', label: 'Search', to: '/mobile-demo/search', icon: Search },
]

export default function MobileDemoLayout() {
  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#10243a]" data-mobile-demo-shell>
      <header className="sticky top-0 z-30 border-b border-white/70 bg-[#f6f8fb]/90 px-5 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[520px] items-center justify-between gap-3">
          <NavLink
            to="/mobile-demo/transaction/demo-transaction"
            className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl px-1 text-left active:bg-white"
            aria-label="Open mobile demo workspace"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#10243a] text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
              <Home className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">Live mobile demo</span>
              <span className="block truncate text-[15px] font-semibold text-[#10243a]">Premium transaction portal</span>
            </span>
          </NavLink>
          <div className="flex items-center gap-2">
            <span className="hidden min-h-10 items-center gap-2 rounded-full border border-[#d7e0ea] bg-white px-3 text-[12px] font-semibold text-[#60758d] min-[420px]:inline-flex">
              <ShieldCheck className="h-4 w-4 text-[#1f7a5a]" />
              Demo data
            </span>
            <NavLink
              to="/mobile-demo/search"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d7e0ea] bg-white text-[#10243a] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
              aria-label="Search demo"
            >
              <Search className="h-5 w-5" />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[520px] px-5 pb-[calc(7.75rem+env(safe-area-inset-bottom))] pt-3">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2" aria-label="Mobile demo navigation">
        <div className="mx-auto grid max-w-[520px] grid-cols-3 items-center gap-1 rounded-[30px] border border-white/70 bg-white/90 px-2 py-2 shadow-[0_-14px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <NavLink
            to="/mobile-demo/transaction/demo-transaction"
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[22px] px-0.5 text-[10px] font-semibold text-[#60758d] transition active:bg-[#f1f5f9]"
          >
            <Home className="h-5 w-5" />
            <span>Demo</span>
          </NavLink>
          {DEMO_NAV_ITEMS.map((item) => {
            const Icon = item.icon || Compass
            return (
              <NavLink
                key={item.key}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[22px] px-0.5 text-[10px] font-semibold transition',
                    isActive ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'text-[#60758d] active:bg-[#f1f5f9]',
                  ].join(' ')
                }
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
