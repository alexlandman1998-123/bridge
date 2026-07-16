import { buildConveyancerCockpit } from './conveyancerCockpit.js'
import {
  buildConveyancerApplicationProjection,
  loadConveyancerApplicationContext,
  loadConveyancerApplicationRuntime,
} from './conveyancerApplicationOrchestratorH2.js'

export const CONVEYANCER_COCKPIT_H3_VERSION = 'conveyancer_cockpit_h3_v1'

export const CONVEYANCER_COCKPIT_H3_FILTERS = Object.freeze([
  Object.freeze({ key: 'attention', label: 'Needs attention' }),
  Object.freeze({ key: 'mine', label: 'My work' }),
  Object.freeze({ key: 'decisions', label: 'Decisions' }),
  Object.freeze({ key: 'blocked', label: 'Blocked' }),
  Object.freeze({ key: 'waiting', label: 'Waiting and later' }),
  Object.freeze({ key: 'all', label: 'All open work' }),
])

export const CONVEYANCER_COCKPIT_H3_CONTROLS = Object.freeze({
  sourceOfTruth: 'P1_immutable_revisions',
  applicationBoundary: 'H2_guarded_application_orchestrator',
  directTableWritesAllowed: false,
  queuePersisted: false,
  filtersPersisted: false,
  externalProvidersRequired: false,
  missingRuntimeFallsBackSafely: true,
})

const ATTENTION = new Set(['review', 'do_now', 'blocked'])
const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const label = (value = '') => { const normalized = text(value).replaceAll('_', ' ').replaceAll('.', ' '); return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : '' }
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }

function latestRevisions(rows = []) {
  const latest = new Map()
  for (const row of rows || []) {
    const identity = text(row.record_id || row.recordId || row.id)
    if (!identity) continue
    const current = latest.get(identity)
    if (!current || Number(row.revision || 0) > Number(current.revision || 0)) latest.set(identity, row)
  }
  return [...latest.values()]
}

