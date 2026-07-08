import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addOfflineDraft } from '../../services/mobileProductivityService'
import { trackMobileMetric } from '../../services/observability/monitoring'
import { MobileCard } from './MobileShellStates'
import { getMobileCreateConfig } from './mobileCreateConfig'

function createInitialForm() {
  return {
    primary: '',
    secondary: '',
    notes: '',
  }
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
  const config = getMobileCreateConfig(type)

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open || !config) return null

  return (
    <MobileCreateSheetForm
      key={type}
      config={config}
      type={type}
      route={route}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}

function MobileCreateSheetForm({ config, type, route, onClose, onSaved }) {
  const [form, setForm] = useState(() => createInitialForm())
  const [savedDraft, setSavedDraft] = useState(null)
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
    <div
      className="fixed inset-0 z-[85] flex items-end overflow-hidden bg-[#10243a]/42 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={onClose}
    >
      <form
        className="mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        data-mobile-create-sheet={type}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">{config.eyebrow}</p>
            <h2 className="mt-1 text-[24px] font-semibold text-[#10243a]">{config.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{config.body}</p>
          </div>
          <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1f5f9] text-[#60758d]" onClick={onClose} aria-label="Close create sheet">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-4">
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
        </div>

        <div className="shrink-0 border-t border-[#e6edf3] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white">
            <Icon className="h-4 w-4 text-[#9fe0bd]" />
            {config.submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
