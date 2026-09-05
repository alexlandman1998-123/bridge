import { RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS } from './rentalManagedMigrationAuthoring.js'

export const RENTAL_MANAGED_MIGRATION_SCAFFOLD_CONFIRMATION = 'CREATE_MANAGED_RENTAL_MIGRATION_SCAFFOLDS'

export function assessRentalManagedMigrationScaffolding({ sourceBaseline = {}, existingMigrationNames = [], createRequested = false, confirmation = '' } = {}) {
  const existing = new Set(Array.isArray(existingMigrationNames) ? existingMigrationNames : [])
  const collisions = RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS
    .filter((item) => existing.has(item.name))
    .map((item) => item.name)
  const scaffoldReady = sourceBaseline.ready === true && collisions.length === 0
  const createAllowed = scaffoldReady
    && createRequested === true
    && confirmation === RENTAL_MANAGED_MIGRATION_SCAFFOLD_CONFIRMATION
  return {
    version: 'arch9_rental_managed_migration_scaffolding_phase6_v1',
    status: createAllowed ? 'READY_TO_CREATE_LOCAL_SCAFFOLDS' : scaffoldReady ? 'READY_FOR_EXPLICIT_SCAFFOLD_CONFIRMATION' : 'BLOCKED_PENDING_SOURCE_BASELINE',
    items: RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS,
    collisions,
    scaffoldReady,
    createAllowed,
    applyAllowed: false,
    nextAction: createAllowed
      ? 'Create empty managed migration files locally, then copy only the reviewed locked source in a subsequent review step.'
      : scaffoldReady
        ? 'Re-run with the explicit scaffold confirmation to create empty local migration files.'
        : 'Clear the Phase 5 source-baseline lock and resolve migration-name collisions before scaffolding.',
  }
}
