import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { assessLegalDocumentPublicSurfaceBoundary } from '../src/core/documents/legalDocumentPublicSurfaceBoundary.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const h3 = runJson('scripts/legal-document-phase-h3-authority-continuity.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !anon || !serviceKey) blockers.push({ code: 'H4_SUPABASE_CONFIGURATION_MISSING' })

const targets = g1?.evidence || []
const tableProbes = []
const storageProbes = []
const publicUrlProbes = []
const functionProbes = { mandateFinalizerRejected: false, otpFinalizerRejected: false, dispatcherRejected: false, watchdogRejected: false, fakeTokenResolveRejected: false, fakeTokenActionRejected: false, fakeTokenResponsesSanitised: false }
if (!blockers.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const packetIds = targets.map((target) => target.packetId).filter(Boolean)
  const versionIds = targets.map((target) => target.versionId).filter(Boolean)
  const probes = [
    ['document_packets', publicClient.from('document_packets').select('id').in('id', packetIds)],
    ['document_packet_versions', publicClient.from('document_packet_versions').select('id').in('id', versionIds)],
    ['document_packet_signers', publicClient.from('document_packet_signers').select('id').in('packet_version_id', versionIds)],
    ['document_signing_fields', publicClient.from('document_signing_fields').select('id').in('packet_version_id', versionIds)],
    ['document_packet_events', publicClient.from('document_packet_events').select('id').in('version_id', versionIds)],
    ['legal_final_artifact_evidence', publicClient.from('legal_final_artifact_evidence').select('id').in('packet_version_id', versionIds)],
    ['legal_final_artifact_deliveries', publicClient.from('legal_final_artifact_deliveries').select('id').in('packet_version_id', versionIds)],
    ['legal_final_artifact_publications', publicClient.from('legal_final_artifact_publications').select('id').in('packet_version_id', versionIds)],
  ]
  for (const [table, query] of probes) {
    const result = await query
    tableProbes.push({ table, protected: Boolean(result.error) || !(result.data || []).length, visibleRowCount: result.data?.length || 0, deniedByGrant: Boolean(result.error) })
  }
  if (versionIds.length) {
    const [evidence, versions] = await Promise.all([
      admin.from('legal_final_artifact_evidence').select('packet_version_id, bucket, path').in('packet_version_id', versionIds),
      admin.from('document_packet_versions').select('id, final_signed_file_url').in('id', versionIds),
    ])
    if (evidence.error || versions.error) blockers.push({ code: 'H4_ARTIFACT_DIAGNOSTICS_FAILED', detail: evidence.error?.message || versions.error?.message })
    for (const artifact of evidence.data || []) {
      const download = await publicClient.storage.from(artifact.bucket).download(artifact.path)
      storageProbes.push({ packetVersionId: artifact.packet_version_id, protected: Boolean(download.error) || !download.data })
    }
    const versionById = new Map((versions.data || []).map((version) => [version.id, version]))
    for (const target of targets) {
      const persistedUrl = String(versionById.get(target.versionId)?.final_signed_file_url || '').trim()
      let protectedUrl = !persistedUrl
      let httpStatus = null
      if (persistedUrl) {
        try {
          const response = await fetch(persistedUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000) })
          httpStatus = response.status
          protectedUrl = response.status === 401 || response.status === 403 || response.status === 404 || response.status === 410
        } catch { protectedUrl = true }
      }
      publicUrlProbes.push({ packetType: target.packetType, persistedUrlPresent: Boolean(persistedUrl), protected: protectedUrl, httpStatus })
    }
  }

  async function invoke(name, body, includeAnonBearer = false) {
    const headers = { apikey: anon, 'Content-Type': 'application/json' }
    if (includeAnonBearer) headers.Authorization = `Bearer ${anon}`
    const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    return { response, body: await response.json().catch(() => ({})) }
  }
  const invalidVersionId = '00000000-0000-4000-8000-000000000000'
  const mandateTarget = targets.find((target) => target.packetType === 'mandate')
  const otpTarget = targets.find((target) => target.packetType === 'otp')
  const fakeToken = randomBytes(32).toString('hex')
  const [mandate, otp, dispatcher, watchdog, resolve, action] = await Promise.all([
    mandateTarget ? invoke('generate-final-signed-document', { packetId: mandateTarget.packetId, packetVersionId: invalidVersionId }, true) : null,
    otpTarget ? invoke('generate-final-signed-otp', { packetId: otpTarget.packetId, packetVersionId: invalidVersionId }, true) : null,
    targets[0] ? invoke('dispatch-final-signed-document', { packetId: targets[0].packetId, packetVersionId: invalidVersionId }, true) : null,
    invoke('legal-document-watchdog', {}, true),
    invoke('resolve-signer-token', { action: 'resolve', token: fakeToken }),
    invoke('signer-signing-action', { action: 'view', token: fakeToken }),
  ])
  const finalizerRejected = (result) => Boolean(result && result.response.headers.get('x-legal-finalizer-contract') === 'h4-v1' && result.response.status === 403 && result.body.errorCode === 'FINALISATION_FORBIDDEN')
  functionProbes.mandateFinalizerRejected = finalizerRejected(mandate)
  functionProbes.otpFinalizerRejected = finalizerRejected(otp)
  functionProbes.dispatcherRejected = Boolean(dispatcher && dispatcher.response.status === 403 && dispatcher.body.errorCode === 'FINAL_DELIVERY_FORBIDDEN')
  functionProbes.watchdogRejected = watchdog.response.status === 401 && watchdog.body.errorCode === 'WATCHDOG_AUTH_REQUIRED'
  functionProbes.fakeTokenResolveRejected = resolve.response.status === 404 && resolve.body.errorCode === 'INVALID_SIGNING_TOKEN'
  functionProbes.fakeTokenActionRejected = action.response.status === 404 && action.body.errorCode === 'INVALID_SIGNING_TOKEN'
  const fakeResponses = JSON.stringify([resolve.body, action.body])
  functionProbes.fakeTokenResponsesSanitised = !targets.some((target) => fakeResponses.includes(target.packetId) || fakeResponses.includes(target.versionId)) && !/signer_email|signer_name|packet_id|packet_version_id/i.test(fakeResponses)
}

