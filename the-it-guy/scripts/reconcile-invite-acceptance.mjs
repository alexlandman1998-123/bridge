import fs from 'node:fs'
import path from 'node:path'
import {
  buildInviteAcceptanceReconciliationPlan,
  renderInviteAcceptanceReconciliationSql,
} from '../src/lib/invitationAcceptanceReconciliation.js'

const INPUT_PATH = process.env.INVITE_ACCEPTANCE_RECONCILE_INPUT || process.env.INVITE_ACCEPTANCE_AUDIT_INPUT || ''
const OUTPUT_PATH = process.env.INVITE_ACCEPTANCE_RECONCILE_OUTPUT || ''
const SQL_OUTPUT_PATH = process.env.INVITE_ACCEPTANCE_RECONCILE_SQL_OUTPUT || ''
const FORMAT = String(process.env.INVITE_ACCEPTANCE_RECONCILE_FORMAT || 'json').trim().toLowerCase()

function readInputPayload() {
  if (!INPUT_PATH) {
    throw new Error('Missing INVITE_ACCEPTANCE_RECONCILE_INPUT or INVITE_ACCEPTANCE_AUDIT_INPUT.')
  }
  const resolvedPath = path.resolve(process.cwd(), INPUT_PATH)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Invite reconciliation input does not exist: ${resolvedPath}`)
  }
  return {
    source: `file:${resolvedPath}`,
    ...JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
  }
}

async function main() {
  const payload = readInputPayload()
  const plan = buildInviteAcceptanceReconciliationPlan(payload, { source: payload.source })
  const jsonOutput = `${JSON.stringify(plan, null, 2)}\n`
  const sqlOutput = renderInviteAcceptanceReconciliationSql(plan)

  if (OUTPUT_PATH) fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_PATH), jsonOutput)
  if (SQL_OUTPUT_PATH) fs.writeFileSync(path.resolve(process.cwd(), SQL_OUTPUT_PATH), sqlOutput)

  process.stdout.write(FORMAT === 'sql' ? sqlOutput : jsonOutput)
}

main().catch((error) => {
  console.error('Invite acceptance reconciliation failed:', error?.message || error)
  process.exitCode = 1
})
