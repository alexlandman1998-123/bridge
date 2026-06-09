import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const auditSource = await read('../../docs/commercial-phase-4-document-audit.md')
for (const marker of [
  'commercial_documents',
  'commercial_document_requests',
  'commercial_activity',
  'commercial_landlord',
  'commercial_tenant',
  'commercial_property',
  'commercial_vacancy',
  'commercial_requirement',
  'commercial_deal',
  'commercial_heads_of_terms',
  'commercial_lease',
  'Supabase storage',
]) {
  assert.match(auditSource, new RegExp(marker), `Phase 4 audit should document ${marker}`)
}

const migrationSource = await read('../../supabase/migrations/202606080002_commercial_document_compliance_workflow.sql')
for (const marker of [
  'version_number',
  'supersedes_document_id',
  'expires_at',
  'reviewed_by',
  'reviewed_at',
  'priority',
  'requested_by',
  'completed_document_id',
  'commercial_documents_workflow_idx',
  'commercial_document_requests_workflow_idx',
]) {
  assert.match(migrationSource, new RegExp(marker), `Phase 4 migration should include ${marker}`)
}

const constantsSource = await read('../src/modules/commercial/commercialDocumentConstants.js')
for (const marker of [
  'COMMERCIAL_DOCUMENT_CATEGORIES',
  'COMMERCIAL_DOCUMENT_REQUIREMENT_TEMPLATES',
  'COMMERCIAL_DOCUMENT_REQUEST_PRIORITIES',
  'COMMERCIAL_HOT_DOCUMENT_FLOW',
  'COMMERCIAL_LEASE_DOCUMENT_FLOW',
  'buildCommercialDocumentCompliance',
  'getCommercialDocumentVersionLabel',
  'signed_hot',
  'signed_lease',
  'zoning_certificate',
  'financial_statements',
]) {
  assert.match(constantsSource, new RegExp(marker), `commercial document constants should include ${marker}`)
}

const apiSource = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'COMMERCIAL_DOCUMENT_WORKFLOW_COLUMNS',
  'removeCommercialDocumentWorkflowPayload',
  'version_number',
  'expires_at',
  'priority',
  'requested_by',
  'getCommercialDocumentCentreData',
  'reviewed_by',
  'reviewed_at',
  'document_uploaded',
  'document_requested',
]) {
  assert.match(apiSource, new RegExp(marker), `commercial API should include ${marker}`)
}

const librarySource = await read('../src/modules/commercial/components/CommercialDocumentLibrary.jsx')
for (const marker of [
  'buildCommercialDocumentCompliance',
  'Required Documents',
  'Completion',
  'Outstanding',
  'Rejected / Review',
  'HOT Document Progression',
  'Lease Document Progression',
  'getCommercialDocumentVersionLabel',
]) {
  assert.match(librarySource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `record document library should include ${marker}`)
}

const centreSource = await read('../src/modules/commercial/pages/CommercialDocumentsPage.jsx')
for (const marker of [
  'Document Centre',
  'All Documents',
  'Outstanding',
  'Recently Uploaded',
  'Rejected',
  'Expiring',
  'Record Type',
  'Broker',
  'Branch',
  'Team',
  'getCommercialDocumentCentreData',
]) {
  assert.match(centreSource, new RegExp(marker), `document centre should include ${marker}`)
}

const dashboardApiSource = await read('../src/modules/commercial/services/commercialDashboardApi.js')
for (const marker of [
  'buildDocumentCompliance',
  'documentCompliance',
  'riskRows',
  'expiring',
  'underReview',
]) {
  assert.match(dashboardApiSource, new RegExp(marker), `dashboard API should include ${marker}`)
}

const dashboardSource = await read('../src/modules/commercial/pages/CommercialDashboard.jsx')
for (const marker of [
  'DocumentComplianceCard',
  'Document Compliance',
  'Document centre',
  'Under Review',
  'Expiring',
]) {
  assert.match(dashboardSource, new RegExp(marker), `commercial dashboard should include ${marker}`)
}

console.log('commercial Phase 4 document workflow tests passed')
