import { readFileSync } from 'node:fs'
import { buildMvpPilotMetrics } from '../src/core/transactions/mvpPilotMetrics.js'
import { evaluateMvpRolloutControls } from '../src/core/transactions/mvpRolloutControls.js'
const inputPath = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length)
if (!inputPath) throw new Error('Provide --input=<pilot-transactions.json>.')
const input = JSON.parse(readFileSync(inputPath, 'utf8'))
const metrics = buildMvpPilotMetrics(input.transactions || input)
console.log(JSON.stringify({ metrics, controls: evaluateMvpRolloutControls(metrics, input.limits || {}) }, null, 2))
