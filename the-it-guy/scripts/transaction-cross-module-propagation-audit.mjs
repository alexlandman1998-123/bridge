#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Supabase URL and service-role key are required for this read-only audit.')

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const query = await db.from(table).select(columns).range(from, from + 999)
    if (query.error) throw new Error(`${table}: ${query.error.message}`)
    rows.push(...query.data)
    if (query.data.length < 1000) return rows
  }
}

function transactionIds(rows) {
  return new Set(rows.map((row) => row.transaction_id).filter(Boolean))
}

function countBy(rows, keyName) {
  const counts = new Map()
  for (const row of rows) {
    const keyValue = String(row[keyName] ?? 'null')
    counts.set(keyValue, (counts.get(keyValue) || 0) + 1)
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)))
}

function countByDerived(rows, deriveKey) {
  const counts = new Map()
  for (const row of rows) {
    const keyValue = String(deriveKey(row) ?? 'null')
    counts.set(keyValue, (counts.get(keyValue) || 0) + 1)
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)))
}

function mapLegacyStage(transaction) {
  const stage = String(transaction.current_main_stage || transaction.stage || '').toUpperCase()
  if (/CANCEL/.test(stage)) return 'CANCELLED'
  if (/COMPLETE|COMPLETED/.test(stage)) return 'COMPLETE'
  if (/REG/.test(stage)) return transaction.lifecycle_state === 'completed' ? 'COMPLETE' : 'REGISTRATION'
  if (/ATTY|XFER|TRANSFER|ATTORNEY/.test(stage)) return 'TRANSFER'
  if (/FIN|BOND|CASH|PROOF/.test(stage)) return 'FINANCE'
  if (/OTP/.test(stage)) return 'SALES_OTP'
  return 'SETUP'
}

const [
  transactions,
  workflowInstances,
  workflowSteps,
  workflowEvidence,
  rollups,
  subprocesses,
  subprocessSteps,
  sharedProgress,
  propagationAudits,
  rolloutSettings,
  rolloutRuns,
  events,
  transactionNotifications,
  automationEvents,
  documents,
  documentRequests,
  checklistItems,
  financeDetails,
  bondApplications,
] = await Promise.all([
  fetchAll('transactions', 'id,is_demo_data,is_active,lifecycle_state,stage,current_main_stage,current_sub_stage_summary,updated_at'),
  fetchAll('transaction_workflow_instances', 'id,transaction_id,workflow_key,status,updated_at'),
  fetchAll('transaction_workflow_steps', 'workflow_instance_id,transaction_id,workflow_key,step_key,status,updated_at'),
  fetchAll('transaction_workflow_evidence', 'transaction_id,workflow_step_id,evidence_type,evidence_status,created_at'),
  fetchAll('transaction_rollups', 'transaction_id,parent_stage,parent_status,progress_percent,active_workflow_key,active_step_key,is_stale,last_error,derived_at,updated_at'),
  fetchAll('transaction_subprocesses', 'id,transaction_id,process_type,status,lane_status,current_stage,visibility_scope,is_demo_data,updated_at'),
  fetchAll('transaction_subprocess_steps', 'subprocess_id,step_key,status,visibility_scope,updated_at'),
  fetchAll('transaction_shared_progress', 'id,transaction_id,process_key,step_key,status,visibility,source_type,updated_at'),
  fetchAll('transaction_progress_propagation_audits', 'status,gap_count,repaired_count,source,created_at'),
  fetchAll('transaction_progress_rollout_settings', 'environment,rollout_mode,canary_percent,auto_repair_enabled,max_gap_count,max_client_review_count,max_exhausted_email_count,updated_at'),
  fetchAll('transaction_progress_rollout_runs', 'environment,rollout_mode,decision,evaluated_transactions,repaired_count,alert_required,duration_ms,created_at'),
  fetchAll('transaction_events', 'transaction_id,event_type,visibility_scope,created_at'),
  fetchAll('transaction_notifications', 'transaction_id,notification_type,event_type,created_at'),
  fetchAll('notification_events', 'transaction_id,automation_key,channel,status,created_at'),
  fetchAll('documents', 'transaction_id,status,visibility_scope,stage_key,lane_key,updated_at'),
  fetchAll('document_requests', 'transaction_id,status,visibility_scope,lane_key,updated_at'),
  fetchAll('transaction_checklist_items', 'transaction_id,status,auto_rule_key,linked_document_id,linked_document_request_id,updated_at'),
  fetchAll('transaction_finance_details', 'transaction_id,proof_of_funds_received,deposit_paid,bond_submitted,bond_approved,grant_signed,proceed_to_attorneys,updated_at'),
  fetchAll('transaction_bond_applications', 'transaction_id,status,updated_at'),
])

