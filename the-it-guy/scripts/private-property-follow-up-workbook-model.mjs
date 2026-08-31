import fs from 'node:fs'
import path from 'node:path'

export const PRIVATE_PROPERTY_FOLLOW_UP_ROWS = [
  { row: 2, actionId: 'rental-residential-per-week-hide-address', agentId: 'ARCH9-SANDBOX-USER-1', reference: 'rr2755973' },
  { row: 3, actionId: 'rental-commercial-add-agent-images', agentId: 'ARCH9-SANDBOX-USER-2', reference: 'rr2755974' },
  { row: 3, actionId: 'agent-user-2-inactive', agentId: 'ARCH9-SANDBOX-USER-2', reference: 'rr2755974', agentOnly: true },
  { row: 4, actionId: 'rental-commercial-to-residential', agentId: 'ARCH9-SANDBOX-USER-1', reference: 'rr2755975' },
  { row: 5, actionId: 'sale-residential-change-unique-id', reference: 'T2870290' },
  { row: 6, actionId: 'sale-commercial-cancel-showday-reduce-price', reference: 'T2870291' },
  { row: 7, actionId: 'sale-farm-reorder-agents', reference: 'T2870292' },
  { row: 8, actionId: 'sale-land-offers-from', agentId: 'ARCH9-SANDBOX-USER-1', reference: 'T2870293' },
]

export function defaultVerificationPath(outputDir, actionId) {
  return path.join(outputDir, `private-property-verify-${actionId}.json`)
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function verificationForAction({ outputDir, actionId, agentOnly = false, agentEvidencePath }) {
  const filePath = agentOnly ? agentEvidencePath : defaultVerificationPath(outputDir, actionId)
  const report = readJsonIfPresent(filePath)
  if (!report) return { actionId, filePath, status: 'MISSING' }
  const status = report.status || ''
  const verified = agentOnly
    ? status === 'COMPLETED' || status === 'VERIFIED'
    : status === 'VERIFIED'
  return {
    actionId,
    filePath,
    status,
    verified,
    reference: report.verification?.observed?.privatePropertyReference || '',
    nextStep: report.nextStep || '',
  }
}

export function buildPrivatePropertyWorkbookCompletionPlan({
  outputDir,
  agentEvidencePath,
} = {}) {
  const evidenceDirectory = outputDir || ''
  const agentEvidence = agentEvidencePath || path.join(evidenceDirectory, 'private-property-sandbox-user-2-inactive.json')
  const rows = PRIVATE_PROPERTY_FOLLOW_UP_ROWS.map((item) => {
    const evidence = verificationForAction({
      outputDir: evidenceDirectory,
      actionId: item.actionId,
      agentOnly: item.agentOnly,
      agentEvidencePath: agentEvidence,
    })
    return {
      ...item,
      evidence,
      expectedReference: item.reference,
      completed: Boolean(evidence.verified),
    }
  })
  const blockers = rows
    .filter((item) => !item.completed)
    .map((item) => `follow_up_not_verified:${item.actionId}:${item.evidence.status || 'MISSING'}`)
  const updates = new Map()
  for (const item of rows.filter((candidate) => candidate.completed)) {
    const existing = updates.get(item.row) || { row: item.row, reference: item.reference, agentId: '', followUps: [] }
    if (item.evidence.reference) existing.reference = item.evidence.reference
    if (item.agentId) existing.agentId = item.agentId
    existing.followUps.push(`${item.actionId}: verified`)
    updates.set(item.row, existing)
  }
  return {
    status: blockers.length ? 'BLOCKED' : 'READY_TO_EXPORT',
    rows,
    updates: [...updates.values()].sort((left, right) => left.row - right.row),
    blockers,
  }
}
