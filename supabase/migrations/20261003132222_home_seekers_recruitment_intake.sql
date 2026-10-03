begin;

-- Applications are independent of property leads and client records.
create table public.home_seekers_applications (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id),
  organisation_id uuid not null references public.organisations(id),
  recipient_user_id uuid not null references public.profiles(id),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (website_site_id, idempotency_key)
);
create index home_seekers_applications_rate_idx on public.home_seekers_applications (website_site_id, request_fingerprint, created_at);
alter table public.home_seekers_applications enable row level security;
revoke all on public.home_seekers_applications from public, anon, authenticated;
grant select on public.home_seekers_applications to authenticated;
grant select, insert on public.home_seekers_applications to service_role;
create policy home_seekers_applications_recipient on public.home_seekers_applications for select to authenticated using (
  recipient_user_id = auth.uid() and exists (
    select 1 from public.organisation_users member where member.organisation_id = home_seekers_applications.organisation_id
      and member.user_id = auth.uid() and member.status = 'active' and member.role in ('principal', 'admin', 'super_admin')
  )
);

-- Service-role only, with invoker privileges. No browser can execute this RPC.
create function public.home_seekers_capture_application(p_site_id uuid, p_hostname text, p_payload jsonb, p_idempotency_key text, p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_recipient uuid;
  v_id uuid;
begin
  select site.organisation_id into v_org from public.website_sites site
  join public.website_domains domain on domain.website_site_id = site.id
  where site.id = p_site_id and site.organisation_id = '2958d402-368e-43c9-b728-0098e10505f1'::uuid
    and site.status = 'published' and domain.status = 'active' and domain.hostname = p_hostname;
  if v_org is null then raise exception 'Published Home Seekers site not found' using errcode = 'P0002'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload->>'privacyAccepted', '') <> 'true'
    or coalesce(p_payload->>'pagePath', '') <> '/demo/homeseekers/join'
    or coalesce(p_payload->>'sales', '') !~ '^[0-9]{1,5}$'
    or (p_payload->>'sales')::integer > 10000
    or length(coalesce(p_payload->>'name', '')) not between 2 and 120
    or length(coalesce(p_payload->>'email', '')) not between 3 and 254
    or length(coalesce(p_payload->>'phone', '')) not between 9 and 30
    or length(coalesce(p_payload->>'area', '')) not between 2 and 120
    or length(coalesce(p_payload->>'message', '')) not between 1 and 3000 then
    raise exception 'Invalid recruitment application' using errcode = '22023';
  end if;
  -- Serialise retries and rate-limit checks so concurrent submissions cannot bypass them.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site_id::text || ':recruitment', 0));
  if exists (select 1 from public.home_seekers_applications where website_site_id = p_site_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('accepted', true, 'duplicate', true);
  end if;
  if (select count(*) from public.home_seekers_applications where website_site_id = p_site_id and request_fingerprint = p_fingerprint and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('accepted', false, 'rateLimited', true);
  end if;
  select member.user_id into v_recipient from public.organisation_users member
  join public.profiles profile on profile.id = member.user_id
  where member.organisation_id = v_org and member.status = 'active' and member.role in ('principal', 'admin', 'super_admin')
  order by case member.role when 'principal' then 0 when 'admin' then 1 else 2 end, member.is_primary_owner desc, member.updated_at desc, member.user_id limit 1;
  if v_recipient is null then raise exception 'No recruitment recipient available' using errcode = 'P0002'; end if;
  insert into public.home_seekers_applications (website_site_id, organisation_id, recipient_user_id, idempotency_key, request_fingerprint, payload_json)
  values (p_site_id, v_org, v_recipient, p_idempotency_key, p_fingerprint, p_payload) returning id into v_id;
  insert into public.transaction_notifications (transaction_id, user_id, role_type, notification_type, title, message, is_read, dedupe_key, event_type, event_data)
  values (null, v_recipient, 'agent', 'participant_assigned', 'New Home Seekers agent application',
    (p_payload->>'name') || ' — ' || (p_payload->>'area') || '. Registered sales: ' || (p_payload->>'sales') || '. Mobile: ' || (p_payload->>'phone') || '. Email: ' || (p_payload->>'email') || '. ' || (p_payload->>'message'),
    false, 'home-seekers-application:' || v_id::text, 'ParticipantAssigned', jsonb_build_object('notificationDomain', 'home_seekers_recruitment', 'applicationId', v_id));
  -- Count only accepted, newly persisted applications. Retries never inflate conversions.
  insert into public.website_analytics_daily (website_site_id, event_date, event_type, page_path, dimension_key, event_count)
  values (p_site_id, current_date, 'application_submitted', '/demo/homeseekers/join', 'path:/demo/homeseekers/join', 1)
  on conflict (website_site_id, event_date, event_type, page_path, dimension_key) do update set event_count = public.website_analytics_daily.event_count + 1;
  return jsonb_build_object('accepted', true, 'duplicate', false);
end;
$$;
revoke all on function public.home_seekers_capture_application(uuid,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.home_seekers_capture_application(uuid,text,jsonb,text,text) to service_role;
create policy home_seekers_application_notifications_read on public.transaction_notifications for select to authenticated using (
  user_id = auth.uid() and event_data->>'notificationDomain' = 'home_seekers_recruitment'
  and exists (select 1 from public.home_seekers_applications application where application.id::text = transaction_notifications.event_data->>'applicationId')
);
create policy home_seekers_application_notifications_update on public.transaction_notifications for update to authenticated using (
  user_id = auth.uid() and event_data->>'notificationDomain' = 'home_seekers_recruitment'
  and exists (select 1 from public.home_seekers_applications application where application.id::text = transaction_notifications.event_data->>'applicationId')
) with check (
  user_id = auth.uid() and event_data->>'notificationDomain' = 'home_seekers_recruitment'
  and exists (select 1 from public.home_seekers_applications application where application.id::text = transaction_notifications.event_data->>'applicationId')
);
alter table public.website_analytics_daily drop constraint website_analytics_daily_event_type_check;
alter table public.website_analytics_daily add constraint website_analytics_daily_event_type_check check (event_type in ('site_visit','page_view','listing_view','application_submitted','guarantee_opened','ppra_letter_opened'));
create or replace function public.website_record_analytics_event(
  p_hostname text,
  p_event_type text,
  p_page_path text,
  p_listing_id uuid default null
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_site_id uuid;
  v_host text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_hostname, '')));
  v_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_event_type, '')));
  v_path text := pg_catalog.left(pg_catalog.btrim(coalesce(p_page_path, '')), 2048);
  v_dimension text;
