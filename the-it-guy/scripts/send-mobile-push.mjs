import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

// This is an explicit operator command. It never runs during install or build.
const options = {}
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--dry-run') options.dryRun = true
  else if (['--title', '--message'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i]
  else throw new Error('Usage: node scripts/send-mobile-push.mjs --title TITLE --message MESSAGE [--dry-run]')
}
if (!options.title || !options.message) throw new Error('Provide --title and --message.')
const token = (await readFile(path.join(homedir(), '.config/arch9/mobile-push-operator-token'), 'utf8')).trim()
try {
  const response = await fetch('https://app.arch9.co.za/api/mobile/push-operator', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(options), signal: AbortSignal.timeout(25000),
  })
  const result = await response.json()
  console.log(JSON.stringify({ status: response.status, ...result }))
  if (!response.ok || (options.dryRun ? result.ready !== true : result.accepted !== true)) process.exitCode = 1
} catch {
  console.error('The request did not finish. Delivery is unknown; do not automatically retry.')
  process.exitCode = 1
}
