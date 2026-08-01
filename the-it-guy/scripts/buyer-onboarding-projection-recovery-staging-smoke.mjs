#!/usr/bin/env node

/**
 * Rollback-backed staging smoke for buyer onboarding projection recovery.
 *
 * The smoke selects one existing active buyer-onboarding token, switches to
 * the browser anon role, verifies the current snapshot can still be saved, and
 * inserts every projection recovery marker shape. The transaction always rolls
 * back, and output contains only boolean/count evidence.
 */

import { Client } from 'pg'

const STAGING_PROJECT = Object.freeze({
  projectRef: 'vaszuxjeoajeuhlcnzzf',
  databaseUrlVariable: 'SUPABASE_STAGING_DB_URL',
  projectRefVariable: 'SUPABASE_STAGING_PROJECT_REF',
})

const RECOVERY_EVENT_TYPES = Object.freeze([
  'buyer_onboarding_required_documents_projection_failed',
  'buyer_onboarding_platform_fee_consent_projection_failed',
  'buyer_onboarding_information_sheet_projection_failed',
  'buyer_onboarding_roleplayer_projection_failed',
  'buyer_onboarding_workflow_evidence_projection_failed',
  'buyer_onboarding_awaiting_signed_otp_projection_failed',
  'buyer_onboarding_finance_event_projection_failed',
])

function usage() {
  console.log('Usage:')
  console.log('  node scripts/buyer-onboarding-projection-recovery-staging-smoke.mjs --environment staging')
  console.log('')
  console.log('Required environment variables:')
  console.log('  SUPABASE_STAGING_PROJECT_REF, SUPABASE_STAGING_DB_URL')
}

function parseArgs(argv) {
  const options = { environment: null, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--environment') options.environment = String(argv[++index] || '').trim().toLowerCase()
    else if (value === '--help' || value === '-h') options.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  return options
}

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[database-url]')
    .replace(/(x-bridge-onboarding-token[^,}\s]*)/gi, '[onboarding-token-header]')
    .replace(/([a-z0-9_-]{20,}\.[a-z0-9_-]{20,}\.[a-z0-9_-]{20,})/gi, '[jwt]')
}

