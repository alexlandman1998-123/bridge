import { RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS } from './rentalManagedMigrationAuthoring.js'

export const RENTAL_LOCAL_MIGRATION_VERIFY_CONFIRMATION = 'VERIFY_LOCAL_RENTAL_MIGRATIONS'

export function assessRentalLocalMigrationVerification({ sourceBaseline = {}, migrationEntries = [], verifyRequested = false, confirmation = '' } = {}) {
  const entries = new Map((Array.isArray(migrationEntries) ? migrationEntries : []).map((entry) => [entry.name, entry]))
  const missingMigrations = RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS
    .filter((item) => !entries.has(item.name))
    .map((item) => item.name)
  const driftedMigrations = RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS
    .filter((item) => {
      const entry = entries.get(item.name)
      return entry && entry.sourceSha256 !== entry.migrationSha256
    })
    .map((item) => item.name)
  const migrationContentLocked = missingMigrations.length === 0 && driftedMigrations.length === 0
  const verificationReady = sourceBaseline.ready === true && migrationContentLocked
  const verifyAllowed = verificationReady
    && verifyRequested === true
    && confirmation === RENTAL_LOCAL_MIGRATION_VERIFY_CONFIRMATION
  return {
    version: 'arch9_rental_local_migration_verification_phase7_v1',
    status: verifyAllowed ? 'READY_TO_VERIFY_LOCAL_DATABASE' : verificationReady ? 'READY_FOR_EXPLICIT_LOCAL_VERIFY_CONFIRMATION' : 'BLOCKED_PENDING_MANAGED_MIGRATION_CONTENT',
    missingMigrations,
    driftedMigrations,
    migrationContentLocked,
    verificationReady,
    verifyAllowed,
    applyAllowed: false,
    nextAction: verifyAllowed
      ? 'Reset the local database, apply local migrations, and run local ledger/security-advisor verification only.'
      : verificationReady
        ? 'Re-run with explicit local verification confirmation.'
        : 'Create each managed migration and copy the exact locked source content before local verification.',
  }
}
