import assert from 'node:assert/strict'
import { assessRentalProductionBaselineAuthority } from '../rentalProductionBaselineAuthority.js'

const valid = {
  productionLedger: { confirmed: true, reference: 'ledger-ref', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'a'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false, readOnly: true, artifactKind: 'migration_ledger' },
  productionCatalog: { confirmed: true, reference: 'catalog-ref', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'b'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false, readOnly: true, objectGroups: ['tables', 'functions', 'policies', 'triggers', 'indexes', 'storage'] },
}

assert.equal(assessRentalProductionBaselineAuthority(valid).ready, true)
assert.equal(assessRentalProductionBaselineAuthority({ ...valid, productionLedger: { ...valid.productionLedger, readOnly: false } }).ready, false)
assert.equal(assessRentalProductionBaselineAuthority({ ...valid, productionCatalog: { ...valid.productionCatalog, objectGroups: ['tables'] } }).ready, false)
assert.equal(assessRentalProductionBaselineAuthority({ ...valid, productionCatalog: { ...valid.productionCatalog, projectRef: 'vaszuxjeoajeuhlcnzzf' } }).ready, false)

console.log('Rental production baseline-authority Phase 2 contract passed.')
