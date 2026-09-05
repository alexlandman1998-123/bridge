import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessRentalProductionReleaseAuthority } from '../src/services/rentals/rentalProductionReleaseAuthority.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(appRoot, relativePath), 'utf8'))
const report = {
  checkedAt: new Date().toISOString(),
  ...assessRentalProductionReleaseAuthority({
    preflightReceipt: readJson('config/rentals-release-production-preflight-receipt.json'),
    authority: readJson('config/rentals-release-production-authority.json'),
  }),
}
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
