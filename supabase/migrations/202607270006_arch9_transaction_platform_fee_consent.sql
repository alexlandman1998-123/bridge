begin;

create or replace function public.bridge_onboarding_request_token()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_request_header('x-bridge-onboarding-token');
$$;

create or replace function public.bridge_has_onboarding_token_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.transaction_id = target_transaction_id
      and onboarding.is_active is true
      and onboarding.token = public.bridge_onboarding_request_token()
  );
$$;

create table if not exists public.transaction_consent_wording_versions (
  id uuid primary key default gen_random_uuid(),
  consent_type text not null,
  party_type text not null,
  wording_version text not null,
  title text not null,
  body text not null,
  checkbox_label text not null,
  fee_amount numeric(12,2) not null,
  currency text not null default 'ZAR',
  status text not null default 'published',
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_consent_wording_versions_type_check
    check (consent_type in ('arch9_transaction_platform_fee')),
  constraint transaction_consent_wording_versions_party_check
    check (party_type in ('buyer', 'seller')),
  constraint transaction_consent_wording_versions_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint transaction_consent_wording_versions_amount_check
    check (fee_amount >= 0),
  constraint transaction_consent_wording_versions_unique
    unique (consent_type, party_type, wording_version)
);

insert into public.transaction_consent_wording_versions (
  consent_type,
  party_type,
  wording_version,
  title,
  body,
  checkbox_label,
  fee_amount,
  currency,
  status
)
values
  (
    'arch9_transaction_platform_fee',
    'seller',
    'seller-platform-fee-v1',
    'ARCH9 Transaction Platform Fee',
    'I acknowledge that this transaction is being facilitated through the ARCH9 platform. I authorise the transferring attorney to deduct the once-off ARCH9 Transaction Platform Fee of R750.00 from my proceeds on registration and to remit that amount to ARCH9.',
    'I have read, understood and agree to the above authorisation.',
    750.00,
    'ZAR',
    'published'
  ),
  (
    'arch9_transaction_platform_fee',
    'buyer',
    'buyer-platform-fee-v1',
    'ARCH9 Transaction Platform Fee',
    'I acknowledge that a once-off ARCH9 Transaction Platform Fee of R750.00 will be included in my transfer cost account. I authorise the transferring attorney to collect this amount and remit it to ARCH9.',
    'I have read, understood and agree to the above authorisation.',
    750.00,
    'ZAR',
    'published'
  )
on conflict (consent_type, party_type, wording_version) do update
set title = excluded.title,
    body = excluded.body,
    checkbox_label = excluded.checkbox_label,
    fee_amount = excluded.fee_amount,
    currency = excluded.currency,
    status = excluded.status,
    updated_at = now();

create table if not exists public.transaction_consents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  party_id uuid,
  party_type text not null,
  consent_type text not null,
  consent_status text not null default 'accepted',
  fee_amount numeric(12,2) not null,
  currency text not null default 'ZAR',
  wording_version text not null,
  wording_snapshot text not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_by_name text,
  accepted_by_email text,
  accepted_by_phone text,
  ip_address inet,
  user_agent text,
  source text not null,
  related_document_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_consents_party_check
    check (party_type in ('buyer', 'seller')),
  constraint transaction_consents_type_check
    check (consent_type in ('arch9_transaction_platform_fee')),
  constraint transaction_consents_status_check
    check (consent_status in ('pending', 'accepted', 'declined', 'superseded', 'revoked', 'waived')),
  constraint transaction_consents_source_check
    check (source in ('seller_defects_declaration', 'buyer_onboarding', 'manual_attorney_upload', 'admin_override')),
  constraint transaction_consents_amount_check
    check (fee_amount >= 0),
  constraint transaction_consents_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists transaction_consents_one_active_platform_fee_idx
  on public.transaction_consents (
    transaction_id,
    party_type,
    coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid),
    consent_type
  )
  where consent_status = 'accepted'
    and revoked_at is null
    and consent_type = 'arch9_transaction_platform_fee';

