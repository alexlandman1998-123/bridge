import { Bell, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { fetchMyNotifications } from '../../lib/headerNotificationsApi.js'
import { mapDesktopRouteToMobile } from '../../config/mobileRouteMappings.js'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import useDismissableMenu from '../../hooks/useDismissableMenu.js'
import './mobile-notifications.css'

function notificationDestination(item, developer) {
  const data = item.eventData || {}
  const leadId = data.leadId || data.lead_id
  if (leadId) return `${developer ? '/mobile/developer/leads' : '/mobile/lead'}/${encodeURIComponent(leadId)}`
  const path = [data.applicationPath, data.actionRoute, data.path, data.href].find((value) => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//'))
  if (path) {
    const mapped = mapDesktopRouteToMobile(path)
    if (!mapped.includes('mobileNotice=unsupported')) return mapped
  }
  return developer ? '/mobile/developer/leads' : '/mobile/leads'
}

function formatTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  return new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function MobileNotificationBell() {
  const workspace = useWorkspace()
  const organisation = useOptionalOrganisation()
  const location = useLocation()
  const userId = workspace.profile?.id || workspace.profile?.userId || ''
  const scopeKey = `${userId}:${organisation?.organisation?.id || workspace.currentWorkspace?.id || workspace.workspace?.id || ''}:${workspace.role || ''}`
  const developer = resolveMobileRoleCategory(workspace) === 'developer'
  const [openAt, setOpenAt] = useState(null)
  const open = openAt?.location === location.key && openAt?.scope === scopeKey
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const bellRef = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const panelId = useId()
  const refs = useMemo(() => [bellRef, panelRef], [])
  const dismiss = useCallback(() => setOpenAt(null), [])
  useDismissableMenu({ open, refs, onDismiss: dismiss })

  useEffect(() => {
    if (!open) return undefined
    const panel = panelRef.current
    const bell = bellRef.current
    closeRef.current?.focus()
    return () => {
      if (panel?.contains(document.activeElement) || document.activeElement === document.body) bell?.focus()
    }
  }, [open])

  useEffect(() => {
    let active = true
    if (!userId) return undefined
    // Unread-only reads bypass the desktop feed's shared cache, keeping each
    // mobile identity's badge and alerts isolated without marking anything read.
    fetchMyNotifications({ userId, unreadOnly: true, limit: 100 })
      .then((snapshot) => { if (active) setResult({ scope: scopeKey, snapshot, loadedAt: Date.now() }) })
      .catch(() => { if (active) setResult({ scope: scopeKey, error: 'We couldn’t load notifications. Try again.' }) })
    return () => { active = false }
  }, [userId, scopeKey, retry])

  const ready = result?.scope === scopeKey
  const notifications = ready && !result.error ? result.snapshot?.notifications || [] : []
  const unreadCount = ready && !result.error ? result.snapshot?.unreadCount || 0 : 0
  function refresh() { setResult(null); setRetry((value) => value + 1) }

  return <>
    <button ref={bellRef} type="button" className="mobile-notification-bell" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={() => {
      if (open) dismiss()
      else {
        setOpenAt({ location: location.key, scope: scopeKey })
        if (ready && (result.error || Date.now() - result.loadedAt > 15_000)) refresh()
      }
    }}>
      <Bell size={22} strokeWidth={1.8} aria-hidden="true" />
      {unreadCount > 0 && <span className="mobile-notification-badge" aria-label={`${unreadCount} unread notifications`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section ref={panelRef} id={panelId} className="mobile-notification-dropdown" role="dialog" aria-label="Notifications">
      <header><div><h2>Notifications</h2><p>Unread lead updates</p></div><div className="mobile-notification-tools"><button type="button" aria-label="Refresh notifications" onClick={refresh}><RefreshCw size={16} aria-hidden="true" /></button><button ref={closeRef} type="button" aria-label="Close notifications" onClick={dismiss}><X size={18} aria-hidden="true" /></button></div></header>
      <div className="mobile-notification-content" aria-busy={!ready && Boolean(userId)}>
        {!userId ? <p className="mobile-notification-state">Select your workspace to view notifications.</p> : !ready ? <p className="mobile-notification-state" role="status">Loading notifications…</p> : result.error ? <div className="mobile-notification-state" role="alert"><p>{result.error}</p><button type="button" onClick={refresh}>Try again</button></div> : notifications.length ? <ul>{notifications.map((item) => <li key={item.id}><Link to={notificationDestination(item, developer)} onClick={dismiss}><span className="mobile-notification-dot" aria-hidden="true" /><span className="mobile-notification-copy"><strong>{item.title || 'New lead received'}</strong>{item.message && <span>{item.message}</span>}{formatTime(item.createdAt) && <time dateTime={item.createdAt}>{formatTime(item.createdAt)} · SAST</time>}</span><ChevronRight size={16} aria-hidden="true" /></Link></li>)}</ul> : <div className="mobile-notification-empty"><span><Bell size={22} strokeWidth={1.5} aria-hidden="true" /></span><h3>You’re all caught up</h3><p>No unread lead notifications.</p></div>}
      </div>
    </section>}
  </>
}
