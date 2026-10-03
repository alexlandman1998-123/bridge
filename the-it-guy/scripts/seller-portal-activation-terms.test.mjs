import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  buildSellerPortalActivationTermsAcceptance, getSellerPortalActivationTermsConfig,
  normalizeSellerPortalActivationTermsConfig, SELLER_PORTAL_ACTIVATION_TERMS_VERSION,
} from '../src/lib/sellerPortalActivationTerms.js'

const config = getSellerPortalActivationTermsConfig()
const acceptedAt = '2026-10-03T09:30:00.000Z'
const acceptance = buildSellerPortalActivationTermsAcceptance({ acceptedAt, acceptedByEmail: 'seller@example.com' })
assert.equal(config.wordingVersion, SELLER_PORTAL_ACTIVATION_TERMS_VERSION)
assert.equal(acceptance.acceptedAt, acceptedAt)
assert.equal(acceptance.accepted_by_email, undefined)
assert.equal(acceptance.acceptedByEmail, 'seller@example.com')
assert.equal(acceptance.consentType, 'seller_portal_terms_and_privacy')
assert.equal(acceptance.privacyPolicyVersion, 'arch9-seller-terms-popi-v1')
assert.equal(acceptance.wordingSnapshot, config.body)
assert.equal(acceptance.popiConsentIncluded, true)
assert.doesNotMatch(JSON.stringify(config), /fee|750/i)
assert.doesNotMatch(JSON.stringify(acceptance), /fee|750/i)
// Stale remote fee configuration and arbitrary overrides cannot create hidden fee consent.
const stale = { body: 'Platform fee R750', wordingVersion: 'seller-platform-fee-v1', fee_amount: '750.00' }
assert.deepEqual(normalizeSellerPortalActivationTermsConfig(stale), config)
assert.deepEqual(buildSellerPortalActivationTermsAcceptance({ acceptedAt, acceptedByEmail: 'seller@example.com', termsConfig: stale, feeAmount: '750.00' }), acceptance)
const sql = await fs.readFile(new URL('../../supabase/migrations/20261003090254_seller_portal_terms_without_fee.sql', import.meta.url), 'utf8')
assert.match(sql, /bridge_resolve_private_listing_seller_portal_token/)
assert.match(sql, /bridge_private_listing_seller_portal_link_is_active/)
assert.match(sql, /v_terms_version is distinct from v_current_version/)
assert.match(sql, /v_current_version,\s*v_privacy_version,\s*null,\s*null,\s*null,\s*v_body,\s*v_checkbox/)
assert.doesNotMatch(sql, /transaction_consent_wording_versions|v_wording/)
assert.match(sql, /on conflict \(seller_onboarding_id, terms_type, terms_version\) do nothing/)
const service = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const fetchConfig = service.split('export async function fetchSellerPortalActivationTermsConfig()')[1].split('export async function requestSellerPortalPasswordRecovery')[0]
assert.doesNotMatch(fetchConfig, /transaction_consent_wording_versions/)
console.log('seller portal activation terms checks passed')

// Execute the replacement function in isolated PostgreSQL, never against a remote account.
const { PGlite } = await import('@electric-sql/pglite')
const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.digest(text, text) returns bytea language sql as $$ select decode(md5($1), 'hex') $$;
    create function public.bridge_request_headers() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create table public.private_listings(id uuid primary key, organisation_id uuid);
    create table public.private_listing_seller_onboarding(id uuid primary key, private_listing_id uuid,
      status text, seller_portal_activation_source text, seller_portal_status text,
      seller_portal_activated_at timestamptz, seller_portal_terms_accepted_at timestamptz,
      seller_portal_terms_version text, seller_portal_terms_acceptance_id uuid, updated_at timestamptz);
    create function public.bridge_resolve_private_listing_seller_portal_token(text)
      returns table(token_valid boolean, onboarding_id uuid, token_kind text, stable_portal_token text)
      language sql as $$ select $1 = 'valid', '00000000-0000-0000-0000-000000000002'::uuid, 'invitation'::text, null::text $$;
    create function public.bridge_private_listing_seller_portal_link_is_active(jsonb, jsonb)
      returns boolean language sql as $$ select true $$;
    create function public.bridge_log_client_portal_access_event(text,text,text,uuid,text)
      returns void language plpgsql as $$ begin return; end $$;
    insert into public.private_listings values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
    insert into public.private_listing_seller_onboarding(id,private_listing_id,status) values
      ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','submitted');
  `)
  const original = await fs.readFile(new URL('../../supabase/migrations/202607280001_seller_portal_activation_lifecycle.sql', import.meta.url), 'utf8')
  const table = original.slice(original.indexOf('create table if not exists public.seller_portal_terms_acceptances'), original.indexOf('create index if not exists seller_portal_terms_acceptances_listing_idx'))
  await db.exec(table)
  await db.exec('create unique index acceptance_unique on public.seller_portal_terms_acceptances(seller_onboarding_id,terms_type,terms_version)')
  await db.exec(sql)
  const record = (token, payload) => db.query('select public.bridge_record_seller_portal_activation_terms($1,$2::jsonb) as result', [token, JSON.stringify(payload)])
  await assert.rejects(record('invalid', acceptance), /invalid, expired/)
  await assert.rejects(record('valid', {...acceptance, accepted: false}), /must be accepted/)
  await assert.rejects(record('valid', {...acceptance, feeAmount: '750.00'}), /terms have changed/)
  await assert.rejects(record('valid', {...acceptance, wordingSnapshot: 'Different text'}), /terms have changed/)
  await assert.rejects(record('valid', {...acceptance, popiConsentIncluded: false}), /terms have changed/)
  const result = await record('valid', acceptance)
  assert.equal(result.rows[0].result.ok, true)
  await record('valid', acceptance)
  const rows = await db.query('select * from public.seller_portal_terms_acceptances')
  assert.equal(rows.rows.length, 1)
  assert.equal(rows.rows[0].fee_amount, null)
  assert.equal(rows.rows[0].fee_disclosure_version, null)
  assert.equal(rows.rows[0].currency, null)
  assert.equal(rows.rows[0].wording_snapshot, config.body)
  assert.equal(rows.rows[0].terms_version, config.wordingVersion)
  console.log('seller portal isolated SQL acceptance checks passed')
} finally { await db.close() }
