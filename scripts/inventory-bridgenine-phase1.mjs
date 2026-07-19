#!/usr/bin/env node

import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const SEARCH_TERM = 'bridgenine'
const DEFAULT_OUTPUT_DIR = 'migration-evidence/2026-07-19-bridgenine-removal-phase1/backups'
const OUTPUT_DIR = path.resolve(process.argv[2] || DEFAULT_OUTPUT_DIR)
const SUPABASE_URL = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
}

const writePrivateJson = async (filename, value) => {
  const target = path.join(OUTPUT_DIR, filename)
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await chmod(target, 0o600)
  return target
}

const writePublicJson = async (filename, value) => {
  const target = path.join(path.dirname(OUTPUT_DIR), filename)
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 })
  return target
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  const body = await response.text()
  let data = null
  try {
    data = body ? JSON.parse(body) : null
  } catch {
    // Keep the error below free of response bodies, which may contain sensitive data.
  }
  if (!response.ok) {
    const message = data?.message || data?.error || `HTTP ${response.status}`
    throw new Error(`${response.status} ${response.statusText}: ${message}`)
  }
  return { data, headers: response.headers }
}

const objectContainsTerm = (value) => JSON.stringify(value).toLowerCase().includes(SEARCH_TERM)

const findMatchingPaths = (value, prefix = '', matches = new Set()) => {
  if (typeof value === 'string' && value.toLowerCase().includes(SEARCH_TERM)) {
    matches.add(prefix || '$')
    return matches
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findMatchingPaths(item, `${prefix}[${index}]`, matches))
    return matches
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      findMatchingPaths(item, prefix ? `${prefix}.${key}` : key, matches)
    })
  }
  return matches
}

