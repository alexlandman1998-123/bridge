import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const evidence = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5-evidence.json', root), 'utf8'))
const rollout = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5-rollout.json', root), 'utf8'))
const contract = JSON.parse(await readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8'))

const automated = {
  phase0ContractPresent: existsSync(new URL('scripts/client-portal-launch-phase0-contract.test.mjs', root)),
  phase1StabilityPresent: existsSync(new URL('scripts/client-portal-launch-phase1-stability.test.mjs', root)),
  phase2ResponsiveFoundationPresent: existsSync(new URL('scripts/client-portal-launch-phase2-responsive-foundation.test.mjs', root)),
  phase3BrandSystemPresent: existsSync(new URL('scripts/client-portal-launch-phase3-brand-system.test.mjs', root)),
  phase4PerformancePresent: existsSync(new URL('scripts/client-portal-launch-phase4-performance-resilience.test.mjs', root)),
  productionBuildPresent: existsSync(new URL('dist/index.html', root)),
  clientPortalChunkWithinBudget: false,
  clientPortalChunkGzipBytes: null,
  clientPortalChunkBudgetBytes: 230 * 1024
}

if (automated.productionBuildPresent) {
  const assetDirectory = new URL('dist/assets/', root)
  const assets = await readdir(assetDirectory)
  const chunk = assets.find((name) => name.startsWith('ClientPortal-') && name.endsWith('.js'))
  if (chunk) {
    const bytes = gzipSync(await readFile(new URL(chunk, assetDirectory))).length
    automated.clientPortalChunkGzipBytes = bytes
    automated.clientPortalChunkWithinBudget = bytes <= automated.clientPortalChunkBudgetBytes
  }
}

const blockers = []
if (!String(evidence.candidateBuild || '').trim()) blockers.push('release:candidateBuild')
if (!String(evidence.productionEnvironment || '').trim()) blockers.push('release:productionEnvironment')
for (const [key, value] of Object.entries(automated)) {
  if (key.endsWith('Bytes')) continue
  if (value !== true && typeof value === 'boolean') blockers.push(`automated:${key}`)
}

const requiredEvidence = [
  'productionPerformance',
  'physicalDevices',
  'capabilityParity',
  'accessibility',
  'operations',
  'defects',
  'productOwnerSignoff'
]
for (const key of requiredEvidence) {
  const item = evidence.evidence?.[key]
  if (item?.status !== 'passed') blockers.push(`evidence:${key}`)
  if (!String(item?.evidenceUrl || '').trim()) blockers.push(`evidence_url:${key}`)
}

const budgets = contract.performanceBudgets
const performanceEvidence = evidence.evidence.productionPerformance
if (performanceEvidence.status === 'passed') {
  if (performanceEvidence.buyerUsefulContentMs > budgets.mobileUsefulContentMs) blockers.push('budget:buyerUsefulContentMs')
  if (performanceEvidence.sellerUsefulContentMs > budgets.mobileUsefulContentMs) blockers.push('budget:sellerUsefulContentMs')
  if (performanceEvidence.slowNetworkCoreContentMs > budgets.mobileSlowNetworkCoreContentMs) blockers.push('budget:slowNetworkCoreContentMs')
  if (performanceEvidence.cachedNavigationMs > budgets.cachedNavigationResponseMs) blockers.push('budget:cachedNavigationMs')
  if (performanceEvidence.maximumCumulativeLayoutShift > budgets.maximumCumulativeLayoutShift) blockers.push('budget:maximumCumulativeLayoutShift')
}

if (evidence.evidence.defects.status === 'passed') {
  if (evidence.evidence.defects.openCritical !== 0) blockers.push('defects:openCritical')
  if (evidence.evidence.defects.openHigh !== 0) blockers.push('defects:openHigh')
}
if (evidence.evidence.physicalDevices.status === 'passed') {
  if (evidence.evidence.physicalDevices.ios?.result !== 'passed') blockers.push('physical_devices:ios')
  if (evidence.evidence.physicalDevices.android?.result !== 'passed') blockers.push('physical_devices:android')
}
if (evidence.evidence.operations.status === 'passed') {
  for (const owner of ['monitoringOwner', 'supportOwner', 'rollbackOwner']) {
    if (!String(evidence.evidence.operations[owner] || '').trim()) blockers.push(`operations:${owner}`)
  }
  if (evidence.evidence.operations.rollbackTestResult !== 'passed') blockers.push('operations:rollbackTestResult')
}
if (evidence.evidence.productOwnerSignoff.status === 'passed') {
  if (!String(evidence.evidence.productOwnerSignoff.signedOffBy || '').trim()) blockers.push('signoff:signedOffBy')
  if (!String(evidence.evidence.productOwnerSignoff.signedOffAt || '').trim()) blockers.push('signoff:signedOffAt')
}

const decision = blockers.length === 0 ? 'GO_FOR_ONE_AGENCY_PILOT' : 'HOLD'
const report = {
  contract: 'arch9-client-portal-launch-phase5-v1',
  decision,
  candidateBuild: evidence.candidateBuild || null,
  productionEnvironment: evidence.productionEnvironment || null,
  rolloutStatus: rollout.status,
  rolloutBoundary: {
    maximumPilotAgencies: rollout.maximumPilotAgencies,
    automaticExpansion: rollout.automaticExpansion,
    observationHours: rollout.requiredObservationHoursBeforeExpansion
  },
  automated,
  blockers
}

console.log(JSON.stringify(report, null, 2))
if (enforce && decision !== 'GO_FOR_ONE_AGENCY_PILOT') process.exit(1)
