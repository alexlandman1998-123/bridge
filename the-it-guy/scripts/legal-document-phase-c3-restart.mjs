import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { buildLegalDocumentReviewSnapshot, sha256, stableJson } from './legal-document-review-fingerprint.mjs'
import { normalizeIds } from './legal-document-phase-c1-source.mjs'

const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_C3_WRITE'
const MANIFEST_PATH = 'config/legal-document-review-manifest.json'
const REVIEW_PATH = 'config/legal-document-counsel-review.json'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const runJson = (script) => {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(result.stdout) } catch { return null }
}
const apply = process.argv.includes('--apply')
const c1 = runJson('scripts/legal-document-phase-c1-verify.mjs')
const c2 = runJson('scripts/legal-document-phase-c2-verify.mjs')
const previousManifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8')
const previousReviewRaw = fs.readFileSync(REVIEW_PATH, 'utf8')
const previousManifest = JSON.parse(previousManifestRaw)
const previousReview = JSON.parse(previousReviewRaw)
const blockers = []
if (c1?.status !== 'READY_FOR_B1_REFREEZE') blockers.push({ code: 'C3_C1_NOT_READY' })
if (c2?.status !== 'READY_FOR_B1_REFREEZE') blockers.push({ code: 'C3_C2_NOT_READY' })

let nextManifest = null
let nextReview = null
let templateIds = []
if (!blockers.length) {
  const snapshot = await buildLegalDocumentReviewSnapshot()
  const generatedAt = new Date().toISOString()
  nextManifest = { version: 1, phase: 'B1', status: 'frozen_for_counsel_review', digestAlgorithm: 'sha256', projectRef: snapshot.projectRef, candidateOrganisationIds: snapshot.candidateOrganisationIds, generatedAt, templates: snapshot.templates }
  nextManifest.manifestDigest = `sha256:${sha256(stableJson({ ...nextManifest, generatedAt: undefined, manifestDigest: undefined }))}`
  templateIds = normalizeIds(nextManifest.templates.map((row) => row.templateId))
  if (nextManifest.manifestDigest === previousManifest.manifestDigest) blockers.push({ code: 'C3_MANIFEST_UNCHANGED', detail: 'There is no new governed content to restart.' })
  if (nextManifest.templates.some((row) => !row.sourceAvailable)) blockers.push({ code: 'C3_SOURCE_UNREADABLE' })
  const priorById = new Map((previousReview.reviews || []).map((row) => [row.templateId, row]))
  nextReview = {
    version: 1,
    phase: 'B2',
    status: 'pending_review',
    projectRef: nextManifest.projectRef,
    b1ManifestDigest: nextManifest.manifestDigest,
    reviewBatchReference: null,
    cycleRestartReference: arg('reference') || null,
    reviews: nextManifest.templates.map((template) => {
      const prior = priorById.get(template.templateId)
      return { templateId: template.templateId, packetType: template.packetType, contentDigest: template.contentDigest, decision: 'pending', reviewedBy: null, reviewedAt: null, reviewReference: null, notes: null, history: [...(prior?.history || []), { action: 'review_cycle_restarted', previousContentDigest: prior?.contentDigest || null, nextContentDigest: template.contentDigest, previousManifestDigest: previousManifest.manifestDigest, nextManifestDigest: nextManifest.manifestDigest, recordedAt: generatedAt }] }
    }),
  }
}

if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'C3_WRITE_FLAG_MISSING' })
if (apply && arg('confirm-project-ref') !== nextManifest?.projectRef) blockers.push({ code: 'C3_PROJECT_CONFIRMATION_MISMATCH' })
if (apply && arg('confirm-previous-manifest-digest') !== previousManifest.manifestDigest) blockers.push({ code: 'C3_PREVIOUS_MANIFEST_CONFIRMATION_MISMATCH' })
if (apply && arg('confirm-next-manifest-digest') !== nextManifest?.manifestDigest) blockers.push({ code: 'C3_NEXT_MANIFEST_CONFIRMATION_MISMATCH' })
if (apply && normalizeIds(arg('confirm-template-ids')).join(',') !== templateIds.join(',')) blockers.push({ code: 'C3_TEMPLATE_CONFIRMATION_MISMATCH' })
if (apply && !arg('restarted-by')) blockers.push({ code: 'C3_OPERATOR_MISSING' })
if (apply && !arg('reference')) blockers.push({ code: 'C3_REFERENCE_MISSING' })

const report = { phase: 'C3', mode: apply ? 'apply' : 'dry-run', status: blockers.length ? 'BLOCKED' : apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY', projectRef: nextManifest?.projectRef || previousManifest.projectRef, previousManifestDigest: previousManifest.manifestDigest, nextManifestDigest: nextManifest?.manifestDigest || null, templateIds, c1Status: c1?.status || 'UNAVAILABLE', c2Status: c2?.status || 'UNAVAILABLE', blockers, mutatedData: false }
if (!apply || blockers.length) {
  console.log(JSON.stringify(report, null, 2))
  if (blockers.length) process.exitCode = 1
} else {
  if (fs.readFileSync(MANIFEST_PATH, 'utf8') !== previousManifestRaw || fs.readFileSync(REVIEW_PATH, 'utf8') !== previousReviewRaw) throw new Error('C3 evidence files changed during preparation; rerun the dry run.')
  const env = process.env
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const restart = await client.rpc('bridge_restart_legal_document_review_cycle', { p_previous_manifest_digest: previousManifest.manifestDigest, p_next_manifest_digest: nextManifest.manifestDigest, p_template_ids: templateIds, p_restarted_by: arg('restarted-by'), p_restart_reference: arg('reference') })
  if (restart.error) throw restart.error
  const manifestTemp = `${MANIFEST_PATH}.c3.tmp`
  const reviewTemp = `${REVIEW_PATH}.c3.tmp`
  try {
    fs.writeFileSync(manifestTemp, `${JSON.stringify(nextManifest, null, 2)}\n`, { flag: 'wx' })
    fs.writeFileSync(reviewTemp, `${JSON.stringify(nextReview, null, 2)}\n`, { flag: 'wx' })
    fs.renameSync(manifestTemp, MANIFEST_PATH)
    fs.renameSync(reviewTemp, REVIEW_PATH)
  } finally {
    if (fs.existsSync(manifestTemp)) fs.rmSync(manifestTemp)
    if (fs.existsSync(reviewTemp)) fs.rmSync(reviewTemp)
  }
  console.log(JSON.stringify({ ...report, status: 'RESTARTED_READY_FOR_B2', result: restart.data, operator: { restartedBy: arg('restarted-by'), reference: arg('reference') }, mutatedData: true }, null, 2))
}
