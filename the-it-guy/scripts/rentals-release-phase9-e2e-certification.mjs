import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessRentalE2eCertification } from '../src/services/rentals/rentalE2eCertification.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.resolve(appRoot, relativePath), 'utf8'))
const rebuildReceipt = readJson('config/rentals-release-staging-rebuild-receipt.json')
const certification = readJson('config/rentals-release-e2e-certification.json')
const stagingRebuild = {
  ready: rebuildReceipt.confirmed === true && Boolean(rebuildReceipt.reference) && Boolean(rebuildReceipt.recordedAt) && Boolean(rebuildReceipt.projectRef) && Boolean(rebuildReceipt.chainSha256),
  target: rebuildReceipt.projectRef || null,
  chainSha256: rebuildReceipt.chainSha256 || null,
}
const report = { checkedAt: new Date().toISOString(), ...assessRentalE2eCertification({ stagingRebuild, certification }) }
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
