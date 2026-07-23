import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assessLegalDocumentRendererCapacity } from '../src/core/documents/legalDocumentRendererCapacity.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const i1 = runJson('scripts/legal-document-phase-i1-concurrency.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const concurrencyPerType = Math.max(2, Math.min(8, Number(process.env.I2_CONCURRENCY_PER_TYPE || 4)))
const latencyLimitMs = Math.max(5000, Number(process.env.I2_P95_LIMIT_MS || 30000))
if (!url || !anon || !serviceKey) blockers.push({ code: 'I2_SUPABASE_CONFIGURATION_MISSING' })

const targets = g1?.evidence || []
const probes = []
const unauthorizedProbes = []
const beforeState = []
const afterState = []
let latencyP95Ms = null
if (!blockers.length && targets.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const packets = await client.from('document_packets').select('id, packet_type, template_id, transaction_id, lead_id, current_version_number, source_context_json, branding_snapshot_json').in('id', targets.map((target) => target.packetId))
    const versions = await client.from('document_packet_versions').select('id, packet_id, placeholders_resolved_json, section_manifest_json, validation_summary_json').in('id', targets.map((target) => target.versionId))
    if (packets.error || versions.error) throw packets.error || versions.error
    const templateIds = [...new Set((packets.data || []).map((packet) => packet.template_id).filter(Boolean))]
    const templates = await client.from('document_packet_templates').select('id, template_storage_bucket, template_storage_path, metadata_json').in('id', templateIds)
    if (templates.error) throw templates.error
    const packetById = new Map((packets.data || []).map((packet) => [packet.id, packet]))
    const versionById = new Map((versions.data || []).map((version) => [version.id, version]))
    const templateById = new Map((templates.data || []).map((template) => [template.id, template]))
    const contexts = targets.map((target) => {
      const packet = packetById.get(target.packetId)
      const version = versionById.get(target.versionId)
      const template = templateById.get(packet?.template_id)
      if (!packet || !version || !template) throw new Error(`I2 target context is incomplete for ${target.packetType}.`)
      const validation = version.validation_summary_json || {}
      const artifact = validation.artifact_provenance || {}
      const templatePath = String(template.template_storage_path || '')
      const renderMode = target.packetType === 'otp'
        ? 'native_structured'
        : String(validation.render_provenance?.renderMode || validation.generationPayload?.template?.renderMode || template.metadata_json?.render_mode || 'legacy_docx')
      const generationPayload = { ...(validation.generationPayload || {}), template: { ...(validation.generationPayload?.template || {}), id: template.id } }
      const base = { capacityProbe: true, templatePath, templateBucket: template.template_storage_bucket, templateFilename: templatePath.split('/').pop() || null, outputBucket: artifact.bucket || 'documents' }
      const payload = {
        ...base,
        packetId: packet.id,
        transactionId: packet.transaction_id,
        leadId: packet.lead_id,
        renderMode,
        placeholders: version.placeholders_resolved_json || {},
        sectionManifest: version.section_manifest_json || [],
        generationPayload,
        sourceContext: packet.source_context_json || {},
        branding: packet.branding_snapshot_json || {},
      }
      const prefix = String(artifact.path || '').split('/').slice(0, -1).join('/')
      return { target, packet, version, artifact, prefix, payload, functionName: 'generate-mandate' }
    })

    async function snapshot(context) {
      const [packetState, versionsCount, eventsCount, documentsCount, storage] = await Promise.all([
        client.from('document_packets').select('current_version_number').eq('id', context.packet.id).maybeSingle(),
        client.from('document_packet_versions').select('id', { count: 'exact', head: true }).eq('packet_id', context.packet.id),
        client.from('document_packet_events').select('id', { count: 'exact', head: true }).eq('packet_id', context.packet.id),
        context.packet.transaction_id ? client.from('documents').select('id', { count: 'exact', head: true }).eq('transaction_id', context.packet.transaction_id) : Promise.resolve({ count: null, error: null }),
        context.prefix ? client.storage.from(context.artifact.bucket || 'documents').list(context.prefix, { limit: 1000 }) : Promise.resolve({ data: [], error: null }),
      ])
      const error = [packetState, versionsCount, eventsCount, documentsCount, storage].find((result) => result.error)?.error
      if (error) throw error
      return { packetId: context.packet.id, packetType: context.target.packetType, currentVersionNumber: Number(packetState.data?.current_version_number || 0), versionCount: Number(versionsCount.count || 0), eventCount: Number(eventsCount.count || 0), documentCount: documentsCount.count === null ? null : Number(documentsCount.count || 0), storageObjectCount: storage.data?.length || 0 }
    }
    beforeState.push(...await Promise.all(contexts.map(snapshot)))

    async function invoke(functionName, payload, authorization) {
      const started = performance.now()
      const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${functionName}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(Math.max(60000, latencyLimitMs * 2)) })
      const body = await response.json().catch(() => ({}))
      return { response, body, durationMs: Math.round((performance.now() - started) * 100) / 100 }
    }
    const unauthorized = await Promise.all(contexts.map((context) => invoke(context.functionName, context.payload, anon)))
    unauthorizedProbes.push(...unauthorized.map((result, index) => ({ packetType: contexts[index].target.packetType, rejected: result.response.status === 403 && result.body.errorCode === 'RENDER_CAPACITY_FORBIDDEN' && result.response.headers.get('x-legal-renderer-contract') === 'i2-v1' })))
    const calls = contexts.flatMap((context) => Array.from({ length: concurrencyPerType }, async () => {
      const result = await invoke(context.functionName, context.payload, serviceKey)
      return { packetType: context.target.packetType, contract: result.response.headers.get('x-legal-renderer-contract') === 'i2-v1' ? result.body.contract : null, capacityProbe: result.body.capacityProbe === true, mutatedData: result.body.mutatedData === false, sha256: result.body.output?.sha256 || null, byteLength: Number(result.body.output?.byteLength || 0), mediaType: result.body.output?.mediaType || null, durationMs: result.durationMs, status: result.response.status, errorCode: result.body.errorCode || null }
    }))
    probes.push(...await Promise.all(calls))
    afterState.push(...await Promise.all(contexts.map(snapshot)))
    const latencies = probes.map((probe) => probe.durationMs).filter(Number.isFinite).sort((a, b) => a - b)
    latencyP95Ms = latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] : null
  } catch (error) {
    blockers.push({ code: 'I2_RENDERER_PROBE_FAILED', detail: error?.message || String(error) })
  }
}

