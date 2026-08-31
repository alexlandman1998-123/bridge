import fs from 'node:fs'
import path from 'node:path'

import {
  buildRentalProperty24VettingPhase0Pack,
  formatRentalProperty24VettingPhase0Markdown,
} from '../the-it-guy/src/services/rentals/rentalProperty24VettingPhase0Model.js'

const repoRoot = process.cwd()

function parseArgs(args = process.argv.slice(2)) {
  const options = { write: false, json: false }
  for (const arg of args) {
    if (arg === '--write') options.write = true
    else if (arg === '--json') options.json = true
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

const options = parseArgs()
const pack = buildRentalProperty24VettingPhase0Pack()
let outputs = null
if (options.write) {
  const jsonPath = path.join(repoRoot, 'docs', 'rental-property24-vetting-phase0.json')
  const markdownPath = path.join(repoRoot, 'docs', 'rental-property24-vetting-phase0.md')
  fs.writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`)
  fs.writeFileSync(markdownPath, formatRentalProperty24VettingPhase0Markdown(pack))
  outputs = { json: path.relative(repoRoot, jsonPath), markdown: path.relative(repoRoot, markdownPath) }
}

if (options.json) process.stdout.write(`${JSON.stringify({ ...pack, outputs }, null, 2)}\n`)
else console.log(`Rental Property24 vetting Phase 0: ${pack.status}`)
