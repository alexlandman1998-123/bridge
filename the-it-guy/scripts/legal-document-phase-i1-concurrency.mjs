import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assessLegalDocumentConcurrencyReadiness } from '../src/core/documents/legalDocumentConcurrencyReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const h4 = runJson('scripts/legal-document-phase-h4-public-surface.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const concurrencyPerPacket = Math.max(4, Math.min(20, Number(process.env.I1_CONCURRENCY_PER_PACKET || 8)))
const latencyLimitMs = Math.max(500, Number(process.env.I1_P95_LIMIT_MS || 3000))
if (!url || !serviceKey) blockers.push({ code: 'I1_SUPABASE_CONFIGURATION_MISSING' })

const targets = g1?.evidence || []
const beforeCounts = []
const afterCounts = []
const contractProbes = []
let latencyP95Ms = null
if (!blockers.length && targets.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  async function snapshot(target) {
    const [packet, versions, events, latest] = await Promise.all([
      client.from('document_packets').select('current_version_number').eq('id', target.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id', { count: 'exact', head: true }).eq('packet_id', target.packetId),
      client.from('document_packet_events').select('id', { count: 'exact', head: true }).eq('packet_id', target.packetId),
      client.from('document_packet_versions').select('version_number').eq('packet_id', target.packetId).order('version_number', { ascending: false }).limit(1).maybeSingle(),
    ])
    const error = [packet, versions, events, latest].find((result) => result.error)?.error
    if (error) throw error
    return { packetId: target.packetId, packetType: target.packetType, currentVersionNumber: Number(packet.data?.current_version_number || 0), versionCount: Number(versions.count || 0), eventCount: Number(events.count || 0), maxVersionNumber: Number(latest.data?.version_number || 0) }
  }
  try {
    beforeCounts.push(...await Promise.all(targets.map(snapshot)))
    const calls = targets.flatMap((target) => Array.from({ length: concurrencyPerPacket }, async () => {
      const started = performance.now()
      const result = await client.rpc('bridge_create_document_packet_version_i1', { p_packet_id: target.packetId, p_render_status: 'generated', p_dry_run: true })
      const durationMs = Math.round((performance.now() - started) * 100) / 100
      if (result.error) return { packetId: target.packetId, packetType: target.packetType, contract: null, dryRun: null, nextVersionNumber: null, durationMs, error: result.error.message }
      return { packetId: target.packetId, packetType: target.packetType, contract: result.data?.contract || null, dryRun: result.data?.dryRun === true, nextVersionNumber: Number(result.data?.nextVersionNumber || 0), durationMs, error: null }
    }))
    contractProbes.push(...await Promise.all(calls))
    afterCounts.push(...await Promise.all(targets.map(snapshot)))
    const latencies = contractProbes.map((probe) => probe.durationMs).filter(Number.isFinite).sort((a, b) => a - b)
    latencyP95Ms = latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] : null
  } catch (error) {
    blockers.push({ code: 'I1_CONCURRENCY_PROBE_FAILED', detail: error?.message || String(error) })
  }
}

const assessment = assessLegalDocumentConcurrencyReadiness({ h4: h4 || {}, targetCount: targets.length, contractProbes, beforeCounts, afterCounts, latencyP95Ms, latencyLimitMs })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  I1_H4_NOT_READY: 'Complete H4 public-surface certification before concurrency acceptance.',
  I1_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact concurrency targets exist.',
  I1_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL and service-role diagnostics credential.',
  I1_CONCURRENCY_PROBE_FAILED: 'Deploy the I1 atomic version migration and restore its service-role RPC access.',
  I1_ATOMIC_VERSION_CONTRACT_INVALID: 'Deploy the I1 atomic packet-version function and unique packet/version constraint.',
  I1_CONCURRENT_VERSION_RESERVATION_DRIFT: 'Keep version-number allocation under the per-packet database lock.',
  I1_STATE_SNAPSHOT_INCOMPLETE: 'Restore packet, version, and event diagnostics for both controlled targets.',
  I1_DRY_RUN_MUTATED_DATA: 'Repair the I1 dry-run branch so concurrency certification cannot create versions or events.',
  I1_CONCURRENCY_LATENCY_EXCEEDED: `Reduce packet-lock contention until dry-run p95 is at most ${latencyLimitMs}ms.`,
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'I1', status: unique.length ? 'NO_GO' : 'READY_FOR_I2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this concurrency gate and rerun I1.' })), evidence: { h4Status: h4?.status || 'UNAVAILABLE', targetCount: targets.length, concurrencyPerPacket, probeCount: contractProbes.length, successfulContractCount: contractProbes.filter((probe) => probe.contract === 'i1-v1' && probe.dryRun).length, beforeCounts, afterCounts, latencyP95Ms, latencyLimitMs, probes: contractProbes.map(({ packetType, contract, dryRun, nextVersionNumber, durationMs, error }) => ({ packetType, contract, dryRun, nextVersionNumber, durationMs, error })) }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
