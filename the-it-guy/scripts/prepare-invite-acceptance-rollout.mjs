import fs from 'node:fs'
import path from 'node:path'
import {
  buildInviteAcceptanceRolloutPacket,
  renderInviteAcceptanceRolloutRunbook,
} from '../src/lib/invitationAcceptanceRollout.js'

const INPUT_PATH = process.env.INVITE_ACCEPTANCE_ROLLOUT_INPUT ||
  process.env.INVITE_ACCEPTANCE_HEALTH_INPUT ||
  process.env.INVITE_ACCEPTANCE_RECONCILE_INPUT ||
  process.env.INVITE_ACCEPTANCE_AUDIT_INPUT ||
  ''
const OUTPUT_DIR = process.env.INVITE_ACCEPTANCE_ROLLOUT_OUTPUT_DIR || ''
const FORMAT = String(process.env.INVITE_ACCEPTANCE_ROLLOUT_FORMAT || 'json').trim().toLowerCase()
const FAIL_ON_BLOCKED = process.env.INVITE_ACCEPTANCE_ROLLOUT_FAIL_ON_BLOCKED === 'true'
const FAIL_ON_ATTENTION = process.env.INVITE_ACCEPTANCE_ROLLOUT_FAIL_ON_ATTENTION === 'true'

function readInputPayload() {
  if (!INPUT_PATH) {
    throw new Error('Missing INVITE_ACCEPTANCE_ROLLOUT_INPUT, INVITE_ACCEPTANCE_HEALTH_INPUT, INVITE_ACCEPTANCE_RECONCILE_INPUT, or INVITE_ACCEPTANCE_AUDIT_INPUT.')
  }
  const resolvedPath = path.resolve(process.cwd(), INPUT_PATH)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Invite acceptance rollout input does not exist: ${resolvedPath}`)
  }
  return {
    source: `file:${resolvedPath}`,
    ...JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
  }
}

function writeArtifact(outputDir, fileName, content) {
  fs.writeFileSync(path.join(outputDir, fileName), content)
}

function writeArtifacts(packet, runbook) {
  if (!OUTPUT_DIR) return
  const outputDir = path.resolve(process.cwd(), OUTPUT_DIR)
  fs.mkdirSync(outputDir, { recursive: true })

  writeArtifact(outputDir, 'invite-acceptance-rollout.json', `${JSON.stringify(packet, null, 2)}\n`)
  writeArtifact(outputDir, 'invite-acceptance-audit.json', `${JSON.stringify(packet.auditReport, null, 2)}\n`)
  writeArtifact(outputDir, 'invite-acceptance-reconciliation.json', `${JSON.stringify(packet.reconciliationPlan, null, 2)}\n`)
  writeArtifact(outputDir, 'invite-acceptance-health.json', `${JSON.stringify(packet.healthReport, null, 2)}\n`)
  writeArtifact(outputDir, 'invite-acceptance-repair.sql', packet.repairSql)
  writeArtifact(outputDir, 'invite-acceptance-runbook.md', runbook)
}

async function main() {
  const payload = readInputPayload()
  const packet = buildInviteAcceptanceRolloutPacket(payload, {
    source: payload.source,
    outputDir: OUTPUT_DIR,
    failOnAttention: FAIL_ON_ATTENTION,
  })
  const runbook = renderInviteAcceptanceRolloutRunbook(packet)
  writeArtifacts(packet, runbook)

  process.stdout.write(FORMAT === 'markdown' || FORMAT === 'md' ? runbook : `${JSON.stringify(packet, null, 2)}\n`)

  if ((FAIL_ON_BLOCKED || FAIL_ON_ATTENTION) && packet.gate?.exitCode) {
    process.exitCode = packet.gate.exitCode
  }
}

main().catch((error) => {
  console.error('Invite acceptance rollout packet failed:', error?.message || error)
  process.exitCode = 1
})
