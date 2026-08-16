import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  statusLinksMigration: await readFile(
    new URL('../../supabase/migrations/202608130012_transaction_link_creation_rls_repair.sql', import.meta.url),
    'utf8',
  ),
  subprocessMigration: await readFile(
    new URL('../../supabase/migrations/202608130007_transaction_subprocess_creation_rls_repair.sql', import.meta.url),
    'utf8',
  ),
  requiredDocumentsMigration: await readFile(
    new URL('../../supabase/migrations/20260815202615_transaction_required_documents_internal_rls_repair.sql', import.meta.url),
    'utf8',
  ),
  unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  workflowActions: await readFile(
    new URL('../server/services/workflowActionAvailabilityService.js', import.meta.url),
    'utf8',
  ),
}

function assertPolicy(source, tableName, policyName, command) {
  assert.match(source, new RegExp(`alter table if exists public\\.${tableName} enable row level security`, 'i'))
  assert.match(source, new RegExp(`create policy ${policyName}[\\s\\S]*?for ${command}`, 'i'))
  assert.match(source, /to authenticated/i)
  assert.match(source, /bridge_can_access_transaction_spine/i)
}

assertPolicy(
  files.requiredDocumentsMigration,
  'transaction_required_documents',
  'transaction_required_documents_select_transaction_spine_scope',
  'select',
)
assertPolicy(
  files.requiredDocumentsMigration,
  'transaction_required_documents',
  'transaction_required_documents_insert_transaction_spine_scope',
  'insert',
)
assertPolicy(
  files.requiredDocumentsMigration,
  'transaction_required_documents',
  'transaction_required_documents_update_transaction_spine_scope',
  'update',
)
assert.match(files.requiredDocumentsMigration, /bridge_can_access_transaction_org_member/i)
assert.match(files.requiredDocumentsMigration, /grant insert, update on public\.transaction_required_documents to authenticated/i)

assertPolicy(
  files.subprocessMigration,
  'transaction_subprocesses',
  'transaction_subprocesses_insert_transaction_spine_scope',
  'insert',
)
assertPolicy(
  files.subprocessMigration,
  'transaction_subprocesses',
  'transaction_subprocesses_update_transaction_spine_scope',
  'update',
)
assertPolicy(
  files.subprocessMigration,
  'transaction_subprocess_steps',
  'transaction_subprocess_steps_insert_transaction_spine_scope',
  'insert',
)
assertPolicy(
  files.subprocessMigration,
  'transaction_subprocess_steps',
  'transaction_subprocess_steps_update_transaction_spine_scope',
  'update',
)
assert.match(files.subprocessMigration, /process_type in \('finance', 'transfer', 'bond', 'attorney', 'cancellation'\)/i)

assertPolicy(
  files.statusLinksMigration,
  'transaction_status_links',
  'transaction_status_links_insert_transaction_spine_scope',
  'insert',
)
assertPolicy(
  files.statusLinksMigration,
  'transaction_status_links',
  'transaction_status_links_update_transaction_spine_scope',
  'update',
)
assertPolicy(
  files.statusLinksMigration,
  'transaction_onboarding',
  'transaction_onboarding_insert_transaction_spine_scope',
  'insert',
)
assertPolicy(
  files.statusLinksMigration,
  'transaction_onboarding',
  'transaction_onboarding_update_transaction_spine_scope',
  'update',
)

assert.match(files.unitDetail, /async function handleSendOnboardingEmail/)
assert.match(files.unitDetail, /recordBuyerOnboardingSent/)
assert.match(files.unitDetail, /roleplayers:\s*resolveDeveloperBuyerOnboardingHandoffRoleplayers\(/)
assert.match(files.unitDetail, /kingstonsBuyerOnboardingLinksDisabled/)

assert.match(files.api, /export async function recordBuyerOnboardingSent/)
assert.match(files.api, /bond_assignment_status:\s*'awaiting_buyer_onboarding'/)
assert.match(files.api, /bond assignment handoff update skipped/)
assert.match(files.api, /buyer participant onboarding status update skipped/)

assert.match(files.workflowActions, /isDevelopmentSale\(state\)\s*\?\s*\['buyer_onboarding_complete'\]/)
assert.match(files.workflowActions, /Seller onboarding is not required for new development transactions\./)

console.log('developer module Phase 4 live preflight contract passed')
