begin;

-- Production websites are now available to more than one approved agency.
-- Keep the per-organisation enrolment gate: it is what prevents an
-- unapproved tenant from creating a site or accepting public leads.
drop index if exists public.website_pilot_enrolments_one_active_idx;

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
    raise exception 'Website creation requires an active production website enrolment for this organisation.' using errcode = '42501';
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
    raise exception 'Website lead capture requires an active production website enrolment for this organisation.' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on table public.website_pilot_enrolments is
  'Per-organisation production website enrolment allow-list. Multiple approved agencies may be active; site creation and lead capture remain tenant-scoped.';

comment on function public.website_bind_pilot_hostname(uuid, text) is
  'Binds a managed Vercel or PropData preview hostname for an actively enrolled organisation. It cannot alter client DNS or email records.';

notify pgrst, 'reload schema';
commit;