function requireStagingTarget(options) {
  if (options.environment !== 'staging') {
    throw new Error('--environment must be exactly staging.')
  }

  const suppliedRef = String(process.env[STAGING_PROJECT.projectRefVariable] || '').trim()
  const databaseUrl = String(process.env[STAGING_PROJECT.databaseUrlVariable] || '').trim()
  if (suppliedRef !== STAGING_PROJECT.projectRef) {
    throw new Error(`${STAGING_PROJECT.projectRefVariable} must equal the guarded staging project reference.`)
  }
  if (!databaseUrl) throw new Error(`${STAGING_PROJECT.databaseUrlVariable} is required.`)

  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error(`${STAGING_PROJECT.databaseUrlVariable} must be a PostgreSQL connection URL.`)
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${STAGING_PROJECT.databaseUrlVariable} must use a PostgreSQL protocol.`)
  }

  const hostname = parsed.hostname.toLowerCase()
  const expectedDirectHost = `db.${STAGING_PROJECT.projectRef}.supabase.co`
  const expectedPoolerUsername = `postgres.${STAGING_PROJECT.projectRef}`
  const isExpectedDirectHost = hostname === expectedDirectHost
  const isExpectedProjectPooler =
    /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname) &&
    decodeURIComponent(parsed.username) === expectedPoolerUsername
  if (!isExpectedDirectHost && !isExpectedProjectPooler) {
    throw new Error('SUPABASE_STAGING_DB_URL must target the guarded staging database host or project-bound pooler.')
  }
  if (parsed.port && parsed.port !== '5432') {
    throw new Error('SUPABASE_STAGING_DB_URL must use the direct Supabase database port (5432).')
  }
  if (parsed.pathname !== '/postgres') {
    throw new Error('SUPABASE_STAGING_DB_URL must target the postgres database.')
  }

  return { ...STAGING_PROJECT, environment: options.environment, databaseUrl }
}

function verificationSql() {
  return String.raw`begin;

set local statement_timeout = '45s';
set local lock_timeout = '10s';

do $buyer_projection_recovery_setup$
declare
  v_onboarding_token text;
  v_transaction_id uuid;
begin
  select onboarding.token, onboarding.transaction_id
    into v_onboarding_token, v_transaction_id
  from public.transaction_onboarding onboarding
  join public.transactions transaction_row
    on transaction_row.id = onboarding.transaction_id
  where onboarding.is_active is true
    and transaction_row.development_id is not null
    and transaction_row.unit_id is not null
    and lower(trim(coalesce(transaction_row.finance_type, ''))) in ('cash', 'bond', 'combination', 'hybrid')
    and lower(trim(coalesce(transaction_row.purchaser_type, ''))) in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser')
  order by onboarding.updated_at desc nulls last
  limit 1;

  if v_onboarding_token is null or v_transaction_id is null then
    raise exception 'No active buyer-onboarding fixture was available for projection recovery smoke.' using errcode = 'P0002';
  end if;

  perform set_config(
    'request.headers',
    jsonb_build_object('x-bridge-onboarding-token', v_onboarding_token)::text,
    true
  );
  perform set_config('bridge.verify.buyer_projection_recovery_transaction_id', v_transaction_id::text, true);
end;
$buyer_projection_recovery_setup$;

set local role anon;

do $buyer_projection_recovery_verify$
declare
  v_transaction_id uuid := nullif(current_setting('bridge.verify.buyer_projection_recovery_transaction_id', true), '')::uuid;
  v_transaction public.transactions%rowtype;
  v_form_data jsonb := '{}'::jsonb;
  v_funding_sources jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_snapshot_result jsonb;
  v_event_type text;
  v_marker_count integer := 0;
  v_unsafe_marker_blocked boolean := false;
begin
  if v_transaction_id is null then
    raise exception 'Buyer projection recovery smoke lost its transaction scope.' using errcode = 'P0002';
  end if;

  if to_regprocedure('public.bridge_save_buyer_onboarding_snapshot(jsonb,jsonb,jsonb,boolean,text)') is null then
    raise exception 'Missing buyer onboarding snapshot RPC.' using errcode = '42883';
  end if;

  if to_regprocedure('public.bridge_accept_transaction_platform_fee_consent(text,jsonb)') is null then
    raise exception 'Missing buyer platform fee consent RPC.' using errcode = '42883';
  end if;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = v_transaction_id;

  if not found then
    raise exception 'Onboarding token could not read its scoped transaction.' using errcode = '42501';
  end if;

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

  if coalesce(v_snapshot_result ->> 'transactionId', '') <> v_transaction_id::text then
    raise exception 'No-op buyer onboarding snapshot was not accepted for the scoped transaction.' using errcode = 'P0001';
  end if;

  if coalesce(v_snapshot_result -> 'onboarding', '{}'::jsonb) ? 'token' then
    raise exception 'Buyer onboarding snapshot exposed an onboarding token.' using errcode = '42501';
  end if;

  foreach v_event_type in array array[
    'buyer_onboarding_required_documents_projection_failed',
    'buyer_onboarding_platform_fee_consent_projection_failed',
    'buyer_onboarding_information_sheet_projection_failed',
    'buyer_onboarding_roleplayer_projection_failed',
    'buyer_onboarding_workflow_evidence_projection_failed',
    'buyer_onboarding_awaiting_signed_otp_projection_failed',
    'buyer_onboarding_finance_event_projection_failed'
  ]
  loop
    insert into public.transaction_events (
      transaction_id,
      event_type,
      event_data,
      created_by_role,
      visibility_scope
    )
    values (
      v_transaction_id,
      v_event_type,
      jsonb_build_object(
        'source', 'buyer_onboarding_projection_recovery_marker',
        'projection', replace(replace(v_event_type, 'buyer_onboarding_', ''), '_projection_failed', ''),
        'recoveryRequired', true,
        'retryable', true,
        'errorCategory', 'projection_failed',
        'errorCode', 'STAGING_SMOKE'
      ),
      'system',
      'internal'
    );
    v_marker_count := v_marker_count + 1;
  end loop;

  begin
    insert into public.transaction_events (
      transaction_id,
      event_type,
      event_data,
      created_by_role,
      visibility_scope
    )
    values (
      v_transaction_id,
      'buyer_onboarding_required_documents_projection_failed',
      jsonb_build_object(
        'source', 'unsafe_marker_shape',
        'projection', 'required_documents',
        'recoveryRequired', true,
        'retryable', true
      ),
      'system',
      'internal'
    );
  exception
    when others then
      v_unsafe_marker_blocked := true;
  end;

  if not v_unsafe_marker_blocked then
    raise exception 'Unsafe buyer projection marker shape was not blocked.' using errcode = '42501';
  end if;

  perform set_config(
    'bridge.verify.buyer_projection_recovery_result',
    jsonb_build_object(
      'status', 'pass',
      'snapshotAcceptedCurrentPayload', true,
      'snapshotNeverReturnsOnboardingToken', true,
      'recoveryMarkerEventTypesAccepted', v_marker_count,
      'unsafeMarkerShapeBlocked', v_unsafe_marker_blocked,
      'rolledBack', true
    )::text,
    true
  );
end;
$buyer_projection_recovery_verify$;

reset role;

select current_setting('bridge.verify.buyer_projection_recovery_result', true)::jsonb
  as buyer_onboarding_projection_recovery;

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
    throw new Error(`Buyer onboarding projection recovery smoke failed before completion: ${redact(error?.message || error)}`)
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
  const row = rows.find((item) => item && typeof item === 'object' && item.buyer_onboarding_projection_recovery)
  const result = row?.buyer_onboarding_projection_recovery
  if (!result || typeof result !== 'object') {
    throw new Error('Verification query returned no buyer onboarding projection recovery result.')
  }
  return result
}

function assertPassed(result) {
  const expected = {
    status: 'pass',
    snapshotAcceptedCurrentPayload: true,
    snapshotNeverReturnsOnboardingToken: true,
    recoveryMarkerEventTypesAccepted: RECOVERY_EVENT_TYPES.length,
    unsafeMarkerShapeBlocked: true,
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
    const target = requireStagingTarget(options)
    const result = extractResult(await executeVerification(target))
    assertPassed(result)
    console.log(JSON.stringify({
      environment: target.environment,
      projectRef: target.projectRef,
      verification: result,
    }, null, 2))
  }
} catch (error) {
  console.error(`Buyer onboarding projection recovery staging smoke blocked: ${redact(error?.message || error)}`)
  process.exitCode = 1
}
