import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'
import { assessDocumentGeneratorPublicSurfaceBoundary } from '../src/core/documents/documentGeneratorPublicSurfaceBoundary.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const SAFE_MISSING_VERSION_ID = '00000000-0000-4000-8000-000000000004'
function runJson(script, timeout = 660_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 60 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}
const h3Run = runJson('scripts/document-generator-phase-h3-authority-continuity.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const targets = g1Run.report?.evidence || []
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!h3Run.report) blockers.push({ code: 'H4_H3_CHECK_UNAVAILABLE', detail: h3Run.error, solution: 'Restore H3 authority continuity verification.' })
if (!g1Run.report) blockers.push({ code: 'H4_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled mandate and OTP pair.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'H4_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run H4 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !anon || !serviceKey) blockers.push({ code: 'H4_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure the staging URL, anonymous key and service diagnostics credential.' })

const tableProbes = [], storageProbes = [], publicUrlProbes = [], signerSurfaceEvidence = []
const rpcProbes = { packetAuthorityRejected: false, launchChainRejected: false, generatedPdfAccessRejected: false, completionStatusRejected: false, recoveryRehearsalRejected: false }
const operationProbes = { mandateFinalizerRejected: false, otpFinalizerRejected: false, dispatcherRejected: false, watchdogRejected: false, recoveryRejected: false }
const fakeTokenProbes = { resolveRejected: false, actionRejected: false, responsesSanitised: false }
if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const packetIds = targets.map((row) => row.packetId).filter(Boolean), versionIds = targets.map((row) => row.versionId).filter(Boolean)
  const versions = await admin.from('document_packet_versions').select('id,rendered_document_id,rendered_file_bucket,rendered_file_path,rendered_file_url,final_signed_document_id,final_signed_file_bucket,final_signed_file_path,final_signed_file_url').in('id', versionIds)
  if (versions.error) blockers.push({ code: 'H4_ARTIFACT_DIAGNOSTICS_FAILED', detail: versions.error.message, solution: 'Restore service-role generated/final artifact diagnostics.' })
  const documentIds = [...new Set((versions.data || []).flatMap((row) => [row.rendered_document_id, row.final_signed_document_id]).filter(Boolean))]
  const targetByTable = { document_packets: ['id', packetIds], document_packet_versions: ['id', versionIds], document_packet_events: ['version_id', versionIds], documents: ['id', documentIds] }
  for (const table of documentGeneratorProtectedTables) {
    const [column, ids] = targetByTable[table] || ['packet_version_id', versionIds]
    const result = await publicClient.from(table).select(table === 'legal_final_delivery_claims' ? 'packet_version_id' : 'id').in(column, ids)
    tableProbes.push({ table, protected: Boolean(result.error) || !(result.data || []).length, visibleRowCount: result.data?.length || 0, deniedByGrant: Boolean(result.error) })
  }
  for (const target of targets) {
    const version = (versions.data || []).find((row) => row.id === target.versionId)
    for (const artifact of [
      { artifactType: 'generated', bucket: version?.rendered_file_bucket, path: version?.rendered_file_path, persistedUrl: version?.rendered_file_url },
      { artifactType: 'final', bucket: version?.final_signed_file_bucket, path: version?.final_signed_file_path, persistedUrl: version?.final_signed_file_url },
    ]) {
      if (!artifact.bucket || !artifact.path) storageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, protected: false, missingEvidence: true })
      else {
        const download = await publicClient.storage.from(artifact.bucket).download(artifact.path)
        storageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, protected: Boolean(download.error) || !download.data })
      }
      const persistedUrl = String(artifact.persistedUrl || '').trim()
      let protectedUrl = !persistedUrl, httpStatus = null
      if (persistedUrl) try {
        const response = await fetch(persistedUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000) })
        httpStatus = response.status
        protectedUrl = [401, 403, 404, 410].includes(response.status)
      } catch { protectedUrl = true }
      publicUrlProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, persistedUrlPresent: Boolean(persistedUrl), protected: protectedUrl, httpStatus })
    }
    const surface = await admin.rpc('bridge_get_public_signer_surface_contract_h4', { p_packet_version_id: target.versionId })
    if (surface.error) blockers.push({ code: 'H4_SIGNER_SURFACE_DIAGNOSTIC_FAILED', packetType: target.packetType, detail: surface.error.message, solution: 'Deploy migration 202607180027 and restore its service-only diagnostic RPC.' })
    else signerSurfaceEvidence.push(surface.data)
  }
  const target = targets[0]
  if (target) {
    const [authority, launch, pdf, completion, recoveryRpc] = await Promise.all([
      publicClient.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId }),
      publicClient.rpc('bridge_get_document_generator_launch_chain_g1', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
      publicClient.rpc('bridge_authorize_persisted_pdf_access_d4', { p_packet_id: target.packetId, p_version_id: target.versionId, p_purpose: 'download' }),
      publicClient.rpc('bridge_get_final_completion_status_f5', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
      publicClient.rpc('bridge_rehearse_final_completion_recovery_g4', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
    ])
    rpcProbes.packetAuthorityRejected = Boolean(authority.error) || authority.data !== true
    rpcProbes.launchChainRejected = Boolean(launch.error) || !launch.data
    rpcProbes.generatedPdfAccessRejected = Boolean(pdf.error) || !pdf.data
    rpcProbes.completionStatusRejected = Boolean(completion.error) || !completion.data
    rpcProbes.recoveryRehearsalRejected = Boolean(recoveryRpc.error) || !recoveryRpc.data
  }
  async function invoke(name, body, includeAnonBearer = false) {
    const headers = { apikey: anon, 'Content-Type': 'application/json' }
    if (includeAnonBearer) headers.Authorization = `Bearer ${anon}`
    const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    return { status: response.status, body: await response.json().catch(() => ({})), contract: response.headers.get('x-legal-finalizer-contract') }
  }
  const mandate = targets.find((row) => row.packetType === 'mandate'), otp = targets.find((row) => row.packetType === 'otp')
  const fakeResolveToken = randomBytes(32).toString('hex'), fakeActionToken = randomBytes(32).toString('hex')
  const [mandateFinalizer, otpFinalizer, dispatcher, watchdog, recovery, resolve, action] = await Promise.all([
    invoke('generate-final-signed-document', { packetId: mandate?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }, true),
    invoke('generate-final-signed-otp', { packetId: otp?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }, true),
    invoke('dispatch-final-signed-document', { packetId: target?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }, true),
    invoke('legal-document-watchdog', {}, true),
    invoke('retry-final-document-completion', { packetId: target?.packetId, packetVersionId: target?.versionId, rehearsal: true }, true),
    invoke('resolve-signer-token', { action: 'resolve', token: fakeResolveToken }),
    invoke('signer-signing-action', { action: 'view', token: fakeActionToken }),
  ])
  const finalizerRejected = (row) => row.status === 403 && row.body.errorCode === 'FINALISATION_FORBIDDEN' && row.contract === 'h4-v1'
  operationProbes.mandateFinalizerRejected = finalizerRejected(mandateFinalizer)
  operationProbes.otpFinalizerRejected = finalizerRejected(otpFinalizer)
  operationProbes.dispatcherRejected = dispatcher.status === 403 && dispatcher.body.errorCode === 'FINAL_DELIVERY_FORBIDDEN'
  operationProbes.watchdogRejected = watchdog.status === 401 && watchdog.body.errorCode === 'WATCHDOG_AUTH_REQUIRED'
  operationProbes.recoveryRejected = [401, 403].includes(recovery.status) && ['F5_AUTH_INVALID', 'F5_ACCESS_DENIED'].includes(recovery.body.errorCode)
  fakeTokenProbes.resolveRejected = resolve.status === 404 && resolve.body.errorCode === 'INVALID_SIGNING_TOKEN'
  fakeTokenProbes.actionRejected = action.status === 404 && action.body.errorCode === 'INVALID_SIGNING_TOKEN'
  const fakeResponses = JSON.stringify([resolve.body, action.body])
  fakeTokenProbes.responsesSanitised = !targets.some((row) => fakeResponses.includes(row.packetId) || fakeResponses.includes(row.versionId)) && !/signer_email|signer_name|packet_id|packet_version_id|organisation_id/i.test(fakeResponses)
}

const assessment = assessDocumentGeneratorPublicSurfaceBoundary({ h3: h3Run.report || {}, targetCount: targets.length, tableProbes, storageProbes, publicUrlProbes, rpcProbes, operationProbes, fakeTokenProbes, signerSurfaceEvidence, mutatedData: false })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || item.packetType || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'H4', status: unique.length ? 'NO_GO' : 'READY_FOR_I1', ready: unique.length === 0, blockerCount: unique.length, blockers: unique, evidence: { h3Status: h3Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, tableProbes, storageProbes, publicUrlProbes, rpcProbes, operationProbes, fakeTokenProbes, signerSurfaceEvidence }, projectRef, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