begin
  if v_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    or v_type not in ('site_visit', 'page_view', 'listing_view', 'guarantee_opened', 'ppra_letter_opened')
    or v_path !~ '^/[^[:space:]]*$' then
    raise exception 'Invalid website analytics event.' using errcode = '22023';
  end if;

  if v_type in ('guarantee_opened', 'ppra_letter_opened') and v_path <> '/demo/homeseekers/join' then
    raise exception 'Invalid recruitment conversion path.' using errcode = '22023';
  end if;

  select site.id into v_site_id
  from public.website_domains domain
  join public.website_sites site on site.id = domain.website_site_id
  where pg_catalog.lower(domain.hostname) = v_host
    and domain.status = 'active'
    and site.status = 'published'
  order by domain.is_primary desc, domain.created_at
  limit 1;

  if v_site_id is null then
    raise exception 'Published website not found.' using errcode = 'P0002';
  end if;

  if v_type = 'listing_view' then
    if p_listing_id is null or not exists (
      select 1 from public.website_listing_publications publication
      where publication.website_site_id = v_site_id
        and publication.listing_id = p_listing_id
        and publication.status = 'published'
    ) then
      raise exception 'Published website listing not found.' using errcode = 'P0002';
    end if;
    v_dimension := 'listing:' || p_listing_id::text;
  else
    if p_listing_id is not null then
      raise exception 'Only listing views may identify a listing.' using errcode = '22023';
    end if;
    v_dimension := 'path:' || v_path;
  end if;

  insert into public.website_analytics_daily (
    website_site_id, event_date, event_type, page_path, dimension_key, listing_id, event_count
  ) values (
    v_site_id, current_date, v_type, v_path, v_dimension, p_listing_id, 1
  ) on conflict (website_site_id, event_date, event_type, page_path, dimension_key)
  do update set event_count = public.website_analytics_daily.event_count + 1;
end;
$$;


commit;