function runtimeStatus(row = {}, field) {
  return key(row[field] || row[field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || row.status)
}

export function summarizeConveyancerCockpitRuntime(runtime = {}, runtimeAvailability = {}) {
  const exceptions = latestRevisions(runtime.exceptions)
  const coordinations = latestRevisions(runtime.coordinations)
  const evidence = latestRevisions(runtime.evidence)
  const financialModels = latestRevisions(runtime.financialModels)
  const openExceptions = exceptions.filter((row) => !['resolved', 'superseded'].includes(runtimeStatus(row, 'status')))
  const coordinationAttention = coordinations.filter((row) => ['action_required', 'blocked'].includes(runtimeStatus(row, 'coordination_status')))
  const evidenceReview = evidence.filter((row) => ['under_review', 'rejected', 'action_required'].includes(runtimeStatus(row, 'evidence_status')))
  const financialAttention = financialModels.filter((row) => ['under_review', 'reconciliation_required'].includes(runtimeStatus(row, 'model_status')))
  const notices = [
    ...openExceptions.map((row) => ({ id: `exception:${row.id}`, type: 'exception', tone: 'danger', label: label(row.payload?.title || row.exception_code || row.exceptionCode) || 'Matter exception needs attention', target: 'transfer' })),
    ...coordinationAttention.map((row) => ({ id: `coordination:${row.id}`, type: 'coordination', tone: 'warning', label: text(row.payload?.title || row.payload?.summary) || 'Professional coordination needs attention', target: 'transfer' })),
    ...evidenceReview.map((row) => ({ id: `evidence:${row.id}`, type: 'evidence', tone: 'warning', label: label(row.payload?.label || row.evidence_type || row.evidenceType) || 'Evidence needs review', target: 'documents' })),
    ...financialAttention.map((row) => ({ id: `financial:${row.id}`, type: 'financial', tone: 'warning', label: label(row.payload?.label) || 'Financial reconciliation needs attention', target: 'finance' })),
  ]
  return freeze({
    available: runtimeAvailability.available !== false,
    reason: text(runtimeAvailability.reason) || 'loaded',
    counts: { exceptions: openExceptions.length, coordination: coordinationAttention.length, evidenceReview: evidenceReview.length, financial: financialAttention.length, totalAttention: notices.length },
    notices,
  })
}

function ownedByActor(item = {}, actor = {}) {
  const owner = item.owner || {}
  const actorUserId = text(actor.userId || actor.user_id)
  const actorRole = key(actor.role)
  return Boolean((actorUserId && text(owner.userId || owner.user_id) === actorUserId) || (actorRole && key(owner.role) === actorRole))
}

function matchesFilter(item, filter, actor) {
  if (filter === 'all') return true
  if (filter === 'mine') return ownedByActor(item, actor)
  if (filter === 'decisions') return item.bucket === 'review'
  if (filter === 'blocked') return item.bucket === 'blocked'
  if (filter === 'waiting') return ['waiting', 'upcoming'].includes(item.bucket)
  return ATTENTION.has(item.bucket)
}

function matchesSearch(item, search) {
  const needle = text(search).toLowerCase()
  if (!needle) return true
  const haystack = [item.label, item.description, item.actionKey, item.owner?.role, item.waitingOn, item.blockerReason, ...(item.evidence?.missing || []).map((entry) => entry.label)].map(text).join(' ').toLowerCase()
  return haystack.includes(needle)
}

function filterCounts(items, actor) {
  return Object.fromEntries(CONVEYANCER_COCKPIT_H3_FILTERS.map((definition) => [definition.key, items.filter((item) => matchesFilter(item, definition.key, actor)).length]))
}

export function buildConveyancerCockpitH3({ context = {}, actor = {}, asOf = '', filter = 'attention', search = '' } = {}) {
  const cockpit = buildConveyancerCockpit({ context, actor, asOf })
  const selectedFilter = CONVEYANCER_COCKPIT_H3_FILTERS.some((item) => item.key === key(filter)) ? key(filter) : 'attention'
  const runtime = summarizeConveyancerCockpitRuntime(context.runtime, context.runtimeAvailability)
  if (!cockpit.queue) return freeze({ ...cockpit, version: CONVEYANCER_COCKPIT_H3_VERSION, runtime, applicationProjection: null, workspace: { selectedFilter, search: text(search), filters: CONVEYANCER_COCKPIT_H3_FILTERS.map((item) => ({ ...item, count: 0 })), groups: [], items: [], empty: true, emptyMessage: 'No generated work is available yet.' } })
  const allItems = cockpit.queue.items || []
  const counts = filterCounts(allItems, actor)
  const items = allItems.filter((item) => matchesFilter(item, selectedFilter, actor) && matchesSearch(item, search))
  const itemKeys = new Set(items.map((item) => item.actionKey))
  const groups = cockpit.groups.map((group) => ({ ...group, items: group.items.filter((item) => itemKeys.has(item.actionKey)) })).filter((group) => group.items.length)
  const applicationProjection = buildConveyancerApplicationProjection({ context, actor, asOf })
  const emptyMessage = text(search)
    ? 'No work matches this search. Clear the search or choose another view.'
    : selectedFilter === 'mine'
      ? 'Nothing is assigned to your role right now. Check all open work if you are helping the team.'
      : selectedFilter === 'attention'
        ? 'Nothing needs attention right now. Waiting and later work is still available.'
        : 'No work is in this view right now.'
  return freeze({
    ...cockpit,
    version: CONVEYANCER_COCKPIT_H3_VERSION,
    runtime,
    applicationProjection,
    workspace: {
      selectedFilter,
      search: text(search),
      filters: CONVEYANCER_COCKPIT_H3_FILTERS.map((item) => ({ ...item, count: counts[item.key] })),
      groups,
      items,
      empty: items.length === 0,
      emptyMessage,
    },
  })
}

function missingRuntime(error) {
  return ['42P01', 'PGRST202', 'PGRST205'].includes(error?.code) || /conveyancer_(exceptions|coordinations|evidence|financial_models)/i.test(error?.message || '')
}

export async function loadConveyancerCockpitH3Context(client, binding = {}) {
  const context = await loadConveyancerApplicationContext(client, binding)
  try {
    const runtime = await loadConveyancerApplicationRuntime(client, binding)
    return freeze({ ...context, runtime, runtimeAvailability: { available: true, reason: 'loaded' } })
  } catch (error) {
    if (!missingRuntime(error)) throw error
    return freeze({ ...context, runtime: { exceptions: [], coordinations: [], evidence: [], financialModels: [] }, runtimeAvailability: { available: false, reason: 'h2_runtime_not_installed' } })
  }
}
