import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030005_lead_ingestion_review_fields.sql', import.meta.url), 'utf8')
for (const field of [
  'review_status text',
  'reviewed_by uuid references auth.users(id)',
  'reviewed_at timestamptz',
  'resolved_at timestamptz',
  'duplicate_of_log_id uuid references public.lead_ingestion_logs(log_id)',
  'retry_count integer not null default 0',
  'last_retry_at timestamptz',
  'listing_id uuid references public.private_listings(id)',
  'assigned_agent_id uuid references auth.users(id)',
  'processed_at timestamptz',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)')), `migration should include ${field}`)
}
for (const status of ['needs_review', 'reviewed', 'resolved', 'duplicate']) {
  assert.match(migrationSql, new RegExp(`'${status}'`), `migration should allow ${status}`)
}
for (const indexName of [
  'idx_lead_ingestion_logs_review_status',
  'idx_lead_ingestion_logs_duplicate_of',
  'idx_lead_ingestion_logs_listing_id',
  'idx_lead_ingestion_logs_assigned_agent_id',
  'idx_lead_ingestion_logs_processed_at',
]) {
  assert.match(migrationSql, new RegExp(indexName), `migration should include ${indexName}`)
}

const serviceSource = await fs.readFile(new URL('../src/services/leadIngestionReviewService.js', import.meta.url), 'utf8')
for (const method of [
  'listLeadIngestionLogs',
  'getLeadIngestionLog',
  'markLogReviewed',
  'markLogDuplicate',
  'markLogResolved',
  'linkLogToLead',
  'linkLogToContact',
  'linkLogToListing',
  'retryLeadIngestionLog',
]) {
  assert.match(serviceSource, new RegExp(`export .*${method}`), `service should export ${method}`)
}
assert.match(serviceSource, /createOrUpdateLeadFromEnquiry/)
assert.match(serviceSource, /upsertLeadListingInterest/)
assert.match(serviceSource, /isOriginalEnquiry: true/)
assert.match(serviceSource, /Original enquiry listing linked/)

const ingestionServiceSource = await fs.readFile(new URL('../src/services/leadIngestionService.js', import.meta.url), 'utf8')
assert.match(ingestionServiceSource, /listing_id/)
assert.match(ingestionServiceSource, /review_status/)
assert.match(ingestionServiceSource, /duplicate_of_log_id/)
assert.match(ingestionServiceSource, /processed_at/)

const pageSource = await fs.readFile(new URL('../src/pages/AgentEnquiriesPage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /Enquiries/)
assert.match(pageSource, /Enquiry Review/)
assert.match(pageSource, /Retry safely/)
assert.match(pageSource, /Listing could not be matched/)
assert.match(pageSource, /linkLogToListing/)

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(appSource, /AgentEnquiriesPage/)
assert.match(appSource, /path="\/pipeline\/enquiries"/)

const rolesSource = await fs.readFile(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
assert.match(rolesSource, /key: 'enquiries'/)
assert.match(rolesSource, /\/pipeline\/enquiries/)

const sidebarSource = await fs.readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
assert.match(sidebarSource, /enquiries: ClipboardList/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadIngestionReviewServiceTestUtils } = await server.ssrLoadModule('/src/services/leadIngestionReviewService.js')
  const {
    buildRetryLeadIngestionPayload,
    filterLeadIngestionLogsClientSide,
    getEnquiryPayloadSummary,
    normalizeLeadIngestionLog,
  } = __leadIngestionReviewServiceTestUtils

  const rawLog = {
    log_id: '11111111-1111-4111-8111-111111111111',
    organisation_id: '22222222-2222-4222-8222-222222222222',
    source: 'property24',
    external_reference: 'p24-001',
    payload: {
      name: 'Sarah Jones',
      phone: '+27 82 000 0000',
      email: 'sarah@example.test',
      listingReference: 'B9-123',
      message: 'Please call me.',
    },
    status: 'failed',
    lead_id: null,
    contact_id: null,
    listing_id: null,
    error: 'Unknown listing: original enquiry listing could not be resolved.',
    retry_count: 1,
    created_at: '2026-06-03T08:00:00.000Z',
  }

  const summary = getEnquiryPayloadSummary(rawLog.payload)
  assert.equal(summary.name, 'Sarah Jones')
  assert.equal(summary.email, 'sarah@example.test')
  assert.equal(summary.listingReference, 'B9-123')

  const normalized = normalizeLeadIngestionLog(rawLog)
  assert.equal(normalized.source, 'Property24')
  assert.equal(normalized.status, 'failed')
  assert.equal(normalized.reviewStatus, 'needs_review')
  assert.equal(normalized.hasUnresolvedListing, true)
  assert.equal(normalized.payloadSummary.phone, '+27 82 000 0000')

  const duplicate = normalizeLeadIngestionLog({
    ...rawLog,
    log_id: '33333333-3333-4333-8333-333333333333',
    status: 'duplicate',
    error: 'Duplicate payload external reference.',
  })
  const processed = normalizeLeadIngestionLog({
    ...rawLog,
    log_id: '44444444-4444-4444-8444-444444444444',
    source: 'Website',
    status: 'processed',
    listing_id: '55555555-5555-4555-8555-555555555555',
    error: null,
    payload: { name: 'Mike Buyer', email: 'mike@example.test', listingReference: 'WEB-9' },
  })

  assert.deepEqual(
    filterLeadIngestionLogsClientSide([normalized, duplicate, processed], { status: 'all', search: 'sarah' }).map((row) => row.logId),
    [normalized.logId, duplicate.logId],
  )
  assert.deepEqual(
    filterLeadIngestionLogsClientSide([normalized, duplicate, processed], { issue: 'duplicate' }).map((row) => row.logId),
    [duplicate.logId],
  )
  assert.deepEqual(
    filterLeadIngestionLogsClientSide([normalized, duplicate, processed], { issue: 'unresolved_listing' }).map((row) => row.logId),
    [normalized.logId],
  )
  assert.deepEqual(
    filterLeadIngestionLogsClientSide([normalized, duplicate, processed], { hasLead: false }).map((row) => row.logId),
    [normalized.logId, duplicate.logId, processed.logId],
  )

  const retryPayload = buildRetryLeadIngestionPayload(normalized, {
    email: 'new@example.test',
    listingId: '66666666-6666-4666-8666-666666666666',
    source: 'PrivateProperty',
  })
  assert.equal(retryPayload.source, 'Private Property')
  assert.equal(retryPayload.organisationId, normalized.organisationId)
  assert.equal(retryPayload.externalReference, 'p24-001')
  assert.equal(retryPayload.email, 'new@example.test')
  assert.equal(retryPayload.listingId, '66666666-6666-4666-8666-666666666666')
} finally {
  await server.close()
}

console.log('lead ingestion review tests passed')
