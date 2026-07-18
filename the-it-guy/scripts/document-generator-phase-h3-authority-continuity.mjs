import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'
import { assessDocumentGeneratorAuthorityContinuity, documentGeneratorAuthorisedReadTables } from '../src/core/documents/documentGeneratorAuthorityContinuity.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const SAFE_MISSING_VERSION_ID = '00000000-0000-4000-8000-000000000003'
function runJson(script, timeout = 600_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 50 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}
const h2Run = runJson('scripts/document-generator-phase-h2-least-privilege.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const targets = g1Run.report?.evidence || []
const organisationIds = [...new Set(targets.map((row) => row.organisationId).filter(Boolean))]
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const authorisedEmail = String(process.env.H3_AUTHORISED_EMAIL || process.env.H3_AUTHORIZED_EMAIL || process.env.DOCUMENT_GENERATOR_G2_EMAIL || '').trim()
const authorisedPassword = String(process.env.H3_AUTHORISED_PASSWORD || process.env.H3_AUTHORIZED_PASSWORD || process.env.DOCUMENT_GENERATOR_G2_PASSWORD || '').trim()
const revokedEmail = String(process.env.H3_REVOKED_EMAIL || '').trim()
const revokedPassword = String(process.env.H3_REVOKED_PASSWORD || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!h2Run.report) blockers.push({ code: 'H3_H2_CHECK_UNAVAILABLE', detail: h2Run.error, solution: 'Restore H2 verification before H3.' })
if (!g1Run.report) blockers.push({ code: 'H3_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled mandate and OTP pair.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'H3_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run H3 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !anon || !serviceKey) blockers.push({ code: 'H3_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure staging URL, anonymous key and service diagnostics credential.' })
if (!authorisedEmail || !authorisedPassword) blockers.push({ code: 'H3_AUTHORISED_ACTOR_MISSING', solution: 'Configure an active principal, assigned agent, or packet creator.' })
if (!revokedEmail || !revokedPassword) blockers.push({ code: 'H3_REVOKED_ACTOR_MISSING', solution: 'Configure an authenticated actor with an inactive or revoked target-organisation membership.' })

let authorisedActorAvailable = false
let revokedActorAvailable = false
let authorisedTargetCount = 0
let revokedMembershipOrganisationCount = 0
let revokedActiveMembershipCount = 0
const authorisedPolicyProbes = [], revokedPolicyProbes = [], authorisedTableProbes = [], revokedTableProbes = [], authorisedStorageProbes = [], revokedStorageProbes = []
const authorisedRpcProbes = { launchChain: false, generatedPdfAccess: false, completionStatus: false, recoveryRehearsal: false }
const revokedRpcProbes = { launchChain: false, generatedPdfAccess: false, completionStatus: false, recoveryRehearsal: false }
const authorisedEdgeProbes = { mandateFinalizerAccepted: false, otpFinalizerAccepted: false, recoveryAccepted: false }
const revokedEdgeProbes = { mandateFinalizerRejected: false, otpFinalizerRejected: false, recoveryRejected: false }
if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const authorised = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const revoked = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const [authorisedAuth, revokedAuth] = await Promise.all([authorised.auth.signInWithPassword({ email: authorisedEmail, password: authorisedPassword }), revoked.auth.signInWithPassword({ email: revokedEmail, password: revokedPassword })])
  authorisedActorAvailable = Boolean(!authorisedAuth.error && authorisedAuth.data.session?.access_token && authorisedAuth.data.user?.id)
  revokedActorAvailable = Boolean(!revokedAuth.error && revokedAuth.data.session?.access_token && revokedAuth.data.user?.id)
  if (!authorisedActorAvailable) blockers.push({ code: 'H3_AUTHORISED_ACTOR_AUTH_FAILED', detail: authorisedAuth.error?.message, solution: 'Repair the authorised staging actor credentials.' })
  if (!revokedActorAvailable) blockers.push({ code: 'H3_REVOKED_ACTOR_AUTH_FAILED', detail: revokedAuth.error?.message, solution: 'Repair the revoked actor login without reactivating membership.' })
  if (authorisedActorAvailable && revokedActorAvailable) {
    const authorisedId = authorisedAuth.data.user.id, revokedId = revokedAuth.data.user.id
    const packetIds = targets.map((row) => row.packetId).filter(Boolean), versionIds = targets.map((row) => row.versionId).filter(Boolean)
    const [authorisedMemberships, revokedMemberships, authority, versions] = await Promise.all([
      admin.from('organisation_users').select('*').eq('user_id', authorisedId).in('organisation_id', organisationIds),
      admin.from('organisation_users').select('*').eq('user_id', revokedId).in('organisation_id', organisationIds),
      admin.from('document_packets').select('id,organisation_id,assigned_agent_id,created_by').in('id', packetIds),
      admin.from('document_packet_versions').select('id,rendered_document_id,rendered_file_bucket,rendered_file_path,final_signed_document_id,final_signed_file_bucket,final_signed_file_path').in('id', versionIds),
    ])
    for (const result of [authorisedMemberships, revokedMemberships, authority, versions]) if (result.error) blockers.push({ code: 'H3_AUTHORITY_DIAGNOSTICS_FAILED', detail: result.error.message, solution: 'Restore service-role authority and artifact diagnostics.' })
    const active = (row) => ['active', 'accepted'].includes(String(row.status || row.membership_status || '').toLowerCase())
    const authorisedActive = (authorisedMemberships.data || []).filter(active)
    const adminRoles = new Set(['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'manager', 'agency_admin', 'agent_admin'])
    const adminOrganisationIds = new Set(authorisedActive.filter((row) => [row.role, row.workspace_role, row.organisation_role, row.app_role].some((role) => adminRoles.has(String(role || '').toLowerCase()))).map((row) => row.organisation_id))
    authorisedTargetCount = (authority.data || []).filter((packet) => adminOrganisationIds.has(packet.organisation_id) || packet.assigned_agent_id === authorisedId || packet.created_by === authorisedId).length
    revokedMembershipOrganisationCount = new Set((revokedMemberships.data || []).map((row) => row.organisation_id)).size
    revokedActiveMembershipCount = (revokedMemberships.data || []).filter(active).length
    for (const target of targets) {
      const [allowed, denied] = await Promise.all([authorised.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId }), revoked.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId })])
      authorisedPolicyProbes.push({ packetType: target.packetType, allowed: !allowed.error && allowed.data === true })
      revokedPolicyProbes.push({ packetType: target.packetType, allowed: denied.error ? null : denied.data === true })
    }
    const documentIds = [...new Set((versions.data || []).flatMap((row) => [row.rendered_document_id, row.final_signed_document_id]).filter(Boolean))]
    const targetByTable = { document_packets: ['id', packetIds], document_packet_versions: ['id', versionIds], document_packet_events: ['version_id', versionIds], documents: ['id', documentIds] }
    async function rows(client, table) {
      const [column, ids] = targetByTable[table] || ['packet_version_id', versionIds]
      return client.from(table).select(table === 'legal_final_delivery_claims' ? 'packet_version_id' : 'id').in(column, ids)
    }
    for (const table of documentGeneratorProtectedTables) {
      const [expected, visible, denied] = await Promise.all([rows(admin, table), rows(authorised, table), rows(revoked, table)])
      if (expected.error) blockers.push({ code: 'H3_TABLE_DIAGNOSTIC_FAILED', detail: `${table}: ${expected.error.message}`, solution: 'Restore service-role table diagnostics.' })
      if (documentGeneratorAuthorisedReadTables.includes(table)) authorisedTableProbes.push({ table, expectedCount: expected.data?.length || 0, visibleCount: visible.data?.length || 0, complete: !visible.error && (visible.data?.length || 0) === (expected.data?.length || 0) })
      revokedTableProbes.push({ table, protected: Boolean(denied.error) || !(denied.data || []).length, visibleRowCount: denied.data?.length || 0 })
    }
    for (const target of targets) {
      const version = (versions.data || []).find((row) => row.id === target.versionId)
      for (const artifact of [{ artifactType: 'generated', bucket: version?.rendered_file_bucket, path: version?.rendered_file_path }, { artifactType: 'final', bucket: version?.final_signed_file_bucket, path: version?.final_signed_file_path }]) {
        if (!artifact.bucket || !artifact.path) { authorisedStorageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, accessible: false, validPdf: false }); revokedStorageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, protected: false }); continue }
        const [allowed, denied] = await Promise.all([authorised.storage.from(artifact.bucket).download(artifact.path), revoked.storage.from(artifact.bucket).download(artifact.path)])
        const bytes = allowed.data ? new Uint8Array(await allowed.data.arrayBuffer()) : new Uint8Array()
        authorisedStorageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, accessible: !allowed.error && Boolean(allowed.data), validPdf: new TextDecoder().decode(bytes.subarray(0, 4)) === '%PDF' })
        revokedStorageProbes.push({ packetType: target.packetType, artifactType: artifact.artifactType, protected: Boolean(denied.error) || !denied.data })
      }
    }
    const rpcChecks = { launchChain: [], generatedPdfAccess: [], completionStatus: [], recoveryRehearsal: [] }
    const revokedRpcChecks = { launchChain: [], generatedPdfAccess: [], completionStatus: [], recoveryRehearsal: [] }
    for (const target of targets) {
      const calls = (client) => Promise.all([
        client.rpc('bridge_get_document_generator_launch_chain_g1', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
        client.rpc('bridge_authorize_persisted_pdf_access_d4', { p_packet_id: target.packetId, p_version_id: target.versionId, p_purpose: 'download' }),
        client.rpc('bridge_get_final_completion_status_f5', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
        client.rpc('bridge_rehearse_final_completion_recovery_g4', { p_packet_id: target.packetId, p_packet_version_id: target.versionId }),
      ])
      const [positive, negative] = await Promise.all([calls(authorised), calls(revoked)])
      const keys = Object.keys(rpcChecks)
      keys.forEach((key, index) => { rpcChecks[key].push(!positive[index].error && Boolean(positive[index].data)); revokedRpcChecks[key].push(Boolean(negative[index].error) || !negative[index].data) })
    }
    for (const key of Object.keys(rpcChecks)) { authorisedRpcProbes[key] = rpcChecks[key].length === targets.length && rpcChecks[key].every(Boolean); revokedRpcProbes[key] = revokedRpcChecks[key].length === targets.length && revokedRpcChecks[key].every(Boolean) }
    async function invoke(token, name, body) {
      const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
      return { status: response.status, body: await response.json().catch(() => ({})), contract: response.headers.get('x-legal-finalizer-contract') }
    }
    const authorisedToken = authorisedAuth.data.session.access_token, revokedToken = revokedAuth.data.session.access_token
    const mandate = targets.find((row) => row.packetType === 'mandate'), otp = targets.find((row) => row.packetType === 'otp')
    const [am, ao, rm, ro, ...recoveryResults] = await Promise.all([
      invoke(authorisedToken, 'generate-final-signed-document', { packetId: mandate?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      invoke(authorisedToken, 'generate-final-signed-otp', { packetId: otp?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      invoke(revokedToken, 'generate-final-signed-document', { packetId: mandate?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      invoke(revokedToken, 'generate-final-signed-otp', { packetId: otp?.packetId, packetVersionId: SAFE_MISSING_VERSION_ID }),
      ...targets.flatMap((target) => [invoke(authorisedToken, 'retry-final-document-completion', { packetId: target.packetId, packetVersionId: target.versionId, rehearsal: true }), invoke(revokedToken, 'retry-final-document-completion', { packetId: target.packetId, packetVersionId: target.versionId, rehearsal: true })]),
    ])
    const accepted = (row) => row.status === 400 && row.body.errorCode === 'NO_GENERATED_VERSION' && Boolean(row.contract)
    const rejected = (row) => row.status === 403 && row.body.errorCode === 'FINALISATION_FORBIDDEN' && Boolean(row.contract)
    authorisedEdgeProbes.mandateFinalizerAccepted = accepted(am); authorisedEdgeProbes.otpFinalizerAccepted = accepted(ao)
    revokedEdgeProbes.mandateFinalizerRejected = rejected(rm); revokedEdgeProbes.otpFinalizerRejected = rejected(ro)
    const authorisedRecoveries = recoveryResults.filter((_, index) => index % 2 === 0), revokedRecoveries = recoveryResults.filter((_, index) => index % 2 === 1)
    authorisedEdgeProbes.recoveryAccepted = authorisedRecoveries.length === targets.length && authorisedRecoveries.every((row) => row.status === 200 && row.body.success === true && row.body.mutatedData === false)
    revokedEdgeProbes.recoveryRejected = revokedRecoveries.length === targets.length && revokedRecoveries.every((row) => row.status === 403 && row.body.errorCode === 'F5_ACCESS_DENIED')
  }
}

const assessment = assessDocumentGeneratorAuthorityContinuity({ h2: h2Run.report || {}, targetCount: targets.length, targetOrganisationCount: organisationIds.length, authorisedActorAvailable, authorisedTargetCount, revokedActorAvailable, revokedMembershipOrganisationCount, revokedActiveMembershipCount, authorisedPolicyProbes, revokedPolicyProbes, authorisedTableProbes, revokedTableProbes, authorisedStorageProbes, revokedStorageProbes, authorisedRpcProbes, revokedRpcProbes, authorisedEdgeProbes, revokedEdgeProbes, mutatedData: false })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'H3', status: unique.length ? 'NO_GO' : 'READY_FOR_H4', ready: unique.length === 0, blockerCount: unique.length, blockers: unique, evidence: { h2Status: h2Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, targetOrganisationCount: organisationIds.length, authorisedActorAvailable, authorisedTargetCount, revokedActorAvailable, revokedMembershipOrganisationCount, revokedActiveMembershipCount, authorisedPolicyProbes, revokedPolicyProbes, authorisedTableProbes, revokedTableProbes, authorisedStorageProbes, revokedStorageProbes, authorisedRpcProbes, revokedRpcProbes, authorisedEdgeProbes, revokedEdgeProbes }, projectRef, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
