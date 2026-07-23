import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessLegalDocumentLeastPrivilegeBoundary } from '../src/core/documents/legalDocumentLeastPrivilegeBoundary.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const h1 = runJson('scripts/legal-document-phase-h1-access-boundary.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const email = process.env.H2_UNASSIGNED_EMAIL || process.env.AGENCY_RUNTIME_UNASSIGNED_EMAIL || ''
const password = process.env.H2_UNASSIGNED_PASSWORD || process.env.AGENCY_RUNTIME_UNASSIGNED_PASSWORD || ''
if (!url || !anon || !serviceKey) blockers.push({ code: 'H2_SUPABASE_CONFIGURATION_MISSING' })
if (!email || !password) blockers.push({ code: 'H2_UNASSIGNED_ACTOR_MISSING' })

const targets = g1?.evidence || []
const organisationIds = [...new Set(targets.map((target) => target.organisationId).filter(Boolean))]
let actorMembershipOrganisationCount = 0
let actorAuthorizedTargetCount = 0
const policyProbes = []
const tableProbes = []
const storageProbes = []
const functionProbes = { mandateFinalizerRejected: false, otpFinalizerRejected: false, dispatcherRejected: false }
if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const actor = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const auth = await actor.auth.signInWithPassword({ email, password })
  if (auth.error || !auth.data.session?.access_token || !auth.data.user?.id) blockers.push({ code: 'H2_UNASSIGNED_ACTOR_AUTH_FAILED', detail: auth.error?.message })
  else {
    const actorId = auth.data.user.id
    const token = auth.data.session.access_token
    const memberships = organisationIds.length
      ? await admin.from('organisation_users').select('*').eq('user_id', actorId).in('organisation_id', organisationIds)
      : { data: [], error: null }
    if (memberships.error) blockers.push({ code: 'H2_MEMBERSHIP_PROBE_FAILED', detail: memberships.error.message })
    const activeMemberships = (memberships.data || []).filter((row) => ['active', 'accepted'].includes(String(row.status || row.membership_status || '').toLowerCase()))
    actorMembershipOrganisationCount = new Set(activeMemberships.map((row) => row.organisation_id)).size
    const adminRoles = new Set(['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'manager', 'agency_admin', 'agent_admin'])
    const adminOrganisationIds = new Set(activeMemberships.filter((row) => [row.role, row.workspace_role, row.organisation_role, row.app_role].some((role) => adminRoles.has(String(role || '').toLowerCase()))).map((row) => row.organisation_id))
    const packetIds = targets.map((target) => target.packetId).filter(Boolean)
    const versionIds = targets.map((target) => target.versionId).filter(Boolean)
    const authorityRows = packetIds.length
      ? await admin.from('document_packets').select('id, organisation_id, assigned_agent_id, created_by').in('id', packetIds)
      : { data: [], error: null }
    if (authorityRows.error) blockers.push({ code: 'H2_PACKET_AUTHORITY_PROBE_FAILED', detail: authorityRows.error.message })
    actorAuthorizedTargetCount = (authorityRows.data || []).filter((packet) => adminOrganisationIds.has(packet.organisation_id) || packet.assigned_agent_id === actorId || packet.created_by === actorId).length
    for (const target of targets) {
      const policy = await actor.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId })
      policyProbes.push({ packetType: target.packetType, allowed: policy.error ? null : policy.data === true, contractAvailable: !policy.error })
      if (policy.error) blockers.push({ code: 'H2_POLICY_PROBE_FAILED', detail: policy.error.message })
    }
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
      if (evidence.error) blockers.push({ code: 'H2_STORAGE_TARGET_PROBE_FAILED', detail: evidence.error.message })
      for (const artifact of evidence.data || []) {
        const download = await actor.storage.from(artifact.bucket).download(artifact.path)
        storageProbes.push({ packetVersionId: artifact.packet_version_id, protected: Boolean(download.error) || !download.data })
      }
    }
    async function invoke(name, body) {
      const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
      return { response, body: await response.json().catch(() => ({})) }
    }
    const invalidVersionId = '00000000-0000-4000-8000-000000000000'
    const mandateTarget = targets.find((target) => target.packetType === 'mandate')
    const otpTarget = targets.find((target) => target.packetType === 'otp')
    const [mandate, otp, dispatcher] = await Promise.all([
      mandateTarget ? invoke('generate-final-signed-document', { packetId: mandateTarget.packetId, packetVersionId: invalidVersionId }) : null,
      otpTarget ? invoke('generate-final-signed-document', { packetId: otpTarget.packetId, packetVersionId: invalidVersionId }) : null,
      targets[0] ? invoke('dispatch-final-signed-document', { packetId: targets[0].packetId, packetVersionId: invalidVersionId }) : null,
    ])
    functionProbes.mandateFinalizerRejected = Boolean(mandate && ['h2-v1', 'h3-v1', 'h4-v1'].includes(mandate.response.headers.get('x-legal-finalizer-contract')) && mandate.response.status === 403 && mandate.body.errorCode === 'FINALISATION_FORBIDDEN')
    functionProbes.otpFinalizerRejected = Boolean(otp && ['h2-v1', 'h3-v1', 'h4-v1'].includes(otp.response.headers.get('x-legal-finalizer-contract')) && otp.response.status === 403 && otp.body.errorCode === 'FINALISATION_FORBIDDEN')
    functionProbes.dispatcherRejected = Boolean(dispatcher && dispatcher.response.status === 403 && dispatcher.body.errorCode === 'FINAL_DELIVERY_FORBIDDEN')
  }
}
const assessment = assessLegalDocumentLeastPrivilegeBoundary({ h1: h1 || {}, targetCount: targets.length, targetOrganisationCount: organisationIds.length, actorMembershipOrganisationCount, actorAuthorizedTargetCount, policyProbes, tableProbes, storageProbes, functionProbes })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  H2_H1_NOT_READY: 'Complete H1 cross-tenant isolation before same-tenant least-privilege acceptance.',
  H2_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact packet targets exist.',
  H2_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL, anonymous key, and service-role diagnostics credential.',
  H2_UNASSIGNED_ACTOR_MISSING: 'Configure a managed active organisation member who is not an admin, packet creator, or assigned agent.',
  H2_UNASSIGNED_ACTOR_AUTH_FAILED: 'Repair the managed same-organisation test actor credentials.',
  H2_MEMBERSHIP_PROBE_FAILED: 'Restore service-role membership diagnostics before least-privilege testing.',
  H2_PACKET_AUTHORITY_PROBE_FAILED: 'Restore service-role packet diagnostics before least-privilege testing.',
  H2_ACTOR_MEMBERSHIP_INVALID: 'Use an active non-privileged member in every controlled target organisation.',
  H2_ACTOR_HAS_PACKET_AUTHORITY: 'Use a member who is neither an administrator, assigned agent, nor packet creator.',
  H2_POLICY_PROBE_FAILED: 'Deploy the H2 packet-authority migration and restore its authenticated RPC grant.',
  H2_POLICY_CONTRACT_INVALID: 'Deploy or repair the H2 packet-scoped authority helper.',
  H2_SAME_TENANT_ROW_ACCESS_EXPOSED: 'Replace broad organisation-member packet policies with H2 packet-scoped RLS.',
  H2_STORAGE_TARGET_PROBE_FAILED: 'Restore final-artifact evidence lookup for the storage authority test.',
  H2_SAME_TENANT_STORAGE_ACCESS_EXPOSED: 'Restrict signed artifacts to packet-authorised application paths.',
  H2_OPERATION_AUTHORITY_INVALID: 'Deploy the H2 finalisers and protected final-delivery dispatcher.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'H2', status: unique.length ? 'NO_GO' : 'READY_FOR_H3', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this least-privilege gate and rerun H2.' })), evidence: { h1Status: h1?.status || 'UNAVAILABLE', targetCount: targets.length, targetOrganisationCount: organisationIds.length, actorMembershipOrganisationCount, actorAuthorizedTargetCount, policyProbes, tableProbes, storageProbes, functionProbes }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
