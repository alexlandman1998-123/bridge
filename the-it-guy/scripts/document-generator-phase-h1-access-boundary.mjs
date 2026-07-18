import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { assessDocumentGeneratorAccessBoundary, documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const SAFE_MISSING_VERSION_ID = '00000000-0000-4000-8000-000000000001'
function runJson(script, timeout = 480_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}

const g4Run = runJson('scripts/document-generator-phase-g4-recovery-rehearsal.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const targets = g1Run.report?.evidence || []
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const email = String(process.env.H1_UNRELATED_EMAIL || process.env.AGENCY_RUNTIME_UNRELATED_EMAIL || '').trim()
const password = String(process.env.H1_UNRELATED_PASSWORD || process.env.AGENCY_RUNTIME_UNRELATED_PASSWORD || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!g4Run.report) blockers.push({ code: 'H1_G4_CHECK_UNAVAILABLE', detail: g4Run.error, solution: 'Restore the G4 recovery verifier before H1.' })
if (!g1Run.report) blockers.push({ code: 'H1_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled OTP and mandate pair before H1.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'H1_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run H1 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !anon || !serviceKey) blockers.push({ code: 'H1_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure the staging URL, anonymous key and service diagnostics credential.' })
if (!email || !password) blockers.push({ code: 'H1_UNRELATED_ACTOR_MISSING', solution: 'Configure H1_UNRELATED_EMAIL and H1_UNRELATED_PASSWORD for a managed unrelated staging user.' })

let unrelatedMembershipCount = 0
const tableProbes = []
const storageProbes = []
const rpcProbes = { launchChainRejected: false, generatedPdfAccessRejected: false, completionStatusRejected: false, recoveryRehearsalRejected: false }
const edgeProbes = { mandateFinalizerRejected: false, otpFinalizerRejected: false, dispatcherRejected: false, watchdogRejected: false, recoveryRejected: false }
if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const actor = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const auth = await actor.auth.signInWithPassword({ email, password })
  if (auth.error || !auth.data.session?.access_token || !auth.data.user?.id) blockers.push({ code: 'H1_UNRELATED_ACTOR_AUTH_FAILED', detail: auth.error?.message, solution: 'Repair the managed unrelated staging actor credentials.' })
  else {
    const token = auth.data.session.access_token
    const organisationIds = [...new Set(targets.map((target) => target.organisationId).filter(Boolean))]
    const memberships = organisationIds.length ? await admin.from('organisation_users').select('id', { count: 'exact', head: true }).eq('user_id', auth.data.user.id).in('organisation_id', organisationIds) : { count: 0, error: null }
    if (memberships.error) blockers.push({ code: 'H1_MEMBERSHIP_PROBE_FAILED', detail: memberships.error.message, solution: 'Restore service-role membership diagnostics.' })
    unrelatedMembershipCount = Number(memberships.count || 0)

    const packetIds = targets.map((target) => target.packetId).filter(Boolean)
    const versionIds = targets.map((target) => target.versionId).filter(Boolean)
    const versions = versionIds.length ? await admin.from('document_packet_versions').select('id,packet_id,rendered_document_id,rendered_file_bucket,rendered_file_path,final_signed_document_id,final_signed_file_bucket,final_signed_file_path').in('id', versionIds) : { data: [], error: null }
    if (versions.error) blockers.push({ code: 'H1_ARTIFACT_TARGET_LOOKUP_FAILED', detail: versions.error.message, solution: 'Restore service-role version evidence lookup.' })
    const documentIds = [...new Set((versions.data || []).flatMap((row) => [row.rendered_document_id, row.final_signed_document_id]).filter(Boolean))]
    const queries = {
      document_packets: actor.from('document_packets').select('id').in('id', packetIds),
      document_packet_versions: actor.from('document_packet_versions').select('id').in('id', versionIds),
      document_packet_signers: actor.from('document_packet_signers').select('id').in('packet_version_id', versionIds),
      document_signing_fields: actor.from('document_signing_fields').select('id').in('packet_version_id', versionIds),
      document_packet_events: actor.from('document_packet_events').select('id').in('version_id', versionIds),
      document_signing_field_layouts: actor.from('document_signing_field_layouts').select('id').in('packet_version_id', versionIds),
      document_signing_dispatches: actor.from('document_signing_dispatches').select('id').in('packet_version_id', versionIds),
      document_signer_sessions: actor.from('document_signer_sessions').select('id').in('packet_version_id', versionIds),
      legal_final_artifact_evidence: actor.from('legal_final_artifact_evidence').select('id').in('packet_version_id', versionIds),
      legal_final_artifact_deliveries: actor.from('legal_final_artifact_deliveries').select('id').in('packet_version_id', versionIds),
      legal_final_artifact_publications: actor.from('legal_final_artifact_publications').select('id').in('packet_version_id', versionIds),
      legal_final_delivery_claims: actor.from('legal_final_delivery_claims').select('packet_version_id').in('packet_version_id', versionIds),
      legal_final_transaction_publications: actor.from('legal_final_transaction_publications').select('id').in('packet_version_id', versionIds),
      legal_final_completion_receipts: actor.from('legal_final_completion_receipts').select('id').in('packet_version_id', versionIds),
      legal_final_completion_retry_attempts: actor.from('legal_final_completion_retry_attempts').select('id').in('packet_version_id', versionIds),
      documents: actor.from('documents').select('id').in('id', documentIds),
    }
    for (const table of documentGeneratorProtectedTables) {
      const result = await queries[table]
      tableProbes.push({ table, protected: Boolean(result.error) || !(result.data || []).length, visibleRowCount: result.data?.length || 0, deniedByGrant: Boolean(result.error) })
    }
    for (const target of targets) {
      const version = (versions.data || []).find((row) => row.id === target.versionId)
      for (const artifact of [
        { artifactType: 'generated', bucket: version?.rendered_file_bucket, path: version?.rendered_file_path },
        { artifactType: 'final', bucket: version?.final_signed_file_bucket, path: version?.final_signed_file_path },
      ]) {
        if (!artifact.bucket || !artifact.path) { storageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, protected: false, missingEvidence: true }); continue }
        const download = await actor.storage.from(artifact.bucket).download(artifact.path)
        storageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, protected: Boolean(download.error) || !download.data })
      }
    }

    const target = targets[0]
    if (target) {
      const [launch, pdf, completion, recoveryRpc] = await Promise.all([
        actor.rpc('bridge_get_document_generator_launch_chain_g1', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
        actor.rpc('bridge_authorize_persisted_pdf_access_d4', { p_packet_id: target.packetId, p_version_id: target.versionId, p_purpose: 'download' }),
        actor.rpc('bridge_get_final_completion_status_f5', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
        actor.rpc('bridge_rehearse_final_completion_recovery_g4', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
      ])
      rpcProbes.launchChainRejected = Boolean(launch.error) || !launch.data
      rpcProbes.generatedPdfAccessRejected = Boolean(pdf.error) || !pdf.data
      rpcProbes.completionStatusRejected = Boolean(completion.error) || !completion.data
      rpcProbes.recoveryRehearsalRejected = Boolean(recoveryRpc.error) || !recoveryRpc.data
    }
    async function invoke(name, body = {}) {
      const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
      return { status: response.status, body: await response.json().catch(() => ({})), contract: response.headers.get('x-legal-finalizer-contract') }
    }
    const mandateTarget = targets.find((row) => row.packetType === 'mandate')
    const otpTarget = targets.find((row) => row.packetType === 'otp')
    const [mandate, otp, dispatcher, watchdog, recovery] = await Promise.all([
      invoke('generate-final-signed-document', { packetId: mandateTarget?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      invoke('generate-final-signed-otp', { packetId: otpTarget?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      invoke('dispatch-final-signed-document', {}),
      invoke('legal-document-watchdog', {}),
      invoke('retry-final-document-completion', { packetId: target?.packetId, packetVersionId: target?.versionId, rehearsal: true }),
    ])
    edgeProbes.mandateFinalizerRejected = mandate.status === 403 && mandate.body.errorCode === 'FINALISATION_FORBIDDEN' && Boolean(mandate.contract)
    edgeProbes.otpFinalizerRejected = otp.status === 403 && otp.body.errorCode === 'FINALISATION_FORBIDDEN' && Boolean(otp.contract)
    edgeProbes.dispatcherRejected = dispatcher.status === 403 && dispatcher.body.errorCode === 'FINAL_DELIVERY_FORBIDDEN'
    edgeProbes.watchdogRejected = watchdog.status === 401 && watchdog.body.errorCode === 'WATCHDOG_AUTH_REQUIRED'
    edgeProbes.recoveryRejected = recovery.status === 403 && recovery.body.errorCode === 'F5_ACCESS_DENIED'
  }
}

const assessment = assessDocumentGeneratorAccessBoundary({ g4: g4Run.report || {}, targetCount: targets.length, unrelatedMembershipCount, tableProbes, storageProbes, rpcProbes, edgeProbes, mutatedData: false })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'H1', status: unique.length ? 'NO_GO' : 'READY_FOR_H2', ready: unique.length === 0, blockerCount: unique.length, blockers: unique, evidence: { g4Status: g4Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, unrelatedMembershipCount, tableProbes, storageProbes, rpcProbes, edgeProbes }, projectRef, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
