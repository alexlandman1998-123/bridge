begin;

create extension if not exists "pgcrypto";

create table if not exists public.inbound_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  mobile text not null,
  role_type text not null,
  position text,
  organisation_name text not null,
  website text,
  location text,
  business_metrics jsonb not null default '{}'::jsonb,
  selected_interests text[] not null default array[]::text[],
  services text[] not null default array[]::text[],
  source text not null default 'other',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  landing_url text,
  status text not null default 'new',
  owner_id uuid references auth.users(id) on delete set null,
  notes text,
  source_payload jsonb not null default '{}'::jsonb,
  duplicate_count integer not null default 0,
  last_submission_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  converted_at timestamptz,
  converted_entity_id uuid,
  constraint inbound_leads_role_type_check
    check (role_type in ('developer', 'agency', 'bond_originator', 'attorney')),
  constraint inbound_leads_source_check
    check (source in ('instagram', 'facebook', 'linkedin', 'website', 'qr', 'email', 'direct', 'manual', 'other')),
  constraint inbound_leads_status_check
    check (status in ('new', 'contacted', 'demo_booked', 'trial_setup', 'onboarding', 'live', 'not_proceeding')),
  constraint inbound_leads_required_text_check
    check (
      length(trim(first_name)) > 0
      and length(trim(last_name)) > 0
      and length(trim(email)) > 0
      and length(trim(mobile)) > 0
      and length(trim(organisation_name)) > 0
    ),
  constraint inbound_leads_email_check
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254),
  constraint inbound_leads_mobile_check
    check (
      regexp_replace(mobile, '[^0-9]+', '', 'g') ~ '^(0[6-8][0-9]{8}|27[6-8][0-9]{8}|[6-8][0-9]{8})$'
    ),
  constraint inbound_leads_metrics_check
    check (jsonb_typeof(business_metrics) = 'object' and octet_length(business_metrics::text) <= 32768),
  constraint inbound_leads_payload_check
    check (jsonb_typeof(source_payload) = 'object' and octet_length(source_payload::text) <= 65536),
  constraint inbound_leads_duplicate_count_check
    check (duplicate_count >= 0)
);

create index if not exists inbound_leads_status_created_idx
  on public.inbound_leads (status, created_at desc);
create index if not exists inbound_leads_role_created_idx
  on public.inbound_leads (role_type, created_at desc);
create index if not exists inbound_leads_source_created_idx
  on public.inbound_leads (source, created_at desc);
create index if not exists inbound_leads_owner_created_idx
  on public.inbound_leads (owner_id, created_at desc)
  where owner_id is not null;
create index if not exists inbound_leads_email_idx
  on public.inbound_leads (lower(trim(email)));
create index if not exists inbound_leads_mobile_digits_idx
  on public.inbound_leads (regexp_replace(mobile, '[^0-9]+', '', 'g'));
create index if not exists inbound_leads_org_name_idx
  on public.inbound_leads (lower(trim(organisation_name)));
create index if not exists inbound_leads_campaign_idx
  on public.inbound_leads (utm_source, utm_campaign, created_at desc);

drop trigger if exists inbound_leads_set_updated_at on public.inbound_leads;
create trigger inbound_leads_set_updated_at
before update on public.inbound_leads
for each row execute function public.bridge_set_updated_at();

create table if not exists public.inbound_lead_activities (
  id uuid primary key default gen_random_uuid(),
  inbound_lead_id uuid not null references public.inbound_leads(id) on delete cascade,
  event_type text not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inbound_lead_activities_event_type_check
    check (event_type in (
      'created',
      'repeat_submission',
      'owner_changed',
      'status_changed',
      'note_added',
      'contact_made',
      'demo_scheduled',
      'setup_started',
      'converted_live',
      'not_proceeding',
      'manual_update'
    )),
  constraint inbound_lead_activities_metadata_check
    check (jsonb_typeof(metadata_json) = 'object' and octet_length(metadata_json::text) <= 16384)
);