const assessment = assessLegalDocumentRendererCapacity({ i1: i1 || {}, targetCount: targets.length, probes, unauthorizedProbes, beforeState, afterState, latencyP95Ms, latencyLimitMs, concurrencyPerType })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  I2_I1_NOT_READY: 'Complete I1 atomic version concurrency before renderer-capacity acceptance.',
  I2_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact renderer inputs exist.',
  I2_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL, anonymous key, and service-role diagnostics credential.',
  I2_RENDERER_PROBE_FAILED: 'Deploy the I2 generators and restore exact controlled render context.',
  I2_RENDERER_CAPACITY_CONTRACT_INVALID: 'Deploy the service-only i2-v1 non-persisting renderer contract.',
  I2_CONCURRENT_RENDER_ISOLATION_INVALID: 'Remove shared mutable render state so identical concurrent inputs produce identical bytes.',
  I2_CAPACITY_PROBE_AUTHORITY_INVALID: 'Restrict capacity mode to the exact service-role credential.',
  I2_STATE_SNAPSHOT_INCOMPLETE: 'Restore packet, document, event, and storage diagnostics for both targets.',
  I2_CAPACITY_PROBE_MUTATED_DATA: 'Move the capacity response before every upload or database insert.',
  I2_RENDER_LATENCY_EXCEEDED: `Reduce concurrent renderer p95 to at most ${latencyLimitMs}ms.`,
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'I2', status: unique.length ? 'NO_GO' : 'READY_FOR_I3', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this renderer-capacity gate and rerun I2.' })), evidence: { i1Status: i1?.status || 'UNAVAILABLE', targetCount: targets.length, concurrencyPerType, probeCount: probes.length, successfulProbeCount: probes.filter((probe) => probe.contract === 'i2-v1' && probe.capacityProbe).length, unauthorizedProbes, beforeState, afterState, latencyP95Ms, latencyLimitMs, probes }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
