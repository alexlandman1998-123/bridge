#!/usr/bin/env node

/**
 * Verifies the buyer onboarding -> client portal capability handoff against a
 * real Supabase database without leaving any test data behind.
 *
 * The database session creates no fixture. It selects one existing, active
 * buyer onboarding row, switches to the `anon` role, exercises the two token
 * scopes, and rolls the entire transaction back. Output deliberately contains
 * only boolean/count evidence: no bearer tokens, UUIDs, form data, or PII.
 */

import { Client } from 'pg'

const PROJECTS = Object.freeze({
  staging: {
    projectRef: 'vaszuxjeoajeuhlcnzzf',
    databaseUrlVariable: 'SUPABASE_STAGING_DB_URL',
    projectRefVariable: 'SUPABASE_STAGING_PROJECT_REF',
  },
  production: {
    projectRef: 'isdowlnollckzvltkasn',
    databaseUrlVariable: 'SUPABASE_PRODUCTION_DB_URL',
    projectRefVariable: 'SUPABASE_PRODUCTION_PROJECT_REF',
  },
})

const PRODUCTION_CONFIRMATION = '--confirm-production-read-only'

function usage() {
  console.log('Usage:')
  console.log('  node scripts/buyer-onboarding-portal-token-handoff-rls-smoke.mjs --environment staging')
  console.log(`  node scripts/buyer-onboarding-portal-token-handoff-rls-smoke.mjs --environment production ${PRODUCTION_CONFIRMATION}`)
  console.log('')
  console.log('Required environment variables:')
  console.log('  staging: SUPABASE_STAGING_PROJECT_REF, SUPABASE_STAGING_DB_URL')
  console.log('  production: SUPABASE_PRODUCTION_PROJECT_REF, SUPABASE_PRODUCTION_DB_URL')
}

function parseArgs(argv) {
  const options = { environment: null, productionConfirmed: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--environment') options.environment = String(argv[++index] || '').trim().toLowerCase()
    else if (value === PRODUCTION_CONFIRMATION) options.productionConfirmed = true
    else if (value === '--help' || value === '-h') options.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  return options
}

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[database-url]')
    .replace(/(x-bridge-(?:onboarding|client-portal)-token[^,}\s]*)/gi, '[bearer-token-header]')
    .replace(/(clp[a-z0-9_-]{12,})/gi, '[portal-token]')
    .replace(/([a-z0-9_-]{20,}\.[a-z0-9_-]{20,}\.[a-z0-9_-]{20,})/gi, '[jwt]')
}

