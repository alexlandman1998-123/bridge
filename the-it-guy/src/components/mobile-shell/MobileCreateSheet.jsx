import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addOfflineDraft,
  clearMobileCreateDraft,
  getMobileCreateDraft,
  getMobileCreateDrafts,
  saveMobileCreateDraft,
  subscribeToMobileCreateDrafts,
} from '../../services/mobileProductivityService'
import { trackMobileMetric } from '../../services/observability/monitoring'
import UxDiagnosticsActions from '../feedback/UxDiagnosticsActions'
import { MobileCard } from './MobileShellStates'
import {
  getMobileCreateConfig,
  getMobileCreateFieldLimit,
  mobileCreateDraftMatchesModule,
  validateMobileCreateForm,
} from './mobileCreateConfig'

function createInitialForm() {
  return {
    primary: '',
    secondary: '',
    notes: '',
  }
}

function hasCreateDraftContent(form = {}) {
  return Boolean(
    String(form.primary || '').trim() ||
      String(form.secondary || '').trim() ||
      String(form.notes || '').trim(),
  )
}

function trimCreateForm(form = {}) {
  return {
    primary: String(form.primary || '').trim(),
    secondary: String(form.secondary || '').trim(),
    notes: String(form.notes || '').trim(),
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

export function MobileCreateRecoveryStrip({ moduleKey = '', limit = 3 }) {
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState(() => getMobileCreateDrafts())
  const visibleDrafts = drafts
    .filter((draft) => !moduleKey || mobileCreateDraftMatchesModule(draft, moduleKey))
    .slice(0, limit)

  useEffect(() => subscribeToMobileCreateDrafts(setDrafts), [])

  if (!visibleDrafts.length) return null

  function refreshDrafts() {
    setDrafts(getMobileCreateDrafts())
  }

  function resumeDraft(draft) {
    const route = String(draft.route || '/mobile/home').trim() || '/mobile/home'
    const separator = route.includes('?') ? '&' : '?'
    navigate(`${route}${separator}create=${encodeURIComponent(draft.type || '')}`)
  }

  function discardDraft(draft) {
    clearMobileCreateDraft({ type: draft.type, route: draft.route })
    refreshDrafts()
  }

  return (
    <section className="space-y-2" data-mobile-create-recovery>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-[#10243a]">Unfinished capture</h2>
        <span className="rounded-full bg-[#fff6e5] px-3 py-1 text-[11px] font-semibold text-[#b7791f]">{visibleDrafts.length}</span>
      </div>
      {visibleDrafts.map((draft) => (
        <div key={draft.key || draft.id} className="rounded-[24px] border border-[#f0ddb4] bg-[#fffaf0] p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff1d8] text-[#b7791f]">
              <Plus className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#10243a]">{draft.title || 'Unfinished capture'}</p>
              <p className="mt-1 text-xs leading-5 text-[#8a6733]">{draft.type || 'Draft'} saved on this device {draft.updatedLabel ? `- ${draft.updatedLabel}` : ''}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-10 rounded-2xl bg-[#10243a] px-3 text-sm font-semibold text-white" onClick={() => resumeDraft(draft)}>
              Resume
            </button>
            <button type="button" className="min-h-10 rounded-2xl border border-[#e4d2a7] bg-white px-3 text-sm font-semibold text-[#7a4c12]" onClick={() => discardDraft(draft)}>
              Discard
            </button>
          </div>
        </div>
      ))}
      <UxDiagnosticsActions
        source="mobile_create_recovery"
        category="continuity_recovery"
        severity="low"
        message="Unfinished mobile capture recovery was shown."
        metadata={{ moduleKey, visibleDraftCount: visibleDrafts.length }}
        compact
      />
    </section>
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
  const [restoredDraft, setRestoredDraft] = useState(() => getMobileCreateDraft({ type, route }))
  const [form, setForm] = useState(() => restoredDraft?.form || createInitialForm())
  const [savedDraft, setSavedDraft] = useState(null)
  const [errors, setErrors] = useState([])
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false)
  const Icon = config.icon || Plus
  const hasTypedDraft = hasCreateDraftContent(form)

  useEffect(() => {
    if (savedDraft) return
    if (hasTypedDraft) {
      saveMobileCreateDraft({
        type,
        route,
        module: config.module,
        title: form.primary || config.title,
        form,
      })
    } else {
      clearMobileCreateDraft({ type, route })
    }
  }, [config.module, config.title, form, hasTypedDraft, route, savedDraft, type])

  useEffect(() => {
    if (!hasTypedDraft || savedDraft || typeof window === 'undefined') return undefined
    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasTypedDraft, savedDraft])

  function updateField(field, value) {
    const limit = getMobileCreateFieldLimit(field)
    setForm((current) => ({ ...current, [field]: value }))
    if (String(value || '').length <= limit) {
      setErrors([])
    }
    setDiscardPromptOpen(false)
    if (savedDraft) {
      setSavedDraft(null)
    }
  }

  function requestClose() {
    if (hasTypedDraft && !savedDraft) {
      setDiscardPromptOpen(true)
      return
    }
    onClose?.()
  }

  function discardAndClose() {
    clearMobileCreateDraft({ type, route })
    setForm(createInitialForm())
    setRestoredDraft(null)
    setDiscardPromptOpen(false)
    onClose?.()
  }

  function startFresh() {
    clearMobileCreateDraft({ type, route })
    setForm(createInitialForm())
    setRestoredDraft(null)
    setErrors([])
    setDiscardPromptOpen(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const validation = validateMobileCreateForm(type, form)
    if (!validation.ok) {
      setErrors(validation.errors)
      setDiscardPromptOpen(false)
      return
    }
    const cleanedForm = trimCreateForm(form)
    const draft = addOfflineDraft({
      type: config.draftType,
      title: cleanedForm.primary || config.title,
      module: config.module,
      payload: {
        actionType: type,
        primary: cleanedForm.primary,
        secondary: cleanedForm.secondary,
        notes: cleanedForm.notes,
        route,
      },
    })
    clearMobileCreateDraft({ type, route })
    setErrors([])
    setDiscardPromptOpen(false)
    setRestoredDraft(null)
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
      onClick={requestClose}
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
          <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1f5f9] text-[#60758d]" onClick={requestClose} aria-label="Close create sheet">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5 [-webkit-overflow-scrolling:touch]">
          {hasTypedDraft && !savedDraft ? (
            <div className="mb-4 rounded-[20px] border border-[#d9eadf] bg-[#f5fbf7] p-4" data-mobile-create-durable-draft>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1f7a5a]">Saved on this device</p>
                  <p className="mt-1 text-xs leading-5 text-[#4d6a59]">
                    {restoredDraft?.updatedLabel ? `Last updated ${restoredDraft.updatedLabel}. ` : ''}
                    You can refresh, close, or sign in again and resume this capture later.
                  </p>
                </div>
                <button type="button" className="shrink-0 rounded-2xl border border-[#cfe8d8] bg-white px-3 py-2 text-xs font-semibold text-[#1f7a5a]" onClick={startFresh}>
                  Start fresh
                </button>
              </div>
            </div>
          ) : null}

          {errors.length ? (
            <div className="mb-4 rounded-[20px] border border-[#f3c6c6] bg-[#fff7f7] p-4 text-sm font-semibold text-[#9b1c1c]" role="alert">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          {discardPromptOpen ? (
            <div className="mb-4 rounded-[20px] border border-[#f0ddb4] bg-[#fffaf0] p-4">
              <p className="text-sm font-semibold text-[#7a4c12]">Discard this draft?</p>
              <p className="mt-1 text-xs leading-5 text-[#8a6733]">Your typed details are saved on this device until you discard them or save the draft.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="min-h-10 rounded-2xl border border-[#e4d2a7] bg-white px-3 text-sm font-semibold text-[#7a4c12]" onClick={() => setDiscardPromptOpen(false)}>
                  Keep editing
                </button>
                <button type="button" className="min-h-10 rounded-2xl bg-[#7a4c12] px-3 text-sm font-semibold text-white" onClick={discardAndClose}>
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-[#60758d]">{config.primaryLabel}</span>
              <input
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a] outline-none focus:border-[#1f7a5a]"
                value={form.primary}
                onChange={(event) => updateField('primary', event.target.value)}
                placeholder={config.primaryPlaceholder}
                maxLength={getMobileCreateFieldLimit('primary')}
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
                maxLength={getMobileCreateFieldLimit('secondary')}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase text-[#60758d]">{config.notesLabel}</span>
              <textarea
                className="mt-2 min-h-[92px] w-full rounded-2xl border border-[#d7e0ea] bg-white px-3 py-3 text-sm font-semibold text-[#10243a] outline-none focus:border-[#1f7a5a]"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder={config.notesPlaceholder}
                maxLength={getMobileCreateFieldLimit('notes')}
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
          <button type={savedDraft ? 'button' : 'submit'} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white" onClick={savedDraft ? onClose : undefined}>
            <Icon className="h-4 w-4 text-[#9fe0bd]" />
            {savedDraft ? 'Done' : config.submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
