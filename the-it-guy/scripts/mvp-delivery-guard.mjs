import {
  assessMvpDeliveryWorkstream,
  MVP_ALLOWED_WORKSTREAMS,
  MVP_FROZEN_WORKSTREAMS,
} from '../src/core/transactions/mvpDeliveryPolicy.js'

function parseArgs(argv = []) {
  const options = { workstream: '', list: false, json: false }
  for (const arg of argv) {
    if (arg === '--list') options.list = true
    else if (arg === '--json') options.json = true
    else if (arg.startsWith('--workstream=')) options.workstream = arg.slice('--workstream='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

const options = parseArgs(process.argv.slice(2))

if (options.list) {
  console.log('Use --workstream=<name> to evaluate one delivery workstream.')
  console.log(`Allowed: ${Object.keys(MVP_ALLOWED_WORKSTREAMS).join(', ')}`)
  console.log(`Frozen: ${Object.keys(MVP_FROZEN_WORKSTREAMS).join(', ')}`)
  process.exit(0)
}

if (!options.workstream) {
  throw new Error('A workstream is required. Example: node scripts/mvp-delivery-guard.mjs --workstream=workflow_controls')
}

const assessment = assessMvpDeliveryWorkstream(options.workstream)
if (options.json) console.log(JSON.stringify(assessment, null, 2))
else console.log(`${assessment.decision.toUpperCase()}: ${assessment.workstream || 'unknown'} — ${assessment.reason}`)

if (!assessment.allowed) process.exit(1)
