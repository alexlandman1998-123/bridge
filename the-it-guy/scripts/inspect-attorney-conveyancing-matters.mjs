import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { inspectMatterWorkflowPlanSnapshot, MATTER_WORKFLOW_PLAN_VERSION } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'

const STAGING_URL = 'https://vaszuxjeoajeuhlcnzzf.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const option = prefix => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
const snapshotPath = option('--snapshot=')
const stagingMatterId = option('--staging-matter=')
const evidencePath = option('--release-evidence=')
const requireClean = process.argv.includes('--require-clean') || Boolean(evidencePath)

function parseEnvFile(path) {
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Z_]+=/.test(line))
    .map(line => { const position = line.indexOf('='); return [line.slice(0, position), line.slice(position + 1).trim().replace(/^['"]|['"]$/g, '')] }))
}

async function loadStagingMatter(id) {
  assert.match(id, UUID, 'A staging matter UUID is required.')
  const env = parseEnvFile(resolve('.env.staging.local'))
  assert.equal(env.VITE_SUPABASE_URL, STAGING_URL, 'Refusing to inspect a non-staging project.')
  assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Staging read credential is unavailable.')
  const client = createClient(STAGING_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const read = async query => { const { data, error } = await query; if (error) throw error; return data }
  const transaction = await read(client.from('transactions').select('id,routing_profile_json,is_demo_data').eq('id', id).single())
  assert.equal(transaction.is_demo_data, true, 'Only labelled staging demo matters may be inspected directly.')
  const laneRows = await read(client.from('transaction_subprocesses').select('id,process_type').eq('transaction_id', id).in('process_type', ['transfer', 'bond', 'cancellation']))
  const stepRows = laneRows.length ? await read(client.from('transaction_subprocess_steps')
    .select('subprocess_id,step_key,status').in('subprocess_id', laneRows.map(lane => lane.id))) : []
  return [{ id, routingProfile: transaction.routing_profile_json || {}, lanes: laneRows.map(lane => ({
    laneKey: lane.process_type, steps: stepRows.filter(step => step.subprocess_id === lane.id),
  })) }]
}

function loadSnapshots(path) {
  const parsed = JSON.parse(readFileSync(resolve(path), 'utf8'))
  const matters = Array.isArray(parsed?.matters) ? parsed.matters : [parsed]
  assert.ok(matters.length > 0, 'The snapshot has no matters.')
  assert.ok(matters.length <= 100, 'Inspect at most 100 matters in one read-only batch.')
  const ids = new Set()
  for (const matter of matters) {
    assert.match(matter?.id || '', UUID, 'Each matter needs a UUID.')
    assert.ok(!ids.has(matter.id), 'The snapshot contains a duplicate matter.')
    ids.add(matter.id)
    assert.ok(matter.routingProfile && typeof matter.routingProfile === 'object', 'Each matter needs a routing profile.')
    assert.ok(Array.isArray(matter.lanes), 'Each matter needs lane task rows.')
    const laneKeys = new Set()
    for (const lane of matter.lanes) {
      assert.ok(['transfer', 'bond', 'cancellation'].includes(lane?.laneKey), 'Each lane needs a known lane key.')
      assert.ok(!laneKeys.has(lane.laneKey), 'The snapshot contains a duplicate lane.')
      laneKeys.add(lane.laneKey)
      assert.ok(Array.isArray(lane.steps), 'Each lane needs task rows.')
      const stepKeys = new Set()
      for (const step of lane.steps) {
        assert.ok(typeof step?.step_key === 'string' && step.step_key, 'Each task row needs a step key.')
        assert.ok(!stepKeys.has(step.step_key), 'The snapshot contains a duplicate task row.')
        stepKeys.add(step.step_key)
      }
    }
  }
  return matters
}

function releaseEvidenceIssues(reports, path) {
  const evidence = JSON.parse(readFileSync(resolve(path), 'utf8'))
  const issues = []
  const present = value => typeof value === 'string' && value.trim().length > 0
  if (reports.some(report => report.lodgedLanes.length)) issues.push('A lodged matter cannot enter an unlodged rollout cohort.')
  if (evidence.planVersion !== MATTER_WORKFLOW_PLAN_VERSION) issues.push('Plan version has not been signed off.')
  if (!/^[0-9a-f]{40}$/i.test(evidence.sourceRef || '') || !present(evidence.stagingMigrationReference)) {
    issues.push('The exact source commit and staging migration reference are required.')
  }
  if (!Number.isInteger(evidence.maxCohortSize) || evidence.maxCohortSize < 1 || reports.length > evidence.maxCohortSize) {
    issues.push('The reviewed cohort size is missing or exceeded.')
  }
  const actualIds = reports.map(item => item.id).sort()
  const approvedIds = Array.isArray(evidence.cohortMatterIds) ? [...evidence.cohortMatterIds].sort() : []
  if (JSON.stringify(actualIds) !== JSON.stringify(approvedIds) ||
    approvedIds.some(id => !UUID.test(id)) || new Set(approvedIds).size !== approvedIds.length) {
    issues.push('The inspected matters differ from the approved cohort.')
  }
  if (evidence.scenarioMatrixApproved !== true || !present(evidence.scenarioMatrixEvidenceReference)) {
    issues.push('The scenario matrix needs professional approval and an evidence reference.')
  }
  for (const role of ['transfer', 'bond', 'cancellation']) {
    for (const group of ['professionalReviews', 'stagingWalkthroughs']) {
      const review = evidence[group]?.[role]
      if (!present(review?.reviewer) || !review?.completedAt || Number.isNaN(Date.parse(review.completedAt)) ||
        !present(review?.evidenceReference) || review?.planVersion !== MATTER_WORKFLOW_PLAN_VERSION) {
        issues.push(`${group}.${role} needs a reviewer, valid completion date, current plan version and evidence reference.`)
      }
    }
  }
  return issues
}

if (Boolean(snapshotPath) === Boolean(stagingMatterId)) {
  console.error('Use exactly one of --snapshot=<read-only-export.json> or --staging-matter=<demo-uuid>.')
  process.exitCode = 2
} else {
  const matters = snapshotPath ? loadSnapshots(snapshotPath) : await loadStagingMatter(stagingMatterId)
  const reports = matters.map(matter => ({ id: matter.id,
    ...inspectMatterWorkflowPlanSnapshot({ routingProfile: matter.routingProfile, lanes: matter.lanes }) }))
  const releaseIssues = evidencePath ? releaseEvidenceIssues(reports, evidencePath) : []
  const reconciliationCount = reports.filter(report => report.requiresReconciliation).length
  const inspectionClean = reconciliationCount === 0
  const releaseReady = evidencePath ? inspectionClean && releaseIssues.length === 0 : null
  console.log(JSON.stringify({ mode: evidencePath ? 'release_gate' : stagingMatterId ? 'staging_read_only' : 'snapshot_read_only',
    candidateVersion: MATTER_WORKFLOW_PLAN_VERSION, matterCount: reports.length, reconciliationCount,
    releaseIssues, inspectionClean, releaseReady, matters: reports }, null, 2))
  if (requireClean && !(evidencePath ? releaseReady : inspectionClean)) process.exitCode = 1
}
