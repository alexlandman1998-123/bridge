import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assessDocumentGeneratorRendererCapacityBoundary } from '../src/core/documents/documentGeneratorRendererCapacityBoundary.js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const concurrencyPerPacket = Math.max(2, Math.min(8, Number(process.env.I2_CONCURRENCY_PER_PACKET || 4)))
const latencyLimitMs = Math.max(5000, Number(process.env.I2_P95_LIMIT_MS || 30000))
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

const i1Run = runJson('scripts/document-generator-phase-i1-concurrency.mjs')
const g1Run = runJson('scripts/document-generator-phase-g1-verify.mjs')
const controlledTargets = g1Run.report?.evidence || []
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const projectRef = url.match(/^https:\/\/([^.]+)/)?.[1] || ''
const blockers = []
if (!i1Run.report) blockers.push({ code: 'I2_I1_CHECK_UNAVAILABLE', detail: i1Run.error, solution: 'Restore document-generator I1 verification before running I2.' })
if (!g1Run.report) blockers.push({ code: 'I2_CONTROLLED_PAIR_UNAVAILABLE', detail: g1Run.error, solution: 'Restore the controlled mandate and OTP launch-chain verifier.' })
if (projectRef !== STAGING_PROJECT_REF) blockers.push({ code: 'I2_STAGING_BOUNDARY_INVALID', detail: projectRef || 'missing project ref', solution: `Run I2 only against staging project ${STAGING_PROJECT_REF}.` })
if (!url || !anon || !serviceKey) blockers.push({ code: 'I2_SUPABASE_CONFIGURATION_MISSING', solution: 'Configure the staging URL, anonymous key and service-role diagnostics credential.' })

