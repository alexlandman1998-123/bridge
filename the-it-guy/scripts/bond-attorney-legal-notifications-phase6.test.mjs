import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getNotificationAutomationDefinition,
  NOTIFICATION_AUTOMATION_STATUSES,
} from '../src/services/notificationAutomationContract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migration = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/migrations/202608030005_bond_attorney_legal_workflow_notifications.sql'),
  'utf8',
)
const sendEmailIndex = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/index.ts'),
  'utf8',
)
const handler = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/handlers/bondAttorneyLegalNotification.ts'),
  'utf8',
)
const edgeContract = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/services/notificationAutomationContract.ts'),
  'utf8',
)
const legalJobRunner = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/legal-document-job-runner/index.ts'),
  'utf8',
)

const keys = [
  'bond_application_submitted',
  'bond_application_status_changed',
  'bond_additional_documents_requested',
  'bond_document_uploaded',
  'bond_bank_offer_received',
  'bond_bank_offer_buyer_decision',
  'bond_grant_received',
  'bond_grant_published',
  'bond_delivery_failed',
  'attorney_instruction_ready',
  'attorney_instruction_accepted',
  'attorney_instruction_declined',
  'attorney_assignment_changed',
  'attorney_matter_stage_changed',
  'attorney_client_financial_document_published',
  'legal_packet_generated',
  'legal_packet_sent_for_signing',
  'legal_signer_viewed',
  'legal_signer_signed',
  'legal_packet_completed',
  'legal_signing_dispatch_failed',
]

for (const key of keys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled by default`)
  assert.ok(migration.includes(`'${key}'`), `phase 6 migration should register ${key}`)
  assert.ok(sendEmailIndex.includes(`"${key}"`), `send-email index should route ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const expectedSql of [
  'bridge_queue_bond_attorney_legal_event_phase6',
  'bridge_claim_bond_attorney_legal_notifications_phase6',
  'bridge_handle_bond_application_notifications_phase6',
  'bridge_handle_bond_quote_notifications_phase6',
  'bridge_handle_bond_originator_notifications_phase6',
  'trg_bond_bank_outcome_notifications_phase6',
  'trg_bond_submission_notifications_phase6',
  'bridge_handle_attorney_assignment_notifications_phase6',
  'bridge_handle_attorney_financial_publication_notifications_phase6',
  'bridge_handle_legal_packet_event_notifications_phase6',
  'bridge_handle_legal_job_notifications_phase6',
  'notification_events_bond_attorney_legal_dedupe_idx',
  'bond_attorney_legal_dispatch',
]) {
  assert.ok(migration.includes(expectedSql), `phase 6 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'renderBridgeEmailLayout',
  'resolveEmailBranding',
  'formatEmailSender',
  'bridge_claim_bond_attorney_legal_notifications_phase6',
  'bond_attorney_legal_dispatch',
]) {
  assert.ok(handler.includes(expectedHandler), `bond/attorney/legal handler missing ${expectedHandler}`)
}

for (const expectedRunnerHook of [
  'dispatchLegalNotificationEvents',
  'bond_attorney_legal_dispatch',
  'legal_signing_dispatch_failed',
  'LEGAL_DOCUMENT_JOB_SEND_FAILED',
  'LEGAL_DOCUMENT_JOB_SEND_UNCONFIRMED',
]) {
  assert.ok(legalJobRunner.includes(expectedRunnerHook), `legal document job runner missing ${expectedRunnerHook}`)
}

console.log('bond, attorney and legal workflow notifications phase 6 checks passed')
