import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const CURRENT_UNIQUE_ID = 'PP-SANDBOX-SALE-RES-VIDEO-001'

function parseArgs(argv = []) {
  const options = {
    freeze: false,
    newPropertyId: '',
    askingPrice: '',
    offersFrom: '',
    output: path.join(appRoot, 'outputs', 'private-property-follow-up-input-freeze.json'),
  }
  for (const arg of argv) {
    if (arg === '--freeze') {
      options.freeze = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    if (!Object.hasOwn(options, key)) throw new Error(`Unknown option: ${arg}`)
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function positiveNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function inputDigest(inputs) {
  return crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const askingPrice = positiveNumber(options.askingPrice)
  const offersFrom = positiveNumber(options.offersFrom)
  const blockers = []
  if (!options.newPropertyId) blockers.push('missing_argument:--new-property-id')
  if (options.newPropertyId === CURRENT_UNIQUE_ID) blockers.push('new_property_id_must_differ_from_current_property_id')
  if (options.newPropertyId && !/^[A-Za-z0-9][A-Za-z0-9_-]{3,100}$/.test(options.newPropertyId)) blockers.push('invalid_new_property_id_format')
  if (!askingPrice) blockers.push('missing_or_invalid_argument:--asking-price')
  if (!offersFrom) blockers.push('missing_or_invalid_argument:--offers-from')
  if (askingPrice && offersFrom && offersFrom > askingPrice) blockers.push('offers_from_must_not_exceed_asking_price')
  if (!options.freeze) blockers.push('confirmation_required:--freeze')

  const frozenInputs = askingPrice && offersFrom && options.newPropertyId
    ? {
        saleResidentialNewPropertyId: options.newPropertyId,
        saleLandAskingPrice: askingPrice,
        saleLandOffersFrom: offersFrom,
        salesPricePresentation: 'OffersFrom',
        agentUser2ContactMustBeSuppliedAtExecution: true,
      }
    : null
  const report = {
    phase: 'private-property-sandbox-phase9-input-freeze',
    generatedAt: new Date().toISOString(),
    status: blockers.length ? 'BLOCKED' : 'FROZEN',
    inputs: frozenInputs,
    inputDigest: frozenInputs ? inputDigest(frozenInputs) : null,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      workbookEdited: false,
      rawCredentialsStored: false,
      agentContactStored: false,
    },
    blockers,
    nextStep: blockers.length
      ? 'Provide valid values and explicitly re-run with --freeze before beginning the sandbox sequence.'
      : 'Phase 9 inputs are frozen. Capture a fresh Phase 10 sandbox baseline before any mutation.',
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, blockers: report.blockers, inputDigest: report.inputDigest, nextStep: report.nextStep }, null, 2))
  if (report.status !== 'FROZEN') process.exitCode = 1
}

run()
