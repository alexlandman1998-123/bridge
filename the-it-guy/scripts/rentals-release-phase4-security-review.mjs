import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessRentalSecurityDefinerExceptionReview } from '../src/services/rentals/rentalSecurityDefinerExceptionReview.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const configPath = path.resolve(appRoot, 'config/rentals-security-definer-exceptions.json')
const resolveSource = (source) => [path.resolve(appRoot, source), path.resolve(appRoot, '..', source)].find((candidate) => fs.existsSync(candidate))
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const sources = [...new Set(config.exceptions.map((exception) => exception.source))].map((source) => {
  const absolutePath = resolveSource(source)
  if (!absolutePath) throw new Error(`Source does not exist: ${source}`)
  return { path: source, sql: fs.readFileSync(absolutePath, 'utf8') }
})
const report = { checkedAt: new Date().toISOString(), ...assessRentalSecurityDefinerExceptionReview({ exceptions: config.exceptions, sources }) }
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
