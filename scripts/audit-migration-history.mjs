#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  const output = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
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

function splitSqlStatements(value = '') {
  const statements = []
  let start = 0
  let index = 0
  let state = 'normal'
  let dollarTag = null

  while (index < value.length) {
    const character = value[index]
    const next = value[index + 1]

    if (state === 'lineComment') {
      if (character === '\n') state = 'normal'
      index += 1
      continue
    }
    if (state === 'blockComment') {
      if (character === '*' && next === '/') {
        state = 'normal'
        index += 2
      } else {
        index += 1
      }
      continue
    }
    if (state === 'singleQuote') {
      if (character === "'" && next === "'") index += 2
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
      index += 2
    } else if (character === "'") {
      state = 'singleQuote'
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
      if (character === '*' && next === '/') {
        state = 'normal'
        index += 2
      } else index += 1
      continue
    }
    if (state === 'singleQuote') {
      result += character
      if (character === "'" && next === "'") {
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
      state = 'lineComment'
      index += 2
    } else if (character === '/' && next === '*') {
      state = 'blockComment'
      index += 2
    } else if (character === "'") {
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

function normalizeSql(value = '') {
  const sql = removeSqlComments(String(value))
  let result = ''
  let index = 0
  let state = 'normal'
  let dollarTag = null
  let pendingWhitespace = false

  const append = (character) => {
    const operators = '=<>+-*/:'
    if (
      pendingWhitespace &&
      result &&
      !'(),;'.includes(character) &&
      !'(),'.includes(result.at(-1)) &&
      !operators.includes(character) &&
      !operators.includes(result.at(-1))
    ) result += ' '
    result += character
    pendingWhitespace = false
  }

  while (index < sql.length) {
    const character = sql[index]
    const next = sql[index + 1]
    if (state === 'singleQuote') {
      append(character)
      if (character === "'" && next === "'") {
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

const localMigrations = getLocalMigrations()
const localVersions = new Set(localMigrations.map((migration) => migration.version))
const localByName = new Map()
for (const migration of localMigrations) {
  const candidates = localByName.get(migration.name) || []
  candidates.push(migration)
  localByName.set(migration.name, candidates)
}

const report = { exactRenames: [], changedSources: [], missingSources: [] }
for (const remote of getRemoteMigrationIndex()) {
  if (localVersions.has(remote.version)) continue
  const candidates = localByName.get(remote.name) || []
  const exact = candidates.find((candidate) => candidate.sqlHash === remote.sql_hash)
  if (exact) {
    report.exactRenames.push({ remoteVersion: remote.version, localVersion: exact.version, name: remote.name })
  } else if (candidates.length) {
    report.changedSources.push({ remoteVersion: remote.version, name: remote.name, candidates })
  } else {
    report.missingSources.push({ remoteVersion: remote.version, name: remote.name })
  }
}

const statementsByRemoteVersion = getRemoteStatements(report.changedSources.map(({ remoteVersion }) => remoteVersion))
report.changedSources = report.changedSources.map(({ remoteVersion, name, candidates }) => {
  const remoteStatements = statementsByRemoteVersion.get(remoteVersion) || []
  const comparisons = candidates.map((candidate) => {
    const localSqlStatements = splitSqlStatements(candidate.sql)
    const localStatementHashes = new Set(localSqlStatements.map((statement) => hash(normalizeSql(statement))))
    const remoteSqlStatements = remoteStatements.flatMap((statement) => splitSqlStatements(statement))
    const unmatchedStatements = remoteSqlStatements
      .map((statement, index) => {
        const normalizedStatement = normalizeSql(statement)
        return {
          index: index + 1,
          hash: hash(normalizedStatement),
          matches: localStatementHashes.has(hash(normalizedStatement)),
        }
      })
      .filter((statement) => !statement.matches)
    return {
      localVersion: candidate.version,
      localFile: candidate.file,
      remoteStatementCount: remoteSqlStatements.length,
      matchedStatementCount: remoteSqlStatements.length - unmatchedStatements.length,
      unmatchedStatements,
      formattingOnly: unmatchedStatements.length === 0,
      unmatchedRemoteSql: remoteSqlStatements
        .map((statement, index) => ({ index: index + 1, statement }))
        .filter(({ statement }) => !localStatementHashes.has(hash(normalizeSql(statement)))),
      unmatchedLocalSql: localSqlStatements
        .map((statement, index) => ({ index: index + 1, statement }))
        .filter(({ statement }) => !remoteSqlStatements.some((remoteStatement) => hash(normalizeSql(remoteStatement)) === hash(normalizeSql(statement)))),
    }
  })
  return { remoteVersion, name, comparisons }
})

if (process.argv.includes('--details')) {
  console.log(JSON.stringify({ changedSources: report.changedSources }, null, 2))
} else if (process.argv.includes('--summary')) {
  const comparisons = report.changedSources.flatMap(({ remoteVersion, name, comparisons }) =>
    comparisons.map((comparison) => ({ remoteVersion, name, ...comparison })),
  )
  console.log(
    JSON.stringify(
      {
        exactRenames: report.exactRenames.length,
        changedSourceCandidates: report.changedSources.length,
        statementComparisons: comparisons.length,
        formattingOnly: comparisons.filter(({ formattingOnly }) => formattingOnly).length,
        changedStatements: comparisons.filter(({ formattingOnly }) => !formattingOnly).map(({ remoteVersion, name, localVersion, remoteStatementCount, matchedStatementCount, unmatchedStatements }) => ({
          remoteVersion,
          name,
          localVersion,
          remoteStatementCount,
          matchedStatementCount,
          unmatchedStatementIndexes: unmatchedStatements.map(({ index }) => index),
        })),
        missingSources: report.missingSources,
      },
      null,
      2,
    ),
  )
} else {
  console.log(JSON.stringify(report, null, 2))
}
