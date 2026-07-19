import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateMvpScaleProgression } from '../the-it-guy/src/core/transactions/mvpScaleProgression.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
if (!inputArg) throw new Error('Use --input=<rollout-evidence.json>.')
const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))
if (input.environment !== 'production') throw new Error('Scale evidence must be marked as production.')
const report = evaluateMvpScaleProgression(input)
console.log(JSON.stringify(report, null, 2))
if (report.decision === 'pause_rollout') process.exit(1)
