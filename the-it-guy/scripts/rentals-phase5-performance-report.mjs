import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRentalPerformanceReport } from '../src/modules/rentals/shared/observability/rentalPerformanceTelemetry.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const samplesArg = process.argv.find((value) => value.startsWith('--samples='))

if (!samplesArg) {
  console.log(JSON.stringify({
    contract: 'arch9_rentals_performance_v1',
    status: 'NO_SAMPLES',
    message: 'Pass --samples=<path-to-json-array> to summarize privacy-safe rental performance samples.',
  }, null, 2))
  process.exit(0)
}

const requestedPath = samplesArg.slice('--samples='.length)
const samplePath = path.resolve(appRoot, requestedPath)
const samples = JSON.parse(await fs.readFile(samplePath, 'utf8'))
if (!Array.isArray(samples)) throw new Error('The samples file must contain a JSON array.')
console.log(JSON.stringify(buildRentalPerformanceReport(samples), null, 2))
