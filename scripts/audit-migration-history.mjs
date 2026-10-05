#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')

function hash(value) {
  return createHash('md5').update(value).digest('hex')
}

function getLocalMigrations() {
  return readdirSync(migrationsDirectory)
    .map((file) => {
      const match = file.match(/^(\d+)_(.+)\.sql$/)
      if (!match) return null
      return {
        version: match[1],
        name: match[2],
        file,
        sqlHash: hash(readFileSync(join(migrationsDirectory, file))),
        sql: readFileSync(join(migrationsDirectory, file), 'utf8'),
      }
    })
    .filter(Boolean)
}

function queryRemoteMigrations(sql) {
  const output = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', `begin read only; ${sql} commit;`], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  })
  const jsonStart = output.indexOf('{\n  \"boundary\"')
  if (jsonStart < 0) throw new Error('Supabase did not return a machine-readable migration response.')
  return JSON.parse(output.slice(jsonStart)).rows
}

function getRemoteMigrationIndex() {
  return queryRemoteMigrations("select version, name, md5(array_to_string(statements, E'\\n\\n')) as sql_hash from supabase_migrations.schema_migrations order by version;")
}

function getRemoteStatements(versions) {
  if (versions.length === 0) return new Map()
  if (!versions.every((version) => /^\d+$/.test(version))) throw new Error('Migration versions must be numeric.')

  const quotedVersions = versions.map((version) => `'${version}'`).join(', ')
  const rows = queryRemoteMigrations(
    `select version, statements from supabase_migrations.schema_migrations where version in (${quotedVersions}) order by version;`,
  )
  return new Map(rows.map((row) => [row.version, row.statements || []]))
}

export function splitSqlStatements(value = '') {
  const statements = []
  let start = 0
  let index = 0
  let state = 'normal'
  let dollarTag = null
  let commentDepth = 0
  let escapeString = false

  while (index < value.length) {
    const character = value[index]
    const next = value[index + 1]

    if (state === 'lineComment') {
      if (character === '\n') state = 'normal'
      index += 1
      continue
    }
    if (state === 'blockComment') {
      if (character === '/' && next === '*') {
        commentDepth += 1
        index += 2
      } else if (character === '*' && next === '/') {
        commentDepth -= 1
        if (!commentDepth) state = 'normal'
        index += 2
      } else {
        index += 1
      }
      continue
    }
    if (state === 'singleQuote') {
      if (escapeString && character === '\\') index += 2
      else if (character === "'" && next === "'") index += 2
      else if (character === "'") {
        state = 'normal'
        index += 1
      } else index += 1
      continue
    }
    if (state === 'doubleQuote') {
      if (character === '"' && next === '"') index += 2
      else if (character === '"') {
        state = 'normal'
        index += 1
      } else index += 1
      continue
    }
    if (state === 'dollarQuote') {
      if (value.startsWith(dollarTag, index)) {
        index += dollarTag.length
        state = 'normal'
      } else index += 1
      continue
    }

    if (character === '-' && next === '-') {
      state = 'lineComment'
      index += 2
    } else if (character === '/' && next === '*') {
      state = 'blockComment'
      commentDepth = 1
      index += 2
    } else if (character === "'") {
      state = 'singleQuote'
      escapeString = /(?:^|[^A-Za-z0-9_$])[eE]$/.test(value.slice(0, index))
      index += 1
    } else if (character === '"') {
      state = 'doubleQuote'
      index += 1
    } else if (character === '$') {
      const dollarMatch = value.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (dollarMatch) {
        dollarTag = dollarMatch[0]
        state = 'dollarQuote'
        index += dollarTag.length
      } else index += 1
    } else if (character === ';') {
      const statement = value.slice(start, index + 1).trim()
      if (statement) statements.push(statement)
      start = index + 1
      index += 1
    } else index += 1
  }

  const remainder = value.slice(start).trim()
  if (remainder) statements.push(remainder)
  return statements
}

