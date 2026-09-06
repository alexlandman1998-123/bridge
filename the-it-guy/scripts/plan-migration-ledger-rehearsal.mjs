#!/usr/bin/env node
/**
 * Creates a non-executable staging rehearsal plan. It never runs migration
 * repair, applies SQL, changes a linked project, or contacts Supabase.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const valueFor = (flag) => {
  const index = args.indexOf(flag)
  return index < 0 ? null : args[index + 1] || null
}
const classifiedArgument = valueFor('--classified-map')
const outputArgument = valueFor('--output')
const stagingArgument = valueFor('--staging-ledger')
const productionArgument = valueFor('--production-ledger')

if (args.includes('--help') || !classifiedArgument || !outputArgument) {
  console.log('Usage: node scripts/plan-migration-ledger-rehearsal.mjs --classified-map <map.json> --output <plan.json> [--staging-ledger <migration-list-output.txt>] [--production-ledger <migration-list-output.txt>]')
  if (!args.includes('--help')) process.exitCode = 1
} else {
  const classifiedMap = JSON.parse(readFileSync(resolve(process.cwd(), classifiedArgument), 'utf8'))
  const stagingVersions = stagingArgument ? readLedgerVersions(resolve(process.cwd(), stagingArgument)) : null
  const productionVersions = productionArgument ? readLedgerVersions(resolve(process.cwd(), productionArgument)) : null
  const blockedRequirements = []
  const unrecoveredProduction = classifiedMap.entries
    .filter(({ classification }) => classification === 'missing_locally_must_be_restored')
    .map(({ version, recoverySource }) => ({ version, recoverySource }))

  if (!stagingVersions) {
    blockedRequirements.push({
      id: 'staging-ledger-snapshot',
      reason: 'A fresh staging `supabase migration list --project-ref <staging-ref>` snapshot is required before a staging rehearsal can be scoped.',
    })
  }
  if (unrecoveredProduction.length > 0) {
    blockedRequirements.push({
      id: 'production-source-recovery',
      reason: `${unrecoveredProduction.length} production-only migration versions have no exact current local SQL counterpart. Recover and review their SQL before planning history repair.`,
      versions: unrecoveredProduction,
    })
  }

  const localPending = classifiedMap.entries
    .filter(({ classification }) => classification === 'local_work_not_yet_deployed')
    .map(({ version, file, sha256 }) => ({ version, file, sha256 }))
  const plan = {
    version: 1,
    mode: 'dry_run_only',
    generatedAt: new Date().toISOString(),
    status: blockedRequirements.length ? 'blocked' : 'ready_for_staging_rehearsal_review',
    guarantees: [
      'No migration history was repaired.',
      'No SQL was applied.',
      'No project link or remote environment was changed.',
      'This file contains no executable repair command.',
    ],
    inputs: {
      classifiedMap: resolve(process.cwd(), classifiedArgument),
      stagingLedgerSnapshot: stagingArgument ? resolve(process.cwd(), stagingArgument) : null,
      productionLedgerSnapshot: productionArgument ? resolve(process.cwd(), productionArgument) : null,
    },
    scope: {
      localWorkNotYetDeployed: localPending,
      productionOnlyMigrationsNeedingRecovery: unrecoveredProduction,
      staging: stagingVersions ? compareStaging(stagingVersions, classifiedMap) : null,
      productionToStaging: stagingVersions && productionVersions ? compareLedgers(productionVersions, stagingVersions) : null,
    },
    blockedRequirements,
    requiredRehearsalEvidence: [
      'A staging migration-list snapshot captured immediately before rehearsal.',
      'Recovered SQL and SHA-256 review for every production-only migration.',
      'A database schema comparison proving each proposed ledger adjustment corresponds to already-present schema.',
      'An explicit, version-by-version approval record before any `supabase migration repair` command is considered.',
      'A fresh post-rehearsal staging migration-list snapshot and application smoke-test evidence.',
    ],
    nextAction: blockedRequirements.length
      ? 'Resolve every blocked requirement. Do not run migration repair or db push.'
      : 'Review the staging delta and create a separate, approved, version-by-version rehearsal manifest.',
  }
  writeFileSync(resolve(process.cwd(), outputArgument), `${JSON.stringify(plan, null, 2)}\n`)
  console.log(JSON.stringify({ status: plan.status, blockedRequirementCount: blockedRequirements.length, localPendingCount: localPending.length }, null, 2))
}

function readLedgerVersions(path) {
  const versions = new Set()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const cells = [...line.matchAll(/`([^`]*)`/gu)].map((match) => match[1].trim())
    if (cells.length === 3 && /^\d{12,14}$/u.test(cells[1])) versions.add(cells[1])
  }
  return versions
}

function compareStaging(stagingVersions, classifiedMap) {
  const localVersions = new Set(classifiedMap.entries.filter(({ direction }) => direction === 'local_only').map(({ version }) => version))
  return {
    observedMigrationCount: stagingVersions.size,
    localPendingAlreadyInStaging: [...localVersions].filter((version) => stagingVersions.has(version)).sort(),
    localPendingAbsentFromStaging: [...localVersions].filter((version) => !stagingVersions.has(version)).sort(),
  }
}

function compareLedgers(productionVersions, stagingVersions) {
  const canonicalVersion = (version) => version.length === 12 ? `${version}00` : version
  const productionByCanonicalVersion = new Map([...productionVersions].map((version) => [canonicalVersion(version), version]))
  const stagingByCanonicalVersion = new Map([...stagingVersions].map((version) => [canonicalVersion(version), version]))
  const sharedCanonicalVersions = [...productionByCanonicalVersion]
    .filter(([version]) => stagingByCanonicalVersion.has(version))
  const timestampAliases = sharedCanonicalVersions
    .filter(([version, productionVersion]) => stagingByCanonicalVersion.get(version) !== productionVersion)
    .map(([version, productionVersion]) => ({
      canonicalVersion: version,
      productionVersion,
      stagingVersion: stagingByCanonicalVersion.get(version),
    }))
  return {
    productionMigrationCount: productionVersions.size,
    stagingMigrationCount: stagingVersions.size,
    exactSharedMigrationCount: [...productionVersions].filter((version) => stagingVersions.has(version)).length,
    canonicalSharedMigrationCount: sharedCanonicalVersions.length,
    timestampAliases,
    productionOnlyVersions: [...productionByCanonicalVersion].filter(([version]) => !stagingByCanonicalVersion.has(version)).map(([, rawVersion]) => rawVersion).sort(),
    stagingOnlyVersions: [...stagingByCanonicalVersion].filter(([version]) => !productionByCanonicalVersion.has(version)).map(([, rawVersion]) => rawVersion).sort(),
  }
}