const activeTransactions = transactions.filter((transaction) =>
  transaction.is_active !== false &&
  !['archived', 'cancelled'].includes(String(transaction.lifecycle_state || '').toLowerCase()),
)
const activeNonDemoTransactions = activeTransactions.filter((transaction) => transaction.is_demo_data !== true)
const knownTransactionIds = new Set(transactions.map((transaction) => transaction.id))

function coverage(rows, base = activeTransactions) {
  const coveredIds = transactionIds(rows)
  return {
    transactions: coveredIds.size,
    activeCovered: base.filter((transaction) => coveredIds.has(transaction.id)).length,
    activeMissing: base.filter((transaction) => !coveredIds.has(transaction.id)).length,
  }
}

const stepsBySubprocess = new Map()
for (const step of subprocessSteps) {
  if (!stepsBySubprocess.has(step.subprocess_id)) stepsBySubprocess.set(step.subprocess_id, [])
  stepsBySubprocess.get(step.subprocess_id).push(step)
}
const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]))
const sharedProgressKeys = new Set(sharedProgress.map((row) => `${row.transaction_id}:${row.process_key}`))
const sharedProgressByKey = new Map(sharedProgress.map((row) => [`${row.transaction_id}:${row.process_key}`, row]))
const sortedPropagationAudits = [...propagationAudits].sort(
  (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime(),
)
const sortedRolloutRuns = [...rolloutRuns].sort(
  (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime(),
)
const activeMissingSharedBaseline = activeTransactions.filter((transaction) => !sharedProgressKeys.has(`${transaction.id}:transaction`))
const progressedLanesMissingSharedProgress = subprocesses.filter((lane) => {
  const processKey = lane.process_type === 'attorney' ? 'transfer' : String(lane.process_type || '').toLowerCase()
  const status = String(lane.lane_status || lane.status || '').toLowerCase()
  return ['active', 'pending', 'in_progress', 'waiting', 'blocked', 'completed', 'complete'].includes(status)
    && !sharedProgressKeys.has(`${lane.transaction_id}:${processKey}`)
})
const staleSharedProgress = subprocesses.filter((lane) => {
  const processKey = lane.process_type === 'attorney' ? 'transfer' : String(lane.process_type || '').toLowerCase()
  const progress = sharedProgressByKey.get(`${lane.transaction_id}:${processKey}`)
  if (!progress || !lane.updated_at || !progress.updated_at) return false
  return new Date(lane.updated_at).getTime() > new Date(progress.updated_at).getTime() + 120_000
    && (String(lane.current_stage || 'not_started') !== String(progress.step_key || '')
      || String(lane.lane_status || lane.status || '') !== String(progress.status || ''))
})

let completedLaneWithOpenSteps = 0
let notStartedLaneWithProgressedSteps = 0
let nonDemoNotStartedLaneWithProgressedSteps = 0
let currentStageMissingFromSteps = 0
let progressedStepNewerThanTransaction = 0
const transactionsWithProgressedStepNewerThanTransaction = new Set()
for (const lane of subprocesses) {
  const steps = stepsBySubprocess.get(lane.id) || []
  const laneStatus = lane.lane_status || lane.status
  if (laneStatus === 'completed' && steps.some((step) => step.status !== 'completed')) completedLaneWithOpenSteps += 1
  if (laneStatus === 'not_started' && steps.some((step) => ['in_progress', 'completed', 'blocked', 'waiting'].includes(step.status))) {
    notStartedLaneWithProgressedSteps += 1
    if (transactionById.get(lane.transaction_id)?.is_demo_data !== true) nonDemoNotStartedLaneWithProgressedSteps += 1
  }
  if (lane.current_stage && steps.length && !steps.some((step) => step.step_key === lane.current_stage)) {
    currentStageMissingFromSteps += 1
  }
  const transaction = transactionById.get(lane.transaction_id)
  for (const step of steps) {
    if (!['in_progress', 'completed', 'blocked', 'waiting'].includes(step.status) || !transaction?.updated_at) continue
    if (new Date(step.updated_at).getTime() > new Date(transaction.updated_at).getTime() + 1000) {
      progressedStepNewerThanTransaction += 1
      transactionsWithProgressedStepNewerThanTransaction.add(lane.transaction_id)
    }
  }
}

const legacyVsRollupMismatch = rollups.filter((rollup) => {
  const transaction = transactionById.get(rollup.transaction_id)
  return transaction && mapLegacyStage(transaction) !== String(rollup.parent_stage || '').toUpperCase()
}).length

const eventTransactionIds = transactionIds(events)
const notificationTransactionIds = transactionIds(transactionNotifications)
const automationTransactionIds = transactionIds(automationEvents)
const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
const recentEvents = events.filter((event) => new Date(event.created_at).getTime() >= recentCutoff)
const recentEventTransactionIds = transactionIds(recentEvents)
const workflowLikeRecentEvents = recentEvents.filter((event) =>
  /workflow|transactionupdated|document|finance|attorney|bond/i.test(event.event_type || ''),
)

const operationalChecklist = checklistItems.filter((item) => String(item.auto_rule_key || '').startsWith('operational:'))
const linkedOperationalChecklist = operationalChecklist.filter((item) => item.linked_document_id || item.linked_document_request_id)

const report = {
  projectRef: new URL(url).hostname.split('.')[0],
  generatedAt: new Date().toISOString(),
  transactions: {
    total: transactions.length,
    active: activeTransactions.length,
    activeNonDemo: activeNonDemoTransactions.length,
    demoFlag: countBy(transactions, 'is_demo_data'),
    mainStage: countBy(activeTransactions, 'current_main_stage'),
  },
  canonicalWorkflow: {
    workflowInstances: coverage(workflowInstances),
    workflowSteps: coverage(workflowSteps),
    workflowEvidence: coverage(workflowEvidence),
    rollups: coverage(rollups),
    staleRollups: rollups.filter((rollup) => rollup.is_stale).length,
    rollupErrors: rollups.filter((rollup) => rollup.last_error).length,
    legacyVsRollupMismatch,
  },
  subprocessWorkflow: {
    subprocesses: coverage(subprocesses),
    subprocessCount: subprocesses.length,
    stepCount: subprocessSteps.length,
    status: countBy(subprocesses, 'status'),
    laneStatus: countBy(subprocesses, 'lane_status'),
    statusVsLaneStatus: countByDerived(subprocesses, (lane) => `${lane.status || 'null'} -> ${lane.lane_status || 'null'}`),
    stepStatus: countBy(subprocessSteps, 'status'),
    stepVisibility: countBy(subprocessSteps, 'visibility_scope'),
    completedLaneWithOpenSteps,
    notStartedLaneWithProgressedSteps,
    nonDemoNotStartedLaneWithProgressedSteps,
    currentStageMissingFromSteps,
    progressedStepNewerThanTransaction,
    transactionsWithProgressedStepNewerThanTransaction: transactionsWithProgressedStepNewerThanTransaction.size,
  },
  sharedProgressPropagation: {
    coverage: coverage(sharedProgress),
    rows: sharedProgress.length,
    processKey: countBy(sharedProgress, 'process_key'),
    visibility: countBy(sharedProgress, 'visibility'),
    activeMissingBaseline: activeMissingSharedBaseline.length,
    progressedLanesMissingSharedProgress: progressedLanesMissingSharedProgress.length,
    staleSharedProgress: staleSharedProgress.length,
    lastAssuranceRun: sortedPropagationAudits[0] || null,
    recentAssuranceRuns: sortedPropagationAudits.slice(0, 10),
    rollout: {
      settings: rolloutSettings,
      lastRun: sortedRolloutRuns[0] || null,
      recentRuns: sortedRolloutRuns.slice(0, 10),
      alertRuns: rolloutRuns.filter((run) => run.alert_required).length,
      decision: countBy(rolloutRuns, 'decision'),
    },
  },
  domainCoverage: {
    financeDetails: coverage(financeDetails),
    bondApplications: coverage(bondApplications),
    documents: coverage(documents),
    documentRequests: coverage(documentRequests),
    checklist: coverage(checklistItems),
    operationalChecklist: coverage(operationalChecklist),
    operationalChecklistRows: operationalChecklist.length,
    operationalChecklistLinkedToDocumentOrRequest: linkedOperationalChecklist.length,
  },
  events: {
    rows: events.length,
    transactions: eventTransactionIds.size,
    activeTransactionsWithoutAnyEvent: activeTransactions.filter((transaction) => !eventTransactionIds.has(transaction.id)).length,
    last30Days: recentEvents.length,
    transactionsLast30Days: recentEventTransactionIds.size,
    workflowLikeLast30Days: workflowLikeRecentEvents.length,
    visibility: countBy(events, 'visibility_scope'),
  },
  notifications: {
    transactionNotificationRows: transactionNotifications.length,
    transactionsWithTransactionNotifications: notificationTransactionIds.size,
    activeEventTransactionsWithoutTransactionNotification: activeTransactions.filter((transaction) =>
      eventTransactionIds.has(transaction.id) && !notificationTransactionIds.has(transaction.id),
    ).length,
    automationRows: automationEvents.length,
    transactionsWithAutomationEvents: automationTransactionIds.size,
    channels: countBy(automationEvents, 'channel'),
    status: countBy(automationEvents, 'status'),
    recentEventTransactionsWithoutAutomationEvent: [...recentEventTransactionIds].filter((id) => !automationTransactionIds.has(id)).length,
  },
  orphanRows: {
    workflowInstances: workflowInstances.filter((row) => !knownTransactionIds.has(row.transaction_id)).length,
    subprocesses: subprocesses.filter((row) => !knownTransactionIds.has(row.transaction_id)).length,
    events: events.filter((row) => row.transaction_id && !knownTransactionIds.has(row.transaction_id)).length,
  },
}

console.log(JSON.stringify(report, null, 2))
