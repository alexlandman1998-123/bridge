import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const repositoryRoot = new URL('../../../../', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), 'utf8')
}

test('signed seller PDFs are rendered, stored and attached by the signing service', async () => {
  const edgeFunction = await read('supabase/functions/listing-mandate-signing/index.ts')
  const renderer = await read('supabase/functions/listing-mandate-signing/sellerSignedPdf.ts')
  const migration = await read('supabase/migrations/20260920195249_attach_server_rendered_seller_signing_pdfs.sql')

  assert.match(edgeFunction, /renderSellerSignedPdf/)
  assert.match(edgeFunction, /storage\.from\(signedPdfBucket\)[\s\S]{0,80}\.upload/)
  assert.match(edgeFunction, /upsert: false/)
  assert.match(edgeFunction, /bridge_attach_listing_seller_signed_pdf_artifacts/)
  assert.match(edgeFunction, /seller-signing\/\$\{text\(session\.private_listing_id\)\}[\s\S]*signed-\$\{documentKey\}\.pdf/)
  assert.match(renderer, /PDFDocument\.create\(\)/)
  assert.match(renderer, /SIGNED SELLER DOCUMENT/)
  assert.match(renderer, /Electronic signature/)
  assert.match(migration, /The browser is never an authority for final output/i)
  assert.match(migration, /The signed % PDF artifact is immutable/i)
  assert.match(migration, /to service_role/)
})

test('seller workspace never converts a final signed HTML row into a browser PDF', async () => {
  const workspace = await read('the-it-guy/src/pages/agency/AgencyPipelinePage.jsx')

  assert.doesNotMatch(workspace, /downloadGeneratedSellerLeadDocumentPdf/)
  assert.doesNotMatch(workspace, /data-seller-lead-generated-document-pdf-stage/)
  assert.match(workspace, /isSellerFinalDocumentAwaitingServerPdf/)
  assert.match(workspace, /Finalising PDF/)
  assert.match(workspace, /Open preview/)
})

test('signing branding is frozen once and reused by the recipient and PDF renderer', async () => {
  const edgeFunction = await read('supabase/functions/listing-mandate-signing/index.ts')
  const lineageMigration = await read('supabase/migrations/20260920200300_freeze_listing_seller_signing_branding_lineage.sql')
  const documentProjection = await read('the-it-guy/src/services/sellerDocumentRequirementsService.js')

  assert.match(edgeFunction, /arch9-seller-signing-branding-snapshot-v1/)
  assert.match(edgeFunction, /createSigningBrandingSnapshot/)
  assert.match(edgeFunction, /persistImmutableBrandLogo/)
  assert.match(edgeFunction, /loadFrozenSigningBrandLogo/)
  assert.match(edgeFunction, /configured agency logo could not be frozen/i)
  assert.match(edgeFunction, /stored agency branding digest does not match its snapshot/i)
  assert.match(edgeFunction, /brandingSnapshot,[\s\S]{0,120}brandingDigest: brandingSnapshot\.digest/)
  assert.doesNotMatch(edgeFunction, /currentAgencyOnboardingBranding/)
  assert.doesNotMatch(edgeFunction, /signingPackWithCurrentBranding/)
  assert.match(lineageMigration, /branding_snapshot jsonb not null/)
  assert.match(lineageMigration, /Seller signing branding lineage is immutable/)
  assert.match(lineageMigration, /before update of branding_snapshot, branding_digest, branding_frozen_at, signing_pack_snapshot/i)
  assert.match(lineageMigration, /signing pack branding does not match its authoritative lineage/i)
  assert.match(lineageMigration, /mandate branding does not match its authoritative lineage/i)
  assert.match(documentProjection, /Facts and corporate identity are one frozen document input/)
  assert.doesNotMatch(documentProjection, /const refreshedDisclosure = buildSellerPropertyDisclosureDocumentFromFormData/)
})

test('existing signed records use a digest-bound, non-destructive repair workflow', async () => {
  const edgeFunction = await read('supabase/functions/listing-mandate-signing/index.ts')
  const repairMigration = await read('supabase/migrations/20260920201226_repair_existing_seller_signing_records_safely.sql')
  const repairAudit = await read('the-it-guy/scripts/sql/seller-document-existing-record-repair-audit.sql')

  assert.match(edgeFunction, /action === "repair-existing"/)
  assert.match(edgeFunction, /body\.apply !== true/)
  assert.match(edgeFunction, /expectedPlanDigest/)
  assert.match(edgeFunction, /Only an organisation administrator can repair signed records/)
  assert.match(edgeFunction, /existing signed PDF does not match the frozen signing record/i)
  assert.match(repairMigration, /private_listing_seller_document_repair_runs/)
  assert.match(repairMigration, /bridge_plan_listing_seller_document_repair/)
  assert.match(repairMigration, /bridge_start_listing_seller_document_repair/)
  assert.match(repairMigration, /bridge_prepare_listing_seller_document_repair_rows/)
  assert.match(repairMigration, /bridge_finish_listing_seller_document_repair/)
  assert.match(repairMigration, /automaticRepairAllowed/)
  assert.match(repairMigration, /ambiguous_duplicate_rows/)
  assert.match(repairMigration, /frozen_branding_lineage_missing_or_invalid/)
  assert.match(repairMigration, /revoke all on table public\.private_listing_seller_document_repair_runs[\s\S]{0,100}public, anon, authenticated/i)
  assert.doesNotMatch(repairMigration, /delete\s+from\s+public\.private_listing_documents/i)
  assert.match(repairAudit, /Read-only seller document repair audit/)
  assert.doesNotMatch(repairAudit, /\b(update|insert|delete|truncate)\b\s+(into|from|public\.)/i)
})

test('legacy signed records recover branding only from their frozen signing pack', async () => {
  const edgeFunction = await read('supabase/functions/listing-mandate-signing/index.ts')
  const recoveryMigration = await read('supabase/migrations/20260921053748_recover_legacy_seller_signing_branding_lineage.sql')

  assert.match(edgeFunction, /createLegacySigningBrandingSnapshot/)
  assert.match(edgeFunction, /legacy_signing_pack_branding_recovery/)
  assert.match(edgeFunction, /signingPackDigest: input\.signingPackDigest/)
  assert.match(edgeFunction, /signedLegacyPackCanBeRecovered/)
  assert.match(recoveryMigration, /adopt_legacy_pack_branding/)
  assert.match(recoveryMigration, /brandingRecoverySource/)
  assert.match(recoveryMigration, /source', 'frozen_signing_pack'/)
  assert.doesNotMatch(recoveryMigration, /organisation_branding/)
  assert.match(recoveryMigration, /to service_role/)
})
