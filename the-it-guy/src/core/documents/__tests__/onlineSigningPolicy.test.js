import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ONLINE_SIGNING_DISABLED,
  ONLINE_SIGNING_DISABLED_CODE,
  ONLINE_SIGNING_DISABLED_MESSAGE,
  assertOnlineSigningAvailable,
} from '../onlineSigningPolicy.js'
import {
  ELECTRONIC_SIGNING_CLASSIFICATION_ERROR,
  SIGNING_CLASSIFICATION_REGISTER,
  SIGNING_CLASSIFICATION_STATUS,
  assertElectronicSigningApproved,
  isElectronicSigningApproved,
} from '../signingClassificationPolicy.js'
import {
  SIGNING_WORKFLOW_CHANGE_TYPES,
  SIGNING_WORKFLOW_INVENTORY,
  assertSigningWorkflowChangeAllowed,
} from '../signingWorkflowInventory.js'

test('online signing is disabled for seller mandate execution', () => {
  assert.equal(ONLINE_SIGNING_DISABLED, true)
})

test('every known signing workflow is classified and fails closed unless legally approved', () => {
  assert.ok(Object.keys(SIGNING_CLASSIFICATION_REGISTER).length >= 7)
  assert.equal(
    SIGNING_CLASSIFICATION_REGISTER.seller_mandate.classification,
    SIGNING_CLASSIFICATION_STATUS.WET_INK_REQUIRED,
  )
  assert.equal(isElectronicSigningApproved('seller_mandate'), false)
  assert.equal(isElectronicSigningApproved('offer_to_purchase'), false)
  assert.throws(
    () => assertElectronicSigningApproved('unclassified_future_workflow'),
    (error) => error?.code === ELECTRONIC_SIGNING_CLASSIFICATION_ERROR && error?.classification === 'unclassified',
  )
})

test('the signing workflow inventory blocks unclassified and electronic-dispatch changes', () => {
  assert.ok(SIGNING_WORKFLOW_INVENTORY.length >= 7)
  assert.ok(SIGNING_WORKFLOW_INVENTORY.every((item) => item.sourceReferences.length > 0))
  assert.throws(
    () => assertSigningWorkflowChangeAllowed('unclassified_future_workflow', SIGNING_WORKFLOW_CHANGE_TYPES.ACKNOWLEDGEMENT_CAPTURE),
    { code: 'signing_workflow_not_inventoried' },
  )
  assert.throws(
    () => assertSigningWorkflowChangeAllowed('offer_to_purchase', SIGNING_WORKFLOW_CHANGE_TYPES.ELECTRONIC_DISPATCH),
    { code: ELECTRONIC_SIGNING_CLASSIFICATION_ERROR },
  )
})

test('every signing inventory reference resolves to a maintained source surface', async () => {
  const references = SIGNING_WORKFLOW_INVENTORY.flatMap((item) => item.sourceReferences)
  await Promise.all(
    references.map((reference) => access(new URL(`../../../../../${reference}`, import.meta.url))),
  )
})

test('online signing attempts have a stable, user-safe failure', () => {
  assert.throws(
    () => assertOnlineSigningAvailable(),
    (error) => error?.code === ONLINE_SIGNING_DISABLED_CODE && error?.message === ONLINE_SIGNING_DISABLED_MESSAGE,
  )
})

