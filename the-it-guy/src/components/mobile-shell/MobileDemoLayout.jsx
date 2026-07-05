import { BriefcaseBusiness, CircleDollarSign, Compass, Home, Search, ShieldCheck } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const PORTAL_TABS = [
  { key: 'overview', label: 'Overview', to: '/mobile-demo/home', icon: Home, match: ['/mobile-demo', '/mobile-demo/home'] },
  { key: 'deal', label: 'Deal', to: '/mobile-demo/transaction/demo-transaction', icon: BriefcaseBusiness, match: ['/mobile-demo/transaction'] },
  { key: 'finance', label: 'Finance', to: '/mobile-demo/application/demo-application', icon: CircleDollarSign, match: ['/mobile-demo/application'] },
  { key: 'team', label: 'Team', to: '/mobile-demo/matter/demo-matter', icon: ShieldCheck, match: ['/mobile-demo/matter', '/mobile-demo/lead'] },
  { key: 'search', label: 'Search', to: '/mobile-demo/search', icon: Search, match: ['/mobile-demo/search'] },
]

function isTabActive(pathname = '', tab = {}) {
  return tab.match?.some((pattern) => (pattern === '/mobile-demo' ? pathname === pattern : pathname.startsWith(pattern))) || false
}

export default function MobileDemoLayout() {
  const location = useLocation()
  const isHome = location.pathname === '/mobile-demo' || location.pathname === '/mobile-demo/home'

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#10243a]" data-mobile-demo-shell>
      {!isHome ? (
        <header className="sticky top-0 z-30 border-b border-white/70 bg-[#f6f8fb]/90 px-5 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[520px] items-center justify-between gap-3">
            <NavLink
              to="/mobile-demo/home"
              className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl px-1 text-left active:bg-white"
              aria-label="Open mobile home"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#10243a] text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
                <Home className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">Arch9</span>
                <span className="block truncate text-[15px] font-semibold text-[#10243a]">Transaction Portal</span>
              </span>
            </NavLink>
            <NavLink
              to="/mobile-demo/search"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d7e0ea] bg-white text-[#10243a] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
              aria-label="Search portal"
            >
              <Search className="h-5 w-5" />
            </NavLink>
          </div>
        </header>
      ) : null}

      <main className={`mx-auto w-full max-w-[520px] px-5 pb-[calc(7.75rem+env(safe-area-inset-bottom))] ${isHome ? 'pt-[max(0.9rem,env(safe-area-inset-top))]' : 'pt-3'}`}>
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2" aria-label="Portal tabs" data-mobile-production-tabs>
        <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end gap-1 rounded-[32px] border border-white/75 bg-white/92 px-2 py-2 shadow-[0_-16px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          {PORTAL_TABS.map((item) => {
            const Icon = item.icon || Compass
            const active = isTabActive(location.pathname, item)
            const isPrimary = item.key === 'deal'
            return (
              <NavLink
                key={item.key}
                to={item.to}
                className={() =>
                  [
                    'relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[22px] px-0.5 text-[10px] font-semibold transition',
                    active ? 'text-[#10243a]' : 'text-[#60758d] active:bg-[#f1f5f9]',
                    isPrimary ? '-mt-5' : '',
                  ].join(' ')
                }
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={[
                    'flex items-center justify-center rounded-2xl transition',
                    isPrimary ? 'h-14 w-14 shadow-[0_14px_28px_rgba(31,122,90,0.30)]' : 'h-9 w-9',
                    active ? 'bg-[#1f7a5a] text-white' : isPrimary ? 'bg-[#10243a] text-white' : 'bg-transparent text-current',
                  ].join(' ')}
                >
                  <Icon className={isPrimary ? 'h-6 w-6' : 'h-5 w-5'} />
                </span>
                <span className={isPrimary ? 'mt-0.5' : ''}>{item.label}</span>
                {active ? <span className="absolute bottom-0 h-1 w-5 rounded-full bg-[#1f7a5a]" /> : null}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
