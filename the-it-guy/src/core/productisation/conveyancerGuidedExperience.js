export const CONVEYANCER_GUIDED_EXPERIENCE_VERSION = 'conveyancer_guided_experience_p9_v1'

const ATTENTION_BUCKETS = new Set(['review', 'do_now', 'blocked'])
const text = (value = '') => String(value ?? '').trim()
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }

function systemState({ available, stopped, failed, observe, activeLabel, manualLabel }) {
  if (!available) return { key: 'manual', label: manualLabel, tone: 'neutral' }
  if (stopped) return { key: 'stopped', label: 'Stopped safely', tone: 'neutral' }
  if (failed) return { key: 'attention', label: 'Needs attention', tone: 'warning' }
  if (observe) return { key: 'observe', label: 'Watching only', tone: 'warning' }
  return { key: 'active', label: activeLabel, tone: 'success' }
}

export function buildConveyancerGuidedExperience({ cockpit = null, context = {} } = {}) {
  if (!cockpit) return freeze({ version: CONVEYANCER_GUIDED_EXPERIENCE_VERSION, ready: false, attentionGroups: [], laterGroups: [], systems: [] })
  const queue = cockpit.queue || { metrics: {}, items: [] }
  const groups = cockpit.groups || []
  const notifications = context.notificationSummary || {}
  const documents = context.documentPipelineSummary || {}
  const runtime = context.providerRuntimeSummary || {}
  const transport = context.providerTransportSummary || {}
  const operations = context.operationalSummary || {}
  const actionable = Number(queue.metrics?.actionable || 0)
  const decisions = Number(queue.metrics?.countsByBucket?.review || 0)
  const waiting = Number(queue.metrics?.countsByBucket?.waiting || 0) + Number(queue.metrics?.countsByBucket?.upcoming || 0)
  const blocked = Number(queue.metrics?.blocked || 0)
  const attentionGroups = groups.filter((group) => ATTENTION_BUCKETS.has(group.key))
  const laterGroups = groups.filter((group) => !ATTENTION_BUCKETS.has(group.key))
  const notificationState = systemState({ available: notifications.available, stopped: notifications.control?.killSwitchEnabled, failed: Number(notifications.counts?.failed || 0) > 0, observe: notifications.control?.mode === 'observe', activeLabel: 'Reminders active', manualLabel: 'Manual reminders' })
  const documentState = systemState({ available: documents.available, stopped: documents.control?.killSwitchEnabled, failed: Number(documents.counts?.failed || 0) > 0 || Number(documents.counts?.rejected || 0) > 0, observe: documents.control?.mode === 'observe', activeLabel: Number(documents.counts?.awaiting_review || 0) > 0 ? 'Review required' : 'Documents connected', manualLabel: 'Manual documents' })
  const providerState = systemState({ available: runtime.available, stopped: operations.killSwitchActive || runtime.control?.killSwitchEnabled, failed: operations.snapshot?.health === 'fail' || operations.applicationSnapshot?.health === 'fail' || runtime.health?.some?.((event) => event.circuit_state === 'open') || Number(transport.outbound?.dead_letter || 0) > 0 || Number(runtime.counts?.missing || 0) + Number(runtime.counts?.invalid || 0) + Number(runtime.counts?.resolver_unavailable || 0) > 0, observe: runtime.control?.mode === 'observe', activeLabel: runtime.providerReady ? 'Providers connected' : 'Manual provider work', manualLabel: 'Manual provider work' })
  return freeze({
    version: CONVEYANCER_GUIDED_EXPERIENCE_VERSION,
    ready: cockpit.ready,
    headline: cockpit.primaryAction?.label || (cockpit.status === 'ready' ? 'Matter is up to date' : cockpit.health?.label || 'Current workflow available'),
    summary: cockpit.primaryAction?.description || cockpit.health?.summary || '',
    primaryAction: cockpit.primaryAction || null,
    counts: { ready: actionable, decisions, waiting, blocked },
    attentionGroups,
    laterGroups,
    showLaterByDefault: attentionGroups.length === 0,
    systems: [
      { id: 'reminders', label: 'Reminders', state: notificationState.key, statusLabel: notificationState.label, tone: notificationState.tone, detail: notifications.available ? `${Number(notifications.counts?.queued || 0)} scheduled · ${Number(notifications.counts?.failed || 0)} need help` : 'Use the normal diary and communication process.' },
      { id: 'documents', label: 'Documents and signing', state: documentState.key, statusLabel: documentState.label, tone: documentState.tone, action: 'documents', detail: documents.available ? `${Number(documents.counts?.awaiting_review || 0)} to review · ${Number(documents.counts?.processing || 0)} processing · ${Number(documents.counts?.failed || 0)} failed` : 'Upload, prepare and sign through the existing document workspace.' },
      { id: 'providers', label: 'Banks, SARS, municipalities and Deeds', state: providerState.key, statusLabel: providerState.label, tone: providerState.tone, detail: runtime.available ? `${Number(runtime.counts?.verified || 0)} ready · ${Number(transport.recoverable || 0)} queued/recovering · ${Number(transport.attention || 0)} need attention` : 'Record provider outcomes manually; no external connection is required.' },
    ],
    fallback: 'You can always continue manually. Provider automation never blocks the conveyancing workflow.',
    provenance: { planId: text(cockpit.provenance?.planId), planRevision: Number(cockpit.provenance?.planRevision || 0), latestReceipt: cockpit.provenance?.latestReceipt || null },
  })
}
