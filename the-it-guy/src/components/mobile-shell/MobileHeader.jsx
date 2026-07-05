import { Bell, UserCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function getInitials(name = '') {
  const words = normalizeText(name).split(/\s+/).filter(Boolean)
  if (!words.length) return 'B9'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase()
}

export default function MobileHeader() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const branding = organisationContext?.branding || {}
  const currentWorkspace = workspace.currentWorkspace || {}
  const simpleWorkspace = workspace.workspace || {}
  const workspaceName =
    normalizeText(branding.organisationLabel) ||
    normalizeText(simpleWorkspace.displayName || simpleWorkspace.display_name || simpleWorkspace.name) ||
    normalizeText(currentWorkspace.displayName || currentWorkspace.display_name || currentWorkspace.name) ||
    'Bridge9 Realty'
  const logoUrl =
    normalizeText(branding.logoIconUrl) ||
    normalizeText(branding.logoUrl) ||
    normalizeText(simpleWorkspace.logoIconUrl || simpleWorkspace.logo_icon_url || simpleWorkspace.logoUrl || simpleWorkspace.logo_url) ||
    normalizeText(currentWorkspace.logoIconUrl || currentWorkspace.logo_icon_url || currentWorkspace.logoUrl || currentWorkspace.logo_url || currentWorkspace.raw?.logo_url)
  const initials = getInitials(workspaceName)
  const unreadCount = 3

  return (
    <header className="sticky top-0 z-30 border-b border-[#e6edf3]/80 bg-[#f6f8fb]/92 px-5 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur-xl" data-mobile-header>
      <div className="mx-auto flex max-w-[520px] items-center gap-3">
        <Link to="/mobile/home" className="flex min-w-0 flex-1 items-center gap-3 text-inherit">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#d9e3eb] bg-white text-sm font-bold text-[#10243a] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
            {logoUrl ? (
              <img src={logoUrl} alt={`${workspaceName} logo`} className="h-full w-full object-contain p-1.5" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#10243a] text-[13px] text-white">{initials}</span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[210px] truncate text-[14px] font-semibold leading-tight text-[#10243a]">{workspaceName}</span>
            <span className="block text-[11px] font-semibold uppercase text-[#6f8192]">Agency workspace</span>
          </span>
        </Link>

        <Link
          to="/mobile/notifications"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e4ebf2] bg-white text-[#10243a] shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1f7a5a] px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </Link>
        <Link
          to="/mobile/more"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e4ebf2] bg-white text-[#10243a] shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
          aria-label="Profile"
        >
          <UserCircle className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  )
}
