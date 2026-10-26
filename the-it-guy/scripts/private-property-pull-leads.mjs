import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { runPrivatePropertyLeadSync } from '../server/services/privatePropertyLeadSyncService.js'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--start-date='))) throw new Error('Use --apply or --start-date=ISO_DATE.')
let env = {}
for (const file of ['.env', '.env.local', '.env.production.local']) {
  const path = new URL(`../${file}`, import.meta.url)
  if (fs.existsSync(path)) Object.assign(env, parseEnv(fs.readFileSync(path, 'utf8')))
}
env = { ...env, ...process.env }
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
if (!url || new URL(url).hostname !== 'isdowlnollckzvltkasn.supabase.co') throw new Error('Arch9 production target required.')
const report = await runPrivatePropertyLeadSync({
  client: createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
  secrets: env, apply: args.includes('--apply'), startDate: args.find((arg) => arg.startsWith('--start-date='))?.slice(13),
})
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'COMPLETE') process.exitCode = 1
