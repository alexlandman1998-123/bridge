import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessLegalDocumentAuthorityContinuity } from '../src/core/documents/legalDocumentAuthorityContinuity.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const h2 = runJson('scripts/legal-document-phase-h2-least-privilege.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const authorisedEmail = process.env.H3_AUTHORISED_EMAIL || process.env.H3_AUTHORIZED_EMAIL || process.env.LEGAL_DOCUMENT_G2_EMAIL || process.env.CANONICAL_BROWSER_EMAIL || ''
const authorisedPassword = process.env.H3_AUTHORISED_PASSWORD || process.env.H3_AUTHORIZED_PASSWORD || process.env.LEGAL_DOCUMENT_G2_PASSWORD || process.env.CANONICAL_BROWSER_PASSWORD || ''
const revokedEmail = process.env.H3_REVOKED_EMAIL || ''
const revokedPassword = process.env.H3_REVOKED_PASSWORD || ''
if (!url || !anon || !serviceKey) blockers.push({ code: 'H3_SUPABASE_CONFIGURATION_MISSING' })
if (!authorisedEmail || !authorisedPassword) blockers.push({ code: 'H3_AUTHORISED_ACTOR_MISSING' })
if (!revokedEmail || !revokedPassword) blockers.push({ code: 'H3_REVOKED_ACTOR_MISSING' })

const targets = g1?.evidence || []
const organisationIds = [...new Set(targets.map((target) => target.organisationId).filter(Boolean))]
const authorisedPolicyProbes = []
const authorisedTableProbes = []
const revokedPolicyProbes = []
const revokedTableProbes = []
const authorisedFunctionProbes = { mandateAccepted: false, otpAccepted: false }
const revokedFunctionProbes = { mandateRejected: false, otpRejected: false }
let authorisedTargetCount = 0
let revokedMembershipOrganisationCount = 0
let revokedActiveMembershipCount = 0
let authorisedActorAvailable = false
let revokedActorAvailable = false