const assessment = assessLegalDocumentPublicSurfaceBoundary({ h3: h3 || {}, targetCount: targets.length, tableProbes, storageProbes, publicUrlProbes, functionProbes })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  H4_H3_NOT_READY: 'Complete H3 authority continuity and revocation verification before public-surface certification.',
  H4_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact public-surface targets exist.',
  H4_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL, anonymous key, and service-role diagnostics credential.',
  H4_ANONYMOUS_ROW_ACCESS_EXPOSED: 'Remove anonymous grants or policies exposing legal packet and evidence rows.',
  H4_ARTIFACT_DIAGNOSTICS_FAILED: 'Restore service-role artifact diagnostics before public exposure testing.',
  H4_ANONYMOUS_STORAGE_ACCESS_EXPOSED: 'Make final signed artifact buckets private and distribute only short-lived authorised links.',
  H4_PERSISTED_PUBLIC_URL_EXPOSED: 'Remove persistent public final-document URLs and retain only private bucket/path evidence.',
  H4_ANONYMOUS_OPERATION_ACCESS_EXPOSED: 'Deploy the H4 finalisers and protected dispatcher/watchdog authority contracts.',
  H4_PUBLIC_SIGNER_TOKEN_BOUNDARY_INVALID: 'Reject fabricated signer tokens with a generic response before returning or mutating signer data.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'H4', status: unique.length ? 'NO_GO' : 'READY_FOR_I1', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this public-surface gate and rerun H4.' })), evidence: { h3Status: h3?.status || 'UNAVAILABLE', targetCount: targets.length, tableProbes, storageProbes, publicUrlProbes, functionProbes }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
