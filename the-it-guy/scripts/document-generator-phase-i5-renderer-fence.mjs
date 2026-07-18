import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assessDocumentGeneratorRendererFenceBoundary } from '../src/core/documents/documentGeneratorRendererFenceBoundary.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const SAFE_MISMATCH_ATTEMPT_ID = '00000000-0000-4000-8000-000000000005'
const latencyLimitMs = Math.max(500, Number(process.env.I5_P95_LIMIT_MS || 2000))
function runJson(script, timeout = 900_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 60 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`

const i4Run = runJson('scripts/document-generator-phase-i4-attempt-observability.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const targets = g1Run.report?.evidence || []
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!i4Run.report) blockers.push({ code: 'I5_I4_CHECK_UNAVAILABLE', detail: i4Run.error, solution: 'Restore document-generator I4 verification before running I5.' })
if (!g1Run.report) blockers.push({ code: 'I5_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled mandate and OTP launch-chain verifier.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'I5_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run I5 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !anon || !serviceKey) blockers.push({ code: 'I5_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure the staging URL, anonymous key and service-role diagnostics credential.' })

const rendererSource = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
const packetServiceSource = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const preRenderIndex = rendererSource.indexOf('assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_render")')
const renderIndex = rendererSource.indexOf('renderHtmlToPdfBytes(', preRenderIndex)
const prePersistIndex = rendererSource.indexOf('assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_persist")', renderIndex)
const uploadIndex = rendererSource.indexOf('.upload(', prePersistIndex)
const rendererCheckpointsCovered = preRenderIndex > 0 && renderIndex > preRenderIndex && prePersistIndex > renderIndex && uploadIndex > prePersistIndex
const timeoutIndex = packetServiceSource.indexOf("failureCode === 'GENERATION_TIMEOUT'")
const ambiguousTimeoutFenced = timeoutIndex > 0 && packetServiceSource.indexOf('deferGenerationLeaseRelease = true', timeoutIndex) > timeoutIndex && packetServiceSource.indexOf("eventType: 'generation_result_ambiguous'", timeoutIndex) > timeoutIndex && packetServiceSource.includes('!deferGenerationLeaseRelease')

const diagnostics = [], mismatchProbes = [], beforeSnapshots = [], afterSnapshots = [], latencies = []
let unauthorizedRejected = false
if (!blockers.length && targets.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  async function snapshot(target) {
    const [packet, versions, events, documents, leases] = await Promise.all([
      service.from('document_packets').select('*').eq('id', target.packetId).maybeSingle(),
      service.from('document_packet_versions').select('*').eq('packet_id', target.packetId).order('version_number', { ascending: true }),
      service.from('document_packet_events').select('*').eq('packet_id', target.packetId).order('created_at', { ascending: true }).order('id', { ascending: true }),
      service.from('documents').select('*').or(`legal_packet_id.eq.${target.packetId},final_legal_packet_id.eq.${target.packetId}`).order('created_at', { ascending: true }).order('id', { ascending: true }),
      service.from('legal_document_generation_leases').select('*').eq('packet_id', target.packetId).order('claimed_at', { ascending: true }),
    ])
    const failed = [packet, versions, events, documents, leases].find((result) => result.error)
    if (failed?.error) throw failed.error
    return { packetId: target.packetId, packetType: target.packetType, stateDigest: digest({ packet: packet.data, versions: versions.data || [], events: events.data || [], documents: documents.data || [], leases: leases.data || [] }) }
  }
  async function timedRpc(client, name, args) {
    const started = performance.now(), result = await client.rpc(name, args)
    latencies.push(Math.round((performance.now() - started) * 100) / 100)
    return result
  }
  try {
    beforeSnapshots.push(...await Promise.all(targets.map(snapshot)))
    const unauthorized = await publicClient.rpc('bridge_assert_generation_lease_i5', { p_packet_id: targets[0].packetId, p_generation_attempt_id: SAFE_MISMATCH_ATTEMPT_ID, p_stage: 'pre_render' })
    unauthorizedRejected = Boolean(unauthorized.error)
    for (const target of targets) {
      const [diagnostic, mismatch] = await Promise.all([
        timedRpc(service, 'bridge_probe_renderer_fence_i5', { p_packet_id: target.packetId }),
        timedRpc(service, 'bridge_assert_generation_lease_i5', { p_packet_id: target.packetId, p_generation_attempt_id: SAFE_MISMATCH_ATTEMPT_ID, p_stage: 'pre_render' }),
      ])
      diagnostics.push({ packetId: target.packetId, packetType: target.packetType, ...(diagnostic.data || {}), error: diagnostic.error?.message || null })
      mismatchProbes.push({ packetId: target.packetId, packetType: target.packetType, rejected: Boolean(mismatch.error), errorCode: mismatch.error?.details || mismatch.error?.message || null })
    }
    afterSnapshots.push(...await Promise.all(targets.map(snapshot)))
  } catch (error) {
    blockers.push({ code: 'I5_FENCE_PROBE_FAILED', detail: error?.message || String(error), solution: 'Deploy migration 202607180034 and restore its service-only fence diagnostics.' })
  }
}

const sortedLatencies = latencies.filter(Number.isFinite).sort((a, b) => a - b)
const latencyP95Ms = sortedLatencies.length ? sortedLatencies[Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)] : null
const assessment = assessDocumentGeneratorRendererFenceBoundary({ i4: i4Run.report || {}, targets, diagnostics, mismatchProbes, unauthorizedRejected, rendererCheckpointsCovered, ambiguousTimeoutFenced, beforeSnapshots, afterSnapshots, latencyP95Ms, latencyLimitMs })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'I5', status: unique.length ? 'NO_GO' : 'READY_FOR_J1', ready: unique.length === 0, blockerCount: unique.length, blockers: unique, evidence: { i4Status: i4Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, unauthorizedRejected, rendererCheckpointsCovered, ambiguousTimeoutFenced, diagnostics, mismatchProbes, beforeSnapshots, afterSnapshots, latencyP95Ms, latencyLimitMs }, projectRef, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
