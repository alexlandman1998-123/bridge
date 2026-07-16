import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function getFailureTelemetryCount() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return { ok: false, count: null, reason: 'missing_staging_credentials' }
  const client = createClient(url, key, { auth: { persistSession: false } })
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const result = await client
    .from('telemetry_events')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'workspace')
    .eq('event_name', 'workspace_branding_image_failed')
    .gte('created_at', since)
  if (result.error) return { ok: false, count: null, reason: result.error.code || 'telemetry_query_failed' }
  const threshold = Number(process.env.WORKSPACE_BRANDING_FAILURE_THRESHOLD || 0)
  return { ok: Number(result.count || 0) <= threshold, count: Number(result.count || 0), threshold, windowHours: 24 }
}

const audit = await run(process.execPath, ['scripts/workspace-branding-integrity-audit.mjs', '--strict'])
const telemetry = await getFailureTelemetryCount()
const browser = audit.code === 0 && telemetry.ok
  ? await run(process.execPath, ['scripts/workspace-branding-browser-staging-smoke.mjs'])
  : { code: 1, stdout: '', stderr: 'Skipped because a prerequisite gate failed.' }

const report = {
  generatedAt: new Date().toISOString(),
  status: audit.code === 0 && telemetry.ok && browser.code === 0 ? 'GO' : 'NO_GO',
  mutatedData: false,
  gates: {
    membershipIntegrity: { status: audit.code === 0 ? 'pass' : 'blocked', detail: audit.code === 0 ? 'Strict integrity audit passed.' : (audit.stderr.trim() || 'Integrity audit failed.') },
    failureTelemetry: { status: telemetry.ok ? 'pass' : 'blocked', ...telemetry },
    browserStability: { status: browser.code === 0 ? 'pass' : 'blocked', detail: browser.code === 0 ? 'Authenticated logo stability smoke passed.' : (browser.stderr.trim() || 'Browser smoke failed.') },
  },
}

console.log(JSON.stringify(report, null, 2))
if (report.status !== 'GO') process.exitCode = 1
