import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assessDocumentGeneratorConcurrencyBoundary } from '../src/core/documents/documentGeneratorConcurrencyBoundary.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const concurrencyPerPacket = Math.max(4, Math.min(20, Number(process.env.I1_CONCURRENCY_PER_PACKET || 8)))
const latencyLimitMs = Math.max(500, Number(process.env.I1_P95_LIMIT_MS || 3000))

function runJson(script, timeout = 660_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 60 * 1024 * 1024 })
  try { return { report: JSON.parse(String(run.stdout || '').trim()), error: null } } catch { return { report: null, error: String(run.stderr || run.stdout || `${script} returned no report.`).trim() } }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`

const h4Run = runJson('scripts/document-generator-phase-h4-public-surface.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const targets = g1Run.report?.evidence || []
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!h4Run.report) blockers.push({ code: 'I1_H4_CHECK_UNAVAILABLE', detail: h4Run.error, solution: 'Restore H4 public-surface verification before running I1.' })
if (!g1Run.report) blockers.push({ code: 'I1_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled mandate and OTP launch-chain verifier.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'I1_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run I1 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !serviceKey) blockers.push({ code: 'I1_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure the staging URL and service-role diagnostics credential.' })

const beforeSnapshots = [], afterSnapshots = [], atomicProbes = [], lineageProbes = [], probeLatencies = []
if (!blockers.length && targets.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  async function snapshot(target) {
    const [packet, versions, events, documents] = await Promise.all([
      client.from('document_packets').select('*').eq('id', target.packetId).maybeSingle(),
      client.from('document_packet_versions').select('*').eq('packet_id', target.packetId).order('version_number', { ascending: true }),
      client.from('document_packet_events').select('*').eq('packet_id', target.packetId).order('created_at', { ascending: true }).order('id', { ascending: true }),
      client.from('documents').select('*').or(`legal_packet_id.eq.${target.packetId},final_legal_packet_id.eq.${target.packetId}`).order('created_at', { ascending: true }).order('id', { ascending: true }),
    ])
    const failed = [packet, versions, events, documents].find((result) => result.error)
    if (failed?.error) throw failed.error
    const state = { packet: packet.data, versions: versions.data || [], events: events.data || [], documents: documents.data || [] }
    return { packetId: target.packetId, packetType: target.packetType, maxVersionNumber: Math.max(0, ...(state.versions.map((row) => Number(row.version_number || 0)))), stateDigest: digest(state) }
  }
  async function timedProbe(target, kind) {
    const started = performance.now()
    const result = kind === 'atomic'
      ? await client.rpc('bridge_create_document_packet_version_i1', { p_packet_id: target.packetId, p_render_status: 'draft', p_dry_run: true })
      : await client.rpc('bridge_probe_document_generator_concurrency_i1', { p_packet_id: target.packetId })
    const durationMs = Math.round((performance.now() - started) * 100) / 100
    probeLatencies.push(durationMs)
    if (result.error) return { packetId: target.packetId, packetType: target.packetType, durationMs, error: result.error.message }
    return { packetId: target.packetId, packetType: target.packetType, ...result.data, durationMs, error: null }
  }

  try {
    beforeSnapshots.push(...await Promise.all(targets.map(snapshot)))
    const calls = targets.flatMap((target) => Array.from({ length: concurrencyPerPacket }, () => Promise.all([timedProbe(target, 'atomic'), timedProbe(target, 'lineage')])))
    const results = await Promise.all(calls)
    for (const [atomic, lineage] of results) { atomicProbes.push(atomic); lineageProbes.push(lineage) }
    afterSnapshots.push(...await Promise.all(targets.map(snapshot)))
  } catch (error) {
    blockers.push({ code: 'I1_CONCURRENCY_PROBE_FAILED', detail: error?.message || String(error), solution: 'Deploy migration 202607180028 and restore service-role read access to controlled packet state.' })
  }
}

const sortedLatencies = probeLatencies.filter(Number.isFinite).sort((a, b) => a - b)
const latencyP95Ms = sortedLatencies.length ? sortedLatencies[Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)] : null
const assessment = assessDocumentGeneratorConcurrencyBoundary({ h4: h4Run.report || {}, targetCount: targets.length, concurrencyPerPacket, atomicProbes, lineageProbes, beforeSnapshots, afterSnapshots, latencyP95Ms, latencyLimitMs })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({
  phase: 'I1', status: unique.length ? 'NO_GO' : 'READY_FOR_I2', ready: unique.length === 0, blockerCount: unique.length, blockers: unique,
  evidence: {
    h4Status: h4Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, concurrencyPerPacket,
    atomicProbeCount: atomicProbes.length, lineageProbeCount: lineageProbes.length,
    beforeSnapshots, afterSnapshots, latencyP95Ms, latencyLimitMs,
    atomicProbes: atomicProbes.map(({ packetType, contract, dryRun, nextVersionNumber, durationMs, error }) => ({ packetType, contract, dryRun, nextVersionNumber, durationMs, error })),
    lineageProbes: lineageProbes.map(({ packetType, contract, currentVersionNumber, maxVersionNumber, nextVersionNumber, currentPointerMatchesMax, duplicateVersionNumberCount, versionCreatedEventMismatchCount, orphanVersionEventCount, durationMs, error }) => ({ packetType, contract, currentVersionNumber, maxVersionNumber, nextVersionNumber, currentPointerMatchesMax, duplicateVersionNumberCount, versionCreatedEventMismatchCount, orphanVersionEventCount, durationMs, error })),
  },
  projectRef, checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (unique.length) process.exitCode = 1
