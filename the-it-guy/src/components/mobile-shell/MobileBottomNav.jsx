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
  { key: 'lead', label: 'New Lead', body: 'Capture a buyer or seller lead.', icon: UsersRound, to: '/mobile/leads' },
  { key: 'transaction', label: 'New Transaction', body: 'Start a deal from the field.', icon: BriefcaseBusiness, to: '/mobile/transactions' },
  { key: 'document', label: 'Scan Document', body: 'Camera capture, queue and sync field documents.', icon: Upload, to: '/mobile/documents' },
  { key: 'note', label: 'Add Note', body: 'Record a quick update.', icon: StickyNote, to: '/mobile/activity' },
  { key: 'follow-up', label: 'Schedule Follow-up', body: 'Set the next reminder.', icon: CalendarPlus, to: '/mobile/tasks' },
  { key: 'prospect', label: 'Add Prospect', body: 'Create a prospecting lead.', icon: FileText, to: '/mobile/leads' },
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
                  <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">Create</p>
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

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2" aria-label="Mobile navigation">
        <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end gap-1 rounded-[30px] border border-white/70 bg-white/88 px-2 py-2 shadow-[0_-14px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          {items.map((item) => {
            const Icon = ICONS[item.key] || LayoutGrid
            if (item.key === 'create') {
              return (
                <button
                  key={item.key}
                  type="button"
                  className="-mt-8 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-[#1f7a5a]"
                  onClick={() => setCreateOpen(true)}
                  aria-label="Open create menu"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-[#f6f8fb] bg-[#1f7a5a] text-white shadow-[0_14px_28px_rgba(31,122,90,0.32)]">
                    <Plus className="h-7 w-7" />
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
                    'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[22px] px-0.5 text-[10px] font-semibold transition',
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
