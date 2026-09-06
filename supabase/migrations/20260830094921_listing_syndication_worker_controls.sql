begin;

create or replace function public.bridge_enqueue_listing_syndication_job_v1(
  p_listing_id uuid,
  p_provider text,
  p_environment text default 'sandbox',
  p_confirmation text default null,
  p_payload jsonb default '{}'::jsonb,
  p_revision text default 'current'
)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_environment text := lower(trim(coalesce(p_environment, 'sandbox')));
  v_organisation_id uuid;
  v_job_type text;
  v_expected_confirmation text;
  v_payload jsonb;
begin
  if v_provider not in ('property24', 'private_property') then
    raise exception 'Unsupported syndication provider.' using errcode = '22023';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'Unsupported syndication environment.' using errcode = '22023';
  end if;

  select organisation_id into v_organisation_id
  from public.private_listings
  where id = p_listing_id;
  if v_organisation_id is null or not public.bridge_is_org_admin(v_organisation_id) then
    raise exception 'Organisation administrator access is required.' using errcode = '42501';
  end if;

  v_expected_confirmation := upper(v_provider) || '_PUBLISH:' || p_listing_id::text || ':' || v_environment;
  if nullif(trim(coalesce(p_confirmation, '')), '') is distinct from v_expected_confirmation then
    raise exception 'Exact listing syndication confirmation is required.' using errcode = '22023';
  end if;

  v_job_type := case v_provider
    when 'property24' then 'property24_publish'
    else 'private_property_publish'
  end;
  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'provider', v_provider,
    'environment', v_environment,
    'confirmation', v_expected_confirmation,
    'approvedBy', auth.uid(),
    'approvedAt', now()
  );

  return public.bridge_enqueue_listing_job_v1(
    p_listing_id,
    v_job_type,
    v_payload,
    p_listing_id::text || ':' || v_job_type || ':' || coalesce(nullif(trim(p_revision), ''), 'current'),
    3
  );
end;
$$;

revoke all on function public.bridge_enqueue_listing_syndication_job_v1(uuid, text, text, text, jsonb, text)
  from public, anon;
grant execute on function public.bridge_enqueue_listing_syndication_job_v1(uuid, text, text, text, jsonb, text)
  to authenticated;

commit;