create index if not exists transaction_consents_transaction_idx
  on public.transaction_consents (transaction_id, party_type, consent_type, created_at desc);

create table if not exists public.transaction_platform_charges (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  party_id uuid,
  party_type text not null,
  consent_id uuid references public.transaction_consents(id) on delete restrict,
  attorney_organisation_id uuid,
  amount numeric(12,2) not null,
  currency text not null default 'ZAR',
  charge_type text not null default 'arch9_transaction_platform_fee',
  charge_status text not null default 'active',
  collection_status text not null default 'awaiting_collection',
  invoice_id text,
  invoiced_at timestamptz,
  paid_at timestamptz,
  collected_at timestamptz,
  remitted_at timestamptz,
  reconciled_at timestamptz,
  waived_at timestamptz,
  waived_by uuid references auth.users(id) on delete set null,
  waiver_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_platform_charges_party_check
    check (party_type in ('buyer', 'seller')),
  constraint transaction_platform_charges_type_check
    check (charge_type in ('arch9_transaction_platform_fee')),
  constraint transaction_platform_charges_status_check
    check (charge_status in ('active', 'waived', 'cancelled')),
  constraint transaction_platform_charges_collection_check
    check (collection_status in ('awaiting_collection', 'invoiced', 'paid', 'collected', 'remitted', 'reconciled', 'waived')),
  constraint transaction_platform_charges_amount_check
    check (amount >= 0),
  constraint transaction_platform_charges_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists transaction_platform_charges_one_active_fee_idx
  on public.transaction_platform_charges (
    transaction_id,
    party_type,
    coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid),
    charge_type
  )
  where charge_status = 'active'
    and charge_type = 'arch9_transaction_platform_fee';

create index if not exists transaction_platform_charges_transaction_idx
  on public.transaction_platform_charges (transaction_id, party_type, charge_type, created_at desc);

drop trigger if exists transaction_consent_wording_versions_touch_updated_at on public.transaction_consent_wording_versions;
create trigger transaction_consent_wording_versions_touch_updated_at
before update on public.transaction_consent_wording_versions
for each row execute function public.bridge_set_updated_at();

drop trigger if exists transaction_consents_touch_updated_at on public.transaction_consents;
create trigger transaction_consents_touch_updated_at
before update on public.transaction_consents
for each row execute function public.bridge_set_updated_at();

drop trigger if exists transaction_platform_charges_touch_updated_at on public.transaction_platform_charges;
create trigger transaction_platform_charges_touch_updated_at
before update on public.transaction_platform_charges
for each row execute function public.bridge_set_updated_at();

alter table public.transaction_consent_wording_versions enable row level security;
alter table public.transaction_consents enable row level security;
alter table public.transaction_platform_charges enable row level security;

