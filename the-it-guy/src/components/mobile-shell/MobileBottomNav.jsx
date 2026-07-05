import {
  BriefcaseBusiness,
  FileText,
  Home,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Plus,
  StickyNote,
  Upload,
  CalendarPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getMobileNavItems } from '../../config/mobileShell'
import { useWorkspace } from '../../context/WorkspaceContext'

const ICONS = {
  home: Home,
  transactions: BriefcaseBusiness,
  create: Plus,
  activity: MessageCircle,
  leads: UsersRound,
  more: MoreHorizontal,
  pipeline: LayoutGrid,
  deals: BriefcaseBusiness,
}

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
  const items = getMobileNavItems(workspace)
  const [createOpen, setCreateOpen] = useState(false)

  function openAction(action) {
    setCreateOpen(false)
    navigate(action.to)
  }

  return (
    <>
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

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2" aria-label="Mobile navigation" data-mobile-bottom-nav>
        <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end gap-1 rounded-[24px] border border-[#dfe7ef]/80 bg-white/92 px-2 py-1.5 shadow-[0_-10px_28px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          {items.map((item) => {
            const Icon = ICONS[item.key] || LayoutGrid
            if (item.key === 'create') {
              return (
                <button
                  key={item.key}
                  type="button"
                  className="-mt-6 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-[#1f7a5a]"
                  onClick={() => setCreateOpen(true)}
                  aria-label="Open create menu"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border-[4px] border-[#f6f8fb] bg-[#1f7a5a] text-white shadow-[0_12px_24px_rgba(31,122,90,0.26)]">
                    <Plus className="h-6 w-6" />
                  </span>
                  <span className="sr-only">Create</span>
                </button>
              )
            }
            return (
              <NavLink
                key={item.key}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-[18px] px-0.5 text-[10px] font-semibold transition',
                    isActive ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'text-[#60758d] active:bg-[#f1f5f9]',
                  ].join(' ')
                }
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </>
  )
}
