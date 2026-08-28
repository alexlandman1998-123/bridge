import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { verifyTargetFlowPerformanceEvidence } from '../src/services/observability/targetFlowPerformanceBudget.js'

const inputArgument = process.argv.find((argument) => argument.startsWith('--input='))
if (!inputArgument) {
  throw new Error('Provide exported diagnostics evidence with --input=/absolute/path/to/evidence.json')
}

const inputPath = resolve(inputArgument.slice('--input='.length))
const evidence = JSON.parse(await readFile(inputPath, 'utf8'))
const verification = verifyTargetFlowPerformanceEvidence(evidence)

process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`)
if (verification.status !== 'PASS') process.exitCode = 1
