import {
  ArrowUpLeft,
  BriefcaseBusiness,
  Building2,
  Home,
  LayoutGrid,
  MessageCircle,
  CalendarDays,
  ChevronRight,
  Plus,
  QrCode,
  StickyNote,
  Upload,
  CalendarPlus,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getMobileNavItems, getMobilePageMenuItems, resolveMobileRoleCategory } from '../../config/mobileShell'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useMobileLeadCreate } from './mobileLeadCreateContext.js'
import { useMobileAppointmentCreate } from './mobileAppointmentCreateContext.js'
import { isMobileCreateType } from './mobileCreateConfig'
import './mobile-navigation.css'
import './mobile-connect-sheet.css'

const MobileConnectSheet = lazy(() => import('./MobileConnectSheet.jsx'))
const MobileContactCreateSheet = lazy(() => import('./MobileContactCreateSheet.jsx'))

const ICONS = {
  home: Home,
  transactions: BriefcaseBusiness,
  developments: Building2,
  create: Plus,
  activity: MessageCircle,
  leads: UsersRound,
  more: ArrowUpLeft,
  listings: Building2,
  calendar: CalendarDays,
  pipeline: LayoutGrid,
  deals: BriefcaseBusiness,
}

const NAV_ITEM_CLASS = 'flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] px-0.5 text-[10px] font-medium leading-[1.2] transition-colors max-[360px]:px-0 max-[360px]:text-[9px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f8b65]'

const CREATE_ACTIONS = [
  { key: 'lead', label: 'New lead', icon: UsersRound, to: '/mobile/leads?create=lead' },
  { key: 'listing', label: 'New listing', icon: Building2, to: '/mobile/listings/new' },
  { key: 'appointment', label: 'New appointment', icon: CalendarDays, to: '/mobile/calendar' },
  { key: 'contact', label: 'New contact', icon: UserPlus, to: '/clients' },
]