function removeSqlComments(value) {
  let result = ''
  let index = 0
  let state = 'normal'
  let dollarTag = null
  let commentDepth = 0
  let escapeString = false

  while (index < value.length) {
    const character = value[index]
    const next = value[index + 1]
    if (state === 'lineComment') {
      if (character === '\n') {
        result += character
        state = 'normal'
      }
      index += 1
      continue
    }
    if (state === 'blockComment') {
      if (character === '/' && next === '*') {
        commentDepth += 1
        index += 2
      } else if (character === '*' && next === '/') {
        commentDepth -= 1
        if (!commentDepth) state = 'normal'
        index += 2
      } else index += 1
      continue
    }
    if (state === 'singleQuote') {
      result += character
      if (escapeString && character === '\\' && next !== undefined) {
        result += next
        index += 2
      } else if (character === "'" && next === "'") {
        result += next
        index += 2
      } else {
        if (character === "'") state = 'normal'
        index += 1
      }
      continue
    }
    if (state === 'doubleQuote') {
      result += character
      if (character === '"' && next === '"') {
        result += next
        index += 2
      } else {
        if (character === '"') state = 'normal'
        index += 1
      }
      continue
    }
    if (state === 'dollarQuote') {
      if (value.startsWith(dollarTag, index)) {
        result += dollarTag
        index += dollarTag.length
        state = 'normal'
      } else {
        result += character
        index += 1
      }
      continue
    }

    if (character === '-' && next === '-') {
      result += ' '
      state = 'lineComment'
      index += 2
    } else if (character === '/' && next === '*') {
      result += ' '
      state = 'blockComment'
      commentDepth = 1
      index += 2
    } else if (character === "'") {
      escapeString = /(?:^|[^A-Za-z0-9_$])[eE]$/.test(value.slice(0, index))
      result += character
      state = 'singleQuote'
      index += 1
    } else if (character === '"') {
      result += character
      state = 'doubleQuote'
      index += 1
    } else if (character === '$') {
      const dollarMatch = value.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (dollarMatch) {
        dollarTag = dollarMatch[0]
        result += dollarTag
        state = 'dollarQuote'
        index += dollarTag.length
      } else {
        result += character
        index += 1
      }
    } else {
      result += character
      index += 1
    }
  }
  return result
}

export function normalizeSql(value = '') {
  const sql = removeSqlComments(String(value))
  let result = ''
  let index = 0
  let state = 'normal'
  let dollarTag = null
  let escapeString = false
  let pendingWhitespace = false

  const append = (character) => {
    const operators = '=<>+-*/:'
    if (
      pendingWhitespace &&
      result &&
      !'(),;'.includes(character) &&
      !'(),'.includes(result.at(-1)) &&
      // Keep gaps between operators: "- -" must not become "--", and
      // "> =" must not become ">=" during a read-only comparison.
      ((!operators.includes(character) && !operators.includes(result.at(-1))) ||
        (operators.includes(character) && operators.includes(result.at(-1))))
    ) result += ' '
    result += character
    pendingWhitespace = false
  }

  while (index < sql.length) {
    const character = sql[index]
    const next = sql[index + 1]
    if (state === 'singleQuote') {
      append(character)
      if (escapeString && character === '\\' && next !== undefined) {
        append(next)
        index += 2
      } else if (character === "'" && next === "'") {
        append(next)
        index += 2
      } else {
        if (character === "'") state = 'normal'
        index += 1
      }
      continue
    }
    if (state === 'doubleQuote') {
      append(character)
      if (character === '"' && next === '"') {
        append(next)
        index += 2
      } else {
        if (character === '"') state = 'normal'
        index += 1
      }
      continue
    }
    if (state === 'dollarQuote') {
      if (sql.startsWith(dollarTag, index)) {
        for (const tagCharacter of dollarTag) append(tagCharacter)
        index += dollarTag.length
        state = 'normal'
      } else {
        append(character)
        index += 1
      }
      continue
    }

    if (/\s/.test(character)) {
      pendingWhitespace = true
      index += 1
    } else if (character === "'") {
      escapeString = /(?:^|[^A-Za-z0-9_$])[eE]$/.test(sql.slice(0, index))
      append(character)
      state = 'singleQuote'
      index += 1
    } else if (character === '"') {
      append(character)
      state = 'doubleQuote'
      index += 1
    } else if (character === '$') {
      const dollarMatch = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (dollarMatch) {
        dollarTag = dollarMatch[0]
        for (const tagCharacter of dollarTag) append(tagCharacter)
        state = 'dollarQuote'
        index += dollarTag.length
      } else {
        append(character)
        index += 1
      }
    } else {
      append(character)
      index += 1
    }
  }
  return result.trim().replace(/;$/, '')
}


/** Compare the recorded SQL without returning SQL text, credentials or row data. */
export function compareMigrationStatements(localSql, remoteStatements = []) {
  const local = splitSqlStatements(localSql).map(normalizeSql).filter(Boolean).map(hash)
  const remote = remoteStatements.flatMap(splitSqlStatements).map(normalizeSql).filter(Boolean).map(hash)
  const matched = local.length === remote.length && local.every((value, index) => value === remote[index])
  return {
    localStatementCount: local.length,
    remoteStatementCount: remote.length,
    status: !remote.length && local.length ? 'recorded_sql_unavailable' : matched ? 'matching' : 'recorded_statements_differ',
    unmatchedLocalStatementIndexes: local.flatMap((value, index) => remote.includes(value) ? [] : [index + 1]),
    unmatchedRemoteStatementIndexes: remote.flatMap((value, index) => local.includes(value) ? [] : [index + 1]),
    orderedStatementsMatch: matched,
  }
}

