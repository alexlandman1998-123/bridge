begin;

-- Phase 2 retains each signer's acknowledgement evidence independently from
-- the signing document. It is service-only: the public signer route may only
-- reach it through the token-validated Edge Function in a later activation
-- phase. No existing signing session calls this boundary yet.
create table if not exists public.private_listing_signing_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  signing_session_id uuid not null references public.private_listing_mandate_signing_sessions(id) on delete cascade,
  acknowledgement_key text not null,
  terms_version text not null,
  terms_content_digest text not null,
  signer_name text not null,
  signer_email text not null,
  accepted_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint private_listing_signing_acknowledgements_key_check check (
    acknowledgement_key in (
      'terms_acceptance',
      'accuracy_and_authority',
      'privacy_and_paia_notice',
      'electronic_communications_and_signing',
      'shared_information_review',
      'proposed_transfer_attorney'
    )
  ),
  constraint private_listing_signing_acknowledgements_digest_check
    check (terms_content_digest ~ '^sha256:[0-9a-f]{64}$'),
  constraint private_listing_signing_acknowledgements_evidence_check
    check (jsonb_typeof(evidence) = 'object'),
  constraint private_listing_signing_acknowledgements_session_key_unique
    unique (signing_session_id, acknowledgement_key)
);

create index if not exists private_listing_signing_acknowledgements_listing_idx
  on public.private_listing_signing_acknowledgements (private_listing_id, accepted_at desc);

alter table public.private_listing_signing_acknowledgements enable row level security;
revoke all on table public.private_listing_signing_acknowledgements from public, anon, authenticated;
grant select, insert on table public.private_listing_signing_acknowledgements to service_role;

create or replace function public.bridge_record_private_listing_signing_acknowledgements(
  p_signing_session_id uuid,
  p_acknowledgements jsonb,
  p_terms_version text,
  p_terms_content_digest text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_row jsonb;
  v_key text;
  v_inserted_count integer := 0;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Signing acknowledgement recording requires the service role.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_acknowledgements) <> 'array' then
    raise exception 'Acknowledgements must be an array.' using errcode = '22023';
  end if;
  if coalesce(p_terms_content_digest, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'A SHA-256 terms content digest is required.' using errcode = '22023';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_signing_session_id
  for update;

  if v_session.id is null then
    raise exception 'Signing session not found.' using errcode = 'P0002';
  end if;
  if nullif(v_session.signing_pack_snapshot #>> '{sellerMandateTerms,version}', '') is distinct from nullif(trim(p_terms_version), '')
     or nullif(v_session.signing_pack_snapshot #>> '{sellerMandateTerms,contentDigest}', '') is distinct from nullif(trim(p_terms_content_digest), '') then
    raise exception 'Acknowledgement evidence does not match the frozen terms version.' using errcode = '23514';
  end if;

  for v_row in select value from jsonb_array_elements(p_acknowledgements)
  loop
    v_key := nullif(trim(v_row ->> 'key'), '');
    if v_key is null or coalesce((v_row ->> 'accepted')::boolean, false) is false then
      raise exception 'Every acknowledgement must have an accepted key.' using errcode = '22023';
    end if;
    insert into public.private_listing_signing_acknowledgements (
      organisation_id, private_listing_id, signing_session_id, acknowledgement_key,
      terms_version, terms_content_digest, signer_name, signer_email, accepted_at, evidence
    ) values (
      v_session.organisation_id, v_session.private_listing_id, v_session.id, v_key,
      trim(p_terms_version), trim(p_terms_content_digest), v_session.signer_name,
      lower(v_session.signer_email), coalesce(p_accepted_at, now()),
      jsonb_build_object('contract', 'arch9-seller-mandate-acknowledgements-v1', 'accepted', true)
    ) on conflict (signing_session_id, acknowledgement_key) do nothing;
    if found then v_inserted_count := v_inserted_count + 1; end if;
  end loop;

  return jsonb_build_object('signingSessionId', v_session.id, 'insertedCount', v_inserted_count, 'idempotent', v_inserted_count = 0);
end;
$$;

revoke all on function public.bridge_record_private_listing_signing_acknowledgements(uuid, jsonb, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_record_private_listing_signing_acknowledgements(uuid, jsonb, text, text, timestamptz) to service_role;

comment on table public.private_listing_signing_acknowledgements is
  'Phase 2 service-only acknowledgement evidence bound to each frozen seller signing-pack terms version.';

commit;