function requireTarget(options) {
  if (!Object.hasOwn(PROJECTS, options.environment || '')) {
    throw new Error('--environment must be exactly staging or production.')
  }
  if (options.environment === 'production' && !options.productionConfirmed) {
    throw new Error(`Production verification requires the explicit ${PRODUCTION_CONFIRMATION} acknowledgement.`)
  }

  const target = PROJECTS[options.environment]
  const suppliedRef = String(process.env[target.projectRefVariable] || '').trim()
  const databaseUrl = String(process.env[target.databaseUrlVariable] || '').trim()

  if (suppliedRef !== target.projectRef) {
    throw new Error(`${target.projectRefVariable} must equal the guarded ${options.environment} project reference.`)
  }
  if (!databaseUrl) throw new Error(`${target.databaseUrlVariable} is required.`)

  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error(`${target.databaseUrlVariable} must be a PostgreSQL connection URL.`)
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${target.databaseUrlVariable} must use a PostgreSQL protocol.`)
  }

  const hostname = parsed.hostname.toLowerCase()
  const expectedDirectHost = `db.${target.projectRef}.supabase.co`
  const expectedPoolerUsername = `postgres.${target.projectRef}`
  const isExpectedDirectHost = hostname === expectedDirectHost
  const isExpectedProjectPooler =
    /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname) &&
    decodeURIComponent(parsed.username) === expectedPoolerUsername

  if (!isExpectedDirectHost && !isExpectedProjectPooler) {
    throw new Error(
      `${target.databaseUrlVariable} must target the guarded direct database host or a project-bound Supabase session pooler.`,
    )
  }
  if (parsed.port && parsed.port !== '5432') {
    throw new Error(`${target.databaseUrlVariable} must use the direct Supabase database port (5432).`)
  }
  if (parsed.pathname !== '/postgres') {
    throw new Error(`${target.databaseUrlVariable} must target the postgres database.`)
  }

  const queryKeys = [...parsed.searchParams.keys()]
  const sslModes = parsed.searchParams.getAll('sslmode')
  if (isExpectedProjectPooler && queryKeys.length === 0) {
    return { ...target, environment: options.environment, databaseUrl }
  }
  if (queryKeys.length !== 1 || queryKeys[0] !== 'sslmode' || sslModes.length !== 1) {
    throw new Error(
      isExpectedProjectPooler
        ? `${target.databaseUrlVariable} may contain no query parameters or one sslmode parameter.`
        : `${target.databaseUrlVariable} may contain only one sslmode parameter.`,
    )
  }
  if (!['require', 'verify-ca', 'verify-full'].includes(String(sslModes[0] || '').toLowerCase())) {
    throw new Error(`${target.databaseUrlVariable} must use sslmode=require, verify-ca, or verify-full.`)
  }

  return { ...target, environment: options.environment, databaseUrl }
}

function verificationSql() {
  return String.raw`begin;

set local statement_timeout = '45s';
set local lock_timeout = '10s';

-- Select a real, already-valid buyer-onboarding journey while still running as
-- the database owner. The selected bearer token is never returned to the CLI.
do $buyer_handoff_setup$
declare
  v_onboarding_token text;
  v_transaction_id uuid;
begin
  select onboarding.token, onboarding.transaction_id
    into v_onboarding_token, v_transaction_id
  from public.transaction_onboarding onboarding
  join public.transactions transaction_row
    on transaction_row.id = onboarding.transaction_id
  left join public.development_settings settings
    on settings.development_id = transaction_row.development_id
  where onboarding.is_active is true
    and transaction_row.development_id is not null
    and transaction_row.unit_id is not null
    and coalesce(settings.client_portal_enabled, true) is true
    and lower(trim(coalesce(transaction_row.finance_type, ''))) in ('cash', 'bond', 'combination', 'hybrid')
    and lower(trim(coalesce(transaction_row.finance_managed_by, ''))) in ('bond_originator', 'client', 'internal')
    and lower(trim(coalesce(transaction_row.purchaser_type, ''))) in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser')
    and lower(trim(coalesce(transaction_row.onboarding_status, ''))) in ('awaiting_client_onboarding', 'awaiting_signed_otp')
    and lower(trim(coalesce(transaction_row.reservation_status, ''))) in ('not_required', 'pending', 'paid', 'verified', 'rejected')
    and transaction_row.reservation_required is not null
  order by onboarding.updated_at desc nulls last
  limit 1;

  if v_onboarding_token is null or v_transaction_id is null then
    raise exception 'No active buyer-onboarding fixture has a valid current snapshot; no verification was run.' using errcode = 'P0002';
  end if;

  perform set_config(
    'request.headers',
    jsonb_build_object('x-bridge-onboarding-token', v_onboarding_token)::text,
    true
  );
  perform set_config('bridge.verify.buyer_handoff_transaction_id', v_transaction_id::text, true);
end;
$buyer_handoff_setup$;

-- From here onward every access check is the same anonymous database role
-- used by the browser. All mutation attempts remain within this transaction.
set local role anon;

do $buyer_handoff_verify$
declare
  v_transaction_id uuid := nullif(current_setting('bridge.verify.buyer_handoff_transaction_id', true), '')::uuid;
  v_transaction public.transactions%rowtype;
  v_form_data jsonb := '{}'::jsonb;
  v_funding_sources jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_portal jsonb;
  v_snapshot_result jsonb;
  v_portal_snapshot_result jsonb;
  v_portal_token text;
  v_onboarding_transaction_rows integer := 0;
  v_onboarding_raw_portal_links_before integer := 0;
  v_onboarding_raw_portal_links_after integer := 0;
  v_portal_link_rows integer := 0;
  v_portal_transaction_rows integer := 0;
  v_direct_update_rows integer := 0;
  v_direct_update_privilege_blocked boolean := false;
begin
  if v_transaction_id is null then
    raise exception 'Buyer onboarding verification lost its transaction scope.' using errcode = 'P0002';
  end if;

  -- The onboarding bearer may read its own transaction but must not gain a
  -- direct portal-link capability by doing so.
  select count(*)
    into v_onboarding_transaction_rows
  from public.transactions transaction_row
  where transaction_row.id = v_transaction_id;

  if v_onboarding_transaction_rows <> 1 then
    raise exception 'Onboarding token could not read exactly its own transaction.' using errcode = '42501';
  end if;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = v_transaction_id;

  select count(*)
    into v_onboarding_raw_portal_links_before
  from public.client_portal_links link
  where link.transaction_id = v_transaction_id
    and link.is_active is true;

  if v_onboarding_raw_portal_links_before <> 0 then
    raise exception 'Onboarding bearer unexpectedly read a raw client portal link.' using errcode = '42501';
  end if;

  -- This security-definer bridge is the only intentional conversion from a
  -- valid onboarding token into the separate client-portal capability.
  v_portal := public.bridge_buyer_onboarding_portal_access();
  v_portal_token := nullif(trim(coalesce(v_portal ->> 'token', '')), '');
  if coalesce(v_portal ->> 'available', '') <> 'true'
    or v_portal_token is null
    or coalesce(v_portal ->> 'transactionId', '') <> v_transaction_id::text then
    raise exception 'Onboarding portal bridge did not return the scoped portal capability.' using errcode = 'P0001';
  end if;

  select count(*)
    into v_onboarding_raw_portal_links_after
  from public.client_portal_links link
  where link.transaction_id = v_transaction_id
    and link.is_active is true;

  if v_onboarding_raw_portal_links_after <> 0 then
    raise exception 'Onboarding bearer received raw portal-link read access after bridge invocation.' using errcode = '42501';
  end if;

  -- Reuse the existing form and funding values, and the transaction's current
  -- normalized finance snapshot. p_submit=false prevents lifecycle movement.
  select form_data
    into v_form_data
  from public.onboarding_form_data form_row
  where form_row.transaction_id = v_transaction_id;
  v_form_data := coalesce(v_form_data, '{}'::jsonb);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sourceType', source.source_type,
        'amount', source.amount,
        'expectedPaymentDate', source.expected_payment_date,
        'actualPaymentDate', source.actual_payment_date,
        'proofDocument', source.proof_document,
        'status', source.status,
        'notes', source.notes
      )
      order by source.created_at asc, source.id asc
    ),
    '[]'::jsonb
  )
    into v_funding_sources
  from public.transaction_funding_sources source
  where source.transaction_id = v_transaction_id;

  v_snapshot := jsonb_build_object(
    'finance_type', v_transaction.finance_type,
    'finance_managed_by', v_transaction.finance_managed_by,
    'purchaser_type', v_transaction.purchaser_type,
    'onboarding_status', v_transaction.onboarding_status,
    'sales_price', v_transaction.sales_price,
    'purchase_price', v_transaction.purchase_price,
    'cash_amount', v_transaction.cash_amount,
    'bond_amount', v_transaction.bond_amount,
    'deposit_amount', v_transaction.deposit_amount,
    'reservation_required', v_transaction.reservation_required,
    'reservation_amount', v_transaction.reservation_amount,
    'reservation_status', v_transaction.reservation_status,
    'reservation_paid_date', v_transaction.reservation_paid_date,
    'onboarding_completed_at', v_transaction.onboarding_completed_at,
    'external_onboarding_submitted_at', v_transaction.external_onboarding_submitted_at
  );

  v_snapshot_result := public.bridge_save_buyer_onboarding_snapshot(
    p_form_data => v_form_data,
    p_snapshot => v_snapshot,
    p_funding_sources => v_funding_sources,
    p_submit => false,
    p_next_action => null
  );

  if coalesce(v_snapshot_result ->> 'transactionId', '') <> v_transaction_id::text
    or coalesce(v_snapshot_result -> 'portal' ->> 'available', '') <> 'true' then
    raise exception 'No-op buyer onboarding snapshot was not accepted for the scoped transaction.' using errcode = 'P0001';
  end if;

  if coalesce(v_snapshot_result -> 'onboarding', '{}'::jsonb) ? 'token' then
    raise exception 'Buyer onboarding snapshot exposed an onboarding token.' using errcode = '42501';
  end if;

  -- A bearer token must not retain a generic transaction-update permission.
  begin
    update public.transactions
       set updated_at = updated_at
     where id = v_transaction_id;
    get diagnostics v_direct_update_rows = row_count;
  exception
    when insufficient_privilege then
      v_direct_update_rows := 0;
      v_direct_update_privilege_blocked := true;
  end;

  if v_direct_update_rows <> 0 then
    raise exception 'Onboarding bearer unexpectedly updated a transaction directly.' using errcode = '42501';
  end if;

  -- Replace, rather than combine, the onboarding header with the portal token.
  -- The portal token should now read the same link and transaction on its own.
  perform set_config(
    'request.headers',
    jsonb_build_object('x-bridge-client-portal-token', v_portal_token)::text,
    true
  );

  select count(*)
    into v_portal_link_rows
  from public.client_portal_links link
  where link.transaction_id = v_transaction_id
    and link.token = v_portal_token
    and link.is_active is true;

  select count(*)
    into v_portal_transaction_rows
  from public.transactions transaction_row
  where transaction_row.id = v_transaction_id;

  if v_portal_link_rows <> 1 or v_portal_transaction_rows <> 1 then
    raise exception 'Client portal bearer did not read its own portal link and transaction.' using errcode = '42501';
  end if;

  -- The portal bearer may use the same save contract for its own editable
  -- onboarding data, but it must never receive the onboarding bearer in the
  -- response (which would let it cross back into the onboarding-only scope).
  v_portal_snapshot_result := public.bridge_save_buyer_onboarding_snapshot(
    p_form_data => v_form_data,
    p_snapshot => v_snapshot,
    p_funding_sources => v_funding_sources,
    p_submit => false,
    p_next_action => null
  );

  if coalesce(v_portal_snapshot_result ->> 'transactionId', '') <> v_transaction_id::text
    or coalesce(v_portal_snapshot_result -> 'onboarding', '{}'::jsonb) ? 'token' then
    raise exception 'Client portal snapshot either lost scope or exposed an onboarding token.' using errcode = '42501';
  end if;

  perform set_config(
    'bridge.verify.buyer_handoff_result',
    jsonb_build_object(
      'status', 'pass',
      'onboardingCanReadOwnTransaction', v_onboarding_transaction_rows = 1,
      'onboardingRawPortalLinksBeforeBridge', v_onboarding_raw_portal_links_before,
      'onboardingRawPortalLinksAfterBridge', v_onboarding_raw_portal_links_after,
      'bridgeReturnedPortalCapability', true,
      'snapshotAcceptedCurrentPayload', true,
      'snapshotNeverReturnsOnboardingToken', true,
      'portalSnapshotNeverReturnsOnboardingToken', true,
      'directTransactionUpdateRows', v_direct_update_rows,
      'directTransactionUpdatePrivilegeBlocked', v_direct_update_privilege_blocked,
      'portalCanReadOwnLink', v_portal_link_rows = 1,
      'portalCanReadOwnTransaction', v_portal_transaction_rows = 1,
      'rolledBack', true
    )::text,
    true
  );
