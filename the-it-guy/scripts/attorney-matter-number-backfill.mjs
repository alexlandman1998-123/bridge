import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [
          line.slice(0, separator),
          line.slice(separator + 1).replace(/^["']|["']$/g, ''),
        ]
      }),
  )
}

function argumentValue(name) {
  const prefix = `${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || ''
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const apply = process.argv.includes('--apply')
const confirmed = process.argv.includes('--confirm-write')
const firmId = argumentValue('--firm-id') || null
const previewLimit = positiveInteger(argumentValue('--preview-limit'), 100)
const applyLimit = argumentValue('--limit') ? positiveInteger(argumentValue('--limit'), null) : null
const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.staging.local'),
  ...process.env,
}
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}
if (apply && (!confirmed || env.ATTORNEY_MATTER_BACKFILL_WRITE !== 'true')) {
  throw new Error('Apply mode requires --confirm-write and ATTORNEY_MATTER_BACKFILL_WRITE=true.')
}

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function rpc(name, parameters) {
  const result = await client.rpc(name, parameters)
  if (result.error) throw result.error
  return result.data
}

async function loadReport() {
  const [summary, preview] = await Promise.all([
    rpc('summarize_attorney_matter_number_backfill', {
      p_attorney_firm_id: firmId,
    }),
    rpc('report_attorney_matter_number_backfill', {
      p_attorney_firm_id: firmId,
      p_limit: previewLimit,
      p_offset: 0,
    }),
  ])
  return { summary, preview: preview || [] }
}

const before = await loadReport()
let applyResult = null
let after = null

if (apply) {
  applyResult = await rpc('apply_attorney_matter_number_backfill', {
    p_attorney_firm_id: firmId,
    p_limit: applyLimit,
  })
  after = await loadReport()
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? 'applied' : 'report_only',
  mutatedData: apply,
  firmId,
  previewLimit,
  applyLimit,
  before,
  applyResult,
  after,
  controlledWriteCommand:
    'ATTORNEY_MATTER_BACKFILL_WRITE=true npm run backfill:attorney-matter-numbers -- --apply --confirm-write',
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

