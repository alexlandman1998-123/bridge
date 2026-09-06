begin;

create table public.website_pilot_enrolments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  cohort text not null default 'agency-v1',
  status text not null default 'planned'
    check (status in ('planned', 'active', 'paused', 'completed')),
  operator_notes text,
  configured_by text not null,
  activated_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_pilot_enrolments_cohort_check
    check (cohort = 'agency-v1'),
  constraint website_pilot_enrolments_notes_length_check
    check (operator_notes is null or char_length(operator_notes) <= 2000),
  constraint website_pilot_enrolments_configured_by_check
    check (char_length(trim(configured_by)) between 2 and 160)
);

create unique index website_pilot_enrolments_one_active_idx
  on public.website_pilot_enrolments ((status))
  where status = 'active';

drop trigger if exists trg_website_pilot_enrolments_updated_at on public.website_pilot_enrolments;
create trigger trg_website_pilot_enrolments_updated_at
before update on public.website_pilot_enrolments
for each row execute function public.set_updated_at_timestamp();

alter table public.website_pilot_enrolments enable row level security;
revoke all on table public.website_pilot_enrolments from public, anon, authenticated, service_role;
grant select on table public.website_pilot_enrolments to authenticated;
grant select, insert, update on table public.website_pilot_enrolments to service_role;

create policy website_pilot_enrolments_admin_select
on public.website_pilot_enrolments
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

create or replace function public.website_set_pilot_enrolment(
  p_organisation_id uuid,
  p_status text,
  p_configured_by text,
  p_operator_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_configured_by text := left(trim(coalesce(p_configured_by, '')), 160);
  v_notes text := nullif(left(trim(coalesce(p_operator_notes, '')), 2000), '');
  v_row public.website_pilot_enrolments%rowtype;
begin
  if p_organisation_id is null then
    raise exception 'A pilot organisation is required.' using errcode = '22023';
  end if;
  if v_status not in ('planned', 'active', 'paused', 'completed') then
    raise exception 'Pilot status must be planned, active, paused or completed.' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_configured_by) < 2 then
    raise exception 'A staging operator identity is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organisations organisation where organisation.id = p_organisation_id) then
    raise exception 'Pilot organisation not found.' using errcode = 'P0002';
  end if;

  insert into public.website_pilot_enrolments (
    organisation_id,
    status,
    operator_notes,
    configured_by,
    activated_at,
    paused_at,
    completed_at
  ) values (
    p_organisation_id,
    v_status,
    v_notes,
    v_configured_by,
    case when v_status = 'active' then now() else null end,
    case when v_status = 'paused' then now() else null end,
    case when v_status = 'completed' then now() else null end
  )
  on conflict (organisation_id) do update
  set status = excluded.status,
      operator_notes = excluded.operator_notes,
      configured_by = excluded.configured_by,
      activated_at = case
        when excluded.status = 'active' then coalesce(public.website_pilot_enrolments.activated_at, now())
        else public.website_pilot_enrolments.activated_at
      end,
      paused_at = case when excluded.status = 'paused' then now() else null end,
      completed_at = case when excluded.status = 'completed' then now() else null end
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'organisationId', v_row.organisation_id,
    'cohort', v_row.cohort,
    'status', v_row.status,
    'activatedAt', v_row.activated_at,
    'pausedAt', v_row.paused_at,
    'completedAt', v_row.completed_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.website_bind_pilot_hostname(
  p_organisation_id uuid,
  p_hostname text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hostname text := lower(trim(coalesce(p_hostname, '')));
  v_site_id uuid;
  v_existing public.website_domains%rowtype;
begin
  if v_hostname !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or not (
      v_hostname like '%.vercel.app'
      or v_hostname like '%.sites.propdata.co.za'
    ) then
    raise exception 'Phase 7 accepts only a Vercel preview hostname or managed PropData preview hostname.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.website_pilot_enrolments enrolment
    where enrolment.organisation_id = p_organisation_id
      and enrolment.status = 'active'
  ) then
    raise exception 'Activate this organisation in the Phase 7 pilot before binding a hostname.' using errcode = '42501';
  end if;

  select site.id into v_site_id
  from public.website_sites site
  where site.organisation_id = p_organisation_id;
  if v_site_id is null then
    raise exception 'Create the pilot website before binding its staging hostname.' using errcode = 'P0002';
  end if;

  select domain.* into v_existing
  from public.website_domains domain
  where pg_catalog.lower(domain.hostname) = v_hostname
  for update;
  if v_existing.id is not null and v_existing.website_site_id <> v_site_id then
    raise exception 'That hostname is already assigned to another website.' using errcode = '23505';
  end if;

  if v_existing.id is null then
    insert into public.website_domains (
      website_site_id, hostname, domain_kind, status, is_primary, dns_instructions
    ) values (
      v_site_id, v_hostname, 'preview', 'active', false,
      pg_catalog.jsonb_build_object(
        'managedBy', 'PropData',
        'environment', 'staging',
        'clientDnsRequired', false,
        'emailDnsRequired', false
      )
    ) returning * into v_existing;
  else
    update public.website_domains domain
    set domain_kind = 'preview',
        status = 'active',
        is_primary = false,
        dns_instructions = pg_catalog.jsonb_build_object(
          'managedBy', 'PropData',
          'environment', 'staging',
          'clientDnsRequired', false,
          'emailDnsRequired', false
        )
    where domain.id = v_existing.id
    returning * into v_existing;
  end if;

  return pg_catalog.jsonb_build_object(
    'websiteSiteId', v_site_id,
    'hostname', v_existing.hostname,
    'status', v_existing.status,
    'domainKind', v_existing.domain_kind
  );
end;
$$;

create or replace function public.website_require_active_pilot_for_site()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.website_pilot_enrolments enrolment
    where enrolment.organisation_id = new.organisation_id
      and enrolment.status = 'active'
  ) then
    raise exception 'Website creation is limited to the active Phase 7 pilot organisation.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.website_require_active_pilot_for_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.website_pilot_enrolments enrolment
    join public.website_sites site
      on site.organisation_id = enrolment.organisation_id
     and site.id = new.website_site_id
    where enrolment.organisation_id = new.organisation_id
      and enrolment.status = 'active'
  ) then
    raise exception 'Website lead capture is unavailable outside the active Phase 7 pilot.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_website_sites_active_pilot on public.website_sites;
create trigger trg_website_sites_active_pilot
before insert on public.website_sites
for each row execute function public.website_require_active_pilot_for_site();

drop trigger if exists trg_website_leads_active_pilot on public.website_lead_submissions;
create trigger trg_website_leads_active_pilot
before insert on public.website_lead_submissions
for each row execute function public.website_require_active_pilot_for_lead();

grant select on table public.website_sites to service_role;
grant select, insert, update on table public.website_domains to service_role;

revoke all on function public.website_set_pilot_enrolment(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.website_bind_pilot_hostname(uuid, text) from public, anon, authenticated;
revoke all on function public.website_require_active_pilot_for_site() from public, anon, authenticated, service_role;
revoke all on function public.website_require_active_pilot_for_lead() from public, anon, authenticated, service_role;
grant execute on function public.website_set_pilot_enrolment(uuid, text, text, text) to service_role;
grant execute on function public.website_bind_pilot_hostname(uuid, text) to service_role;

comment on table public.website_pilot_enrolments is
  'Fail-closed Phase 7 allow-list. At most one agency may be active while the first website template is piloted in staging.';
comment on function public.website_bind_pilot_hostname(uuid, text) is
  'Binds only a managed PropData or Vercel staging hostname. It cannot alter client DNS or email records.';

notify pgrst, 'reload schema';
commit;
