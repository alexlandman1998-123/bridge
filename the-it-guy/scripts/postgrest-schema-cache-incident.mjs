#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const workspaceRoot = resolve(appRoot, '..')
const supabaseWorkdir = resolve(workspaceRoot, 'supabase')
const args = new Set(process.argv.slice(2))
const shouldReload = args.has('--reload')
const shouldWrite = args.has('--write')
const timeoutMs = Number(process.env.POSTGREST_INCIDENT_TIMEOUT_MS || 45000)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

function classifyPostgrestError(error) {
  const text = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
    error?.status,
    error?.statusCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    error?.code === 'PGRST002' ||
    text.includes('could not query the database for the schema cache') ||
    (text.includes('schema cache') && text.includes('retrying'))
  ) {
    return 'PGRST002_SCHEMA_CACHE_REBUILD_FAILED'
  }
  if (text.includes('schema cache')) return 'SCHEMA_CACHE_MISS'
  if (text.includes('failed to fetch') || text.includes('fetch failed') || text.includes('network') || text.includes('timeout')) {
    return 'NETWORK_FAILURE'
  }
  return String(error?.code || 'QUERY_FAILED')
}

function redact(value = '') {
  return String(value)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted-supabase-key]')
}

function run(command, commandArgs, { cwd = appRoot, timeout = timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let didTimeout = false
    const timer = setTimeout(() => {
      didTimeout = true
      child.kill('SIGTERM')
    }, timeout)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolveRun({
        ok: code === 0 && !didTimeout,
        code: code ?? 1,
        signal,
        timedOut: didTimeout,
        stdout: redact(stdout.trim()).slice(-2000),
        stderr: redact(stderr.trim()).slice(-2000),
      })
    })
  })
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? JSON.parse(text || '{}') : redact(text).slice(0, 500),
    }
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || 'fetch_failed' }
  }
}

async function probeTable(label, key, tableName) {
  if (!supabaseUrl || !key) {
    return { ok: false, label, tableName, reason: 'missing_credentials' }
  }
  const startedAt = performance.now()
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(tableName)}?select=id&limit=1`
  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: 'count=exact',
        range: '0-0',
      },
      signal: AbortSignal.timeout(12000),
    })
    const durationMs = Math.round(performance.now() - startedAt)
    const contentRange = response.headers.get('content-range') || ''
    if (response.ok) {
      return {
        ok: true,
        label,
        tableName,
        durationMs,
        countAvailable: contentRange.includes('/'),
      }
    }
    const rawBody = await response.text().catch(() => '')
    let body = {}
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      body = {}
    }
    return {
      ok: false,
      label,
      tableName,
      durationMs,
      status: response.status,
      classification: classifyPostgrestError(body),
      code: body?.code || '',
      message: body?.message || redact(rawBody).slice(0, 500),
    }
  } catch (error) {
    return {
      ok: false,
      label,
      tableName,
      durationMs: Math.round(performance.now() - startedAt),
      classification: classifyPostgrestError(error),
      code: error?.name || '',
      message: error?.message || 'fetch_failed',
    }
  }
}

async function reloadPostgrestSchemaCache() {
  if (!shouldReload) return { skipped: true, reason: 'pass --reload to notify PostgREST' }
  return run('npx', ['supabase', 'db', 'query', '--linked', "notify pgrst, 'reload schema';"], {
    cwd: supabaseWorkdir,
  })
}

async function inspectRoleStats() {
  return run('npx', ['supabase', 'inspect', 'db', 'role-stats', '--linked'], {
    cwd: supabaseWorkdir,
  })
}

const releaseManifest = await fetchJson('https://app.arch9.co.za/release-manifest.json')
const reload = await reloadPostgrestSchemaCache()
const serviceProfiles = await probeTable('service_role_profiles_head', serviceKey, 'profiles')
const anonProfiles = await probeTable('anon_profiles_head', anonKey, 'profiles')
const roleStats = await inspectRoleStats()

const apiProbes = [serviceProfiles, anonProfiles]
const schemaBlocked = apiProbes.some((probe) => probe.classification === 'PGRST002_SCHEMA_CACHE_REBUILD_FAILED')
const status = apiProbes.every((probe) => probe.ok)
  ? 'RECOVERED'
  : schemaBlocked
    ? 'PGRST_SCHEMA_CACHE_BLOCKED'
    : apiProbes.some((probe) => probe.classification === 'NETWORK_FAILURE')
      ? 'NETWORK_PROBE_FAILED'
    : 'API_PROBE_FAILED'

const report = {
  generatedAt: new Date().toISOString(),
  status,
  mutatedData: false,
  supabaseUrlPresent: Boolean(supabaseUrl),
  anonKeyPresent: Boolean(anonKey),
  serviceKeyPresent: Boolean(serviceKey),
  releaseManifest: {
    ok: releaseManifest.ok,
    status: releaseManifest.status,
    releaseId: releaseManifest.body?.releaseId || null,
    builtAt: releaseManifest.body?.builtAt || null,
  },
  reload,
  probes: {
    serviceProfiles,
    anonProfiles,
    roleStats,
  },
  nextAction:
    status === 'PGRST_SCHEMA_CACHE_BLOCKED'
      ? 'Supabase REST/PostgREST is reachable but cannot rebuild its schema cache. Reload/restart the Supabase API service from the dashboard or escalate to Supabase support.'
      : status === 'NETWORK_PROBE_FAILED'
        ? 'The diagnostic environment could not reach Supabase REST. Rerun from an unrestricted network before deciding on a Supabase API restart.'
      : 'No Supabase API service restart indicated by this diagnostic.',
}

console.log(JSON.stringify(report, null, 2))

if (shouldWrite) {
  const outputPath = resolve(appRoot, 'tmp', 'postgrest-schema-cache-incident.json')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.error(`Wrote ${outputPath}`)
}

if (status !== 'RECOVERED') process.exitCode = 1
