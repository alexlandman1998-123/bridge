import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, CirclePause, ListFilter, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../ui/Button'
import Field from '../../ui/Field'
import { buildConveyancerCockpitH3, loadConveyancerCockpitH3Context } from '../../../core/productisation/conveyancerCockpitH3.js'
import { buildConveyancerGuidedExperience } from '../../../core/productisation/conveyancerGuidedExperience.js'
import { loadConveyancerDocumentApplicationSummary } from '../../../core/productisation/conveyancerDocumentApplicationH5.js'
import { loadConveyancerNotificationSummary } from '../../../core/productisation/conveyancerNotificationDelivery.js'
import { loadConveyancerProviderApplicationSummary } from '../../../core/productisation/conveyancerProviderApplicationH6.js'
import { loadConveyancerProviderTransportH7Summary } from '../../../core/productisation/conveyancerProviderTransportH7.js'
import { loadConveyancerOperationalApplicationH8Summary } from '../../../core/productisation/conveyancerOperationalApplicationH8.js'
import {
  buildConveyancerActionAffordanceH9,
  buildConveyancerActionConfirmationH9,
  buildConveyancerUsabilityH9,
} from '../../../core/productisation/conveyancerUsabilityH9.js'
import {
  CONVEYANCER_APPLICATION_H2_EVENT_TYPES as CONVEYANCER_ORCHESTRATION_EVENT_TYPES,
} from '../../../core/productisation/conveyancerApplicationOrchestratorH2.js'
import { runConveyancerApplicationEventH4 as runConveyancerMatterEvent } from '../../../core/productisation/conveyancerNotificationRuntimeH4.js'
import { ConveyancerActionCard } from './ConveyancerActionCard.jsx'
import { ConveyancerSystemStatus } from './ConveyancerSystemStatus.jsx'

const GROUP_TONES = { review: 'border-warning/30 bg-warningSoft/60', do_now: 'border-primary/20 bg-primarySoft/50', blocked: 'border-danger/25 bg-dangerSoft/50', waiting: 'border-borderDefault bg-surfaceAlt', upcoming: 'border-borderSoft bg-white' }
const HEALTH_TONES = { danger: 'border-danger/25 bg-dangerSoft text-danger', warning: 'border-warning/30 bg-warningSoft text-warning', success: 'border-success/25 bg-successSoft text-success', primary: 'border-primary/25 bg-primarySoft text-primary', neutral: 'border-borderDefault bg-surfaceAlt text-textBody' }
const ATTENTION_GROUPS = new Set(['review', 'do_now', 'blocked'])
const EMPTY_REASON = { actionKey: '', type: '', value: '' }

