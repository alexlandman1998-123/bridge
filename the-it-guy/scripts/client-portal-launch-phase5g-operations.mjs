import { readFile } from 'node:fs/promises'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5g-operations.json', root), 'utf8'))
const rollout = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5-rollout.json', root), 'utf8'))

const blockers = []
for (const [owner, value] of Object.entries(packet.owners || {})) {
  if (!String(value || '').trim()) blockers.push(`owner:${owner}`)
}
if (packet.monitoring?.status !== 'passed') blockers.push('monitoring:status')
if (packet.monitoring?.alertTestResult !== 'passed') blockers.push('monitoring:alertTestResult')
for (const field of ['dashboardUrl', 'evidenceUrl']) {
  if (!String(packet.monitoring?.[field] || '').trim()) blockers.push(`monitoring:${field}`)
}
if (packet.support?.status !== 'passed') blockers.push('support:status')
for (const field of ['supportChannel', 'escalationChannel', 'runbookUrl', 'evidenceUrl']) {
  if (!String(packet.support?.[field] || '').trim()) blockers.push(`support:${field}`)
}
if (packet.rollback?.status !== 'passed') blockers.push('rollback:status')
if (packet.rollback?.rehearsalResult !== 'passed') blockers.push('rollback:rehearsalResult')
if (!Number.isFinite(packet.rollback?.recoveryTimeMinutes)) blockers.push('rollback:recoveryTimeMinutes')
for (const field of ['testedBy', 'testedAt', 'evidenceUrl']) {
  if (!String(packet.rollback?.[field] || '').trim()) blockers.push(`rollback:${field}`)
}
if (!String(packet.pilot?.dailyReviewOwner || '').trim()) blockers.push('pilot:dailyReviewOwner')
if (packet.pilot?.maximumAgencies !== rollout.maximumPilotAgencies) blockers.push('pilot:maximumAgencies')
if (packet.pilot?.automaticExpansion !== false) blockers.push('pilot:automaticExpansion')
if (packet.pilot?.observationHours !== rollout.requiredObservationHoursBeforeExpansion) blockers.push('pilot:observationHours')

const decision = blockers.length === 0 ? 'OPERATIONS_CERTIFIED' : 'HOLD'
console.log(JSON.stringify({
  contract: packet.contractId,
  decision,
  candidate: packet.candidate,
  observedExternalIntegrations: packet.monitoring?.baseline?.externalIntegrationsObserved || [],
  pilot: packet.pilot,
  blockers
}, null, 2))

if (enforce && decision !== 'OPERATIONS_CERTIFIED') process.exit(1)
