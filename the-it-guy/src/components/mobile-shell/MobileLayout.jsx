import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import MobileBottomNav from './MobileBottomNav'
import MobileHeader from './MobileHeader'

export default function MobileLayout({ onLogout = null }) {
  const location = useLocation()
  const scrollRootRef = useRef(null)

  useEffect(() => {
    scrollRootRef.current?.scrollTo({ top: 0, left: 0 })
  }, [location.pathname, location.search])

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(circle_at_18%_10%,rgba(31,122,90,0.08),transparent_32%),linear-gradient(180deg,#f8fbfe_0%,#f1f5f9_100%)] text-[#10243a]" data-mobile-shell>
      <MobileHeader />
      <main
        ref={scrollRootRef}
        className="mx-auto min-h-0 w-full max-w-[520px] flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-0 [-webkit-overflow-scrolling:touch]"
        data-mobile-scroll-root
      >
        <Outlet context={{ onLogout }} />
      </main>
      <MobileBottomNav />
    </div>
  )
}