end;
$buyer_handoff_verify$;

reset role;

select current_setting('bridge.verify.buyer_handoff_result', true)::jsonb
  as buyer_onboarding_token_handoff;

rollback;`
}

async function executeVerification(target) {
  const client = new Client({
    connectionString: target.databaseUrl,
    connectionTimeoutMillis: 15_000,
    query_timeout: 75_000,
  })

  try {
    await client.connect()
    const rawResult = await client.query(verificationSql())
    const results = Array.isArray(rawResult) ? rawResult : [rawResult]
    return JSON.stringify(results.flatMap((result) => result?.rows || []))
  } catch (error) {
    throw new Error(`Buyer onboarding token/RLS verification failed before completion: ${redact(error?.message || error)}`)
  } finally {
    await client.end().catch(() => {})
  }
}

function extractResult(stdout) {
  const firstArray = stdout.indexOf('[')
  const lastArray = stdout.lastIndexOf(']')
  const candidate = firstArray >= 0 && lastArray > firstArray ? stdout.slice(firstArray, lastArray + 1) : stdout.trim()
  let parsed
  try {
    parsed = JSON.parse(candidate)
  } catch {
    throw new Error(`Could not parse the verification result safely: ${redact(stdout).slice(0, 600)}`)
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const row = rows.find((item) => item && typeof item === 'object' && item.buyer_onboarding_token_handoff)
  const result = row?.buyer_onboarding_token_handoff
  if (!result || typeof result !== 'object') throw new Error('Verification query returned no buyer onboarding handoff result.')
  return result
}

function assertPassed(result) {
  const expected = {
    status: 'pass',
    onboardingCanReadOwnTransaction: true,
    onboardingRawPortalLinksBeforeBridge: 0,
    onboardingRawPortalLinksAfterBridge: 0,
    bridgeReturnedPortalCapability: true,
    snapshotAcceptedCurrentPayload: true,
    snapshotNeverReturnsOnboardingToken: true,
    portalSnapshotNeverReturnsOnboardingToken: true,
    directTransactionUpdateRows: 0,
    portalCanReadOwnLink: true,
    portalCanReadOwnTransaction: true,
    rolledBack: true,
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (result[key] !== expectedValue) throw new Error(`Verification assertion failed: ${key}.`)
  }
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
  } else {
    const target = requireTarget(options)
    const result = extractResult(await executeVerification(target))
    assertPassed(result)
    console.log(JSON.stringify({
      environment: target.environment,
      projectRef: target.projectRef,
      verification: result,
    }, null, 2))
  }
} catch (error) {
  console.error(`Buyer onboarding token/RLS verification blocked: ${redact(error?.message || error)}`)
  process.exitCode = 1
}
