import { Bell, UserCircle } from 'lucide-react'
import { useState } from 'react'
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
    'Arch9 Realty'
  const primaryLogoUrl =
    normalizeText(branding.logoUrl) ||
    normalizeText(simpleWorkspace.logoUrl || simpleWorkspace.logo_url) ||
    normalizeText(currentWorkspace.logoUrl || currentWorkspace.logo_url || currentWorkspace.raw?.logo_url)
  const iconLogoUrl =
    normalizeText(branding.logoIconUrl) ||
    normalizeText(simpleWorkspace.logoIconUrl || simpleWorkspace.logo_icon_url) ||
    normalizeText(currentWorkspace.logoIconUrl || currentWorkspace.logo_icon_url)
  const logoUrl = primaryLogoUrl || iconLogoUrl
  const initials = getInitials(workspaceName)
  const [logoLoadFailure, setLogoLoadFailure] = useState({ url: '', failed: false })
  const showLogo = Boolean(logoUrl) && !(logoLoadFailure.url === logoUrl && logoLoadFailure.failed)
  const unreadCount = 3

  return (
    <header className="sticky top-0 z-30 border-b border-[#dde6ef]/80 bg-[#f7f9fc]/94 px-5 pb-7 pt-[max(1.35rem,env(safe-area-inset-top))] backdrop-blur-xl" data-mobile-header>
      <div className="mx-auto flex max-w-[520px] items-center gap-4">
        <Link to="/mobile/home" className="flex min-w-0 flex-1 items-center text-inherit" aria-label={`${workspaceName} mobile home`}>
          {showLogo ? (
            <span className="flex h-16 min-w-0 max-w-[240px] items-center">
              <img
                key={logoUrl}
                src={logoUrl}
                alt={`${workspaceName} logo`}
                className="block max-h-14 w-auto max-w-full object-contain object-left"
                onLoad={() => setLogoLoadFailure({ url: logoUrl, failed: false })}
                onError={() => setLogoLoadFailure({ url: logoUrl, failed: true })}
              />
            </span>
          ) : (
            <>
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-[#d9e3eb] bg-white text-base font-bold text-[#10243a] shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
                <span className="flex h-full w-full items-center justify-center bg-[#10243a] text-[15px] text-white">{initials}</span>
              </span>
              <span className="ml-3 min-w-0">
                <span className="block max-w-[210px] truncate text-[18px] font-bold leading-tight text-[#10243a]">{workspaceName}</span>
                <span className="block text-[12px] font-bold uppercase tracking-[0.08em] text-[#6f8192]">Agency workspace</span>
              </span>
            </>
          )}
        </Link>

        <Link
          to="/mobile/notifications"
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#e4ebf2] bg-white text-[#10243a] shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
          aria-label="Notifications"
        >
          <Bell className="h-8 w-8" />
          {unreadCount ? (
            <span className="absolute -right-0.5 -top-1 flex h-8 min-w-8 items-center justify-center rounded-full bg-[#1f8b65] px-2 text-[15px] font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </Link>
        <Link
          to="/mobile/more"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#e4ebf2] bg-white text-[#10243a] shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
          aria-label="Profile"
        >
          <UserCircle className="h-8 w-8" />
        </Link>
      </div>
    </header>
  )
}
