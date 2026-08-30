import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { evaluateTargetFlowPromotionReadiness } from '../src/services/observability/targetFlowPerformanceRelease.js'

const inputArgument = process.argv.find((argument) => argument.startsWith('--input='))
if (!inputArgument) throw new Error('Provide exported diagnostics evidence with --input=/absolute/path/to/evidence.json')
const previewArgument = process.argv.find((argument) => argument.startsWith('--preview-url='))

const evidence = JSON.parse(await readFile(resolve(inputArgument.slice('--input='.length)), 'utf8'))
const readiness = evaluateTargetFlowPromotionReadiness(evidence, {
  expectedPreviewUrl: previewArgument ? previewArgument.slice('--preview-url='.length) : '',
  observedPreviewUrl: previewArgument ? previewArgument.slice('--preview-url='.length) : '',
})
process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`)
if (!readiness.ready) process.exitCode = 1
