import { readFile } from 'node:fs/promises'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const contract = JSON.parse(await readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8'))
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5f-performance.json', root), 'utf8'))

const limits = {
  buyerUsefulContentMs: contract.performanceBudgets.mobileUsefulContentMs,
  sellerUsefulContentMs: contract.performanceBudgets.mobileUsefulContentMs,
  slowNetworkCoreContentMs: contract.performanceBudgets.mobileSlowNetworkCoreContentMs,
  cachedNavigationMs: contract.performanceBudgets.cachedNavigationResponseMs,
  maximumCumulativeLayoutShift: contract.performanceBudgets.maximumCumulativeLayoutShift,
  routeCrashCount: contract.performanceBudgets.routeCrashCount,
  deadControlCount: contract.performanceBudgets.deadControlCount
}

const blockers = []
for (const field of ['commit', 'deploymentId', 'url']) {
  if (!String(packet.candidate?.[field] || '').trim()) blockers.push(`candidate:${field}`)
}
for (const [metric, limit] of Object.entries(limits)) {
  const measurement = packet.measurements?.[metric]
  if (!Number.isFinite(measurement?.value)) blockers.push(`measurement:${metric}`)
  if ((measurement?.sampleCount || 0) < packet.protocol.minimumSampleCount) blockers.push(`sample_count:${metric}`)
  if (!String(measurement?.evidenceUrl || '').trim()) blockers.push(`evidence_url:${metric}`)
  if (Number.isFinite(measurement?.value) && measurement.value > limit) blockers.push(`budget:${metric}`)
}
for (const field of ['testedBy', 'testedAt']) {
  if (!String(packet[field] || '').trim()) blockers.push(`test_run:${field}`)
}

const decision = blockers.length === 0 ? 'PERFORMANCE_CERTIFIED' : 'HOLD'
console.log(JSON.stringify({
  contract: packet.contractId,
  decision,
  candidate: packet.candidate,
  protocol: packet.protocol,
  budgets: limits,
  blockers
}, null, 2))

if (enforce && decision !== 'PERFORMANCE_CERTIFIED') process.exit(1)
