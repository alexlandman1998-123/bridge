import { readFileSync } from 'node:fs'
import { auditMvpPilotBatch } from '../src/core/transactions/mvpPilotBatchAudit.js'

const inputPath = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length)
if (!inputPath) throw new Error('Provide --input=<batch.json>.')
const input = JSON.parse(readFileSync(inputPath, 'utf8'))
const report = auditMvpPilotBatch(input.transactions || input, { batchLimit: Number(input.batchLimit || 2) })
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exit(1)