export function buildMigrationHistoryReport(localMigrations, remoteMigrations, statementsByVersion = new Map()) {
  const localByVersion = new Map(), localByName = new Map()
  for (const migration of localMigrations) {
    const rows = localByVersion.get(migration.version) || []
    rows.push(migration)
    localByVersion.set(migration.version, rows)
    localByName.set(migration.name, [...(localByName.get(migration.name) || []), migration])
  }
  const remoteVersions = new Set(remoteMigrations.map(row => row.version))
  const report = {
    localCount: localMigrations.length, remoteCount: remoteMigrations.length,
    duplicateLocalVersions: [...localByVersion].filter(([, rows]) => rows.length > 1).map(([version, rows]) => ({ version, files: rows.map(row => row.file) })),
    localOnly: localMigrations.filter(row => !remoteVersions.has(row.version)).map(({ version, name, file }) => ({ version, name, file })),
    exactRenames: [], changedSources: [], missingSources: [], nameMismatches: [], sameVersionDifferences: [],
  }
  for (const remote of remoteMigrations) {
    const sameVersion = localByVersion.get(remote.version) || []
    const candidates = sameVersion.length ? sameVersion : localByName.get(remote.name) || []
    if (!candidates.length) {
      report.missingSources.push({ remoteVersion: remote.version, name: remote.name })
      continue
    }
    const comparisons = candidates.map(candidate => ({
      localVersion: candidate.version, localFile: candidate.file, localName: candidate.name,
      ...compareMigrationStatements(candidate.sql, statementsByVersion.get(remote.version) || []),
    }))
    if (sameVersion.length) {
      for (const candidate of candidates) if (candidate.name !== remote.name) {
        report.nameMismatches.push({ version: remote.version, remoteName: remote.name, localName: candidate.name, localFile: candidate.file })
      }
      const different = comparisons.filter(comparison => comparison.status !== 'matching')
      if (different.length) report.sameVersionDifferences.push({ remoteVersion: remote.version, name: remote.name, comparisons: different })
    } else {
      const matching = comparisons.find(comparison => comparison.status === 'matching')
      if (matching) report.exactRenames.push({ remoteVersion: remote.version, localVersion: matching.localVersion, name: remote.name })
      else report.changedSources.push({ remoteVersion: remote.version, name: remote.name, comparisons })
    }
  }
  return report
}

/** Archived statements are usable only when their hash matches the current ledger. */
export function verifiedRecordedStatements(remoteMigrations, statementRows) {
  const archived = new Map(statementRows.map(row => [row.version, row.statements || []]))
  const verified = new Map()
  for (const remote of remoteMigrations) {
    if (!archived.has(remote.version)) continue
    const statements = archived.get(remote.version)
    if ((remote.sql_hash === null && !statements.length) || hash(statements.join('\n\n')) === remote.sql_hash) verified.set(remote.version, statements)
  }
  return verified
}

function summary(report) {
  const comparisons = [...report.changedSources, ...report.sameVersionDifferences].flatMap(row => row.comparisons)
  return {
    localCount: report.localCount, remoteCount: report.remoteCount,
    duplicateLocalVersions: report.duplicateLocalVersions,
    localOnly: report.localOnly,
    exactRenames: report.exactRenames.length,
    changedSourceCandidates: report.changedSources.length,
    nameMismatches: report.nameMismatches,
    sameVersionDifferences: report.sameVersionDifferences,
    recordedSqlUnavailable: comparisons.filter(row => row.status === 'recorded_sql_unavailable').length,
    missingSources: report.missingSources,
    ...(report.evidence ? { evidence: report.evidence } : {}),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const local = getLocalMigrations()
  const argument = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
  const ledgerPath = argument('--remote-ledger'), statementsPath = argument('--remote-statements')
  if (Boolean(ledgerPath) !== Boolean(statementsPath)) throw new Error('Provide both --remote-ledger and --remote-statements evidence files.')
  const ledger = ledgerPath ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null
  const remote = ledger ? ledger.rows : getRemoteMigrationIndex()
  // The old audit skipped matching timestamps. A timestamp alone cannot prove
  // that this checkout contains the SQL that was actually deployed.
  const statements = statementsPath
    ? verifiedRecordedStatements(remote, JSON.parse(readFileSync(statementsPath, 'utf8')).rows)
    : getRemoteStatements(remote.map(row => row.version))
  const report = buildMigrationHistoryReport(local, remote, statements)
  if (ledger) report.evidence = { projectRef: ledger.projectRef, capturedAt: ledger.capturedAt, source: 'recorded_files_with_current_ledger_hash_verification' }
  console.log(JSON.stringify(process.argv.includes('--summary') ? summary(report) : report, null, 2))
  if (process.argv.includes('--strict') && (report.duplicateLocalVersions.length || report.localOnly.length || report.missingSources.length || report.nameMismatches.length || report.sameVersionDifferences.length || report.changedSources.length || report.exactRenames.length)) process.exitCode = 1
}
