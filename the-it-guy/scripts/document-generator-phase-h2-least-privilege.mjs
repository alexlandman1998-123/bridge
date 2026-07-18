import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'
import { assessDocumentGeneratorLeastPrivilegeBoundary } from '../src/core/documents/documentGeneratorLeastPrivilegeBoundary.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const SAFE_MISSING_VERSION_ID = '00000000-0000-4000-8000-000000000002'
function runJson(script, timeout = 540_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 40 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}

const h1Run = runJson('scripts/document-generator-phase-h1-access-boundary.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const targets = g1Run.report?.evidence || []
const organisationIds = [...new Set(targets.map((row) => row.organisationId).filter(Boolean))]
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const email = String(process.env.H2_UNASSIGNED_EMAIL || process.env.AGENCY_RUNTIME_UNASSIGNED_EMAIL || '').trim()
const password = String(process.env.H2_UNASSIGNED_PASSWORD || process.env.AGENCY_RUNTIME_UNASSIGNED_PASSWORD || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!h1Run.report) blockers.push({ code: 'H2_H1_CHECK_UNAVAILABLE', detail: h1Run.error, solution: 'Restore H1 cross-tenant verification before H2.' })
if (!g1Run.report) blockers.push({ code: 'H2_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled mandate and OTP pair.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'H2_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run H2 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !anon || !serviceKey) blockers.push({ code: 'H2_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure staging URL, anonymous key and service diagnostics credential.' })
if (!email || !password) blockers.push({ code: 'H2_UNASSIGNED_ACTOR_MISSING', solution: 'Configure H2_UNASSIGNED_EMAIL and H2_UNASSIGNED_PASSWORD for an active ordinary member.' })

let actorMembershipOrganisationCount = 0
let actorAuthorizedTargetCount = 0
let catalogue = {}
const policyProbes = []
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
  if (auth.error || !auth.data.session?.access_token || !auth.data.user?.id) blockers.push({ code: 'H2_UNASSIGNED_ACTOR_AUTH_FAILED', detail: auth.error?.message, solution: 'Repair the managed same-organisation actor credentials.' })
  else {
    const actorId = auth.data.user.id
    const token = auth.data.session.access_token
    const catalogueResult = await admin.rpc('bridge_get_document_generator_least_privilege_contract_h2')
    if (catalogueResult.error) blockers.push({ code: 'H2_CATALOGUE_PROBE_FAILED', detail: catalogueResult.error.message, solution: 'Deploy migration 202607180026 and restore its service-only catalogue RPC.' })
    else catalogue = catalogueResult.data || {}
    const memberships = organisationIds.length ? await admin.from('organisation_users').select('*').eq('user_id', actorId).in('organisation_id', organisationIds) : { data: [], error: null }
    if (memberships.error) blockers.push({ code: 'H2_MEMBERSHIP_PROBE_FAILED', detail: memberships.error.message, solution: 'Restore service-role membership diagnostics.' })
    const activeMemberships = (memberships.data || []).filter((row) => ['active', 'accepted'].includes(String(row.status || row.membership_status || '').toLowerCase()))
    actorMembershipOrganisationCount = new Set(activeMemberships.map((row) => row.organisation_id)).size
    const adminRoles = new Set(['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'manager', 'agency_admin', 'agent_admin'])
    const adminOrganisationIds = new Set(activeMemberships.filter((row) => [row.role, row.workspace_role, row.organisation_role, row.app_role].some((role) => adminRoles.has(String(role || '').toLowerCase()))).map((row) => row.organisation_id))
    const packetIds = targets.map((row) => row.packetId).filter(Boolean)
    const versionIds = targets.map((row) => row.versionId).filter(Boolean)
    const authority = packetIds.length ? await admin.from('document_packets').select('id,organisation_id,assigned_agent_id,created_by').in('id', packetIds) : { data: [], error: null }
    if (authority.error) blockers.push({ code: 'H2_PACKET_AUTHORITY_PROBE_FAILED', detail: authority.error.message, solution: 'Restore packet authority diagnostics.' })
    actorAuthorizedTargetCount = (authority.data || []).filter((packet) => adminOrganisationIds.has(packet.organisation_id) || packet.assigned_agent_id === actorId || packet.created_by === actorId).length
    for (const target of targets) {
      const result = await actor.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId })
      policyProbes.push({ packetType: target.packetType, allowed: result.error ? null : result.data === true, contractAvailable: !result.error })
    }
    const versions = versionIds.length ? await admin.from('document_packet_versions').select('id,rendered_document_id,rendered_file_bucket,rendered_file_path,final_signed_document_id,final_signed_file_bucket,final_signed_file_path').in('id', versionIds) : { data: [], error: null }
    if (versions.error) blockers.push({ code: 'H2_ARTIFACT_TARGET_LOOKUP_FAILED', detail: versions.error.message, solution: 'Restore version artifact diagnostics.' })
    const documentIds = [...new Set((versions.data || []).flatMap((row) => [row.rendered_document_id, row.final_signed_document_id]).filter(Boolean))]
    const targetByTable = {
      document_packets: ['id', packetIds], document_packet_versions: ['id', versionIds], document_packet_events: ['version_id', versionIds],
      documents: ['id', documentIds],
    }
    for (const table of documentGeneratorProtectedTables) {
      const [column, ids] = targetByTable[table] || ['packet_version_id', versionIds]
      const result = await actor.from(table).select(table === 'legal_final_delivery_claims' ? 'packet_version_id' : 'id').in(column, ids)
      tableProbes.push({ table, protected: Boolean(result.error) || !(result.data || []).length, visibleRowCount: result.data?.length || 0, deniedByGrant: Boolean(result.error) })
    }
    for (const target of targets) {
      const version = (versions.data || []).find((row) => row.id === target.versionId)
      for (const artifact of [{ artifactType: 'generated', bucket: version?.rendered_file_bucket, path: version?.rendered_file_path }, { artifactType: 'final', bucket: version?.final_signed_file_bucket, path: version?.final_signed_file_path }]) {
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
      invoke('dispatch-final-signed-document', { packetId: targets[0]?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      invoke('legal-document-watchdog'),
      invoke('retry-final-document-completion', { packetId: target?.packetId, packetVersionId: target?.versionId, rehearsal: true }),
    ])
    edgeProbes.mandateFinalizerRejected = mandate.status === 403 && mandate.body.errorCode === 'FINALISATION_FORBIDDEN' && Boolean(mandate.contract)
    edgeProbes.otpFinalizerRejected = otp.status === 403 && otp.body.errorCode === 'FINALISATION_FORBIDDEN' && Boolean(otp.contract)
    edgeProbes.dispatcherRejected = dispatcher.status === 403 && dispatcher.body.errorCode === 'FINAL_DELIVERY_FORBIDDEN'
    edgeProbes.watchdogRejected = watchdog.status === 401 && watchdog.body.errorCode === 'WATCHDOG_AUTH_REQUIRED'
    edgeProbes.recoveryRejected = recovery.status === 403 && recovery.body.errorCode === 'F5_ACCESS_DENIED'
  }
}

const assessment = assessDocumentGeneratorLeastPrivilegeBoundary({ h1: h1Run.report || {}, targetCount: targets.length, targetOrganisationCount: organisationIds.length, actorMembershipOrganisationCount, actorAuthorizedTargetCount, policyProbes, catalogue, tableProbes, storageProbes, rpcProbes, edgeProbes, mutatedData: false })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'H2', status: unique.length ? 'NO_GO' : 'READY_FOR_H3', ready: unique.length === 0, blockerCount: unique.length, blockers: unique, evidence: { h1Status: h1Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, targetOrganisationCount: organisationIds.length, actorMembershipOrganisationCount, actorAuthorizedTargetCount, policyProbes, catalogue, tableProbes, storageProbes, rpcProbes, edgeProbes }, projectRef, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
