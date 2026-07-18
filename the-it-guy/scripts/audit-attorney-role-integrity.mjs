import { createServer } from 'vite'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const firmIndex = args.indexOf('--firm-id')
const firmId = firmIndex >= 0 ? String(args[firmIndex + 1] || '').trim() : ''
const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const integrity = await server.ssrLoadModule('/src/services/attorneyRoleIntegrityService.js')
  const report = await integrity.getAttorneyRoleIntegrityReport({ firmId })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (strict && report.gate.status !== 'pass') process.exitCode = 1
} finally {
  await server.close()
}
