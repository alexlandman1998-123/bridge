begin;
create table if not exists public.attorney_firm_branding (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  logo_url text,
  logo_dark_url text,
  primary_colour text,
  secondary_colour text,
  email_signature_html text,
  letterhead_metadata jsonb not null default '{}'::jsonb,
  client_portal_theme jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_firm_branding_firm_unique unique (firm_id)
);
create index if not exists attorney_firm_branding_firm_idx
  on public.attorney_firm_branding (firm_id);
create or replace function public.seed_attorney_firm_branding_from_firm()
returns trigger
language plpgsql
as $$
begin
  insert into public.attorney_firm_branding (
    firm_id,
    logo_url,
    primary_colour,
    secondary_colour,
    created_by
  )
  values (
    new.id,
    new.logo_url,
    new.primary_colour,
    new.secondary_colour,
    new.created_by
  )
  on conflict (firm_id) do nothing;

  return new;
end;
$$;
drop trigger if exists trg_attorney_firms_seed_branding on public.attorney_firms;
create trigger trg_attorney_firms_seed_branding
after insert on public.attorney_firms
for each row
execute function public.seed_attorney_firm_branding_from_firm();
insert into public.attorney_firm_branding (firm_id, logo_url, primary_colour, secondary_colour, created_by)
select f.id, f.logo_url, f.primary_colour, f.secondary_colour, f.created_by
from public.attorney_firms f
left join public.attorney_firm_branding b on b.firm_id = f.id
where b.id is null;
create or replace function public.sync_attorney_firm_branding_to_firm()
returns trigger
language plpgsql
as $$
begin
  update public.attorney_firms
     set logo_url = coalesce(new.logo_url, logo_url),
         primary_colour = coalesce(new.primary_colour, primary_colour),
         secondary_colour = coalesce(new.secondary_colour, secondary_colour),
         updated_at = now()
   where id = new.firm_id;

  return new;
end;
$$;
drop trigger if exists trg_attorney_firm_branding_sync_to_firm on public.attorney_firm_branding;
create trigger trg_attorney_firm_branding_sync_to_firm
after insert or update on public.attorney_firm_branding
for each row
execute function public.sync_attorney_firm_branding_to_firm();
drop trigger if exists trg_attorney_firm_branding_updated_at on public.attorney_firm_branding;
create trigger trg_attorney_firm_branding_updated_at
before update on public.attorney_firm_branding
for each row
execute function public.set_updated_at_timestamp();
alter table public.attorney_firm_branding enable row level security;
drop policy if exists attorney_firm_branding_select_member on public.attorney_firm_branding;
create policy attorney_firm_branding_select_member on public.attorney_firm_branding
for select to authenticated
using (public.attorney_user_is_active_member(firm_id));
drop policy if exists attorney_firm_branding_manage_admin on public.attorney_firm_branding;
create policy attorney_firm_branding_manage_admin on public.attorney_firm_branding
for all to authenticated
using (public.attorney_user_is_firm_admin(firm_id))
with check (public.attorney_user_is_firm_admin(firm_id));
grant select, insert, update, delete on public.attorney_firm_branding to authenticated;
create or replace view public.attorney_team_members as
select
  m.id,
  m.firm_id,
  m.user_id,
  m.department_id,
  m.role,
  m.status,
  m.invited_by,
  m.joined_at,
  m.created_at,
  m.updated_at
from public.attorney_firm_members m;
grant select on public.attorney_team_members to authenticated;
create or replace view public.attorney_invites as
select
  i.id,
  i.firm_id,
  i.email,
  i.role,
  i.department_id,
  i.invited_by,
  i.token,
  i.status,
  i.expires_at,
  i.accepted_at,
  i.created_at,
  i.updated_at
from public.attorney_firm_invitations i;
grant select on public.attorney_invites to authenticated;
commit;