create index if not exists inbound_lead_activities_lead_created_idx
  on public.inbound_lead_activities (inbound_lead_id, created_at desc);
create index if not exists inbound_lead_activities_event_created_idx
  on public.inbound_lead_activities (event_type, created_at desc);

create table if not exists public.inbound_lead_submissions (
  id uuid primary key default gen_random_uuid(),
  inbound_lead_id uuid not null references public.inbound_leads(id) on delete cascade,
  idempotency_key text,
  source text not null default 'other',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  landing_url text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inbound_lead_submissions_source_check
    check (source in ('instagram', 'facebook', 'linkedin', 'website', 'qr', 'email', 'direct', 'manual', 'other')),
  constraint inbound_lead_submissions_payload_check
    check (jsonb_typeof(payload_json) = 'object' and octet_length(payload_json::text) <= 65536),
  constraint inbound_lead_submissions_idempotency_check
    check (idempotency_key is null or (char_length(idempotency_key) between 12 and 128 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'))
);

create unique index if not exists inbound_lead_submissions_idempotency_unique_idx
  on public.inbound_lead_submissions (idempotency_key)
  where idempotency_key is not null;
create index if not exists inbound_lead_submissions_lead_created_idx
  on public.inbound_lead_submissions (inbound_lead_id, created_at desc);

alter table public.inbound_leads enable row level security;
alter table public.inbound_lead_activities enable row level security;
alter table public.inbound_lead_submissions enable row level security;

revoke all on table public.inbound_leads from public, anon, authenticated;
revoke all on table public.inbound_lead_activities from public, anon, authenticated;
revoke all on table public.inbound_lead_submissions from public, anon, authenticated;

grant select, insert, update on table public.inbound_leads to authenticated;
grant select, insert on table public.inbound_lead_activities to authenticated;
grant select, insert on table public.inbound_lead_submissions to authenticated;
grant all on table public.inbound_leads to service_role;
grant all on table public.inbound_lead_activities to service_role;
grant all on table public.inbound_lead_submissions to service_role;

drop policy if exists inbound_leads_admin_select on public.inbound_leads;
create policy inbound_leads_admin_select
  on public.inbound_leads
  for select
  to authenticated
  using ((select public.arch9_admin_can_access_dashboard()));

drop policy if exists inbound_leads_admin_insert on public.inbound_leads;
create policy inbound_leads_admin_insert
  on public.inbound_leads
  for insert
  to authenticated
  with check ((select public.arch9_admin_can_access_dashboard()));

drop policy if exists inbound_leads_admin_update on public.inbound_leads;
create policy inbound_leads_admin_update
  on public.inbound_leads
  for update
  to authenticated
  using ((select public.arch9_admin_can_access_dashboard()))
  with check ((select public.arch9_admin_can_access_dashboard()));

drop policy if exists inbound_lead_activities_admin_select on public.inbound_lead_activities;
create policy inbound_lead_activities_admin_select
  on public.inbound_lead_activities
  for select
  to authenticated
  using ((select public.arch9_admin_can_access_dashboard()));

drop policy if exists inbound_lead_activities_admin_insert on public.inbound_lead_activities;
create policy inbound_lead_activities_admin_insert
  on public.inbound_lead_activities
  for insert
  to authenticated
  with check ((select public.arch9_admin_can_access_dashboard()));

drop policy if exists inbound_lead_submissions_admin_select on public.inbound_lead_submissions;
create policy inbound_lead_submissions_admin_select
  on public.inbound_lead_submissions
  for select
  to authenticated
  using ((select public.arch9_admin_can_access_dashboard()));

create or replace function public.arch9_inbound_source(
  p_source text,
  p_medium text,
  p_referrer text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_source text := lower(trim(coalesce(p_source, '')));
  v_medium text := lower(trim(coalesce(p_medium, '')));
  v_referrer text := lower(trim(coalesce(p_referrer, '')));
begin
  if v_source in ('instagram', 'ig') or v_referrer like '%instagram.%' then return 'instagram'; end if;
  if v_source in ('facebook', 'fb', 'meta') or v_referrer like '%facebook.%' or v_referrer like '%fb.%' then return 'facebook'; end if;
  if v_source = 'linkedin' or v_referrer like '%linkedin.%' then return 'linkedin'; end if;
  if v_source in ('qr', 'qrcode', 'qr_code') or v_medium = 'qr' then return 'qr'; end if;
  if v_source in ('email', 'newsletter') or v_medium = 'email' then return 'email'; end if;
  if v_source in ('website', 'web', 'site') or v_referrer like '%arch9.%' then return 'website'; end if;
  if v_source = 'manual' then return 'manual'; end if;
  if v_source = 'direct' or (v_source = '' and v_referrer = '') then return 'direct'; end if;
  return 'other';
end;
$$;

create or replace function public.arch9_inbound_array_union(p_left text[], p_right text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct value order by value), array[]::text[])
  from (
    select nullif(trim(left_value), '') as value
    from unnest(coalesce(p_left, array[]::text[])) as left_items(left_value)
    union all
    select nullif(trim(right_value), '') as value
    from unnest(coalesce(p_right, array[]::text[])) as right_items(right_value)
  ) collected_values
  where value is not null;
$$;

create or replace function public.arch9_inbound_text_array(p_json jsonb)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result text[] := array[]::text[];
  v_value text;
begin
  if jsonb_typeof(p_json) <> 'array' then
    return v_result;
  end if;

  for v_value in select jsonb_array_elements_text(p_json) loop
    v_value := nullif(trim(v_value), '');
    if v_value is not null and char_length(v_value) <= 160 then
      v_result := array_append(v_result, v_value);
    end if;
  end loop;

  return public.arch9_inbound_array_union(array[]::text[], v_result);
end;
$$;

create or replace function public.arch9_inbound_activity(
  p_lead_id uuid,
  p_event_type text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
begin
  insert into public.inbound_lead_activities (
    inbound_lead_id,
    event_type,
    note,
    actor_user_id,
    metadata_json
  )
  values (
    p_lead_id,
    p_event_type,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_activity_id;

  return v_activity_id;
end;
$$;

revoke all on function public.arch9_inbound_activity(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.arch9_inbound_activity(uuid, text, text, jsonb) to authenticated, service_role;

create or replace function public.submit_arch9_inbound_lead(
  p_payload jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_submission public.inbound_lead_submissions%rowtype;
  v_lead public.inbound_leads%rowtype;
  v_lead_id uuid;
  v_first_name text := nullif(trim(coalesce(p_payload ->> 'first_name', '')), '');
  v_last_name text := nullif(trim(coalesce(p_payload ->> 'last_name', '')), '');
  v_email text := lower(trim(coalesce(p_payload ->> 'email', '')));
  v_mobile text := nullif(trim(coalesce(p_payload ->> 'mobile', '')), '');
  v_mobile_digits text := regexp_replace(coalesce(p_payload ->> 'mobile', ''), '[^0-9]+', '', 'g');
  v_role_type text := lower(trim(coalesce(p_payload ->> 'role_type', '')));
  v_position text := nullif(trim(coalesce(p_payload ->> 'position', '')), '');
  v_organisation_name text := nullif(trim(coalesce(p_payload ->> 'organisation_name', '')), '');
  v_website text := nullif(trim(coalesce(p_payload ->> 'website', '')), '');
  v_location text := nullif(trim(coalesce(p_payload ->> 'location', '')), '');
  v_business_metrics jsonb := coalesce(p_payload -> 'business_metrics', '{}'::jsonb);
  v_interests text[] := public.arch9_inbound_text_array(coalesce(p_payload -> 'selected_interests', '[]'::jsonb));
  v_services text[] := public.arch9_inbound_text_array(coalesce(p_payload -> 'services', '[]'::jsonb));
  v_source text;
  v_duplicate boolean := false;
  v_now timestamptz := now();
begin
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception 'Invalid inbound lead payload';
  end if;

  if p_idempotency_key is not null
    and (char_length(p_idempotency_key) not between 12 and 128 or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$') then
    raise exception 'Invalid idempotency key';
  end if;

  if p_idempotency_key is not null then
    select *
      into v_existing_submission
    from public.inbound_lead_submissions
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return jsonb_build_object('accepted', true, 'duplicate', true, 'lead_id', v_existing_submission.inbound_lead_id);
    end if;
  end if;

  if v_role_type = 'estate_agency' then v_role_type := 'agency'; end if;
  if v_role_type = 'bond originator' then v_role_type := 'bond_originator'; end if;

  if v_first_name is null or char_length(v_first_name) > 120 then
    raise exception 'First name is required';
  end if;
  if v_last_name is null or char_length(v_last_name) > 120 then
    raise exception 'Last name is required';
  end if;
  if v_email = '' or char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid work email is required';
  end if;
  if v_mobile is null or v_mobile_digits !~ '^(0[6-8][0-9]{8}|27[6-8][0-9]{8}|[6-8][0-9]{8})$' then
    raise exception 'A valid South African mobile number is required';
  end if;
  if v_role_type not in ('developer', 'agency', 'bond_originator', 'attorney') then
    raise exception 'A valid role is required';
  end if;
  if v_organisation_name is null or char_length(v_organisation_name) > 180 then
    raise exception 'Organisation name is required';
  end if;
  if jsonb_typeof(v_business_metrics) <> 'object' or octet_length(v_business_metrics::text) > 32768 then
    raise exception 'Invalid business metrics';
  end if;

  v_source := public.arch9_inbound_source(
    coalesce(p_payload ->> 'utm_source', p_payload ->> 'source'),
    p_payload ->> 'utm_medium',
    p_payload ->> 'referrer'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_mobile_digits || ':' || lower(v_organisation_name), 0));

  select *
    into v_lead
  from public.inbound_leads lead
  where lower(trim(lead.email)) = v_email
     or regexp_replace(lead.mobile, '[^0-9]+', '', 'g') = v_mobile_digits
     or lower(trim(lead.organisation_name)) = lower(trim(v_organisation_name))
  order by
    case when lower(trim(email)) = v_email then 0 else 1 end,
    case when regexp_replace(mobile, '[^0-9]+', '', 'g') = v_mobile_digits then 0 else 1 end,
    created_at desc
  limit 1;

  if found then
    v_duplicate := true;
    v_lead_id := v_lead.id;

    update public.inbound_leads
    set first_name = v_first_name,
        last_name = v_last_name,
        email = v_email,
        mobile = v_mobile,
        role_type = v_role_type,
        position = coalesce(v_position, position),
        organisation_name = v_organisation_name,
        website = coalesce(v_website, website),
        location = coalesce(v_location, location),
        business_metrics = coalesce(business_metrics, '{}'::jsonb) || v_business_metrics,
        selected_interests = public.arch9_inbound_array_union(selected_interests, v_interests),
        services = public.arch9_inbound_array_union(services, v_services),
        source = coalesce(nullif(source, 'direct'), v_source),
        utm_source = coalesce(nullif(trim(coalesce(p_payload ->> 'utm_source', '')), ''), utm_source),
        utm_medium = coalesce(nullif(trim(coalesce(p_payload ->> 'utm_medium', '')), ''), utm_medium),
        utm_campaign = coalesce(nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''), utm_campaign),
        utm_content = coalesce(nullif(trim(coalesce(p_payload ->> 'utm_content', '')), ''), utm_content),
        referrer = coalesce(nullif(trim(coalesce(p_payload ->> 'referrer', '')), ''), referrer),
        landing_url = coalesce(nullif(trim(coalesce(p_payload ->> 'landing_url', '')), ''), landing_url),
        source_payload = coalesce(source_payload, '{}'::jsonb) || p_payload,
        duplicate_count = duplicate_count + 1,
        last_submission_at = v_now,
        updated_by = auth.uid()
    where id = v_lead_id;

    perform public.arch9_inbound_activity(
      v_lead_id,
      'repeat_submission',
      'Repeat inbound submission received and merged.',
      jsonb_build_object('source', v_source, 'idempotency_key', p_idempotency_key)
    );
  else
    insert into public.inbound_leads (
      first_name,
      last_name,
      email,
      mobile,
      role_type,
      position,
      organisation_name,
      website,
      location,
      business_metrics,
      selected_interests,
      services,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      referrer,
      landing_url,
      source_payload,
      last_submission_at,
      created_by,
      updated_by
    )
    values (
      v_first_name,
      v_last_name,
      v_email,
      v_mobile,
      v_role_type,
      v_position,
      v_organisation_name,
      v_website,
      v_location,
      v_business_metrics,
      v_interests,
      v_services,
      v_source,
      nullif(trim(coalesce(p_payload ->> 'utm_source', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'utm_medium', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'utm_content', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'referrer', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'landing_url', '')), ''),
      p_payload,
      v_now,
      auth.uid(),
      auth.uid()
    )
    returning id into v_lead_id;

    perform public.arch9_inbound_activity(
      v_lead_id,
      'created',
      'Inbound lead created from public intake.',
      jsonb_build_object('source', v_source, 'campaign', nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''))
    );
  end if;

  insert into public.inbound_lead_submissions (
    inbound_lead_id,
    idempotency_key,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer,
    landing_url,
    payload_json
  )
  values (
    v_lead_id,
    p_idempotency_key,
    v_source,
    nullif(trim(coalesce(p_payload ->> 'utm_source', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'utm_medium', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'utm_campaign', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'utm_content', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'referrer', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'landing_url', '')), ''),
    p_payload
  )
  on conflict (idempotency_key) where (idempotency_key is not null) do nothing;

  return jsonb_build_object('accepted', true, 'duplicate', v_duplicate, 'lead_id', v_lead_id);
end;
$$;

revoke all on function public.submit_arch9_inbound_lead(jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_arch9_inbound_lead(jsonb, text) to anon, authenticated, service_role;

create or replace function public.arch9_admin_inbound_leads_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leads jsonb;
  v_activities jsonb;
  v_owners jsonb;
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
    into v_leads
  from (
    select
      lead.*,
      owner.email as owner_email,
      owner.full_name as owner_name
    from public.inbound_leads lead
    left join public.profiles owner on owner.id = lead.owner_id
    order by lead.created_at desc
    limit 1000
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
    into v_activities
  from (
    select
      activity.*,
      actor.email as actor_email,
      actor.full_name as actor_name
    from public.inbound_lead_activities activity
    left join public.profiles actor on actor.id = activity.actor_user_id
    order by activity.created_at desc
    limit 1000
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.full_name nulls last, row_data.email), '[]'::jsonb)
    into v_owners
  from (
    select id, full_name, email, role, status
    from public.profiles
    where coalesce(lower(trim(status)), 'active') not in ('disabled', 'inactive', 'deleted')
    order by full_name nulls last, email
    limit 200
  ) row_data;

  return jsonb_build_object(
    'generatedAt', now(),
    'leads', coalesce(v_leads, '[]'::jsonb),
    'activities', coalesce(v_activities, '[]'::jsonb),
    'owners', coalesce(v_owners, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.arch9_admin_inbound_leads_snapshot() from public, anon, authenticated;
grant execute on function public.arch9_admin_inbound_leads_snapshot() to authenticated, service_role;

create or replace function public.arch9_admin_update_inbound_lead(
  p_lead_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.inbound_leads%rowtype;
  v_new public.inbound_leads%rowtype;
  v_status text;
  v_owner_id uuid;
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select * into v_old
  from public.inbound_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  v_status := nullif(trim(coalesce(p_patch ->> 'status', '')), '');
  if v_status is not null and v_status not in ('new', 'contacted', 'demo_booked', 'trial_setup', 'onboarding', 'live', 'not_proceeding') then
    raise exception 'Invalid inbound lead status';
  end if;

  v_owner_id := case
    when p_patch ? 'owner_id' and nullif(trim(coalesce(p_patch ->> 'owner_id', '')), '') is not null
      then (p_patch ->> 'owner_id')::uuid
    else null
  end;

  update public.inbound_leads
  set status = coalesce(v_status, status),
      owner_id = case when p_patch ? 'owner_id' then v_owner_id else owner_id end,
      converted_at = case
        when coalesce(v_status, status) = 'live' and converted_at is null then now()
        else converted_at
      end,
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_new;

  if v_status is not null and v_status is distinct from v_old.status then
    perform public.arch9_inbound_activity(
      p_lead_id,
      case
        when v_status = 'live' then 'converted_live'
        when v_status = 'not_proceeding' then 'not_proceeding'
        when v_status = 'demo_booked' then 'demo_scheduled'
        when v_status = 'trial_setup' then 'setup_started'
        when v_status = 'contacted' then 'contact_made'
        else 'status_changed'
      end,
      'Status changed from ' || v_old.status || ' to ' || v_status || '.',
      jsonb_build_object('from', v_old.status, 'to', v_status)
    );
  end if;

  if p_patch ? 'owner_id' and v_owner_id is distinct from v_old.owner_id then
    perform public.arch9_inbound_activity(
      p_lead_id,
      'owner_changed',
      'Owner assignment updated.',
      jsonb_build_object('from', v_old.owner_id, 'to', v_owner_id)
    );
  end if;

  return to_jsonb(v_new);
end;
$$;

revoke all on function public.arch9_admin_update_inbound_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.arch9_admin_update_inbound_lead(uuid, jsonb) to authenticated, service_role;

create or replace function public.arch9_admin_add_inbound_lead_note(
  p_lead_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_lead public.inbound_leads%rowtype;
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  if v_note is null or char_length(v_note) > 4000 then
    raise exception 'A note between 1 and 4000 characters is required';
  end if;

  update public.inbound_leads
  set notes = concat_ws(E'\n\n', nullif(notes, ''), to_char(now(), 'YYYY-MM-DD HH24:MI') || ' - ' || v_note),
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  perform public.arch9_inbound_activity(p_lead_id, 'note_added', v_note, '{}'::jsonb);

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_add_inbound_lead_note(uuid, text) from public, anon, authenticated;
grant execute on function public.arch9_admin_add_inbound_lead_note(uuid, text) to authenticated, service_role;

create or replace function public.arch9_admin_mark_inbound_lead_converted(
  p_lead_id uuid,
  p_converted_entity_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.inbound_leads%rowtype;
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  if p_converted_entity_id is not null
    and not exists (select 1 from public.organisations organisation where organisation.id = p_converted_entity_id) then
    raise exception 'Converted organisation does not exist';
  end if;

  update public.inbound_leads
  set status = 'live',
      converted_at = coalesce(converted_at, now()),
      converted_entity_id = coalesce(p_converted_entity_id, converted_entity_id),
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  perform public.arch9_inbound_activity(
    p_lead_id,
    'converted_live',
    'Inbound lead marked as live.',
    jsonb_build_object('converted_entity_id', p_converted_entity_id)
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_mark_inbound_lead_converted(uuid, uuid) from public, anon, authenticated;
grant execute on function public.arch9_admin_mark_inbound_lead_converted(uuid, uuid) to authenticated, service_role;

comment on table public.inbound_leads is
  'Pre-organisation Arch9 inbound leads captured from the public social intake journey and managed by internal admins.';
comment on column public.inbound_leads.business_metrics is
  'Flexible role-specific scale fields such as agent counts, active developments, applications per month, or property matters per month.';
comment on column public.inbound_leads.selected_interests is
  'Role-specific interest areas selected during guided intake; preserved for acquisition reporting.';
comment on table public.inbound_lead_activities is
  'Activity timeline for inbound lead management: creation, repeat submissions, owner changes, status changes and notes.';
comment on table public.inbound_lead_submissions is
  'Immutable submission receipts preserving UTM/referrer/landing metadata for acquisition reporting and duplicate handling.';

notify pgrst, 'reload schema';
commit;