drop policy if exists transaction_consent_wording_versions_select_published on public.transaction_consent_wording_versions;
create policy transaction_consent_wording_versions_select_published
  on public.transaction_consent_wording_versions
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists transaction_consents_select_internal_access on public.transaction_consents;
create policy transaction_consents_select_internal_access
  on public.transaction_consents
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_consents_select_token_access on public.transaction_consents;
create policy transaction_consents_select_token_access
  on public.transaction_consents
  for select
  to anon, authenticated
  using (
    public.bridge_has_client_portal_token_transaction_access(transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(transaction_id)
  );

drop policy if exists transaction_platform_charges_select_internal_access on public.transaction_platform_charges;
create policy transaction_platform_charges_select_internal_access
  on public.transaction_platform_charges
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_platform_charges_select_token_access on public.transaction_platform_charges;
create policy transaction_platform_charges_select_token_access
  on public.transaction_platform_charges
  for select
  to anon, authenticated
  using (
    public.bridge_has_client_portal_token_transaction_access(transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(transaction_id)
  );

grant select on public.transaction_consent_wording_versions to anon, authenticated;
grant select on public.transaction_consents to anon, authenticated;
grant select on public.transaction_platform_charges to anon, authenticated;

create or replace function public.bridge_record_platform_fee_consent(
  p_transaction_id uuid,
  p_party_id uuid,
  p_party_type text,
  p_acceptance jsonb,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_transaction public.transactions%rowtype;
  v_wording public.transaction_consent_wording_versions%rowtype;
  v_party_type text := lower(nullif(trim(coalesce(p_party_type, '')), ''));
  v_source text := lower(nullif(trim(coalesce(p_acceptance ->> 'source', p_source, '')), ''));
  v_wording_version text := nullif(trim(coalesce(p_acceptance ->> 'wordingVersion', p_acceptance ->> 'wording_version', '')), '');
  v_wording_snapshot text := nullif(trim(coalesce(p_acceptance ->> 'wordingSnapshot', p_acceptance ->> 'wording_snapshot', '')), '');
  v_currency text := upper(nullif(trim(coalesce(p_acceptance ->> 'currency', 'ZAR')), ''));
  v_fee_amount numeric;
  v_accepted boolean := lower(trim(coalesce(p_acceptance ->> 'accepted', p_acceptance ->> 'platformFeeAccepted', p_acceptance ->> 'platform_fee_accepted', 'false'))) in ('true', 't', 'yes', '1');
  v_accepted_at timestamptz;
  v_ip inet;
  v_headers jsonb := public.bridge_request_headers();
  v_existing_consent public.transaction_consents%rowtype;
  v_consent public.transaction_consents%rowtype;
  v_charge public.transaction_platform_charges%rowtype;
  v_now timestamptz := now();
begin
  if p_transaction_id is null then
    raise exception 'Transaction is required for platform fee consent.' using errcode = '22023';
  end if;

  if v_party_type not in ('buyer', 'seller') then
    raise exception 'Unsupported platform fee consent party.' using errcode = '22023';
  end if;

  if v_source not in ('seller_defects_declaration', 'buyer_onboarding', 'manual_attorney_upload', 'admin_override') then
    raise exception 'Unsupported platform fee consent source.' using errcode = '22023';
  end if;

  if not v_accepted then
    raise exception 'Platform fee consent must be accepted before it can be recorded.' using errcode = '22023';
  end if;

  begin
    v_fee_amount := nullif(trim(coalesce(p_acceptance ->> 'feeAmount', p_acceptance ->> 'fee_amount', '')), '')::numeric;
  exception when others then
    raise exception 'Platform fee amount must be valid.' using errcode = '22023';
  end;

  begin
    v_accepted_at := coalesce(nullif(trim(coalesce(p_acceptance ->> 'acceptedAt', p_acceptance ->> 'accepted_at', '')), '')::timestamptz, v_now);
  exception when others then
    raise exception 'Platform fee accepted time must be valid.' using errcode = '22023';
  end;

  begin
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found for platform fee consent.' using errcode = 'P0002';
  end if;

  select *
    into v_wording
  from public.transaction_consent_wording_versions wording
  where wording.consent_type = 'arch9_transaction_platform_fee'
    and wording.party_type = v_party_type
    and wording.status = 'published'
  order by wording.effective_at desc, wording.created_at desc
  limit 1;

  if not found then
    raise exception 'Published platform fee wording is not configured.' using errcode = 'P0002';
  end if;

  if v_wording_version is distinct from v_wording.wording_version then
    raise exception 'Platform fee wording version is no longer current. Please reload and accept the latest wording.' using errcode = '22023';
  end if;

  if coalesce(v_fee_amount, -1) <> v_wording.fee_amount or v_currency <> v_wording.currency then
    raise exception 'Platform fee consent amount does not match the published wording.' using errcode = '22023';
  end if;

  if v_wording_snapshot is null then
    v_wording_snapshot := v_wording.body;
  end if;

  select *
    into v_existing_consent
  from public.transaction_consents consent
  where consent.transaction_id = p_transaction_id
    and consent.party_type = v_party_type
    and coalesce(consent.party_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(p_party_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and consent.consent_type = 'arch9_transaction_platform_fee'
    and consent.consent_status = 'accepted'
    and consent.revoked_at is null
  order by consent.accepted_at desc nulls last, consent.created_at desc
  limit 1;

  if found then
    v_consent := v_existing_consent;
  else
    insert into public.transaction_consents (
      transaction_id,
      party_id,
      party_type,
      consent_type,
      consent_status,
      fee_amount,
      currency,
      wording_version,
      wording_snapshot,
      accepted_at,
      accepted_by_user_id,
      accepted_by_name,
      accepted_by_email,
      accepted_by_phone,
      ip_address,
      user_agent,
      source,
      related_document_id,
      metadata_json
    )
    values (
      p_transaction_id,
      p_party_id,
      v_party_type,
      'arch9_transaction_platform_fee',
      'accepted',
      v_wording.fee_amount,
      v_wording.currency,
      v_wording.wording_version,
      v_wording_snapshot,
      v_accepted_at,
      auth.uid(),
      nullif(left(trim(coalesce(p_acceptance ->> 'acceptedByName', p_acceptance ->> 'accepted_by_name', '')), 300), ''),
      nullif(left(lower(trim(coalesce(p_acceptance ->> 'acceptedByEmail', p_acceptance ->> 'accepted_by_email', ''))), 320), ''),
      nullif(left(trim(coalesce(p_acceptance ->> 'acceptedByPhone', p_acceptance ->> 'accepted_by_phone', '')), 80), ''),
      v_ip,
      nullif(left(trim(coalesce(v_headers ->> 'user-agent', '')), 1000), ''),
      v_source,
      nullif(left(trim(coalesce(p_acceptance ->> 'relatedDocumentId', p_acceptance ->> 'related_document_id', '')), 500), ''),
      jsonb_build_object(
        'transactionReference', nullif(trim(coalesce(p_acceptance ->> 'transactionReference', p_acceptance ->> 'transaction_reference', '')), ''),
        'checkboxLabel', v_wording.checkbox_label,
        'sourcePayload', p_acceptance
      )
    )
    returning * into v_consent;
  end if;

  select *
    into v_charge
  from public.transaction_platform_charges charge
  where charge.transaction_id = p_transaction_id
    and charge.party_type = v_party_type
    and coalesce(charge.party_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(p_party_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and charge.charge_type = 'arch9_transaction_platform_fee'
    and charge.charge_status = 'active'
  order by charge.created_at desc
  limit 1
  for update;

  if found then
    update public.transaction_platform_charges
    set consent_id = coalesce(consent_id, v_consent.id),
        amount = v_wording.fee_amount,
        currency = v_wording.currency,
        metadata_json = metadata_json || jsonb_build_object('lastConsentId', v_consent.id),
        updated_at = v_now
    where id = v_charge.id
    returning * into v_charge;
  else
    insert into public.transaction_platform_charges (
      transaction_id,
      party_id,
      party_type,
      consent_id,
      amount,
      currency,
      charge_type,
      charge_status,
      collection_status,
      metadata_json
    )
    values (
      p_transaction_id,
      p_party_id,
      v_party_type,
      v_consent.id,
      v_wording.fee_amount,
      v_wording.currency,
      'arch9_transaction_platform_fee',
      'active',
      'awaiting_collection',
      jsonb_build_object(
        'source', v_source,
        'wordingVersion', v_wording.wording_version
      )
    )
    returning * into v_charge;
  end if;

  return jsonb_build_object(
    'consentId', v_consent.id,
    'chargeId', v_charge.id,
    'transactionId', p_transaction_id,
    'partyType', v_party_type,
    'feeAmount', v_wording.fee_amount,
    'currency', v_wording.currency,
    'wordingVersion', v_wording.wording_version,
    'collectionStatus', v_charge.collection_status
  );
end;
$$;

create or replace function public.bridge_accept_transaction_platform_fee_consent(
  p_party_type text,
  p_acceptance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_party_type text := lower(nullif(trim(coalesce(p_party_type, '')), ''));
  v_onboarding_token text := nullif(trim(coalesce(public.bridge_onboarding_request_token(), '')), '');
  v_onboarding public.transaction_onboarding%rowtype;
  v_transaction public.transactions%rowtype;
begin
  if v_party_type <> 'buyer' then
    raise exception 'This platform fee consent endpoint only accepts buyer consent.' using errcode = '22023';
  end if;

  if v_onboarding_token is null then
    raise exception 'A valid buyer onboarding token is required.' using errcode = '42501';
  end if;

  select *
    into v_onboarding
  from public.transaction_onboarding onboarding
  where onboarding.token = v_onboarding_token
    and onboarding.is_active is true
  order by onboarding.updated_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Buyer onboarding link is invalid or inactive.' using errcode = '42501';
  end if;

  select *
    into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = v_onboarding.transaction_id;

  if not found then
    raise exception 'Transaction not found for buyer platform fee consent.' using errcode = 'P0002';
  end if;

  return public.bridge_record_platform_fee_consent(
    v_transaction.id,
    v_transaction.buyer_id,
    'buyer',
    coalesce(p_acceptance, '{}'::jsonb),
    'buyer_onboarding'
  );
end;
$$;

create or replace function public.bridge_accept_seller_platform_fee_consent(
  p_token text,
  p_acceptance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, public.bridge_request_header('x-bridge-seller-portal-token'), '')), '');
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_transaction_id uuid;
begin
  if v_token is null then
    raise exception 'A valid seller onboarding token is required.' using errcode = '42501';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  where (onboarding.token = v_token or onboarding.seller_portal_token = v_token)
    and coalesce(onboarding.is_active, true) is true
  order by onboarding.updated_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Seller onboarding link is invalid or inactive.' using errcode = '42501';
  end if;

  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_onboarding.private_listing_id);

  if v_transaction_id is null then
    raise exception 'Seller platform fee consent requires a linked transaction.' using errcode = '22023';
  end if;

  return public.bridge_record_platform_fee_consent(
    v_transaction_id,
    v_onboarding.private_listing_id,
    'seller',
    coalesce(p_acceptance, '{}'::jsonb),
    'seller_defects_declaration'
  );
end;
$$;

revoke all on function public.bridge_record_platform_fee_consent(uuid, uuid, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_accept_transaction_platform_fee_consent(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_accept_seller_platform_fee_consent(text, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.bridge_accept_transaction_platform_fee_consent(text, jsonb) to anon, authenticated;
grant execute on function public.bridge_accept_seller_platform_fee_consent(text, jsonb) to anon, authenticated;
grant execute on function public.bridge_onboarding_request_token() to anon, authenticated;
grant execute on function public.bridge_has_onboarding_token_transaction_access(uuid) to anon, authenticated;

comment on table public.transaction_consents is
  'Immutable transaction consent audit records, including ARCH9 Transaction Platform Fee acceptance evidence.';
comment on table public.transaction_platform_charges is
  'Collection ledger for transaction-level ARCH9 platform fee charges generated from accepted consent.';
comment on function public.bridge_accept_transaction_platform_fee_consent(text, jsonb) is
  'Records buyer ARCH9 platform fee consent from an active buyer onboarding token and creates the collection charge.';
comment on function public.bridge_accept_seller_platform_fee_consent(text, jsonb) is
  'Records seller ARCH9 platform fee consent from an active seller onboarding token and creates the collection charge.';

notify pgrst, 'reload schema';

commit;
