import { createServer } from 'vite'

const args = process.argv.slice(2)
const firmIndex = args.indexOf('--firm-id')
const firmId = firmIndex >= 0 ? String(args[firmIndex + 1] || '').trim() : ''
const confirm = args.includes('--confirm')

if (!firmId) {
  throw new Error('Provide --firm-id <uuid>. Certification is always scoped to one firm.')
}

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const release = await server.ssrLoadModule('/src/services/attorneyRoleReleaseService.js')
  const result = await release.certifyAttorneyRoleRelease({ firmId, confirm })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ready || (confirm && !result.certified)) process.exitCode = 1
} finally {
  await server.close()
}
