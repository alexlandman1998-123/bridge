import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607180025_attorney_accounting_phase1_1_canonical_model.sql', import.meta.url),
  'utf8',
)

const requiredTables = [
  'public.matter_financial_accounts',
  'public.matter_financial_documents',
  'public.matter_financial_entries',
  'public.matter_financial_account_events',
]

for (const table of requiredTables) {
  assert(
    migration.includes(`create table if not exists ${table}`),
    `migration should create ${table}`,
  )

  assert(
    migration.includes(`alter table if exists ${table} enable row level security`),
    `${table} should have RLS enabled`,
  )
}

assert(
  migration.includes('create or replace function public.bridge_can_manage_matter_financials') &&
    migration.includes('create or replace function public.bridge_can_view_matter_financial_account'),
  'migration should define helper functions for staff management and buyer/seller account visibility',
)

assert(
  migration.includes("party_role in ('buyer', 'seller', 'client', 'shared', 'internal')") &&
    migration.includes("audience_role in ('buyer', 'seller', 'client', 'shared', 'internal')"),
  'accounts and documents should explicitly model buyer/seller audiences',
)

assert(
  migration.includes("document_type in (\n      'invoice',") &&
    migration.includes("'statement'") &&
    migration.includes("'proof_of_payment'") &&
    migration.includes("document_status in ('draft', 'published', 'superseded', 'void', 'deleted')") &&
    migration.includes('matter_financial_documents_publish_check'),
  'financial documents should support upload-first invoice/statement lifecycle without generated invoices',
)

assert(
  migration.includes("entry_type in (\n      'opening_balance',") &&
    migration.includes("'payment'") &&
    migration.includes("'credit'") &&
    migration.includes('amount <> 0') &&
    migration.includes("entry_visibility in ('internal', 'client_visible')"),
  'ledger entries should capture posted operational accounting movements with client visibility controls',
)

assert(
  migration.includes('create or replace view public.matter_financial_account_balances') &&
    migration.includes('balance_due') &&
    migration.includes('total_charged') &&
    migration.includes('total_credited'),
  'migration should expose a derived balance view for portal and attorney account summaries',
)

assert(
  migration.includes('grant select, insert, update on public.matter_financial_accounts to authenticated') &&
    migration.includes('grant select, insert, update on public.matter_financial_documents to authenticated') &&
    migration.includes('grant select, insert, update on public.matter_financial_entries to authenticated') &&
    migration.includes('grant select, insert on public.matter_financial_account_events to authenticated') &&
    !migration.includes('grant select on public.matter_financial_accounts to anon') &&
    !migration.includes('grant select on public.matter_financial_documents to anon'),
  'canonical attorney accounting tables should have authenticated scoped grants and no direct anon table access',
)

assert(
  migration.includes('This is not a statutory trust accounting ledger.'),
  'migration should document that the operational ledger is not a statutory trust accounting ledger',
)

console.log('Attorney accounting Phase 1.1 canonical model contract passed.')
