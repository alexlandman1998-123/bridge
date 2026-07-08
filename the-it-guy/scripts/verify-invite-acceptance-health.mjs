import fs from 'node:fs'
import path from 'node:path'
import {
  buildInviteAcceptanceHealthReport,
  renderInviteAcceptanceHealthText,
} from '../src/lib/invitationAcceptanceHealth.js'

const INPUT_PATH = process.env.INVITE_ACCEPTANCE_HEALTH_INPUT ||
  process.env.INVITE_ACCEPTANCE_RECONCILE_INPUT ||
  process.env.INVITE_ACCEPTANCE_AUDIT_INPUT ||
  ''
const OUTPUT_PATH = process.env.INVITE_ACCEPTANCE_HEALTH_OUTPUT || ''
const FORMAT = String(process.env.INVITE_ACCEPTANCE_HEALTH_FORMAT || 'json').trim().toLowerCase()
const FAIL_ON_BLOCKED = process.env.INVITE_ACCEPTANCE_HEALTH_FAIL_ON_BLOCKED !== 'false'
const FAIL_ON_ATTENTION = process.env.INVITE_ACCEPTANCE_HEALTH_FAIL_ON_ATTENTION === 'true'

function readInputPayload() {
  if (!INPUT_PATH) {
    throw new Error('Missing INVITE_ACCEPTANCE_HEALTH_INPUT, INVITE_ACCEPTANCE_RECONCILE_INPUT, or INVITE_ACCEPTANCE_AUDIT_INPUT.')
  }
  const resolvedPath = path.resolve(process.cwd(), INPUT_PATH)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Invite acceptance health input does not exist: ${resolvedPath}`)
  }
  return {
    source: `file:${resolvedPath}`,
    ...JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
  }
}

async function main() {
  const payload = readInputPayload()
  const report = buildInviteAcceptanceHealthReport(payload, {
    source: payload.source,
    failOnAttention: FAIL_ON_ATTENTION,
  })
  const output = FORMAT === 'text'
    ? renderInviteAcceptanceHealthText(report)
    : `${JSON.stringify(report, null, 2)}\n`

  if (OUTPUT_PATH) fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_PATH), output)
  process.stdout.write(output)

  if (FAIL_ON_BLOCKED && report.gate?.exitCode) {
    process.exitCode = report.gate.exitCode
  }
}

main().catch((error) => {
  console.error('Invite acceptance health check failed:', error?.message || error)
  process.exitCode = 1
})
