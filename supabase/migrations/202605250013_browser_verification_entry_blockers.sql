-- Browser-level staging verification entry blocker fixes.
--
-- This migration does not change canonical rollout mode. It repairs the seller
-- portal payload RPC type comparisons and adds an explicitly-confirmed helper
-- for staging buyer/client portal verification fixtures.

begin;
create or replace function public.bridge_private_listing_seller_portal_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_appointments jsonb := '[]'::jsonb;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    return null;
  end if;

  if to_regclass('public.private_listing_document_requirements') is not null then
    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at asc), '[]'::jsonb)
      into v_requirements
    from public.private_listing_document_requirements req
    where req.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    select coalesce(jsonb_agg(to_jsonb(doc) order by doc.uploaded_at desc), '[]'::jsonb)
      into v_documents
    from public.private_listing_documents doc
    where doc.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.appointments') is not null then
    select coalesce(jsonb_agg(to_jsonb(appt) order by appt.date_time asc nulls last, appt.created_at desc), '[]'::jsonb)
      into v_appointments
    from public.appointments appt
    where appt.organisation_id = v_listing.organisation_id
      and coalesce(appt.status, '') not in ('cancelled', 'deleted')
      and coalesce(appt.visibility_scope, 'shared_role_players') not in ('internal', 'internal_only', 'admin_only')
      and (
        appt.listing_id = v_listing.id::text
        or appt.lead_id::text = nullif(v_listing.seller_lead_id, '')
        or appt.related_entity_id::text = v_listing.id::text
        or appt.related_entity_id::text = nullif(v_listing.seller_lead_id, '')
      );
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding),
    'requirements', v_requirements,
    'documents', v_documents,
    'appointments', v_appointments
  );
end;
$$;
grant execute on function public.bridge_private_listing_seller_portal_payload(text) to anon, authenticated;
create or replace function public.bridge_create_staging_client_portal_fixture(
  p_confirm_staging text,
  p_transaction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_existing public.client_portal_links%rowtype;
  v_link public.client_portal_links%rowtype;
begin
  if p_confirm_staging is distinct from 'confirm_staging_browser_verification_fixture' then
    raise exception 'staging fixture confirmation phrase is required' using errcode = '42501';
  end if;

  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required for staging fixture creation' using errcode = '42501';
  end if;

  if p_transaction_id is not null then
    select *
      into v_transaction
    from public.transactions
    where id = p_transaction_id
      and development_id is not null
      and unit_id is not null
    limit 1;
  else
    select t.*
      into v_transaction
    from public.transactions t
    join public.document_requirement_instances dri on dri.transaction_id = t.id
    left join public.development_settings ds on ds.development_id = t.development_id
    where t.development_id is not null
      and t.unit_id is not null
      and coalesce(ds.client_portal_enabled, true) is true
    group by t.id
    order by count(dri.id) desc, max(dri.created_at) desc nulls last
    limit 1;
  end if;

  if not found or v_transaction.id is null then
    raise exception 'No suitable staging transaction found for client portal fixture.';
  end if;

  select *
    into v_existing
  from public.client_portal_links
  where transaction_id = v_transaction.id
    and is_active is true
  order by updated_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'link', to_jsonb(v_existing),
      'transactionId', v_transaction.id,
      'path', '/client/' || v_existing.token || '/documents'
    );
  end if;

  insert into public.client_portal_links (
    development_id,
    unit_id,
    transaction_id,
    buyer_id,
    token,
    is_active
  )
  values (
    v_transaction.development_id,
    v_transaction.unit_id,
    v_transaction.id,
    v_transaction.buyer_id,
    'clp' || replace(gen_random_uuid()::text, '-', ''),
    true
  )
  returning * into v_link;

  return jsonb_build_object(
    'created', true,
    'link', to_jsonb(v_link),
    'transactionId', v_transaction.id,
    'path', '/client/' || v_link.token || '/documents'
  );
end;
$$;
revoke all on function public.bridge_create_staging_client_portal_fixture(text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_create_staging_client_portal_fixture(text, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