if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const authorised = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const revoked = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const [authorisedAuth, revokedAuth] = await Promise.all([
    authorised.auth.signInWithPassword({ email: authorisedEmail, password: authorisedPassword }),
    revoked.auth.signInWithPassword({ email: revokedEmail, password: revokedPassword }),
  ])
  if (authorisedAuth.error || !authorisedAuth.data.session?.access_token || !authorisedAuth.data.user?.id) blockers.push({ code: 'H3_AUTHORISED_ACTOR_AUTH_FAILED', detail: authorisedAuth.error?.message })
  if (revokedAuth.error || !revokedAuth.data.session?.access_token || !revokedAuth.data.user?.id) blockers.push({ code: 'H3_REVOKED_ACTOR_AUTH_FAILED', detail: revokedAuth.error?.message })
  authorisedActorAvailable = Boolean(!authorisedAuth.error && authorisedAuth.data.session?.access_token && authorisedAuth.data.user?.id)
  revokedActorAvailable = Boolean(!revokedAuth.error && revokedAuth.data.session?.access_token && revokedAuth.data.user?.id)
  if (authorisedActorAvailable && revokedActorAvailable) {
    const authorisedId = authorisedAuth.data.user.id
    const revokedId = revokedAuth.data.user.id
    const packetIds = targets.map((target) => target.packetId).filter(Boolean)
    const versionIds = targets.map((target) => target.versionId).filter(Boolean)
    const [authorisedMemberships, revokedMemberships, authorityRows] = await Promise.all([
      organisationIds.length ? admin.from('organisation_users').select('*').eq('user_id', authorisedId).in('organisation_id', organisationIds) : { data: [], error: null },
      organisationIds.length ? admin.from('organisation_users').select('*').eq('user_id', revokedId).in('organisation_id', organisationIds) : { data: [], error: null },
      packetIds.length ? admin.from('document_packets').select('id, organisation_id, assigned_agent_id, created_by').in('id', packetIds) : { data: [], error: null },
    ])
    for (const result of [authorisedMemberships, revokedMemberships, authorityRows]) if (result.error) blockers.push({ code: 'H3_AUTHORITY_DIAGNOSTICS_FAILED', detail: result.error.message })
    const active = (row) => ['active', 'accepted'].includes(String(row.status || row.membership_status || '').toLowerCase())
    const authorisedActive = (authorisedMemberships.data || []).filter(active)
    const adminRoles = new Set(['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'manager', 'agency_admin', 'agent_admin'])
    const adminOrganisationIds = new Set(authorisedActive.filter((row) => [row.role, row.workspace_role, row.organisation_role, row.app_role].some((role) => adminRoles.has(String(role || '').toLowerCase()))).map((row) => row.organisation_id))
    authorisedTargetCount = (authorityRows.data || []).filter((packet) => adminOrganisationIds.has(packet.organisation_id) || packet.assigned_agent_id === authorisedId || packet.created_by === authorisedId).length
    revokedMembershipOrganisationCount = new Set((revokedMemberships.data || []).map((row) => row.organisation_id)).size
    revokedActiveMembershipCount = (revokedMemberships.data || []).filter(active).length

    for (const target of targets) {
      const [allowed, denied] = await Promise.all([
        authorised.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId }),
        revoked.rpc('bridge_can_access_legal_packet_h2', { p_packet_id: target.packetId }),
      ])
      authorisedPolicyProbes.push({ packetType: target.packetType, allowed: allowed.error ? null : allowed.data === true, contractAvailable: !allowed.error })
      revokedPolicyProbes.push({ packetType: target.packetType, allowed: denied.error ? null : denied.data === true, contractAvailable: !denied.error })
      if (allowed.error || denied.error) blockers.push({ code: 'H3_POLICY_PROBE_FAILED', detail: allowed.error?.message || denied.error?.message })
    }

    const tableQueries = (client) => [
      ['document_packets', client.from('document_packets').select('id').in('id', packetIds)],
      ['document_packet_versions', client.from('document_packet_versions').select('id').in('id', versionIds)],
      ['document_packet_signers', client.from('document_packet_signers').select('id').in('packet_version_id', versionIds)],
      ['document_signing_fields', client.from('document_signing_fields').select('id').in('packet_version_id', versionIds)],
      ['document_packet_events', client.from('document_packet_events').select('id').in('version_id', versionIds)],
    ]
    const expectedQueries = tableQueries(admin)
    const authorisedQueries = tableQueries(authorised)
    const revokedQueries = tableQueries(revoked)
    for (let index = 0; index < expectedQueries.length; index += 1) {
      const table = expectedQueries[index][0]
      const [expected, visible, denied] = await Promise.all([expectedQueries[index][1], authorisedQueries[index][1], revokedQueries[index][1]])
      if (expected.error) blockers.push({ code: 'H3_AUTHORITY_DIAGNOSTICS_FAILED', detail: expected.error.message })
      const expectedCount = expected.data?.length || 0
      const visibleCount = visible.data?.length || 0
      authorisedTableProbes.push({ table, expectedCount, visibleCount, complete: !visible.error && expectedCount > 0 && visibleCount === expectedCount })
      revokedTableProbes.push({ table, protected: Boolean(denied.error) || !(denied.data || []).length, visibleRowCount: denied.data?.length || 0, deniedByGrant: Boolean(denied.error) })
    }

    async function invoke(clientAuth, name, body) {
      const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${clientAuth.data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
      return { response, body: await response.json().catch(() => ({})) }
    }
    const invalidVersionId = '00000000-0000-4000-8000-000000000000'
    const mandateTarget = targets.find((target) => target.packetType === 'mandate')
    const otpTarget = targets.find((target) => target.packetType === 'otp')
    const [authorisedMandate, authorisedOtp, revokedMandate, revokedOtp] = await Promise.all([
      mandateTarget ? invoke(authorisedAuth, 'generate-final-signed-document', { packetId: mandateTarget.packetId, packetVersionId: invalidVersionId }) : null,
      otpTarget ? invoke(authorisedAuth, 'generate-final-signed-otp', { packetId: otpTarget.packetId, packetVersionId: invalidVersionId }) : null,
      mandateTarget ? invoke(revokedAuth, 'generate-final-signed-document', { packetId: mandateTarget.packetId, packetVersionId: invalidVersionId }) : null,
      otpTarget ? invoke(revokedAuth, 'generate-final-signed-otp', { packetId: otpTarget.packetId, packetVersionId: invalidVersionId }) : null,
    ])
    const accepted = (result) => Boolean(result && ['h3-v1', 'h4-v1'].includes(result.response.headers.get('x-legal-finalizer-contract')) && result.response.status === 400 && result.body.errorCode === 'NO_GENERATED_VERSION')
    const rejected = (result) => Boolean(result && ['h3-v1', 'h4-v1'].includes(result.response.headers.get('x-legal-finalizer-contract')) && result.response.status === 403 && result.body.errorCode === 'FINALISATION_FORBIDDEN')
    authorisedFunctionProbes.mandateAccepted = accepted(authorisedMandate)
    authorisedFunctionProbes.otpAccepted = accepted(authorisedOtp)
    revokedFunctionProbes.mandateRejected = rejected(revokedMandate)
    revokedFunctionProbes.otpRejected = rejected(revokedOtp)
  }
}

