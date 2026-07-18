import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assessLegalDocumentBackpressureReadiness } from '../src/core/documents/legalDocumentBackpressureReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const i2 = runJson('scripts/legal-document-phase-i2-renderer-capacity.mjs')
const g1 = runJson('scripts/legal-document-phase-g1-verify.mjs')
const blockers = []
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const concurrencyPerPacket = Math.max(4, Math.min(16, Number(process.env.I3_CONCURRENCY_PER_PACKET || 8)))
const holdMs = Math.max(250, Math.min(2000, Number(process.env.I3_HOLD_MS || 1000)))
const latencyLimitMs = Math.max(2000, Number(process.env.I3_P95_LIMIT_MS || 5000))
if (!url || !anon || !serviceKey) blockers.push({ code: 'I3_SUPABASE_CONFIGURATION_MISSING' })

const targets = g1?.evidence || []
const waves = []
const beforeLeaseCounts = []
const afterLeaseCounts = []
let unauthorizedRejected = false
let latencyP95Ms = null
if (!blockers.length && targets.length) {
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  async function leaseCounts() {
    return Promise.all(targets.map(async (target) => {
      const result = await service.from('legal_document_generation_leases').select('packet_id', { count: 'exact', head: true }).eq('packet_id', target.packetId)
      if (result.error) throw result.error
      return { packetId: target.packetId, packetType: target.packetType, count: Number(result.count || 0) }
    }))
  }
  try {
    beforeLeaseCounts.push(...await leaseCounts())
    const unauthorized = await publicClient.rpc('bridge_probe_generation_backpressure_i3', { p_packet_id: targets[0].packetId, p_hold_ms: 50 })
    unauthorizedRejected = Boolean(unauthorized.error)
    const allLatencies = []
    for (let waveNumber = 1; waveNumber <= 2; waveNumber += 1) {
      const calls = targets.flatMap((target) => Array.from({ length: concurrencyPerPacket }, async () => {
        const started = performance.now()
        const result = await service.rpc('bridge_probe_generation_backpressure_i3', { p_packet_id: target.packetId, p_hold_ms: holdMs })
        const durationMs = Math.round((performance.now() - started) * 100) / 100
        allLatencies.push(durationMs)
        return { packetId: target.packetId, packetType: target.packetType, contract: result.data?.contract || null, claimed: result.data?.claimed === true, mutatedData: result.data?.mutatedData === false, durationMs, error: result.error?.message || null }
      }))
      const probes = await Promise.all(calls)
      waves.push({ waveNumber, contractValid: probes.every((probe) => probe.contract === 'i3-v1' && probe.mutatedData && !probe.error), packetResults: targets.map((target) => { const rows = probes.filter((probe) => probe.packetId === target.packetId); return { packetType: target.packetType, claimedCount: rows.filter((row) => row.claimed).length, rejectedCount: rows.filter((row) => !row.claimed && !row.error).length } }), probes: probes.map(({ packetType, claimed, durationMs, error }) => ({ packetType, claimed, durationMs, error })) })
    }
    afterLeaseCounts.push(...await leaseCounts())
    allLatencies.sort((a, b) => a - b)
    latencyP95Ms = allLatencies.length ? allLatencies[Math.max(0, Math.ceil(allLatencies.length * 0.95) - 1)] : null
  } catch (error) {
    blockers.push({ code: 'I3_BACKPRESSURE_PROBE_FAILED', detail: error?.message || String(error) })
  }
}

const assessment = assessLegalDocumentBackpressureReadiness({ i2: i2 || {}, targetCount: targets.length, waves, unauthorizedRejected, beforeLeaseCounts, afterLeaseCounts, latencyP95Ms, latencyLimitMs })
blockers.push(...assessment.reasons.map((code) => ({ code })))
const solutions = {
  I3_I2_NOT_READY: 'Complete I2 renderer capacity and isolation before overload acceptance.',
  I3_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate lifecycle so exact backpressure targets exist.',
  I3_SUPABASE_CONFIGURATION_MISSING: 'Configure canonical staging URL, anonymous key, and service-role diagnostics credential.',
  I3_BACKPRESSURE_PROBE_FAILED: 'Deploy the I3 lease migration and restore service-role diagnostics.',
  I3_BACKPRESSURE_CONTRACT_INVALID: 'Enforce one active generation holder per packet while rejecting concurrent attempts.',
  I3_BACKPRESSURE_AUTHORITY_INVALID: 'Restrict backpressure diagnostics and lease state to authorised credentials.',
  I3_LEASE_SNAPSHOT_INCOMPLETE: 'Restore lease diagnostics for both controlled packets.',
  I3_PROBE_LEASE_STATE_MUTATED: 'Keep I3 certification on transaction-scoped advisory locks only.',
  I3_BACKPRESSURE_LATENCY_EXCEEDED: `Reduce backpressure response p95 to at most ${latencyLimitMs}ms.`,
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'I3', status: unique.length ? 'NO_GO' : 'READY_FOR_J1', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] || 'Resolve this backpressure gate and rerun I3.' })), evidence: { i2Status: i2?.status || 'UNAVAILABLE', targetCount: targets.length, concurrencyPerPacket, holdMs, unauthorizedRejected, beforeLeaseCounts, afterLeaseCounts, latencyP95Ms, latencyLimitMs, waves }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
