begin;

create or replace function public.bridge_enqueue_listing_syndication_canary_v1(
  p_listing_id uuid,
  p_provider text,
  p_canary_confirmation text,
  p_payload jsonb default '{}'::jsonb,
  p_revision text default 'phase13'
)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_organisation_id uuid;
  v_job_type text;
  v_expected_canary text;
  v_publish_confirmation text;
  v_payload jsonb;
begin
  if v_provider not in ('property24', 'private_property') then
    raise exception 'Unsupported syndication canary provider.' using errcode = '22023';
  end if;

  select organisation_id into v_organisation_id
  from public.private_listings
  where id = p_listing_id;
  if v_organisation_id is null or not public.bridge_is_org_admin(v_organisation_id) then
    raise exception 'Organisation administrator access is required.' using errcode = '42501';
  end if;

  v_expected_canary := 'RUN_PHASE13_PRODUCTION_CANARY:' || v_provider || ':' || p_listing_id::text;
  if nullif(trim(coalesce(p_canary_confirmation, '')), '') is distinct from v_expected_canary then
    raise exception 'Exact Phase 13 production canary confirmation is required.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.listing_background_jobs
    where organisation_id = v_organisation_id
      and job_type in ('property24_publish', 'private_property_publish')
      and payload ->> 'environment' = 'production'
      and status in ('queued', 'processing', 'retry_scheduled')
  ) then
    raise exception 'An active production syndication job already exists for this organisation.' using errcode = '55000';
  end if;

  v_job_type := case v_provider when 'property24' then 'property24_publish' else 'private_property_publish' end;
  v_publish_confirmation := upper(v_provider) || '_PUBLISH:' || p_listing_id::text || ':production';
  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'provider', v_provider,
    'environment', 'production',
    'confirmation', v_publish_confirmation,
    'phase13Canary', true,
    'canaryConfirmation', v_expected_canary,
    'approvedBy', auth.uid(),
    'approvedAt', now()
  );

  return public.bridge_enqueue_listing_job_v1(
    p_listing_id,
    v_job_type,
    v_payload,
    'phase13:' || p_listing_id::text || ':' || v_job_type || ':' || coalesce(nullif(trim(p_revision), ''), 'current'),
    1
  );
end;
$$;

revoke all on function public.bridge_enqueue_listing_syndication_canary_v1(uuid, text, text, jsonb, text)
  from public, anon;
grant execute on function public.bridge_enqueue_listing_syndication_canary_v1(uuid, text, text, jsonb, text)
  to authenticated;

commit;
