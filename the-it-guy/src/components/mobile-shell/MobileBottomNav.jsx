import {
  Bell,
  BriefcaseBusiness,
  Building2,
  FileText,
  FolderKanban,
  Home,
  LayoutGrid,
  LineChart,
  MoreHorizontal,
  ScrollText,
  UsersRound,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { getMobileNavItems } from '../../config/mobileShell'
import { useWorkspace } from '../../context/WorkspaceContext'

const ICONS = {
  home: Home,
  transactions: BriefcaseBusiness,
  leads: UsersRound,
  notifications: Bell,
  more: MoreHorizontal,
  reports: LineChart,
  matters: ScrollText,
  documents: FileText,
  applications: FolderKanban,
  pipeline: LayoutGrid,
  listings: Building2,
  deals: BriefcaseBusiness,
}

export default function MobileBottomNav() {
  const workspace = useWorkspace()
  const items = getMobileNavItems(workspace)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#dfe7ef] bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_32px_rgba(15,23,42,0.08)] backdrop-blur" aria-label="Mobile navigation">
      <div className="mx-auto grid max-w-[520px] grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.key] || LayoutGrid
          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition',
                  isActive ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'text-[#60758d] active:bg-[#f1f5f9]',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