const assessment = assessLegalDocumentAuthorityContinuity({ h2: h2 || {}, targetCount: targets.length, targetOrganisationCount: organisationIds.length, authorisedActorAvailable, revokedActorAvailable, authorisedTargetCount, authorisedPolicyProbes, authorisedTableProbes, authorisedFunctionProbes, revokedMembershipOrganisationCount, revokedActiveMembershipCount, revokedPolicyProbes, revokedTableProbes, revokedFunctionProbes })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  H3_H2_NOT_READY: 'Complete H2 same-tenant least-privilege verification before authority continuity acceptance.',
  H3_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact authority targets exist.',
  H3_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL, anonymous key, and service-role diagnostics credential.',
  H3_AUTHORISED_ACTOR_MISSING: 'Configure an active administrator, assigned agent, or packet creator using H3_AUTHORISED_EMAIL/PASSWORD.',
  H3_REVOKED_ACTOR_MISSING: 'Configure an authenticated user whose controlled-organisation membership is inactive or revoked.',
  H3_AUTHORISED_ACTOR_AUTH_FAILED: 'Repair the authorised staging actor credentials.',
  H3_REVOKED_ACTOR_AUTH_FAILED: 'Repair the revoked-membership staging actor credentials without reactivating its organisation membership.',
  H3_AUTHORITY_DIAGNOSTICS_FAILED: 'Restore service-role authority diagnostics before continuity testing.',
  H3_AUTHORISED_ACTOR_INVALID: 'Use an active actor authorised over both controlled packets.',
  H3_REVOKED_ACTOR_MEMBERSHIP_MISSING: 'Use a revoked or inactive membership record in every controlled organisation.',
  H3_REVOKED_ACTOR_STILL_ACTIVE: 'Deactivate the test actor membership before testing revocation.',
  H3_POLICY_PROBE_FAILED: 'Deploy the H2 packet-authority helper and restore its authenticated grant.',
  H3_AUTHORISED_POLICY_PATH_BROKEN: 'Repair packet RLS so legitimate administrators, assignees, and creators retain access.',
  H3_AUTHORISED_READ_PATH_BROKEN: 'Repair child-row RLS so the authorised packet actor sees the complete exact-version record.',
  H3_AUTHORISED_FINALISER_PATH_BROKEN: 'Deploy the H3 finalisers and restore legitimate finalisation authority.',
  H3_REVOKED_POLICY_ACCESS_EXPOSED: 'Make packet authority conditional on active organisation membership.',
  H3_REVOKED_ROW_ACCESS_EXPOSED: 'Remove residual packet-row access from inactive or revoked memberships.',
  H3_REVOKED_FINALISER_ACCESS_EXPOSED: 'Deploy the H3 finalisers and reject inactive or revoked members before version processing.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'H3', status: unique.length ? 'NO_GO' : 'READY_FOR_H4', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this authority-continuity gate and rerun H3.' })), evidence: { h2Status: h2?.status || 'UNAVAILABLE', targetCount: targets.length, targetOrganisationCount: organisationIds.length, authorisedActorAvailable, revokedActorAvailable, authorisedTargetCount, authorisedPolicyProbes, authorisedTableProbes, authorisedFunctionProbes, revokedMembershipOrganisationCount, revokedActiveMembershipCount, revokedPolicyProbes, revokedTableProbes, revokedFunctionProbes }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
