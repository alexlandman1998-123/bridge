import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessLegalDocumentAccessBoundary } from '../src/core/documents/legalDocumentAccessBoundary.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const g4 = runJson('scripts/legal-document-phase-g4-recovery-rehearsal.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const email = process.env.H1_UNRELATED_EMAIL || process.env.AGENCY_RUNTIME_UNRELATED_EMAIL || ''
const password = process.env.H1_UNRELATED_PASSWORD || process.env.AGENCY_RUNTIME_UNRELATED_PASSWORD || ''
if (!url || !anon || !process.env.SUPABASE_SERVICE_ROLE_KEY) blockers.push({ code: 'H1_SUPABASE_CONFIGURATION_MISSING' })
if (!email || !password) blockers.push({ code: 'H1_UNRELATED_ACTOR_MISSING' })

const targets = g1?.evidence || []
let unrelatedMembershipCount = 0
const tableProbes = []
const storageProbes = []
const functionProbes = { mandateFinalizerContract: false, otpFinalizerContract: false, dispatcherRejected: false, watchdogRejected: false }
if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const actor = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const auth = await actor.auth.signInWithPassword({ email, password })
  if (auth.error || !auth.data.session?.access_token || !auth.data.user?.id) blockers.push({ code: 'H1_UNRELATED_ACTOR_AUTH_FAILED', detail: auth.error?.message })
  else {
    const token = auth.data.session.access_token
    const organisationIds = [...new Set(targets.map((target) => target.organisationId).filter(Boolean))]
    if (organisationIds.length) {
      const memberships = await admin.from('organisation_users').select('id', { count: 'exact', head: true }).eq('user_id', auth.data.user.id).in('organisation_id', organisationIds)
      if (memberships.error) blockers.push({ code: 'H1_MEMBERSHIP_PROBE_FAILED', detail: memberships.error.message })
      unrelatedMembershipCount = Number(memberships.count || 0)
    }
    const packetIds = targets.map((target) => target.packetId).filter(Boolean)
    const versionIds = targets.map((target) => target.versionId).filter(Boolean)
    const probes = [
      ['document_packets', actor.from('document_packets').select('id').in('id', packetIds)],
      ['document_packet_versions', actor.from('document_packet_versions').select('id').in('id', versionIds)],
      ['document_packet_signers', actor.from('document_packet_signers').select('id').in('packet_version_id', versionIds)],
      ['document_signing_fields', actor.from('document_signing_fields').select('id').in('packet_version_id', versionIds)],
      ['document_packet_events', actor.from('document_packet_events').select('id').in('version_id', versionIds)],
      ['legal_final_artifact_evidence', actor.from('legal_final_artifact_evidence').select('id').in('packet_version_id', versionIds)],
      ['legal_final_artifact_deliveries', actor.from('legal_final_artifact_deliveries').select('id').in('packet_version_id', versionIds)],
      ['legal_final_artifact_publications', actor.from('legal_final_artifact_publications').select('id').in('packet_version_id', versionIds)],
    ]
    for (const [table, query] of probes) {
      const result = await query
      tableProbes.push({ table, protected: Boolean(result.error) || !(result.data || []).length, visibleRowCount: result.data?.length || 0, deniedByGrant: Boolean(result.error) })
    }
    if (versionIds.length) {
      const evidence = await admin.from('legal_final_artifact_evidence').select('packet_version_id, bucket, path').in('packet_version_id', versionIds)
      if (evidence.error) blockers.push({ code: 'H1_STORAGE_TARGET_PROBE_FAILED', detail: evidence.error.message })
      for (const artifact of evidence.data || []) {
        const download = await actor.storage.from(artifact.bucket).download(artifact.path)
        storageProbes.push({ packetVersionId: artifact.packet_version_id, protected: Boolean(download.error) || !download.data })
      }
    }
    async function invoke(name, body = {}) {
      const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
      return { response, body: await response.json().catch(() => ({})) }
    }
    const invalidVersionId = '00000000-0000-4000-8000-000000000000'
    const mandateTarget = targets.find((target) => target.packetType === 'mandate')
    const otpTarget = targets.find((target) => target.packetType === 'otp')
    const [mandate, otp, dispatcher, watchdog] = await Promise.all([
      invoke('generate-final-signed-document', mandateTarget ? { packetId: mandateTarget.packetId, packetVersionId: invalidVersionId } : {}),
      invoke('generate-final-signed-document', otpTarget ? { packetId: otpTarget.packetId, packetVersionId: invalidVersionId } : {}),
      invoke('dispatch-final-signed-document'), invoke('legal-document-watchdog'),
    ])
    functionProbes.mandateFinalizerContract = ['h1-v1', 'h2-v1', 'h3-v1', 'h4-v1'].includes(mandate.response.headers.get('x-legal-finalizer-contract'))
    functionProbes.otpFinalizerContract = ['h1-v1', 'h2-v1', 'h3-v1', 'h4-v1'].includes(otp.response.headers.get('x-legal-finalizer-contract'))
    functionProbes.dispatcherRejected = dispatcher.response.status === 403 && dispatcher.body.errorCode === 'FINAL_DELIVERY_FORBIDDEN'
    functionProbes.watchdogRejected = watchdog.response.status === 401 && watchdog.body.errorCode === 'WATCHDOG_AUTH_REQUIRED'
  }
}
const assessment = assessLegalDocumentAccessBoundary({ g4: g4 || {}, targetCount: targets.length, unrelatedMembershipCount, tableProbes, storageProbes, functionProbes })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  H1_G4_NOT_READY: 'Complete G4 recovery certification before access-boundary acceptance.',
  H1_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact cross-tenant targets exist.',
  H1_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL, anonymous key, and service-role diagnostics credential.',
  H1_UNRELATED_ACTOR_MISSING: 'Configure a managed staging user with no membership in the controlled organisation.',
  H1_UNRELATED_ACTOR_AUTH_FAILED: 'Repair the managed unrelated staging actor credentials.',
  H1_MEMBERSHIP_PROBE_FAILED: 'Restore service-role membership diagnostics before isolation testing.',
  H1_UNRELATED_ACTOR_NOT_ISOLATED: 'Use a genuinely unrelated actor with no controlled-organisation membership.',
  H1_CROSS_TENANT_TABLE_ACCESS_EXPOSED: 'Repair RLS or grants so the unrelated actor sees no packet, signer, event, or final-evidence rows.',
  H1_STORAGE_TARGET_PROBE_FAILED: 'Restore final-artifact evidence lookup for the storage isolation test.',
  H1_CROSS_TENANT_STORAGE_ACCESS_EXPOSED: 'Repair storage policies so unrelated authenticated users cannot download signed artifacts.',
  H1_EDGE_AUTHORITY_BOUNDARY_INVALID: 'Deploy the H1-authorized finalisers and protected dispatcher/watchdog contracts.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'H1', status: unique.length ? 'NO_GO' : 'READY_FOR_H2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this access-boundary gate and rerun H1.' })), evidence: { g4Status: g4?.status || 'UNAVAILABLE', targetCount: targets.length, unrelatedMembershipCount, tableProbes, storageProbes, functionProbes }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