test('the retired seller signing Edge Function source has been removed', async () => {
  await assert.rejects(
    access(new URL('../../../../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url)),
    { code: 'ENOENT' },
  )
})

test('staff pages and the shared Edge Function client contain no seller mandate signing invocation', async () => {
  const [listingPage, pipelinePage, supabaseClient] = await Promise.all([
    readFile(new URL('../../../pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../lib/supabaseClient.js', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(listingPage, /invokeRetiredOnlineSigning|listing-mandate-signing/)
  assert.doesNotMatch(pipelinePage, /invokeRetiredOnlineSigning|listing-mandate-signing/)
  assert.doesNotMatch(supabaseClient, /listing-mandate-signing|isOnlineSigningDisabledEdgeFunction/)
})

test('seller lead signing UI presents physical signing only', async () => {
  const [listingPage, pipelinePage] = await Promise.all([
    readFile(new URL('../../../pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pipelinePage, /Send the digital signing pack|Send secure digital links/)
  assert.match(pipelinePage, /Prepare a physical-signature pack|Prepare physical copies/)
  assert.match(listingPage, /Wet-ink signatures required/)
  assert.doesNotMatch(listingPage, /Send signing link/)
})

test('the signing retirement migration revokes open sessions without erasing evidence', async () => {
  const migration = await readFile(
    new URL('../../../../../supabase/migrations/20260925100719_retire_online_listing_signing_sessions.sql', import.meta.url),
    'utf8',
  )

  assert.match(
    migration,
    /update public\.private_listing_mandate_signing_sessions\s+set\s+status = 'revoked'/,
  )
  assert.doesNotMatch(migration, /delete\s+from\s+public\.private_listing_mandate_signing_sessions/i)
  assert.doesNotMatch(migration, /(?:signature|signed_name|token_hash)\s*=\s*null/i)

  for (const functionName of [
    'complete_private_listing_seller_signing_pack',
    'complete_private_listing_seller_document_signing',
    'bridge_prepare_listing_seller_signing_pack_atomically',
    'bridge_replace_listing_seller_signing_pack',
    'bridge_amend_listing_seller_signing_pack',
    'bridge_rotate_listing_seller_signing_link',
    'bridge_record_private_listing_signing_acknowledgements',
    'bridge_update_listing_signing_seller_details',
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}\\(`))
    assert.match(migration, new RegExp(`revoke execute on function public\\.${functionName}\\([^;]+\\) from public;`))
  }
})

test('the database rejects future online-signing session creation or reactivation', async () => {
  const migration = await readFile(
    new URL('../../../../../supabase/migrations/20260925101521_enforce_listing_online_signing_retirement.sql', import.meta.url),
    'utf8',
  )

  assert.match(migration, /if tg_op = 'INSERT' then/)
  assert.match(migration, /if new\.status = 'active' then/)
  assert.match(migration, /before insert or update of status/)
  assert.match(migration, /on public\.private_listing_mandate_signing_sessions/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.private_listing_mandate_signing_sessions/i)
})

test('historical mandate executions enter a review queue before any attorney handoff', async () => {
  const migration = await readFile(
    new URL('../../../../../supabase/migrations/20260925110755_classify_historical_seller_mandate_executions.sql', import.meta.url),
    'utf8',
  )

  assert.match(migration, /create table public\.private_listing_mandate_execution_reviews/)
  assert.match(migration, /default 'legal_review_required'/)
  assert.match(migration, /default 'pending'/)
  assert.match(migration, /on conflict \(source_signing_session_id\) do nothing/)
  assert.match(migration, /classification = 'grandfathered_valid'/)
  assert.match(migration, /review_status = 'resolved'/)
  assert.match(migration, /reviewed_by is not null/)
  assert.match(migration, /downstream_release is true/)
  assert.match(
    migration,
    /raise exception 'A historical mandate execution review must explicitly release this record before attorney handoff\.'/,
  )
  assert.match(
    migration,
    /revoke all on function public\.bridge_handoff_signed_mandate_transfer_attorney\(uuid\) from public, anon, authenticated, service_role/,
  )
  assert.doesNotMatch(migration, /delete\s+from\s+public\.private_listing_mandate_signing_sessions/i)
})

test('historical mandate resolutions use an authorised, append-only review workflow', async () => {
  const [migration, serviceSource, panelSource] = await Promise.all([
    readFile(
      new URL('../../../../../supabase/migrations/20260925111055_historical_mandate_execution_review_workflow.sql', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../../../services/historicalMandateExecutionReviewService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../components/documents/HistoricalMandateExecutionReviewPanel.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /create table public\.private_listing_mandate_execution_review_events/)
  assert.match(migration, /actor_id uuid not null references auth\.users\(id\)/)
  assert.match(migration, /bridge_can_review_historical_mandate_execution/)
  assert.match(migration, /'principal', 'director', 'partner', 'admin', 'super_admin'/)
  assert.match(migration, /Record a review reason of at least 20 characters\./)
  assert.match(migration, /Only a grandfathered-valid record can be released for downstream use\./)
  assert.match(migration, /grant execute on function public\.bridge_resolve_historical_mandate_execution_review\(uuid, text, text, boolean\) to authenticated/)
  assert.doesNotMatch(migration, /perform public\.bridge_handoff_signed_mandate_transfer_attorney/)
  assert.match(serviceSource, /bridge_list_historical_mandate_execution_reviews/)
  assert.match(serviceSource, /bridge_resolve_historical_mandate_execution_review/)
  assert.match(serviceSource, /downstreamRelease: row\.downstreamRelease === true/)
  assert.match(panelSource, /Historical mandate execution review/)
  assert.match(panelSource, /This action does not initiate an attorney handoff/)
})

test('wet-ink offer execution requires uploaded evidence and an authorised review', async () => {
  const [migration, service, listingPage] = await Promise.all([
    readFile(new URL('../../../../../supabase/migrations/20260925111913_wet_ink_offer_execution_workflow.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../services/wetInkOfferExecutionService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /create table public\.offer_wet_ink_execution_records/)
  assert.match(migration, /'awaiting_buyer_wet_ink', 'awaiting_seller_wet_ink'/)
  assert.match(migration, /'fully_executed'/)
  assert.match(migration, /buyer_signed_document_id is not null and seller_signed_document_id is not null/)
  assert.match(migration, /Capture the commercial offer amount before preparing a wet-ink OTP pack\./)
  assert.match(migration, /buyer_signed_document_id = null, seller_signed_document_id = null/)
  assert.match(migration, /Buyer wet-ink evidence is not expected at this execution stage\./)
  assert.match(migration, /Buyer wet-ink evidence must be received before seller wet-ink evidence\./)
  assert.match(migration, /Wet-ink execution evidence must be awaiting review before an execution decision\./)
  assert.match(migration, /bridge_prepare_wet_ink_offer_execution/)
  assert.match(migration, /bridge_record_wet_ink_offer_evidence/)
  assert.match(migration, /bridge_review_wet_ink_offer_execution/)
  assert.match(migration, /Both buyer and seller wet-ink evidence must be received before approval\./)
  assert.doesNotMatch(migration, /digital_signature|signing_token|online completion/i)
  assert.match(service, /prepareWetInkOfferExecution/)
  assert.match(service, /recordWetInkOfferEvidence/)
  assert.match(service, /reviewWetInkOfferExecution/)
  assert.match(listingPage, /Wet-ink OTP execution/)
  assert.match(listingPage, /Approve wet-ink evidence/)
  assert.match(listingPage, /Reject evidence/)
  assert.doesNotMatch(listingPage, /window\.prompt\('Record the evidence reviewed/)
})

test('transaction conversion is blocked until the wet-ink OTP has been reviewed and executed', async () => {
  const [migration, lifecycleService, listingPage] = await Promise.all([
    readFile(new URL('../../../../../supabase/migrations/20260925112807_enforce_wet_ink_offer_transaction_conversion.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../lib/buyerLifecycleService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /bridge_offer_wet_ink_execution_ready/)
  assert.match(migration, /bridge_assert_wet_ink_offer_transaction_ready/)
  assert.match(migration, /bridge_enforce_wet_ink_offer_transaction_creation_trigger/)
  assert.match(migration, /bridge_enforce_wet_ink_offer_transaction_link_trigger/)
  assert.match(migration, /A reviewed, fully executed wet-ink OTP is required before creating a transaction\./)
  assert.match(migration, /Wet-ink OTP evidence is locked after its offer has created a transaction\./)
  assert.match(migration, /set status = case when status = 'converted_to_transaction' then status else 'accepted' end/)
  assert.match(lifecycleService, /bridge_assert_wet_ink_offer_transaction_ready/)
  assert.match(lifecycleService, /A reviewed, fully executed wet-ink OTP is required before creating a transaction\./)
  assert.match(listingPage, /Complete and review the wet-ink OTP before creating a transaction\./)
  assert.match(listingPage, /wetInkExecution\?\.status !== 'fully_executed'/)
})

test('migration dependencies preserve historical conversion gaps without creating wet-ink evidence', async () => {
  const [migration, service, panel] = await Promise.all([
    readFile(new URL('../../../../../supabase/migrations/20260925113424_create_wet_ink_conversion_migration_dependency_queue.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../services/wetInkConversionMigrationDependencyService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../components/documents/WetInkConversionMigrationDependencyPanel.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /create table public\.wet_ink_conversion_migration_dependencies/)
  assert.match(migration, /historical_transaction_without_wet_ink/)
  assert.match(migration, /offer_transaction_link_mismatch/)
  assert.match(migration, /accepted_offer_missing_conversion_facts/)
  assert.match(migration, /bridge_collect_wet_ink_conversion_migration_dependencies/)
  assert.match(migration, /bridge_refresh_wet_ink_conversion_migration_dependencies/)
  assert.match(migration, /bridge_resolve_wet_ink_conversion_migration_dependency/)
  assert.match(migration, /review_status = 'pending'/)
  assert.doesNotMatch(migration, /insert into public\.offer_wet_ink_execution_records/i)
  assert.match(service, /listWetInkConversionMigrationDependencies/)
  assert.match(service, /resolveWetInkConversionMigrationDependency/)
  assert.match(panel, /Wet-ink conversion migration review/)
  assert.match(panel, /does not create evidence, alter an existing transaction, or permit a new conversion/)
})

test('the generic email router cannot deliver seller-mandate signing links', async () => {
  const [routerSource, typesSource] = await Promise.all([
    readFile(new URL('../../../../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8'),
  ])

  assert.match(routerSource, /SELLER_MANDATE_ONLINE_SIGNING_EMAIL_RETIRED/)
  assert.doesNotMatch(routerSource, /handleSellerMandateSentEmail|SendSellerMandateSentPayload/)
  assert.doesNotMatch(typesSource, /SendSellerMandateSentPayload/)
  await assert.rejects(
    access(new URL('../../../../../supabase/functions/send-email/handlers/sellerMandateSent.ts', import.meta.url)),
    { code: 'ENOENT' },
  )
})

test('seller-mandate signing reminder automation is retired end to end', async () => {
  const [clientContract, emailContract, emailRouter, emailHandler, emailTypes, migration] = await Promise.all([
    readFile(new URL('../../../services/notificationAutomationContract.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/functions/send-email/services/notificationAutomationContract.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/functions/send-email/handlers/clientSellerPortalNotification.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/migrations/20260925101934_retire_seller_mandate_signing_reminders.sql', import.meta.url), 'utf8'),
  ])
  const retiredReminder = /seller_mandate_(?:viewed_unsigned_reminder|signing_overdue_escalation)/

  for (const source of [clientContract, emailContract, emailRouter, emailHandler, emailTypes]) {
    assert.doesNotMatch(source, retiredReminder)
  }
  assert.match(migration, /implementation_status = 'disabled'/)
  assert.match(migration, /status = 'skipped'/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.notification_events/i)
})
