import assert from 'node:assert/strict'
import { buildRentalLeadImportAuditContext, getRentalLeadIngestionSourceLabel, mapRentalLeadImportRow, normaliseRentalLeadIngestionSource, validateRentalLeadImportRow } from '../rentalLeadImportModel.js'

assert.equal(normaliseRentalLeadIngestionSource('Property 24'), 'property24')
assert.equal(getRentalLeadIngestionSourceLabel('private_property'), 'Private Property')
const candidate = mapRentalLeadImportRow({ __rowNumber: 2, Role: 'tenant', 'First Name': 'Sam', Phone: '0710000000', 'Desired Area': 'Gardens', Source: 'Website', 'Privacy Consent': 'granted' }, { organisationId: 'org-1' })
assert.equal(candidate.ingestionSource, 'website')
assert.equal(candidate.consents.privacy, 'granted')
assert.deepEqual(validateRentalLeadImportRow(candidate), [])
assert.equal(buildRentalLeadImportAuditContext(candidate, { batchId: 'batch-1', importedAt: '2026-09-05T10:00:00.000Z', importedBy: 'agent-1' }).batchId, 'batch-1')
console.log('rentalLeadIngestionModel.test.js passed')
