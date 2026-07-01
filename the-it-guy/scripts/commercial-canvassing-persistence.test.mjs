import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const serviceSource = await fs.readFile(new URL('../src/modules/commercial/services/commercialCanvassingApi.js', import.meta.url), 'utf8')
const importServiceSource = await fs.readFile(new URL('../src/modules/commercial/services/commercialImportApi.js', import.meta.url), 'utf8')
const canvassingPageSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialCanvassingPage.jsx', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606210005_commercial_canvassing_foundation.sql', import.meta.url), 'utf8')
const importRecordTypeMigrationSource = await fs.readFile(new URL('../../supabase/migrations/202606300001_commercial_import_canvassing_sales_prospects.sql', import.meta.url), 'utf8')

assert.doesNotMatch(
  serviceSource,
  /return\s+createCommercialCanvassingProspect\(orgId,\s*payload\)/,
  'commercial prospect create must not recurse on schema errors',
)

assert.doesNotMatch(
  serviceSource,
  /return\s+updateCommercialCanvassingProspect\(orgId,\s*prospectId,\s*payload\)/,
  'commercial prospect update must not recurse on schema errors',
)

assert.doesNotMatch(
  serviceSource,
  /return\s+createCommercialCanvassingActivity\(orgId,\s*payload\)/,
  'commercial canvassing activity create must not recurse on schema errors',
)

for (const requiredToken of [
  'create table if not exists public.commercial_canvassing_prospects',
  'create table if not exists public.commercial_canvassing_activities',
  'prospect_role text',
  'deal_type text',
  'property_category text',
  'metadata_json jsonb',
  'commercial_canvassing_prospects_brokerage_insert',
  'commercial_canvassing_activities_brokerage_insert',
]) {
  assert.match(migrationSource, new RegExp(requiredToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `migration should include ${requiredToken}`)
}

for (const requiredToken of [
  'PROSPECT_IMPORT_COLUMNS',
  'parseCsvText',
  "from '../../../lib/csvImport'",
  'arch9-prospect-import-template.csv',
  'handleProspectImportFileChange',
  'handleCommitProspectImport',
  'handleDownloadRejectedProspectRows',
  'updateImportRowPayload',
  'validateImportPayload',
  'buildProspectRejectedRowsCsv',
  'createProspectImportAuditBatches',
  'finalizeProspectImportAuditBatches',
  'commercialImportBatchId',
  'commercialImportRowId',
  'commercial_canvassing_prospect_import_phase_3',
  'loadRecentProspectImportBatches',
  'Recent Prospect Imports',
  'Review All',
  'No audited prospect imports yet',
  'fetchOrganisationSettings',
  'normalizeProspectBulkUploadSettings',
  'prospectImportSettings.requireManagerApproval',
  'Bulk uploads are disabled in Commercial settings',
  'maxRowsPerUpload',
  'Staged for manager approval in Bulk Upload review',
  'approveCommercialImportBatch',
  'commitCommercialImportBatch',
  'handleApproveRecentProspectImport',
  'handleCommitRecentProspectImport',
  'Prospect import committed',
  'Duplicate email, phone, or company for this role',
  'Rejected Rows',
  'No broker assigned',
  'createCommercialCanvassingProspect(organisationId, {',
  'Import Prospects',
  'canvassing_seller_prospects',
  'canvassing_buyer_prospects',
  'Seller prospects',
  'Buyer prospects',
]) {
  assert.match(canvassingPageSource, new RegExp(requiredToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `canvassing page should include ${requiredToken}`)
}

for (const requiredToken of [
  'CANVASSING_PROSPECT_RECORD_TYPES',
  'canvassing_seller_prospects',
  'canvassing_buyer_prospects',
  'getProspectRoleFromRecordType',
  'commercial_bulk_upload_phase_7',
]) {
  assert.match(importServiceSource, new RegExp(requiredToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial import service should include ${requiredToken}`)
}

for (const requiredToken of [
  'commercial_import_batches_record_type_check',
  'canvassing_seller_prospects',
  'canvassing_buyer_prospects',
]) {
  assert.match(importRecordTypeMigrationSource, new RegExp(requiredToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `sales prospect import migration should include ${requiredToken}`)
}

console.log('commercial canvassing persistence checks passed')
