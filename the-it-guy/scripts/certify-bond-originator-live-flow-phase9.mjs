import { readFile, writeFile } from 'node:fs/promises'

import {
  buildBondOriginatorLiveFlowCertification,
  buildBondOriginatorLiveFlowEvidenceTemplate,
} from '../src/modules/bond/application/index.js'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

const evidencePath = argument('--evidence')
const outputPath = argument('--output')
const template = process.argv.includes('--template')

if (!template && !evidencePath) {
  console.error('Usage: node scripts/certify-bond-originator-live-flow-phase9.mjs --template [--output path] | --evidence path [--output path]')
  process.exit(2)
}

const result = template
  ? buildBondOriginatorLiveFlowEvidenceTemplate({
      fixtureId: argument('--fixture-id'),
      artifactId: argument('--artifact-id'),
    })
  : buildBondOriginatorLiveFlowCertification(JSON.parse(await readFile(evidencePath, 'utf8')))
const json = `${JSON.stringify(result, null, 2)}\n`

if (outputPath) await writeFile(outputPath, json, 'utf8')
else process.stdout.write(json)

if (!template && !result.ready) process.exitCode = 1
