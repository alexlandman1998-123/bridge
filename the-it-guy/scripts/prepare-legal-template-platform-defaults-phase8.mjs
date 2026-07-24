import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  buildPlatformDefaultReleaseRemediationPlan,
  PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG,
} from '../src/core/documents/platformDefaultReleaseRemediation.js'

const PHASE8_WRITE_FLAG_LABEL = 'LEGAL_TEMPLATE_PLATFORM_DEFAULTS_PHASE8_WRITE'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function groupBy(rows = [], keyFn) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    const values = groups.get(key) || []
    values.push(row)
    groups.set(key, values)
  }
  return groups
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url, 'Supabase URL is required.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required for the Phase 8 remediation planner.')

const apply = process.argv.includes('--apply')
const projectRef = new URL(url).hostname.split('.')[0]
const appliedBy = arg('applied-by')
const applicationReference = arg('reference')
const confirmProjectRef = arg('confirm-project-ref')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function readSnapshot() {
  const snapshotBlockers = []
  const { data: templates, error: templatesError } = await client
    .from('document_packet_templates')
    .select('id, organisation_id, module_type, packet_type, template_key, template_label, template_format, status, is_default, is_active, metadata_json, version_tag, created_at, updated_at, published_at')
    .is('organisation_id', null)
    .eq('module_type', 'agency')
    .in('packet_type', ['otp', 'mandate'])
    .in('template_key', ['otp_default_v1', 'mandate_default_v1'])
    .order('updated_at', { ascending: false })
  assert.ifError(templatesError)

  const templateIds = (templates || []).map((template) => template.id).filter(Boolean)
  const { data: sections, error: sectionsError } = templateIds.length
    ? await client
        .from('document_template_sections')
        .select('id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at')
        .in('template_id', templateIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    : { data: [], error: null }
  assert.ifError(sectionsError)

  const { data: provenanceRows, error: provenanceError } = templateIds.length
    ? await client
        .from('document_packet_template_release_provenance_phase4')
        .select('template_id, audit_event_id, content_digest, review_evidence_digest, b1_manifest_digest, review_reference, reviewed_by, reviewed_at, b3_applied_at, b3_applied_by, b3_application_reference, release_contract')
        .in('template_id', templateIds)
    : { data: [], error: null }
  if (provenanceError?.code === 'PGRST205') {
    snapshotBlockers.push({
      code: 'PHASE8_PROTECTED_PROVENANCE_TABLE_MISSING',
      detail: 'document_packet_template_release_provenance_phase4 is missing from the API schema cache. Deploy Phase 4 provenance migration before applying B3 runtime releases.',
    })
  } else {
    assert.ifError(provenanceError)
  }

  return { templates: templates || [], sections: sections || [], provenanceRows: provenanceRows || [], snapshotBlockers }
}

function mergeSnapshotFindings(plan, snapshot) {
  if (!snapshot.snapshotBlockers?.length) return plan
  const blockers = [...plan.blockers, ...snapshot.snapshotBlockers]
  const status = plan.actions.length
    ? 'PARTIAL_REPAIR_AVAILABLE'
    : 'BLOCKED_MANUAL_REVIEW_REQUIRED'
  return {
    ...plan,
    status,
    blockers,
    blockerCount: blockers.length,
  }
}

async function applyNormaliseAction(action) {
  const now = new Date().toISOString()
  const siblingIds = (action.scopeTemplateIds || []).filter((id) => id && id !== action.templateId)
  const selected = await client
    .from('document_packet_templates')
    .update({ status: 'published', is_active: true, is_default: true, updated_at: now })
    .eq('id', action.templateId)
  if (selected.error) throw selected.error

  if (siblingIds.length) {
    const archived = await client
      .from('document_packet_templates')
      .update({ status: 'archived', is_active: false, is_default: false, updated_at: now })
      .in('id', siblingIds)
    if (archived.error) throw archived.error
  }

  return { type: action.type, packetType: action.packetType, templateId: action.templateId, archivedSiblingCount: siblingIds.length }
}

async function applyB3Actions(actions) {
  const results = []
  const groups = groupBy(actions, (action) => action.approval?.b1ManifestDigest || '')
  for (const [manifestDigest, groupedActions] of groups.entries()) {
    if (!manifestDigest) throw new Error('B3 runtime release action is missing a B1 manifest digest.')
    const approvals = groupedActions.map((action) => {
      const { b1ManifestDigest, ...approval } = action.approval
      return approval
    })
    const result = await client.rpc('bridge_apply_legal_document_counsel_approvals', {
      p_b1_manifest_digest: manifestDigest,
      p_approvals: approvals,
      p_applied_by: appliedBy,
      p_application_reference: applicationReference,
    })
    if (result.error) throw result.error
    results.push({ type: 'apply_b3_runtime_release', manifestDigest, count: approvals.length, result: result.data })
  }
  return results
}

const snapshot = await readSnapshot()
const plan = mergeSnapshotFindings(buildPlatformDefaultReleaseRemediationPlan(snapshot), snapshot)

if (!apply) {
  console.log(JSON.stringify({ ...plan, mode: 'dry-run' }, null, 2))
  if (plan.status === 'BLOCKED_MANUAL_REVIEW_REQUIRED') process.exitCode = 1
} else {
  const applyBlockers = []
  if (env[PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG] !== 'true') applyBlockers.push({ code: 'PHASE8_WRITE_FLAG_MISSING', detail: `${PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG}=true is required.` })
  if (confirmProjectRef !== projectRef) applyBlockers.push({ code: 'PHASE8_PROJECT_CONFIRMATION_MISMATCH', detail: `Expected --confirm-project-ref=${projectRef}.` })
  if (!appliedBy) applyBlockers.push({ code: 'PHASE8_OPERATOR_MISSING', detail: '--applied-by is required for B3 runtime release actions.' })
  if (!applicationReference) applyBlockers.push({ code: 'PHASE8_APPLICATION_REFERENCE_MISSING', detail: '--reference is required for B3 runtime release actions.' })
  if (plan.actions.some((action) => action.safeAutomation !== true)) applyBlockers.push({ code: 'PHASE8_UNSAFE_ACTION_PRESENT', detail: 'Plan contains an action that is not marked safe for automation.' })
  if (plan.blockers.length) applyBlockers.push({ code: 'PHASE8_MANUAL_BLOCKERS_PRESENT', detail: 'Resolve manual blockers before applying Phase 8.', blockers: plan.blockers })

  if (applyBlockers.length) {
    console.log(JSON.stringify({ ...plan, mode: 'apply', status: 'BLOCKED', applyBlockers }, null, 2))
    process.exitCode = 1
  } else {
    const normaliseResults = []
    for (const action of plan.actions.filter((item) => item.applyMethod === 'supabase_update')) {
      normaliseResults.push(await applyNormaliseAction(action))
    }
    const b3Results = await applyB3Actions(plan.actions.filter((item) => item.applyMethod === 'bridge_apply_legal_document_counsel_approvals'))
    const afterSnapshot = await readSnapshot()
    const after = mergeSnapshotFindings(buildPlatformDefaultReleaseRemediationPlan(afterSnapshot), afterSnapshot)
    console.log(JSON.stringify({
      ...after,
      mode: 'apply',
      status: after.status === 'NO_REPAIR_NEEDED' ? 'APPLIED_GO' : 'APPLIED_WITH_REMAINING_WORK',
      mutatedData: true,
      applied: {
        normaliseResults,
        b3Results,
      },
    }, null, 2))
    if (after.status !== 'NO_REPAIR_NEEDED') process.exitCode = 1
  }
}