const targets = [], contexts = [], probes = [], unauthorizedProbes = [], beforeSnapshots = [], afterSnapshots = [], latencies = []
if (!blockers.length && controlledTargets.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const packets = await client.from('document_packets').select('id,packet_type,template_id,transaction_id,lead_id,source_context_json,branding_snapshot_json').in('id', controlledTargets.map((row) => row.packetId))
  const versions = await client.from('document_packet_versions').select('id,packet_id,placeholders_resolved_json,section_manifest_json,validation_summary_json').in('id', controlledTargets.map((row) => row.versionId))
  if (packets.error || versions.error) blockers.push({ code: 'I2_TARGET_CONTEXT_UNAVAILABLE', detail: (packets.error || versions.error)?.message, solution: 'Restore service diagnostics access to the controlled packet and version inputs.' })
  const packetById = new Map((packets.data || []).map((row) => [row.id, row]))
  const versionById = new Map((versions.data || []).map((row) => [row.id, row]))
  for (const controlled of controlledTargets) {
    const packet = packetById.get(controlled.packetId), version = versionById.get(controlled.versionId)
    const validation = version?.validation_summary_json || {}, generationPayload = validation.generationPayload || {}
    const freeze = generationPayload.editableRenderFreeze || {}
    const artifact = validation.artifact_provenance || {}
    const target = { packetId: controlled.packetId, packetType: controlled.packetType, freezeId: freeze.freezeId || null, sourceVersionId: freeze.sourceVersionId || null, contentFingerprint: freeze.contentFingerprint || null }
    targets.push(target)
    if (!packet || !version || !target.freezeId || !target.sourceVersionId || !target.contentFingerprint) {
      blockers.push({ code: 'I2_FROZEN_TARGET_CONTEXT_MISSING', detail: controlled.packetType, solution: 'Generate the controlled packet from a C4-frozen editable revision, then rerun G1 and I2.' })
      continue
    }
    contexts.push({
      target, packet, version, artifact,
      storagePrefix: String(artifact.path || '').split('/').slice(0, -1).join('/'),
      payload: {
        capacityProbe: true, packetId: packet.id, transactionId: packet.transaction_id, leadId: packet.lead_id,
        renderMode: 'native_structured', placeholders: version.placeholders_resolved_json || {}, sectionManifest: version.section_manifest_json || [],
        generationPayload, sourceContext: packet.source_context_json || {}, branding: packet.branding_snapshot_json || {},
      },
    })
  }

  async function snapshot(context) {
    const [packet, packetVersions, events, documents, storage] = await Promise.all([
      client.from('document_packets').select('*').eq('id', context.packet.id).maybeSingle(),
      client.from('document_packet_versions').select('*').eq('packet_id', context.packet.id).order('version_number', { ascending: true }),
      client.from('document_packet_events').select('*').eq('packet_id', context.packet.id).order('created_at', { ascending: true }).order('id', { ascending: true }),
      client.from('documents').select('*').or(`legal_packet_id.eq.${context.packet.id},final_legal_packet_id.eq.${context.packet.id}`).order('created_at', { ascending: true }).order('id', { ascending: true }),
      context.storagePrefix ? client.storage.from(context.artifact.bucket || 'documents').list(context.storagePrefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } }) : Promise.resolve({ data: [], error: null }),
    ])
    const failed = [packet, packetVersions, events, documents, storage].find((result) => result.error)
    if (failed?.error) throw failed.error
    return { packetId: context.packet.id, packetType: context.target.packetType, stateDigest: digest({ packet: packet.data, versions: packetVersions.data || [], events: events.data || [], documents: documents.data || [], storage: storage.data || [] }) }
  }
  async function invoke(context, authorization) {
    const started = performance.now()
    const response = await fetch(`${url}/functions/v1/generate-mandate`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify(context.payload), signal: AbortSignal.timeout(Math.max(60000, latencyLimitMs * 2)) })
    const body = await response.json().catch(() => ({}))
    const durationMs = Math.round((performance.now() - started) * 100) / 100
    return { response, body, durationMs }
  }

  if (!blockers.length) try {
    beforeSnapshots.push(...await Promise.all(contexts.map(snapshot)))
    const denied = await Promise.all(contexts.map((context) => invoke(context, anon)))
    unauthorizedProbes.push(...denied.map((result, index) => ({ packetId: contexts[index].packet.id, packetType: contexts[index].target.packetType, rejected: result.response.status === 403 && result.body.errorCode === 'RENDER_CAPACITY_FORBIDDEN' && result.response.headers.get('x-legal-renderer-contract') === 'i2-v1' })))
    const calls = contexts.flatMap((context) => Array.from({ length: concurrencyPerPacket }, async () => {
      const result = await invoke(context, serviceKey)
      latencies.push(result.durationMs)
      const frozen = result.body.frozenInput || {}, output = result.body.output || {}
      return { packetId: context.packet.id, packetType: context.target.packetType, contract: result.body.contract || null, generatorContract: result.body.generatorContract || null, capacityProbe: result.body.capacityProbe === true, mutatedData: result.body.mutatedData === false, inputAuthority: frozen.inputAuthority || null, freezeId: frozen.freezeId || null, sourceVersionId: frozen.sourceVersionId || null, contentFingerprint: frozen.contentFingerprint || null, mediaType: output.mediaType || null, sha256: output.sha256 || null, byteLength: Number(output.byteLength || 0), durationMs: result.durationMs, status: result.response.status, error: result.response.ok ? null : result.body.errorCode || result.body.error || `HTTP ${result.response.status}` }
    }))
    probes.push(...await Promise.all(calls))
    afterSnapshots.push(...await Promise.all(contexts.map(snapshot)))
  } catch (error) {
    blockers.push({ code: 'I2_RENDERER_PROBE_FAILED', detail: error?.message || String(error), solution: 'Deploy the updated generate-mandate renderer and restore its PDF converter dependency.' })
  }
}

const sortedLatencies = latencies.filter(Number.isFinite).sort((a, b) => a - b)
const latencyP95Ms = sortedLatencies.length ? sortedLatencies[Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)] : null
const assessment = assessDocumentGeneratorRendererCapacityBoundary({ i1: i1Run.report || {}, targets, concurrencyPerPacket, probes, unauthorizedProbes, beforeSnapshots, afterSnapshots, latencyP95Ms, latencyLimitMs })
blockers.push(...assessment.blockers)
const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({ phase: 'I2', status: unique.length ? 'NO_GO' : 'READY_FOR_I3', ready: unique.length === 0, blockerCount: unique.length, blockers: unique, evidence: { i1Status: i1Run.report?.status || 'UNAVAILABLE', targetCount: targets.length, concurrencyPerPacket, probeCount: probes.length, unauthorizedProbes, beforeSnapshots, afterSnapshots, latencyP95Ms, latencyLimitMs, probes: probes.map(({ packetType, contract, generatorContract, inputAuthority, freezeId, contentFingerprint, mediaType, sha256, byteLength, durationMs, status, error }) => ({ packetType, contract, generatorContract, inputAuthority, freezeId, contentFingerprint, mediaType, sha256, byteLength, durationMs, status, error })) }, projectRef, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
