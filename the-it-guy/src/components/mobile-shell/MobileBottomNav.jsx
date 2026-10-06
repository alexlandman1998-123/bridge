import {
  ArrowUpLeft,
  BriefcaseBusiness,
  Building2,
  FileText,
  Home,
  LayoutGrid,
  MessageCircle,
  CalendarDays,
  ChevronRight,
  Plus,
  StickyNote,
  Upload,
  CalendarPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getMobileNavItems, getMobilePageMenuItems, resolveMobileRoleCategory } from '../../config/mobileShell'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isMobileCreateType } from './mobileCreateConfig'
import './mobile-navigation.css'

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

const NAV_ITEM_CLASS = 'flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] px-0.5 text-[10px] font-medium leading-[1.2] transition-colors max-[360px]:text-[9px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f8b65]'

const CREATE_ACTIONS = [
  { key: 'lead', label: 'New Lead', body: 'Capture a buyer or seller lead.', icon: UsersRound, to: '/mobile/leads?create=lead' },
  { key: 'transaction', label: 'New Transaction', body: 'Start a deal from the field.', icon: BriefcaseBusiness, to: '/mobile/transactions?create=transaction' },
  { key: 'document', label: 'Scan Document', body: 'Camera capture, queue and sync field documents.', icon: Upload, to: '/mobile/documents?create=document' },
  { key: 'note', label: 'Add Note', body: 'Record a quick update.', icon: StickyNote, to: '/mobile/activity?create=note' },
  { key: 'follow-up', label: 'Schedule Follow-up', body: 'Set the next reminder.', icon: CalendarPlus, to: '/mobile/tasks?create=follow-up' },
  { key: 'prospect', label: 'Add Prospect', body: 'Create a prospecting lead.', icon: FileText, to: '/mobile/leads?create=prospect' },
]

export default function MobileBottomNav() {
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const items = getMobileNavItems(workspace)
  const menuItems = getMobilePageMenuItems(workspace)
  const [createOpen, setCreateOpen] = useState(false)
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
    navigate(action.key === 'lead' && resolveMobileRoleCategory(workspace) === 'developer' ? '/mobile/developer/leads?create=lead' : action.to)
  }

  return (
    <>
      <dialog ref={menuRef} id="mobile-page-menu" className="mobile-page-menu" aria-labelledby="mobile-page-menu-title" onCancel={() => setMenuLocation(null)} onClick={(event) => {
        if (event.target !== menuRef.current) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setMenuLocation(null)
      }}>
        <div className="mobile-page-menu-header"><h2 id="mobile-page-menu-title">Pages</h2><button type="button" aria-label="Close page menu" onClick={() => setMenuLocation(null)}><X size={19} aria-hidden="true" /></button></div>
        <nav aria-label="More pages">
          {menuItems.map((item) => {
            const Icon = ICONS[item.key]
            return <Link key={item.key} to={item.to} onClick={() => setMenuLocation(null)} aria-current={matchesPage(item) ? 'page' : undefined}><span className="mobile-page-menu-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span><span>{item.label}</span><ChevronRight size={17} aria-hidden="true" /></Link>
          })}
        </nav>
      </dialog>
      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-[#10243a]/28 backdrop-blur-sm" onClick={() => setCreateOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[32px] border border-white/70 bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-22px_60px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto max-w-[520px]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase text-[#1f7a5a]">Create</p>
                  <h2 className="text-[22px] font-semibold text-[#10243a]">Quick action</h2>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e0ea] bg-white text-[#10243a]"
                  onClick={() => setCreateOpen(false)}
                  aria-label="Close create menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid gap-3">
                {CREATE_ACTIONS.map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.key}
                      type="button"
                      className="flex min-h-[72px] items-center gap-4 rounded-[24px] border border-[#e4ebf2] bg-[#fbfcfd] px-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                      onClick={() => openAction(action)}
                      data-mobile-create-action={action.key}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#e8f6ef] text-[#1f7a5a]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-[#10243a]">{action.label}</span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-[#60758d]">{action.body}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!createSheetOpen ? (
        <nav className="relative z-40 shrink-0 px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2" aria-label="Mobile navigation" data-mobile-bottom-nav>
          <div className="mx-auto grid max-w-[520px] grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_48px_minmax(0,1.25fr)_minmax(0,1fr)] items-center rounded-[26px] border border-[#dfe7ef] bg-white px-1 py-2 shadow-[0_-6px_24px_rgba(15,23,42,0.07)]">
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
                    aria-label="Open create menu"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1f8b65] text-white shadow-[0_4px_12px_rgba(31,139,101,0.16)]">
                      <Plus className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="sr-only">Create</span>
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
