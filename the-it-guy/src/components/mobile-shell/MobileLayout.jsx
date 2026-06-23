import { Outlet } from 'react-router-dom'
import MobileBottomNav from './MobileBottomNav'
import MobileHeader from './MobileHeader'

export default function MobileLayout({ onLogout = null }) {
  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#10243a]">
      <MobileHeader />
      <main className="mx-auto w-full max-w-[520px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
        <Outlet context={{ onLogout }} />
      </main>
      <MobileBottomNav />
    </div>
  )
}
