import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5h-final-approval.json', root), 'utf8'))
const rollout = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5-rollout.json', root), 'utf8'))

const blockers = []
const prerequisiteResults = {}
for (const [gate, script] of Object.entries(packet.prerequisiteGates || {})) {
  const result = spawnSync(process.execPath, [script], { cwd: new URL('.', root), encoding: 'utf8' })
  let decision = 'ERROR'
  try {
    decision = JSON.parse(result.stdout).decision || 'ERROR'
  } catch {
    decision = 'ERROR'
  }
  prerequisiteResults[gate] = decision
  if (!String(decision).endsWith('_CERTIFIED')) blockers.push(`prerequisite:${gate}:${decision}`)
}

if (packet.defects?.status !== 'passed') blockers.push('defects:status')
if (packet.defects?.openCritical !== 0) blockers.push('defects:openCritical')
if (packet.defects?.openHigh !== 0) blockers.push('defects:openHigh')
if (!String(packet.defects?.evidenceUrl || '').trim()) blockers.push('defects:evidenceUrl')
for (const [approver, approval] of Object.entries(packet.approvals || {})) {
  if (approval.status !== 'approved') blockers.push(`approval:${approver}:status`)
  for (const field of ['name', 'approvedAt', 'evidenceUrl']) {
    if (!String(approval[field] || '').trim()) blockers.push(`approval:${approver}:${field}`)
  }
}
if (packet.changeWindow?.status !== 'approved') blockers.push('change_window:status')
for (const field of ['startsAt', 'endsAt', 'evidenceUrl']) {
  if (!String(packet.changeWindow?.[field] || '').trim()) blockers.push(`change_window:${field}`)
}
if (packet.changeWindow?.supportNotified !== true) blockers.push('change_window:supportNotified')
if (packet.changeWindow?.pilotAgencyApproved !== true) blockers.push('change_window:pilotAgencyApproved')
if (packet.promotion?.status !== 'disabled') blockers.push('promotion:mustRemainDisabledBeforeExecution')
if (packet.promotion?.maximumPilotAgencies !== rollout.maximumPilotAgencies) blockers.push('promotion:maximumPilotAgencies')
if (packet.promotion?.automaticExpansion !== false) blockers.push('promotion:automaticExpansion')
if (packet.promotion?.observationHours !== rollout.requiredObservationHoursBeforeExpansion) blockers.push('promotion:observationHours')

const decision = blockers.length === 0 ? 'READY_FOR_PRODUCTION_PROMOTION' : 'HOLD'
console.log(JSON.stringify({
  contract: packet.contractId,
  decision,
  candidate: packet.candidate,
  production: packet.production,
  prerequisiteResults,
  promotionBoundary: packet.promotion,
  blockers
}, null, 2))

if (enforce && decision !== 'READY_FOR_PRODUCTION_PROMOTION') process.exit(1)
