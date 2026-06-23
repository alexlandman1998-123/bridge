import { Bell, UserCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getMobileRouteTitle } from '../../config/mobileShell'
import { useWorkspace } from '../../context/WorkspaceContext'

export default function MobileHeader() {
  const location = useLocation()
  const workspace = useWorkspace()
  const title = getMobileRouteTitle(location.pathname, workspace)

  return (
    <header className="sticky top-0 z-40 border-b border-[#e4ebf2] bg-white/95 px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex max-w-[520px] items-center gap-3">
        <Link to="/mobile/home" className="flex min-w-0 flex-1 items-center gap-3 text-inherit">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#10243a] text-sm font-bold text-white">
            A9
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase text-[#1f7a5a]">Arch9</span>
            <span className="block truncate text-[18px] font-semibold leading-tight text-[#10243a]">{title}</span>
          </span>
        </Link>

        <Link
          to="/mobile/notifications"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d7e0ea] bg-white text-[#10243a] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </Link>
        <Link
          to="/mobile/more"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d7e0ea] bg-white text-[#10243a] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
          aria-label="Profile"
        >
          <UserCircle className="h-5 w-5" />
        </Link>
      </div>
    </header>
  )
}