function commandId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}` }
function formatWhen(value) { const date = new Date(value || ''); return Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date) }

export function ConveyancerCockpit({ client, organisationId, attorneyFirmId, transactionId, actor, onNavigate }) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyActionKey, setBusyActionKey] = useState('')
  const [expandedActionKey, setExpandedActionKey] = useState('')
  const [reasonDraft, setReasonDraft] = useState(EMPTY_REASON)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [showLater, setShowLater] = useState(null)
  const [workFilter, setWorkFilter] = useState('attention')
  const [workSearch, setWorkSearch] = useState('')
  const [asOf, setAsOf] = useState(() => new Date().toISOString())
  const cockpit = useMemo(() => context ? buildConveyancerCockpitH3({ context, actor, asOf, filter: workFilter, search: workSearch }) : null, [actor, asOf, context, workFilter, workSearch])
  const experience = useMemo(() => buildConveyancerGuidedExperience({ cockpit, context: context || {} }), [cockpit, context])
  const usability = useMemo(() => buildConveyancerUsabilityH9({ cockpit, experience, context: context || {} }), [cockpit, context, experience])

  const refresh = useCallback(async () => {
    if (!client || !organisationId || !attorneyFirmId || !transactionId) { setContext(null); setLoading(false); setError('This matter is not linked to an attorney firm yet.'); return }
    try {
      setLoading(true); setError('')
      const [orchestrationContext, notificationSummary, documentPipelineSummary, providerRuntimeSummary, providerTransportSummary, operationalSummary] = await Promise.all([
        loadConveyancerCockpitH3Context(client, { organisationId, attorneyFirmId, transactionId }),
        loadConveyancerNotificationSummary(client, { organisationId, attorneyFirmId, transactionId }).catch(() => ({ available: false, counts: {}, control: null })),
        loadConveyancerDocumentApplicationSummary(client, { organisationId, attorneyFirmId, transactionId }).catch(() => ({ available: false, counts: {}, control: null })),
        loadConveyancerProviderApplicationSummary(client, { organisationId, attorneyFirmId }).catch(() => ({ available: false, profiles: [], health: [], credentialChecks: [], counts: {}, control: null })),
        loadConveyancerProviderTransportH7Summary(client, { organisationId, attorneyFirmId, transactionId }).catch(() => ({ available: false, outbound: {}, inbound: {}, commands: [], envelopes: [], recoverable: 0, attention: 0, control: null })),
        loadConveyancerOperationalApplicationH8Summary(client, { organisationId, attorneyFirmId }).catch(() => ({ available: false, snapshot: null, applicationSnapshot: null, openAlerts: [], openIncidents: [], activeSwitches: [], componentStops: {}, killSwitchActive: false, releaseGateReady: false })),
      ])
      setContext({ ...orchestrationContext, notificationSummary, documentPipelineSummary, providerRuntimeSummary, providerTransportSummary, operationalSummary })
      setAsOf(new Date().toISOString())
    } catch (loadError) { setContext(null); setError(loadError?.message || 'The work view is not available yet.') }
    finally { setLoading(false) }
  }, [attorneyFirmId, client, organisationId, transactionId])

  useEffect(() => { const timer = globalThis.setTimeout(() => { void refresh() }, 0); return () => globalThis.clearTimeout(timer) }, [refresh])

  async function execute(item, type, value = '') {
    if (!context) return
    const id = commandId(); const command = { commandId: id, type, actionKey: item.actionKey }
    if (type === 'mark_waiting') command.waitingOn = value
    if (type === 'resume') command.reason = value
    try {
      setBusyActionKey(item.actionKey); setError(''); setMessage('')
      const outcome = await runConveyancerMatterEvent(client, { context, actor, event: { eventId: `cockpit:${transactionId}:${id}`, type: CONVEYANCER_ORCHESTRATION_EVENT_TYPES.actionCommandRequested, organisationId, attorneyFirmId, transactionId, sourceReference: `user_command:${id}`, occurredAt: new Date().toISOString(), payload: { command } } })
      if (!outcome.ok) throw new Error(outcome.result?.errors?.[0] || 'The action could not be saved.')
      setMessage(outcome.persistence?.reason === 'idempotent_replay' ? 'This update was already recorded.' : 'Saved. The matter plan is up to date.')
      setReasonDraft(EMPTY_REASON); setPendingConfirmation(null); await refresh()
    } catch (actionError) { setError(actionError?.message || 'Unable to update this action.') }
    finally { setBusyActionKey('') }
  }

  function handleIntent(item) {
    const affordance = buildConveyancerActionAffordanceH9({ item, operationalSummary: context?.operationalSummary, cockpit, busy: Boolean(busyActionKey) })
    if (affordance.disabled) { setError(affordance.disabledReason || 'This update is not available right now.'); return }
    if (item.intent.type === 'open_documents') { onNavigate?.('documents'); return }
    if (item.intent.type === 'open_review' || item.intent.type === 'view') { onNavigate?.('transfer'); return }
    if (item.intent.requiresReason) { setPendingConfirmation(null); setReasonDraft({ actionKey: item.actionKey, type: item.intent.type, value: '' }); return }
    const confirmation = buildConveyancerActionConfirmationH9(item)
    if (confirmation) { setReasonDraft(EMPTY_REASON); setPendingConfirmation(confirmation); setError(''); setMessage(''); return }
    void execute(item, item.intent.type)
  }

  function handleWait(item) {
    const affordance = buildConveyancerActionAffordanceH9({ item: { ...item, intent: { type: 'mark_waiting' } }, operationalSummary: context?.operationalSummary, cockpit, busy: Boolean(busyActionKey) })
    if (affordance.disabled) { setError(affordance.disabledReason || 'This update is not available right now.'); return }
    setPendingConfirmation(null); setError(''); setMessage(''); setReasonDraft({ actionKey: item.actionKey, type: 'mark_waiting', value: '' })
  }

  function confirmPendingAction() {
    if (!pendingConfirmation) return
    const item = cockpit.queue.items.find((entry) => entry.actionKey === pendingConfirmation.actionKey)
    if (!item || item.intent.type !== pendingConfirmation.intentType) { setPendingConfirmation(null); setError('This action changed while you were reviewing it. Refresh and try again.'); return }
    void execute(item, pendingConfirmation.intentType)
  }

  function renderGroups(groups) {
    return groups.map((group) => <section key={group.key} className={`min-w-0 rounded-[18px] border p-4 sm:p-5 ${GROUP_TONES[group.key] || GROUP_TONES.upcoming}`}><div className="mb-4 flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-semibold text-textStrong">{group.label}</h3><p className="mt-1 break-words text-xs leading-5 text-textMuted">{group.description}</p></div><span className="shrink-0 rounded-full border border-borderSoft bg-white px-2.5 py-1 text-xs font-semibold text-textMuted">{group.items.length}</span></div><div className="space-y-3">{group.items.map((item) => <ConveyancerActionCard key={item.actionKey} item={item} expanded={expandedActionKey === item.actionKey} busy={busyActionKey === item.actionKey} commandsDisabled={usability.orchestrationStopped} formatWhen={formatWhen} onToggle={() => setExpandedActionKey((current) => current === item.actionKey ? '' : item.actionKey)} onIntent={handleIntent} onWait={handleWait} />)}</div></section>)
  }

  if (loading) return <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-surface" aria-busy="true" aria-label="Loading conveyancer work"><div className="h-5 w-48 animate-pulse rounded bg-surfaceAlt" /><div className="mt-4 h-24 animate-pulse rounded-[14px] bg-surfaceAlt" /></section>
  if (!cockpit) return <section className="rounded-[18px] border border-warning/25 bg-warningSoft p-6"><AlertTriangle size={22} className="text-warning" /><h2 className="mt-3 text-lg font-semibold text-textStrong">Work view unavailable</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">{error || 'The guided work view could not load.'} The normal matter workspace still works.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => void refresh()}><RefreshCw size={14} />Try again</Button><Button type="button" variant="secondary" onClick={() => onNavigate?.('overview')}>Use normal workspace</Button></div></section>
  if (cockpit.status === 'paused' || cockpit.status === 'awaiting_instruction') return <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-surface"><CirclePause size={24} className="text-textMuted" /><h2 className="mt-3 text-lg font-semibold text-textStrong">{cockpit.health.label}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">{cockpit.health.summary}</p><div className="mt-5 rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textBody">Nothing is locked. Continue in the normal matter workspace.</div><Button type="button" className="mt-4" variant="secondary" onClick={() => onNavigate?.('overview')}>Open normal workspace <ArrowRight size={14} /></Button></section>

  const workspaceGroups = cockpit.workspace?.groups || []
  const attentionGroups = workspaceGroups.filter((group) => ATTENTION_GROUPS.has(group.key))
  const laterGroups = workspaceGroups.filter((group) => !ATTENTION_GROUPS.has(group.key))
  const laterVisible = showLater ?? attentionGroups.length === 0
  const primaryAffordance = experience.primaryAction ? buildConveyancerActionAffordanceH9({ item: experience.primaryAction, operationalSummary: context?.operationalSummary, cockpit, busy: Boolean(busyActionKey) }) : null
  return (
    <section className="space-y-5" aria-label="Conveyancer cockpit">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article className="min-w-0 rounded-[18px] border border-primary/20 bg-white p-5 shadow-surface"><span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">Do this next</span><div className="mt-2 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="break-words text-xl font-semibold tracking-[-0.025em] text-textStrong">{experience.headline}</h2><p className="mt-2 max-w-2xl break-words text-sm leading-6 text-textMuted">{experience.summary}</p><p className="mt-2 text-xs leading-5 text-textMuted">You will review the change before anything is saved.</p></div>{experience.primaryAction ? <Button type="button" className="min-h-10 w-full max-w-full shrink-0 whitespace-normal text-center sm:w-auto" onClick={() => handleIntent(experience.primaryAction)} disabled={primaryAffordance?.disabled}>{experience.primaryAction.intent.label}<ArrowRight size={14} /></Button> : null}</div><dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Ready', experience.counts.ready], ['Decisions', experience.counts.decisions], ['Needs help', experience.counts.blocked], ['Waiting', experience.counts.waiting]].map(([label, value]) => <div key={label} className="min-w-0 rounded-[11px] bg-surfaceAlt px-3 py-2"><dt className="break-words text-xs text-textMuted">{label}</dt><dd className="mt-0.5 text-lg font-semibold text-textStrong">{value}</dd></div>)}</dl></article>
        <aside className={`min-w-0 rounded-[18px] border p-5 ${HEALTH_TONES[cockpit.health.tone] || HEALTH_TONES.neutral}`}><div className="flex min-w-0 items-center gap-2"><ShieldCheck size={18} className="shrink-0" /><strong className="break-words text-sm font-semibold">{cockpit.health.label}</strong></div><p className="mt-3 break-words text-sm leading-6 text-textBody">{cockpit.health.summary}</p><Button type="button" variant="secondary" size="sm" className="mt-4 min-h-10 w-full justify-center whitespace-normal" onClick={() => void refresh()}><RefreshCw size={14} />Refresh</Button></aside>
      </div>

      {usability.orchestrationStopped ? <section className="rounded-[16px] border border-warning/30 bg-warningSoft px-4 py-4" aria-labelledby="h9-safe-stop-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 id="h9-safe-stop-title" className="break-words text-sm font-semibold text-textStrong">{usability.status.title}</h3><p className="mt-1 break-words text-sm leading-6 text-textBody">{usability.status.detail}</p></div><Button type="button" variant="secondary" className="min-h-10 w-full shrink-0 whitespace-normal sm:w-auto" onClick={() => onNavigate?.('overview')}>Open normal workspace <ArrowRight size={14} /></Button></div></section> : null}

      {cockpit.reviewPrompts.map((prompt) => <div key={prompt.id} className="flex flex-col gap-3 rounded-[15px] border border-warning/30 bg-warningSoft px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-textStrong">Check what changed</strong><p className="mt-1 text-sm text-textBody">{prompt.label}</p><span className="mt-1 block text-xs text-textMuted">{formatWhen(prompt.occurredAt)}</span></div><Button type="button" variant="secondary" size="sm" onClick={() => onNavigate?.('transfer')}>Open review</Button></div>)}
      {cockpit.runtime?.notices?.length ? <section className="rounded-[16px] border border-warning/30 bg-warningSoft/60 p-4" aria-labelledby="matter-attention-title"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 id="matter-attention-title" className="text-sm font-semibold text-textStrong">Matter records needing attention</h3><p className="mt-1 text-xs leading-5 text-textMuted">Exceptions, evidence and coordination records are shown here without changing the legal record.</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-warning">{cockpit.runtime.counts.totalAttention}</span></div><ul className="mt-3 grid gap-2 sm:grid-cols-2">{cockpit.runtime.notices.slice(0, 4).map((notice) => <li key={notice.id} className="flex min-w-0 items-center justify-between gap-3 rounded-[12px] border border-borderSoft bg-white px-3 py-2"><span className="min-w-0 break-words text-sm text-textBody">{notice.label}</span><Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => onNavigate?.(notice.target)}>Review</Button></li>)}</ul>{cockpit.runtime.notices.length > 4 ? <p className="mt-2 text-xs text-textMuted">And {cockpit.runtime.notices.length - 4} more record{cockpit.runtime.notices.length - 4 === 1 ? '' : 's'} in the relevant workspace.</p> : null}</section> : null}
      <div aria-live="polite">{message ? <p className="rounded-[12px] border border-success/25 bg-successSoft px-4 py-3 text-sm text-success">{message}</p> : null}{error ? <p className="rounded-[12px] border border-danger/25 bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}</div>

      {pendingConfirmation ? <section role="alertdialog" aria-modal="false" aria-labelledby="h9-confirmation-title" aria-describedby="h9-confirmation-detail" className="rounded-[16px] border-2 border-primary/30 bg-primarySoft p-4 sm:p-5"><div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0"><h3 id="h9-confirmation-title" className="break-words text-base font-semibold text-textStrong">{pendingConfirmation.title}</h3><p id="h9-confirmation-detail" className="mt-2 break-words text-sm leading-6 text-textBody">{pendingConfirmation.question}</p><p className="mt-2 break-words text-xs leading-5 text-textMuted">{pendingConfirmation.consequence}</p></div></div><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" className="min-h-10 w-full whitespace-normal sm:w-auto" onClick={() => setPendingConfirmation(null)} disabled={Boolean(busyActionKey)}>{pendingConfirmation.cancelLabel}</Button><Button type="button" className="min-h-10 w-full whitespace-normal sm:w-auto" onClick={confirmPendingAction} disabled={Boolean(busyActionKey) || usability.orchestrationStopped}>{busyActionKey ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}{busyActionKey ? 'Saving…' : pendingConfirmation.confirmLabel}</Button></div></section> : null}

      {reasonDraft.actionKey ? <form className="min-w-0 rounded-[16px] border border-primary/25 bg-primarySoft p-4" onSubmit={(event) => { event.preventDefault(); const item = cockpit.queue.items.find((entry) => entry.actionKey === reasonDraft.actionKey); if (item && reasonDraft.value.trim() && !usability.orchestrationStopped) void execute(item, reasonDraft.type === 'resume' ? 'resume' : 'mark_waiting', reasonDraft.value.trim()) }}><label htmlFor="conveyancer-action-reason" className="break-words text-sm font-semibold text-textStrong">{reasonDraft.type === 'resume' ? 'What changed so this can continue?' : 'Who or what are we waiting on?'}</label><div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row"><Field id="conveyancer-action-reason" value={reasonDraft.value} onChange={(event) => setReasonDraft((previous) => ({ ...previous, value: event.target.value }))} placeholder={reasonDraft.type === 'resume' ? 'The blocker is resolved because…' : 'For example: seller FICA documents'} autoFocus /><Button type="submit" className="min-h-10 w-full whitespace-normal sm:w-auto" disabled={!reasonDraft.value.trim() || Boolean(busyActionKey) || usability.orchestrationStopped}>Save update</Button><Button type="button" variant="secondary" className="min-h-10 w-full whitespace-normal sm:w-auto" onClick={() => setReasonDraft(EMPTY_REASON)}>Go back</Button></div></form> : null}

      <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-surface" aria-labelledby="single-work-queue-title"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><ListFilter size={17} className="shrink-0 text-primary" /><h3 id="single-work-queue-title" className="text-sm font-semibold text-textStrong">Single work queue</h3></div><p className="mt-1 text-xs leading-5 text-textMuted">Choose a view or search by task, owner, blocker or missing evidence.</p></div><div className="relative w-full lg:max-w-sm"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" /><Field aria-label="Search matter work" value={workSearch} onChange={(event) => setWorkSearch(event.target.value)} placeholder="Search this matter" className="w-full pl-9 pr-9" />{workSearch ? <button type="button" aria-label="Clear work search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-textMuted hover:bg-surfaceAlt hover:text-textStrong" onClick={() => setWorkSearch('')}><X size={14} /></button> : null}</div></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter matter work">{cockpit.workspace.filters.map((filter) => <button key={filter.key} type="button" aria-pressed={workFilter === filter.key} onClick={() => { setWorkFilter(filter.key); setShowLater(null) }} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${workFilter === filter.key ? 'border-primary bg-primary text-white' : 'border-borderDefault bg-white text-textBody hover:bg-surfaceAlt'}`}><span>{filter.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[0.68rem] ${workFilter === filter.key ? 'bg-white/20 text-white' : 'bg-surfaceAlt text-textMuted'}`}>{filter.count}</span></button>)}</div></section>

      {cockpit.workspace.empty ? <section className="rounded-[16px] border border-dashed border-borderDefault bg-surfaceAlt px-5 py-8 text-center"><h3 className="text-sm font-semibold text-textStrong">Nothing to show here</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-textMuted">{cockpit.workspace.emptyMessage}</p>{workSearch || workFilter !== 'all' ? <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => { setWorkSearch(''); setWorkFilter('all'); setShowLater(null) }}>Show all open work</Button> : null}</section> : null}
      <div className="space-y-4" aria-label="Work needing attention">{renderGroups(attentionGroups)}</div>
      {laterGroups.length ? <section><Button type="button" variant="secondary" className="w-full justify-between" aria-expanded={laterVisible} onClick={() => setShowLater(!laterVisible)}>{laterVisible ? 'Hide waiting and later work' : `Show waiting and later work (${laterGroups.reduce((sum, group) => sum + group.items.length, 0)})`}{laterVisible ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</Button>{laterVisible ? <div className="mt-4 space-y-4">{renderGroups(laterGroups)}</div> : null}</section> : null}

      <ConveyancerSystemStatus systems={experience.systems} fallback={experience.fallback} onNavigate={onNavigate} />
      <details className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-xs text-textMuted"><summary className="cursor-pointer font-semibold text-textBody">Plan and audit details</summary><p className="mt-2">Plan {experience.provenance.planId || 'pending'} · revision {experience.provenance.planRevision} · latest activity {experience.provenance.latestReceipt ? formatWhen(experience.provenance.latestReceipt.occurred_at) : 'not recorded'}</p></details>
    </section>
  )
}

export default ConveyancerCockpit