const getAuthUsers = async () => {
  const users = []
  const errors = []
  const pageSize = 50
  const firstResponse = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=${pageSize}`)
  const total = Number(firstResponse.headers.get('x-total-count') || 0)
  const fullPages = Math.floor(total / pageSize)
  users.push(...(Array.isArray(firstResponse.data?.users) ? firstResponse.data.users : []))

  for (let page = 2; page <= fullPages; page += 1) {
    const { data } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${pageSize}`)
    users.push(...(Array.isArray(data?.users) ? data.users : []))
  }

  const firstRemainderIndex = fullPages * pageSize + 1
  const remainderPages = Array.from(
    { length: Math.max(0, total - fullPages * pageSize) },
    (_, index) => firstRemainderIndex + index,
  )
  const results = await Promise.all(remainderPages.map(async (page) => {
    try {
      const { data } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1`)
      return { page, users: Array.isArray(data?.users) ? data.users : [] }
    } catch (error) {
      return { page, error: error.message, users: [] }
    }
  }))
  for (const result of results) {
    users.push(...result.users)
    if (result.error) errors.push({ page: result.page, error: result.error })
  }

  return {
    total,
    scanned: users.length,
    matches: users.filter(objectContainsTerm),
    errors,
  }
}

const quotePostgrestIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`

const getDatabaseMatches = async () => {
  const { data: schema } = await fetchJson(`${SUPABASE_URL}/rest/v1/`)
  const definitions = schema?.definitions || {}
  const exposedRelations = new Set(
    Object.keys(schema?.paths || {})
      .filter((entry) => /^\/[A-Za-z0-9_]+$/.test(entry))
      .map((entry) => entry.slice(1)),
  )
  const candidates = []
  const matches = []
  const jsonMatches = []
  const errors = []
  const relations = Object.entries(definitions).filter(([relation]) => exposedRelations.has(relation))

  const scanRelation = async ([relation, definition]) => {
    const properties = definition?.properties || {}
    const textColumns = Object.entries(properties)
      .filter(([, property]) => property?.format === 'text')
      .map(([column]) => column)
    const likelyReferenceColumns = textColumns.filter((column) =>
      /(email|url|uri|origin|domain|host|link|redirect|site|callback|payload|metadata|setting|config)/i.test(column),
    )
    const jsonColumns = Object.entries(properties)
      .filter(([, property]) => ['json', 'jsonb'].includes(property?.format))
      .map(([column]) => column)
    if (likelyReferenceColumns.length > 0 || jsonColumns.length > 0) {
      candidates.push({ relation, textColumns: likelyReferenceColumns, jsonColumns })
    }

    const uniqueRows = new Map()
    const chunkSize = 10
    for (let index = 0; index < textColumns.length; index += chunkSize) {
      const chunk = textColumns.slice(index, index + chunkSize)
      const filters = chunk
        .map((column) => `${quotePostgrestIdentifier(column)}.ilike.*${SEARCH_TERM}*`)
        .join(',')
      const params = new URLSearchParams({ select: '*', or: `(${filters})`, limit: '10000' })
      try {
        const { data } = await fetchJson(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(relation)}?${params}`)
        for (const row of Array.isArray(data) ? data : []) {
          uniqueRows.set(JSON.stringify(row), row)
        }
      } catch (error) {
        errors.push({ relation, columns: chunk, error: error.message })
      }
    }

    if (uniqueRows.size > 0) {
      const rows = [...uniqueRows.values()]
      matches.push({
        relation,
        rowCount: rows.length,
        matchingPaths: [...new Set(rows.flatMap((row) => [...findMatchingPaths(row)]))].sort(),
        rows,
      })
    }

    if (jsonColumns.length > 0) {
      const primaryKeyColumns = Object.entries(properties)
        .filter(([, property]) => String(property?.description || '').includes('<pk/>'))
        .map(([column]) => column)
      const selectedColumns = [...new Set([...primaryKeyColumns, ...jsonColumns])]
      const foundRows = []
      const pageSize = 1000
      for (let offset = 0; ; offset += pageSize) {
        const params = new URLSearchParams({
          select: selectedColumns.map(quotePostgrestIdentifier).join(','),
          limit: String(pageSize),
          offset: String(offset),
        })
        try {
          const { data } = await fetchJson(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(relation)}?${params}`)
          const rows = Array.isArray(data) ? data : []
          rows.forEach((row, rowIndex) => {
            if (objectContainsTerm(row)) foundRows.push({ _scanOffset: offset + rowIndex, ...row })
          })
          if (rows.length < pageSize) break
        } catch (error) {
          errors.push({ relation, columns: jsonColumns, scan: 'json', error: error.message })
          break
        }
      }
      if (foundRows.length > 0) {
        jsonMatches.push({
          relation,
          rowCount: foundRows.length,
          matchingPaths: [...new Set(foundRows.flatMap((row) => [...findMatchingPaths(row)]))].sort(),
          rows: foundRows,
        })
      }
    }
  }

  const concurrency = 12
  for (let index = 0; index < relations.length; index += concurrency) {
    await Promise.all(relations.slice(index, index + concurrency).map(scanRelation))
  }

  candidates.sort((left, right) => left.relation.localeCompare(right.relation))
  matches.sort((left, right) => left.relation.localeCompare(right.relation))
  jsonMatches.sort((left, right) => left.relation.localeCompare(right.relation))
  errors.sort((left, right) => left.relation.localeCompare(right.relation))
  return { candidates, matches, jsonMatches, errors }
}

await mkdir(OUTPUT_DIR, { recursive: true, mode: 0o700 })
await chmod(OUTPUT_DIR, 0o700)

const generatedAt = new Date().toISOString()
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
const auth = await getAuthUsers()
const database = await getDatabaseMatches()

const backupFiles = []
backupFiles.push(await writePrivateJson('auth-users.json', {
  generatedAt,
  projectRef,
  totalReportedUsers: auth.total,
  scannedUsers: auth.scanned,
  recordCount: auth.matches.length,
  users: auth.matches,
}))
backupFiles.push(await writePrivateJson('database-records.json', {
  generatedAt,
  projectRef,
  relationCount: database.matches.length,
  recordCount: database.matches.reduce((sum, relation) => sum + relation.rowCount, 0),
  relations: database.matches,
  jsonRelationCount: database.jsonMatches.length,
  jsonRecordCount: database.jsonMatches.reduce((sum, relation) => sum + relation.rowCount, 0),
  jsonRelations: database.jsonMatches,
}))
backupFiles.push(await writePrivateJson('database-schema-candidates.json', {
  generatedAt,
  projectRef,
  relationCount: database.candidates.length,
  relations: database.candidates,
}))
backupFiles.push(await writePrivateJson('scan-errors.json', {
  generatedAt,
  projectRef,
  errorCount: database.errors.length + auth.errors.length,
  authUserErrors: auth.errors,
  databaseErrors: database.errors,
}))

await writePublicJson('database-summary.json', {
  generatedAt,
  projectRef,
  auth: {
    usersReported: auth.total,
    usersScanned: auth.scanned,
    matchingUsers: auth.matches.length,
    scanErrors: auth.errors,
  },
  database: {
    textMatches: database.matches.map(({ relation, rowCount, matchingPaths }) => ({
      relation,
      rowCount,
      matchingPaths,
    })),
    jsonMatches: database.jsonMatches.map(({ relation, rowCount, matchingPaths }) => ({
      relation,
      rowCount,
      matchingPaths,
    })),
    scanErrors: database.errors,
  },
})

const manifestFiles = []
for (const filename of backupFiles) {
  const contents = await readFile(filename)
  const details = await stat(filename)
  manifestFiles.push({
    path: path.relative(process.cwd(), filename),
    bytes: details.size,
    sha256: createHash('sha256').update(contents).digest('hex'),
  })
}
await writePublicJson('backup-manifest.json', { generatedAt, files: manifestFiles })

console.log(JSON.stringify({
  outputDirectory: OUTPUT_DIR,
  projectRef,
  authUsersReported: auth.total,
  authUsersScanned: auth.scanned,
  authUserMatches: auth.matches.length,
  databaseRelationsWithMatches: database.matches.length,
  databaseRecordMatches: database.matches.reduce((sum, relation) => sum + relation.rowCount, 0),
  databaseJsonRelationsWithMatches: database.jsonMatches.length,
  databaseJsonRecordMatches: database.jsonMatches.reduce((sum, relation) => sum + relation.rowCount, 0),
  scanErrors: database.errors.length + auth.errors.length,
}, null, 2))
