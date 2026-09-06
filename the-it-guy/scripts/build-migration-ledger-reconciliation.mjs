#!/usr/bin/env node
/**
 * Builds a read-only reconciliation map from `supabase migration list --linked`
 * output. It never executes SQL, repairs migration history, or deploys changes.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const valueFor = (flag) => {
  const index = args.indexOf(flag)
  return index < 0 ? null : args[index + 1] || null
}
const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repositoryRoot = resolve(appRoot, '..')
const ledgerArgument = valueFor('--ledger')
const outputArgument = valueFor('--output')
const environment = valueFor('--environment') || 'production'

if (args.includes('--help') || !ledgerArgument || !outputArgument) {
  console.log('Usage: node scripts/build-migration-ledger-reconciliation.mjs --ledger <migration-list-output.txt> --output <map.json> [--environment production]')
  if (!args.includes('--help')) process.exitCode = 1
} else {
  const ledgerPath = resolve(process.cwd(), ledgerArgument)
  const outputPath = resolve(process.cwd(), outputArgument)
  const migrationDirectory = resolve(repositoryRoot, 'supabase/migrations')
  if (!existsSync(ledgerPath)) throw new Error(`Ledger snapshot not found: ${ledgerPath}`)

  const remoteVersions = new Set()
  for (const line of readFileSync(ledgerPath, 'utf8').split(/\r?\n/u)) {
    const cells = [...line.matchAll(/`([^`]*)`/gu)].map((match) => match[1].trim())
    if (cells.length !== 3) continue
    const remoteVersion = cells[1]
    if (/^\d{12,14}$/u.test(remoteVersion)) remoteVersions.add(remoteVersion)
  }

  const localMigrations = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const match = file.match(/^(\d{12,14})_(.+)\.sql$/u)
      if (!match) throw new Error(`Invalid migration filename: ${file}`)
      const [version, slug] = match.slice(1)
      const path = resolve(migrationDirectory, file)
      const sql = readFileSync(path)
      return {
        version,
        file: relative(repositoryRoot, path),
        slug,
        sha256: createHash('sha256').update(sql).digest('hex'),
        intent: inferIntent(slug, sql),
      }
    })
    .sort((left, right) => left.version.localeCompare(right.version))

  const localVersions = new Set(localMigrations.map(({ version }) => version))
  const entries = [
    ...localMigrations
      .filter(({ version }) => !remoteVersions.has(version))
      .map((migration) => ({
        direction: 'local_only',
        reviewStatus: 'needs_sql_review',
        intendedEnvironment: 'staging_then_production',
        proposedAction: 'Verify whether this SQL has already been applied under a different version; otherwise stage it as a new migration.',
        ...migration,
      })),
    ...[...remoteVersions]
      .filter((version) => !localVersions.has(version))
      .sort()
      .map((version) => ({
        version,
        direction: 'remote_only',
        reviewStatus: 'requires_source_recovery',
        intendedEnvironment: environment,
        proposedAction: 'Recover the original SQL and commit it locally before considering any migration-history repair.',
        file: null,
        slug: null,
        sha256: null,
        intent: { domain: 'unknown', evidence: 'The remote migration ledger stores a version, not the original migration filename or SQL.' },
      })),
  ]

  const map = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: 'read_only',
    environment,
    source: {
      localMigrationDirectory: relative(repositoryRoot, migrationDirectory),
      linkedLedgerSnapshot: ledgerPath,
      note: 'The snapshot is parsed for remote versions only. No database mutation was performed.',
    },
    summary: {
      localMigrationCount: localMigrations.length,
      remoteMigrationCount: remoteVersions.size,
      matchedVersionCount: [...localVersions].filter((version) => remoteVersions.has(version)).length,
      localOnlyCount: entries.filter(({ direction }) => direction === 'local_only').length,
      remoteOnlyCount: entries.filter(({ direction }) => direction === 'remote_only').length,
    },
    entries,
  }

  writeFileSync(outputPath, `${JSON.stringify(map, null, 2)}\n`)
  console.log(JSON.stringify({ output: relative(process.cwd(), outputPath), ...map.summary }, null, 2))
}

function inferIntent(slug, sql) {
  const text = `${slug} ${sql}`.toLowerCase()
  const domains = [
    ['property24', /property24|external_inventory|listing_media/u],
    ['whatsapp_notifications', /whatsapp|notification_templates|meta_/u],
    ['attorneys', /attorney|matter/u],
    ['rentals', /rental|tenancy|landlord|inspection|maintenance/u],
    ['transactions', /transaction|buyer_portal|seller_handoff/u],
    ['documents', /document|template|signing/u],
    ['access_control', /rls|policy|organisation_id|organization_id/u],
  ]
  const match = domains.find(([, pattern]) => pattern.test(text))
  return match
    ? { domain: match[0], evidence: `Inferred from migration filename and SQL content (${match[1]}).` }
    : { domain: 'unclassified', evidence: 'No domain keyword match; requires reviewer classification.' }
}
