import { Bell, UserCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'

export default function MobileHeader() {
  const workspace = useWorkspace()
  const workspaceName = workspace.workspace?.name || workspace.currentWorkspace?.name || 'Workspace'
  const unreadCount = 3

  return (
    <header className="sticky top-0 z-30 bg-[#f6f8fb]/88 px-5 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[520px] items-center gap-3">
        <Link to="/mobile/home" className="flex min-w-0 flex-1 items-center gap-3 text-inherit">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[#10243a] text-sm font-bold text-white shadow-[0_10px_22px_rgba(15,23,42,0.16)]">
            A9
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-[#10243a]">ARCH9</span>
            <span className="block max-w-[190px] truncate text-[12px] font-medium leading-tight text-[#60758d]">{workspaceName}</span>
          </span>
        </Link>

        <Link
          to="/mobile/notifications"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e4ebf2] bg-white text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1f7a5a] px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </Link>
        <Link
          to="/mobile/more"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e4ebf2] bg-white text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
          aria-label="Profile"
        >
          <UserCircle className="h-5 w-5" />
        </Link>
      </div>
    </header>
  )
}
