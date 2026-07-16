import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, CirclePause, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../ui/Button'
import Field from '../../ui/Field'
import { buildConveyancerCockpit } from '../../../core/productisation/conveyancerCockpit.js'
import { buildConveyancerGuidedExperience } from '../../../core/productisation/conveyancerGuidedExperience.js'
import { loadConveyancerDocumentPipelineSummary } from '../../../core/productisation/conveyancerDocumentPipeline.js'
import { loadConveyancerNotificationSummary } from '../../../core/productisation/conveyancerNotificationDelivery.js'
import { loadConveyancerProviderRuntimeSummary } from '../../../core/productisation/conveyancerProviderRuntime.js'
import { loadConveyancerProviderTransportSummary } from '../../../core/productisation/conveyancerProviderTransport.js'
import { loadConveyancerOperationalSummary } from '../../../core/productisation/conveyancerOperationalAssurance.js'
import { CONVEYANCER_ORCHESTRATION_EVENT_TYPES, loadConveyancerOrchestrationContext, runConveyancerMatterEvent } from '../../../core/productisation/conveyancerOrchestration.js'
import { ConveyancerActionCard } from './ConveyancerActionCard.jsx'
import { ConveyancerSystemStatus } from './ConveyancerSystemStatus.jsx'

const GROUP_TONES = { review: 'border-warning/30 bg-warningSoft/60', do_now: 'border-primary/20 bg-primarySoft/50', blocked: 'border-danger/25 bg-dangerSoft/50', waiting: 'border-borderDefault bg-surfaceAlt', upcoming: 'border-borderSoft bg-white' }
const HEALTH_TONES = { danger: 'border-danger/25 bg-dangerSoft text-danger', warning: 'border-warning/30 bg-warningSoft text-warning', success: 'border-success/25 bg-successSoft text-success', primary: 'border-primary/25 bg-primarySoft text-primary', neutral: 'border-borderDefault bg-surfaceAlt text-textBody' }
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
  const [showLater, setShowLater] = useState(null)
  const [asOf, setAsOf] = useState(() => new Date().toISOString())
  const cockpit = useMemo(() => context ? buildConveyancerCockpit({ context, actor, asOf }) : null, [actor, asOf, context])
  const experience = useMemo(() => buildConveyancerGuidedExperience({ cockpit, context: context || {} }), [cockpit, context])

  const refresh = useCallback(async () => {
    if (!client || !organisationId || !attorneyFirmId || !transactionId) { setContext(null); setLoading(false); setError('This matter is not linked to an attorney firm yet.'); return }
    try {
      setLoading(true); setError('')
      const [orchestrationContext, notificationSummary, documentPipelineSummary, providerRuntimeSummary, providerTransportSummary, operationalSummary] = await Promise.all([
        loadConveyancerOrchestrationContext(client, { organisationId, attorneyFirmId, transactionId }),
        loadConveyancerNotificationSummary(client, { organisationId, attorneyFirmId, transactionId }).catch(() => ({ available: false, counts: {}, control: null })),
        loadConveyancerDocumentPipelineSummary(client, { organisationId, attorneyFirmId, transactionId }).catch(() => ({ available: false, counts: {}, control: null })),
        loadConveyancerProviderRuntimeSummary(client, { organisationId, attorneyFirmId }).catch(() => ({ available: false, profiles: [], health: [], control: null })),
        loadConveyancerProviderTransportSummary(client, { organisationId, attorneyFirmId, transactionId }).catch(() => ({ available: false, outbound: {}, inbound: {}, control: null })),
        loadConveyancerOperationalSummary(client, { organisationId, attorneyFirmId }).catch(() => ({ available: false, snapshot: null, openAlerts: [], openIncidents: [], killSwitchActive: false })),
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
      setReasonDraft(EMPTY_REASON); await refresh()
    } catch (actionError) { setError(actionError?.message || 'Unable to update this action.') }
    finally { setBusyActionKey('') }
  }

  function handleIntent(item) {
    if (item.intent.type === 'open_documents') { onNavigate?.('documents'); return }
    if (item.intent.type === 'open_review' || item.intent.type === 'view') { onNavigate?.('transfer'); return }
    if (item.intent.requiresReason) { setReasonDraft({ actionKey: item.actionKey, type: item.intent.type, value: '' }); return }
    void execute(item, item.intent.type)
  }

  function renderGroups(groups) {
    return groups.map((group) => <section key={group.key} className={`rounded-[18px] border p-4 sm:p-5 ${GROUP_TONES[group.key] || GROUP_TONES.upcoming}`}><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-textStrong">{group.label}</h3><p className="mt-1 text-xs leading-5 text-textMuted">{group.description}</p></div><span className="rounded-full border border-borderSoft bg-white px-2.5 py-1 text-xs font-semibold text-textMuted">{group.items.length}</span></div><div className="space-y-3">{group.items.map((item) => <ConveyancerActionCard key={item.actionKey} item={item} expanded={expandedActionKey === item.actionKey} busy={busyActionKey === item.actionKey} formatWhen={formatWhen} onToggle={() => setExpandedActionKey((current) => current === item.actionKey ? '' : item.actionKey)} onIntent={handleIntent} onWait={(entry) => setReasonDraft({ actionKey: entry.actionKey, type: 'mark_waiting', value: '' })} />)}</div></section>)
  }

  if (loading) return <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-surface" aria-busy="true" aria-label="Loading conveyancer work"><div className="h-5 w-48 animate-pulse rounded bg-surfaceAlt" /><div className="mt-4 h-24 animate-pulse rounded-[14px] bg-surfaceAlt" /></section>
  if (!cockpit) return <section className="rounded-[18px] border border-warning/25 bg-warningSoft p-6"><AlertTriangle size={22} className="text-warning" /><h2 className="mt-3 text-lg font-semibold text-textStrong">Work view unavailable</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">{error || 'The guided work view could not load.'} The normal matter workspace still works.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => void refresh()}><RefreshCw size={14} />Try again</Button><Button type="button" variant="secondary" onClick={() => onNavigate?.('overview')}>Use normal workspace</Button></div></section>
  if (cockpit.status === 'paused' || cockpit.status === 'awaiting_instruction') return <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-surface"><CirclePause size={24} className="text-textMuted" /><h2 className="mt-3 text-lg font-semibold text-textStrong">{cockpit.health.label}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">{cockpit.health.summary}</p><div className="mt-5 rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textBody">Nothing is locked. Continue in the normal matter workspace.</div><Button type="button" className="mt-4" variant="secondary" onClick={() => onNavigate?.('overview')}>Open normal workspace <ArrowRight size={14} /></Button></section>

  const laterVisible = showLater ?? experience.showLaterByDefault
  return (
    <section className="space-y-5" aria-label="Conveyancer cockpit">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article className="rounded-[18px] border border-primary/20 bg-white p-5 shadow-surface"><span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">Do this next</span><div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-semibold tracking-[-0.025em] text-textStrong">{experience.headline}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">{experience.summary}</p></div>{experience.primaryAction ? <Button type="button" onClick={() => handleIntent(experience.primaryAction)} disabled={busyActionKey === experience.primaryAction.actionKey}>{experience.primaryAction.intent.label}<ArrowRight size={14} /></Button> : null}</div><dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Ready', experience.counts.ready], ['Decisions', experience.counts.decisions], ['Needs help', experience.counts.blocked], ['Waiting', experience.counts.waiting]].map(([label, value]) => <div key={label} className="rounded-[11px] bg-surfaceAlt px-3 py-2"><dt className="text-xs text-textMuted">{label}</dt><dd className="mt-0.5 text-lg font-semibold text-textStrong">{value}</dd></div>)}</dl></article>
        <aside className={`rounded-[18px] border p-5 ${HEALTH_TONES[cockpit.health.tone] || HEALTH_TONES.neutral}`}><div className="flex items-center gap-2"><ShieldCheck size={18} /><strong className="text-sm font-semibold">{cockpit.health.label}</strong></div><p className="mt-3 text-sm leading-6 text-textBody">{cockpit.health.summary}</p><Button type="button" variant="secondary" size="sm" className="mt-4 w-full justify-center" onClick={() => void refresh()}><RefreshCw size={14} />Refresh</Button></aside>
      </div>

      {cockpit.reviewPrompts.map((prompt) => <div key={prompt.id} className="flex flex-col gap-3 rounded-[15px] border border-warning/30 bg-warningSoft px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-textStrong">Check what changed</strong><p className="mt-1 text-sm text-textBody">{prompt.label}</p><span className="mt-1 block text-xs text-textMuted">{formatWhen(prompt.occurredAt)}</span></div><Button type="button" variant="secondary" size="sm" onClick={() => onNavigate?.('transfer')}>Open review</Button></div>)}
      <div aria-live="polite">{message ? <p className="rounded-[12px] border border-success/25 bg-successSoft px-4 py-3 text-sm text-success">{message}</p> : null}{error ? <p className="rounded-[12px] border border-danger/25 bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}</div>

      {reasonDraft.actionKey ? <form className="rounded-[16px] border border-primary/25 bg-primarySoft p-4" onSubmit={(event) => { event.preventDefault(); const item = cockpit.queue.items.find((entry) => entry.actionKey === reasonDraft.actionKey); if (item && reasonDraft.value.trim()) void execute(item, reasonDraft.type === 'resume' ? 'resume' : 'mark_waiting', reasonDraft.value.trim()) }}><label htmlFor="conveyancer-action-reason" className="text-sm font-semibold text-textStrong">{reasonDraft.type === 'resume' ? 'What changed so this can continue?' : 'Who or what are we waiting on?'}</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><Field id="conveyancer-action-reason" value={reasonDraft.value} onChange={(event) => setReasonDraft((previous) => ({ ...previous, value: event.target.value }))} placeholder={reasonDraft.type === 'resume' ? 'The blocker is resolved because…' : 'For example: seller FICA documents'} autoFocus /><Button type="submit" disabled={!reasonDraft.value.trim() || Boolean(busyActionKey)}>Save</Button><Button type="button" variant="secondary" onClick={() => setReasonDraft(EMPTY_REASON)}>Cancel</Button></div></form> : null}

      <div className="space-y-4" aria-label="Work needing attention">{renderGroups(experience.attentionGroups)}</div>
      {experience.laterGroups.length ? <section><Button type="button" variant="secondary" className="w-full justify-between" aria-expanded={laterVisible} onClick={() => setShowLater(!laterVisible)}>{laterVisible ? 'Hide waiting and later work' : `Show waiting and later work (${experience.laterGroups.reduce((sum, group) => sum + group.items.length, 0)})`}{laterVisible ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</Button>{laterVisible ? <div className="mt-4 space-y-4">{renderGroups(experience.laterGroups)}</div> : null}</section> : null}

      <ConveyancerSystemStatus systems={experience.systems} fallback={experience.fallback} onNavigate={onNavigate} />
      <details className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-xs text-textMuted"><summary className="cursor-pointer font-semibold text-textBody">Plan and audit details</summary><p className="mt-2">Plan {experience.provenance.planId || 'pending'} · revision {experience.provenance.planRevision} · latest activity {experience.provenance.latestReceipt ? formatWhen(experience.provenance.latestReceipt.occurred_at) : 'not recorded'}</p></details>
    </section>
  )
}

export default ConveyancerCockpit
