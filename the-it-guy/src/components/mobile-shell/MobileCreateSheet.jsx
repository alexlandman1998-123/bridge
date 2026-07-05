import { Check, Clock3, FileText, MessageCircle, Plus, ScrollText, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { addOfflineDraft } from '../../services/mobileProductivityService'
import { trackMobileMetric } from '../../services/observability/monitoring'
import { MobileCard } from './MobileShellStates'

const CREATE_CONFIG = {
  lead: {
    eyebrow: 'Lead Capture',
    title: 'New lead',
    body: 'Capture the first contact details and sync it back to the agency pipeline.',
    module: 'lead',
    draftType: 'Lead Capture',
    primaryLabel: 'Lead name',
    primaryPlaceholder: 'Buyer or seller name',
    secondaryLabel: 'Phone or email',
    secondaryPlaceholder: 'Contact detail',
    notesLabel: 'Need or next step',
    notesPlaceholder: 'Budget, area, property interest, next call...',
    submitLabel: 'Save Lead',
    icon: UsersRound,
  },
  prospect: {
    eyebrow: 'Prospecting',
    title: 'Add prospect',
    body: 'Record a canvassing prospect before it becomes a qualified lead.',
    module: 'lead',
    draftType: 'Prospect Capture',
    primaryLabel: 'Prospect name',
    primaryPlaceholder: 'Owner, buyer, landlord or company',
    secondaryLabel: 'Source or area',
    secondaryPlaceholder: 'Canvassing, referral, suburb...',
    notesLabel: 'Prospecting note',
    notesPlaceholder: 'What was discussed and when to follow up...',
    submitLabel: 'Save Prospect',
    icon: FileText,
  },
  transaction: {
    eyebrow: 'Deal Capture',
    title: 'New transaction',
    body: 'Start a transaction draft from the field and sync the details when ready.',
    module: 'transaction',
    draftType: 'Transaction Draft',
    primaryLabel: 'Client or deal name',
    primaryPlaceholder: 'Buyer, seller or transaction name',
    secondaryLabel: 'Property or reference',
    secondaryPlaceholder: 'Address, unit, listing or mandate',
    notesLabel: 'Deal note',
    notesPlaceholder: 'Price, stage, parties, next step...',
    submitLabel: 'Save Transaction Draft',
    icon: ScrollText,
  },
  note: {
    eyebrow: 'Activity Note',
    title: 'Add note',
    body: 'Capture a quick field update for the shared activity stream.',
    module: 'activity',
    draftType: 'Note',
    primaryLabel: 'Note title',
    primaryPlaceholder: 'Short summary',
    secondaryLabel: 'Related item',
    secondaryPlaceholder: 'Lead, transaction, matter...',
    notesLabel: 'Note',
    notesPlaceholder: 'What happened?',
    submitLabel: 'Save Note',
    icon: MessageCircle,
  },
  'follow-up': {
    eyebrow: 'Task Capture',
    title: 'Schedule follow-up',
    body: 'Queue a reminder for yourself or the next owner.',
    module: 'task',
    draftType: 'Follow-up',
    primaryLabel: 'Follow-up title',
    primaryPlaceholder: 'Call buyer, send documents...',
    secondaryLabel: 'Due',
    secondaryPlaceholder: 'Today 16:00, tomorrow morning...',
    notesLabel: 'Reminder detail',
    notesPlaceholder: 'What needs to happen?',
    submitLabel: 'Save Follow-up',
    icon: Clock3,
  },
}

export function isMobileCreateType(type = '') {
  return Boolean(CREATE_CONFIG[String(type || '').trim()])
}

export function getMobileCreateConfig(type = '') {
  return CREATE_CONFIG[String(type || '').trim()] || null
}

function createInitialForm() {
  return {
    primary: '',
    secondary: '',
    notes: '',
  }
}

export function mobileDraftMatchesModule(draft = {}, moduleKey = '') {
  const module = String(draft.module || '').trim()
  if (moduleKey === 'transactions') return module === 'transaction'
  if (moduleKey === 'leads') return module === 'lead'
  if (moduleKey === 'tasks') return module === 'task'
  if (moduleKey === 'activity') return module === 'activity'
  return module === moduleKey
}

export function MobileDraftCard({ draft, actionLabel = 'Pending sync' }) {
  return (
    <MobileCard className="border-[#d8eadf] bg-[#f7fcf9]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]">
          <Check className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">{draft.type || 'Draft'}</p>
          <h2 className="mt-1 text-[17px] font-semibold text-[#10243a]">{draft.title || 'Mobile draft'}</h2>
          {draft.payload?.secondary || draft.payload?.notes ? (
            <p className="mt-1 text-sm leading-6 text-[#60758d]">{draft.payload.secondary || draft.payload.notes}</p>
          ) : null}
          <p className="mt-2 text-xs font-semibold text-[#1f7a5a]">{actionLabel} - {draft.createdLabel}</p>
        </div>
      </div>
    </MobileCard>
  )
}

export default function MobileCreateSheet({ open = false, type = '', route = '', onClose, onSaved }) {
  const config = useMemo(() => getMobileCreateConfig(type), [type])
  const [form, setForm] = useState(() => createInitialForm())
  const [savedDraft, setSavedDraft] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(createInitialForm())
    setSavedDraft(null)
  }, [open, type])

  if (!open || !config) return null

  const Icon = config.icon || Plus

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const draft = addOfflineDraft({
      type: config.draftType,
      title: form.primary.trim() || config.title,
      module: config.module,
      payload: {
        actionType: type,
        primary: form.primary.trim(),
        secondary: form.secondary.trim(),
        notes: form.notes.trim(),
        route,
      },
    })
    setSavedDraft(draft)
    onSaved?.(draft)
    void trackMobileMetric('mobile_quick_create_saved', {
      route,
      metadata: { actionType: type, module: config.module, draftId: draft.id },
    })
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end bg-[#10243a]/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={onClose}>
      <form
        className="mx-auto w-full max-w-[520px] rounded-[28px] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        data-mobile-create-sheet={type}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">{config.eyebrow}</p>
            <h2 className="mt-1 text-[24px] font-semibold text-[#10243a]">{config.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{config.body}</p>
          </div>
          <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1f5f9] text-[#60758d]" onClick={onClose} aria-label="Close create sheet">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-[#60758d]">{config.primaryLabel}</span>
            <input
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a] outline-none focus:border-[#1f7a5a]"
              value={form.primary}
              onChange={(event) => updateField('primary', event.target.value)}
              placeholder={config.primaryPlaceholder}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-[#60758d]">{config.secondaryLabel}</span>
            <input
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a] outline-none focus:border-[#1f7a5a]"
              value={form.secondary}
              onChange={(event) => updateField('secondary', event.target.value)}
              placeholder={config.secondaryPlaceholder}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-[#60758d]">{config.notesLabel}</span>
            <textarea
              className="mt-2 min-h-[92px] w-full rounded-2xl border border-[#d7e0ea] bg-white px-3 py-3 text-sm font-semibold text-[#10243a] outline-none focus:border-[#1f7a5a]"
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder={config.notesPlaceholder}
            />
          </label>
        </div>

        {savedDraft ? (
          <div className="mt-4 rounded-[20px] border border-[#d9eadf] bg-[#f5fbf7] p-4 text-[#1f7a5a]">
            <div className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4" /> Saved for sync</div>
            <p className="mt-1 text-xs">{savedDraft.title} is now visible on this mobile page.</p>
          </div>
        ) : null}

        <button type="submit" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white">
          <Icon className="h-4 w-4 text-[#9fe0bd]" />
          {config.submitLabel}
        </button>
      </form>
    </div>
  )
}
