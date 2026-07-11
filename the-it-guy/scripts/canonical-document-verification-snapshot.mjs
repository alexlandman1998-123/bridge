import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const CANONICAL_DOCUMENT_VERIFICATION_SNAPSHOT_RPC = 'canonical_document_verification_snapshot'
export const CANONICAL_DOCUMENT_VERIFICATION_PURPOSE = 'canonical_staging_verification'

const DEFAULT_CACHE_TTL_MS = 60_000
const DEFAULT_WAIT_TIMEOUT_MS = 120_000
const DEFAULT_POLL_INTERVAL_MS = 250
const DEFAULT_STALE_LOCK_MS = 180_000

function normalizeText(value) {
  return String(value || '').trim()
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function cacheDisabled() {
  return ['0', 'false', 'off', 'disabled'].includes(normalizeText(process.env.CANONICAL_DOCUMENT_SNAPSHOT_CACHE).toLowerCase())
}

function getCachePath({ purpose, rpcName }) {
  const key = createHash('sha256')
    .update([process.cwd(), rpcName, purpose, process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''].join('|'))
    .digest('hex')
    .slice(0, 20)
  return path.join(os.tmpdir(), `canonical-document-verification-snapshot-${key}.json`)
}

async function readCachedSnapshot(cachePath, ttlMs) {
  try {
    const raw = await fs.readFile(cachePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > ttlMs) return null
    return parsed.data || {}
  } catch {
    return null
  }
}

async function writeCachedSnapshot(cachePath, data) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify({ createdAt: Date.now(), data }))
}

async function clearStaleLock(lockPath, staleLockMs) {
  try {
    const stat = await fs.stat(lockPath)
    if (Date.now() - stat.mtimeMs > staleLockMs) {
      await fs.unlink(lockPath)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function tryAcquireLock(lockPath) {
  try {
    await fs.mkdir(path.dirname(lockPath), { recursive: true })
    const handle = await fs.open(lockPath, 'wx')
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }))
    return async () => {
      await handle.close().catch(() => {})
      await fs.unlink(lockPath).catch(() => {})
    }
  } catch (error) {
    if (error?.code === 'EEXIST') return null
    throw error
  }
}

async function fetchSnapshotFromRpc(supabase, { rpcName, purpose }) {
  const { data, error } = await supabase.rpc(rpcName, { p_purpose: purpose })
  if (error) {
    throw new Error(error.message || `Unable to fetch ${rpcName}.`)
  }
  return data || {}
}

export async function loadCanonicalVerificationSnapshot(supabase, options = {}) {
  if (!supabase?.rpc) throw new Error('Supabase client with rpc() is required for canonical verification snapshot.')

  const rpcName = normalizeText(options.rpcName) || CANONICAL_DOCUMENT_VERIFICATION_SNAPSHOT_RPC
  const purpose = normalizeText(options.purpose) || CANONICAL_DOCUMENT_VERIFICATION_PURPOSE
  if (cacheDisabled() || options.cache === false) {
    return fetchSnapshotFromRpc(supabase, { rpcName, purpose })
  }

  const cacheTtlMs = parsePositiveInteger(options.cacheTtlMs || process.env.CANONICAL_DOCUMENT_SNAPSHOT_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS)
  const waitTimeoutMs = parsePositiveInteger(options.waitTimeoutMs || process.env.CANONICAL_DOCUMENT_SNAPSHOT_WAIT_MS, DEFAULT_WAIT_TIMEOUT_MS)
  const pollIntervalMs = parsePositiveInteger(options.pollIntervalMs || process.env.CANONICAL_DOCUMENT_SNAPSHOT_POLL_MS, DEFAULT_POLL_INTERVAL_MS)
  const staleLockMs = parsePositiveInteger(options.staleLockMs || process.env.CANONICAL_DOCUMENT_SNAPSHOT_STALE_LOCK_MS, DEFAULT_STALE_LOCK_MS)
  const cachePath = options.cachePath || getCachePath({ purpose, rpcName })
  const lockPath = `${cachePath}.lock`
  const startedAt = Date.now()

  while (Date.now() - startedAt <= waitTimeoutMs) {
    const cached = await readCachedSnapshot(cachePath, cacheTtlMs)
    if (cached) return cached

    await clearStaleLock(lockPath, staleLockMs)
    const releaseLock = await tryAcquireLock(lockPath)
    if (releaseLock) {
      try {
        const secondCached = await readCachedSnapshot(cachePath, cacheTtlMs)
        if (secondCached) return secondCached
        const snapshot = await fetchSnapshotFromRpc(supabase, { rpcName, purpose })
        await writeCachedSnapshot(cachePath, snapshot)
        return snapshot
      } finally {
        await releaseLock()
      }
    }

    await delay(pollIntervalMs)
  }

  throw new Error(`Timed out waiting for ${rpcName} cache after ${waitTimeoutMs}ms.`)
}