export default function MobileBottomNav() {
  const workspace = useWorkspace()
  const leadCreate = useMobileLeadCreate()
  const appointmentCreate = useMobileAppointmentCreate()
  const navigate = useNavigate()
  const location = useLocation()
  const items = getMobileNavItems(workspace)
  const menuItems = getMobilePageMenuItems(workspace)
  const [createOpen, setCreateOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [contactLocation, setContactLocation] = useState(null)
  const supportsContactCard = ['agent', 'principal', 'default'].includes(resolveMobileRoleCategory(workspace))
  const [menuLocation, setMenuLocation] = useState(null)
  const menuOpen = menuLocation === location.key
  const menuRef = useRef(null)
  const activeCreateType = new URLSearchParams(location.search).get('create') || ''
  const createSheetOpen = isMobileCreateType(activeCreateType)
  const matchesPage = (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  const menuActive = menuOpen || (menuItems.some(matchesPage) && !items.some((item) => item.key !== 'more' && matchesPage(item)))

  useEffect(() => {
    if (!menuOpen) return undefined
    const dialog = menuRef.current
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [menuOpen])

  function openAction(action) {
    setCreateOpen(false)
    if (action.key === 'appointment' && appointmentCreate?.openAppointmentCreate) { appointmentCreate.openAppointmentCreate(); return }
    if (action.key === 'contact') {
      if (workspace.role === 'agent') setContactLocation(location.key)
      else navigate('/clients', { state: { openAddClient: true } })
      return
    }
    if (action.key === 'lead' && resolveMobileRoleCategory(workspace) !== 'developer' && leadCreate) { leadCreate.openLeadCreate(); return }
    navigate(action.key === 'lead' && resolveMobileRoleCategory(workspace) === 'developer' ? '/mobile/developer/leads?create=lead' : action.to)
  }

  return (
    <>
      <dialog ref={menuRef} id="mobile-page-menu" className="mobile-page-menu" aria-label="Menu" onCancel={() => setMenuLocation(null)} onClick={(event) => {
        if (event.target !== menuRef.current) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setMenuLocation(null)
      }}>
        <div className="mobile-page-menu-header"><button type="button" aria-label="Close page menu" onClick={() => setMenuLocation(null)}><X size={19} aria-hidden="true" /></button></div>
        <nav aria-label="More pages">
          {menuItems.map((item) => {
            const Icon = ICONS[item.key]
            return <Link key={item.key} to={item.to} onClick={() => setMenuLocation(null)} aria-current={matchesPage(item) ? 'page' : undefined}><span className="mobile-page-menu-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span><span>{item.label}</span><ChevronRight size={17} aria-hidden="true" /></Link>
          })}
        </nav>
        {supportsContactCard && <button type="button" className="mobile-connect-menu-button" onClick={() => { setMenuLocation(null); setConnectOpen(true) }}><QrCode size={25} aria-hidden="true" /><span><strong>Connect with me</strong><small>Scan to save my contact</small></span><ChevronRight size={17} aria-hidden="true" /></button>}
      </dialog>
      {connectOpen && <Suspense fallback={null}><MobileConnectSheet workspace={workspace} onClose={() => setConnectOpen(false)} /></Suspense>}
      {contactLocation === location.key && <Suspense fallback={null}><MobileContactCreateSheet onClose={() => setContactLocation(null)} /></Suspense>}
      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-[#10243a]/28 backdrop-blur-sm" onClick={() => setCreateOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[520px] rounded-t-[12px] border border-[#e2e7e3] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_32px_rgba(15,23,42,0.12)]"
            role="dialog" aria-modal="true" aria-label="Add new"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto max-w-[520px]">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center bg-white text-black"
                  onClick={() => setCreateOpen(false)}
                  aria-label="Close create menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mobile-quick-create-actions">
                {CREATE_ACTIONS.map((action) => {
                  const Icon = action.icon
                  return <button key={action.key} type="button" className="mobile-quick-create-action" onClick={() => openAction(action)} data-mobile-create-action={action.key} disabled={action.key === 'appointment' && Boolean(appointmentCreate) && !appointmentCreate.openAppointmentCreate}>
                    <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
                    <span>{action.label}</span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!createSheetOpen ? (
        <nav className="relative z-40 shrink-0 px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2" aria-label="Mobile navigation" data-mobile-bottom-nav>
          <div className="mobile-glass-nav mx-auto grid max-w-[520px] grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_64px_minmax(0,1.25fr)_minmax(0,1fr)] items-center gap-x-1 rounded-[26px] border bg-white px-1 py-2 max-[360px]:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_56px_minmax(0,1.25fr)_minmax(0,1fr)] max-[360px]:gap-x-0.5">
            {items.map((item) => {
              const Icon = ICONS[item.key] || LayoutGrid
              if (item.key === 'more') {
                return <button key={item.key} type="button" className={`${NAV_ITEM_CLASS} ${menuActive ? 'bg-[#e5f6ed] text-[#1f8b65]' : 'text-[#60758d] active:bg-[#f1f5f9]'}`} onClick={() => { setCreateOpen(false); setMenuLocation(location.key) }} aria-label="Open page menu" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="mobile-page-menu"><ArrowUpLeft className="h-5 w-5 shrink-0" strokeWidth={1.85} aria-hidden="true" /><span>Menu</span></button>
              }
              if (item.key === 'create') {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="flex h-[54px] w-12 items-center justify-center justify-self-center rounded-[18px] text-[#1f8b65] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f8b65]"
                    onClick={() => setCreateOpen(true)}
                    aria-label="Open add menu"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1f8b65] text-white shadow-[0_4px_12px_rgba(31,139,101,0.16)]">
                      <Plus className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="sr-only">Add</span>
                  </button>
                )
              }
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    [
                      NAV_ITEM_CLASS,
                      isActive ? 'bg-[#e5f6ed] text-[#1f8b65]' : 'text-[#60758d] active:bg-[#f1f5f9]',
                    ].join(' ')
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.85} aria-hidden="true" />
                  <span className="block w-full min-w-0 truncate text-center">{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        </nav>
      ) : null}
    </>
  )
}
