import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607180026_attorney_accounting_phase1_2_party_account_backfill.sql', import.meta.url),
  'utf8',
)

assert(
  migration.includes('create or replace function public.bridge_matter_financial_party_role') &&
    migration.includes("then 'buyer'") &&
    migration.includes("then 'seller'"),
  'migration should normalize buyer/seller participant roles into matter financial party roles',
)

assert(
  migration.includes('create or replace function public.bridge_sync_matter_financial_account_from_participant') &&
    migration.includes('from public.transaction_participants') &&
    migration.includes('insert into public.matter_financial_accounts'),
  'migration should create a sync function that bootstraps accounts from transaction participants',
)

assert(
  migration.includes('opening_balance') &&
    migration.includes("'ZAR'") &&
    migration.includes("'active'") &&
    migration.includes('0,\n      true') &&
    migration.includes('No legacy financial amounts were imported.') &&
    migration.includes("'amountBackfillPolicy', 'none'"),
  'backfilled accounts should be portal-enabled shells with zero opening balance and explicit no-amount policy',
)

assert(
  migration.includes('create trigger trg_sync_matter_financial_account_from_participant') &&
    migration.includes('after insert or update of role_type, transaction_role, participant_name, participant_email, status') &&
    migration.includes('on public.transaction_participants'),
  'migration should keep future buyer/seller participant changes synced into financial accounts',
)

assert(
  migration.includes('create unique index if not exists matter_financial_accounts_active_participant_unique') &&
    migration.includes('where participant_id is not null') &&
    migration.includes("and status <> 'archived'"),
  'migration should prevent multiple active account shells for the same participant',
)

assert(
  migration.includes("event_type,\n      event_visibility") &&
    migration.includes("'account_bootstrapped'") &&
    migration.includes('public.matter_financial_account_events'),
  'migration should record an internal bootstrap event for new account shells',
)

assert(
  migration.includes("status = 'archived'") &&
    migration.includes('participant_role_no_longer_buyer_or_seller') &&
    migration.includes('participant_removed'),
  'sync should archive account shells when a participant stops being a buyer/seller account party',
)

assert(
  migration.includes('public.bridge_can_access_transaction_spine(v_participant.transaction_id)') &&
    migration.includes('revoke all on function public.bridge_sync_matter_financial_account_from_participant(uuid) from public, anon, authenticated') &&
    migration.includes('grant execute on function public.bridge_sync_matter_financial_account_from_participant(uuid) to service_role'),
  'sync function should not be exposed as a broad authenticated RPC',
)

assert(
  migration.includes('assignment.attorney_user_id = auth.uid()') &&
    migration.includes('assignment.assigned_user_id = auth.uid()') &&
    migration.includes('coalesce(assignment.attorney_firm_id, assignment.firm_id)'),
  'phase 1.2 should broaden account management to later attorney assignment columns',
)

assert(
  !migration.includes('transaction_financial_records') &&
    !migration.includes('transaction_attorney_closeouts') &&
    !migration.includes('transaction_attorney_closeout_documents') &&
    !migration.includes('deriveFinancialRow'),
  'phase 1.2 must not import legacy closeout or transaction_financial_records assumptions',
)

console.log('Attorney accounting Phase 1.2 party account backfill contract passed.')
