import { buildConveyancerOperationalProjections } from './conveyancerOrchestration.js'

export const CONVEYANCER_COCKPIT_VERSION = 'conveyancer_cockpit_p3_v1'

export const CONVEYANCER_COCKPIT_GROUPS = Object.freeze([
  Object.freeze({ key: 'review', label: 'Needs your decision', description: 'Open the matter details and make the legal or evidence decision.' }),
  Object.freeze({ key: 'do_now', label: 'Ready now', description: 'Your team can progress this work now.' }),
  Object.freeze({ key: 'blocked', label: 'Needs help', description: 'Resolve the stated issue before work continues.' }),
  Object.freeze({ key: 'waiting', label: 'Waiting on others', description: 'No action is required until the dependency arrives.' }),
  Object.freeze({ key: 'upcoming', label: 'Later', description: 'This work will unlock when its dependencies are ready.' }),
])

const REVIEW_EVENT_TYPES = new Set(['matter_facts_changed', 'external_evidence_received'])

function text(value = '') { return String(value ?? '').trim() }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function actionIntent(item = {}) {
  if (item.bucket === 'blocked') return { type: 'resume', label: 'Resolve blocker', requiresReason: true }
  if (item.bucket === 'waiting') return { type: 'resume', label: 'Resume work', requiresReason: true }
  if (item.evidence?.missing?.length) return { type: 'open_documents', label: `Add evidence (${item.evidence.missing.length})`, requiresReason: false }
  if (item.bucket === 'review') return { type: 'open_review', label: 'Open review', requiresReason: false }
  if (item.bucket === 'do_now') return { type: item.derivedReady ? 'start' : 'complete', label: item.derivedReady ? 'Start work' : 'Mark complete', requiresReason: false }
  return { type: 'view', label: 'View details', requiresReason: false }
}

function health(queue = {}) {
  const counts = queue.metrics?.countsByBucket || {}
  if (counts.blocked) return { key: 'blocked', label: 'Blocked', tone: 'danger', summary: `${counts.blocked} blocked action${counts.blocked === 1 ? '' : 's'} need attention.` }
  if (counts.review) return { key: 'review', label: 'Review needed', tone: 'warning', summary: `${counts.review} action${counts.review === 1 ? '' : 's'} need legal review.` }
  if (queue.metrics?.overdue) return { key: 'overdue', label: 'Overdue', tone: 'danger', summary: `${queue.metrics.overdue} action${queue.metrics.overdue === 1 ? '' : 's'} are overdue.` }
  if (queue.metrics?.actionable) return { key: 'actionable', label: 'Action ready', tone: 'primary', summary: `${queue.metrics.actionable} action${queue.metrics.actionable === 1 ? '' : 's'} can be progressed now.` }
  if (counts.waiting || counts.upcoming) return { key: 'waiting', label: 'In progress', tone: 'neutral', summary: 'The matter is waiting on dependencies or upcoming work.' }
  return { key: 'complete', label: 'Up to date', tone: 'success', summary: 'No open matter-plan actions remain.' }
}

export function buildConveyancerCockpit({ context = {}, actor = {}, asOf = '' } = {}) {
  const control = context.control || {}
  const state = context.state || {}
  const receipts = Array.isArray(state.orchestrationReceipts) ? state.orchestrationReceipts : []
  const latestReceipt = receipts[0] || null
  const reviewReceipts = receipts.filter((receipt) => REVIEW_EVENT_TYPES.has(text(receipt.event_type || receipt.eventType).toLowerCase()) && !(receipt.command_results || receipt.commandResults || []).length)

  if (control.killSwitchEnabled || control.mode === 'disabled') {
    return freeze({
      version: CONVEYANCER_COCKPIT_VERSION, status: 'paused', ready: false,
      health: { key: 'paused', label: 'Automation paused', tone: 'neutral', summary: 'The established attorney workflow remains available.' },
      control, plan: null, queue: null, groups: [], primaryAction: null,
      reviewPrompts: [], notices: ['P2 orchestration is disabled or protected by its kill switch.', 'Manual provider and attorney workflows remain available.'],
      provenance: { latestReceipt: null, planId: null, planRevision: 0 }, errors: [],
    })
  }
  if (!state.currentPlan) {
    return freeze({
      version: CONVEYANCER_COCKPIT_VERSION, status: 'awaiting_instruction', ready: false,
      health: { key: 'awaiting_instruction', label: 'Awaiting plan', tone: 'neutral', summary: 'Accept the signed instruction to create the matter plan.' },
      control, plan: null, queue: null, groups: [], primaryAction: null,
      reviewPrompts: [], notices: ['No persisted matter plan exists yet.', 'Manual provider workflows remain available.'],
      provenance: { latestReceipt, planId: null, planRevision: 0 }, errors: [],
    })
  }

  const projections = buildConveyancerOperationalProjections({ plan: state.currentPlan, actor, asOf })
  const queue = projections.actionQueue
  const decorated = (queue.items || []).map((item) => ({ ...item, intent: actionIntent(item) }))
  const groups = CONVEYANCER_COCKPIT_GROUPS.map((definition) => ({
    ...definition,
    items: decorated.filter((item) => item.bucket === definition.key),
  })).filter((group) => group.items.length)
  const primaryKey = queue.primaryAction?.actionKey || queue.attentionAction?.actionKey
  const primaryAction = decorated.find((item) => item.actionKey === primaryKey) || decorated[0] || null
  const matterHealth = projections.ok ? health(queue) : { key: 'invalid', label: 'Needs support', tone: 'danger', summary: 'The current plan could not be projected safely.' }
  return freeze({
    version: CONVEYANCER_COCKPIT_VERSION, status: projections.ok ? 'ready' : 'blocked', ready: projections.ok,
    health: matterHealth, control, plan: state.currentPlan, queue: { ...queue, items: decorated }, groups, primaryAction,
    reviewPrompts: reviewReceipts.map((receipt) => ({
      id: receipt.id, eventType: receipt.event_type || receipt.eventType,
      occurredAt: receipt.occurred_at || receipt.occurredAt,
      label: (receipt.event_type || receipt.eventType) === 'matter_facts_changed' ? 'Matter facts changed—review the rerouting impact.' : 'External evidence received—review before accepting it as legal evidence.',
    })),
    notices: ['External providers are optional; record and review manual evidence when no connection is active.'],
    provenance: {
      latestReceipt,
      planId: state.currentPlan.planId || null,
      planRevision: Number(state.planRecordRevision || 0),
      planDatabaseId: state.currentPlanDatabaseId || null,
    },
    errors: projections.errors,
  })
}
