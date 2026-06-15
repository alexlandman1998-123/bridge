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
        appt.listing_id = v_listing.id
        or appt.lead_id = v_listing.seller_lead_id
        or appt.related_entity_id = v_listing.id
        or appt.related_entity_id = v_listing.seller_lead_id
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
commit;
