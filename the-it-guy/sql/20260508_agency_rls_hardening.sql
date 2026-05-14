begin;

-- ---------------------------------------------
-- Helper functions for agency tenant isolation
-- ---------------------------------------------

create or replace function public.bridge_current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.bridge_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case lower(trim(coalesce(ou.role, '')))
      when 'administrator' then 'admin'
      when 'owner' then 'principal'
      when 'superadmin' then 'super_admin'
      when 'branch_admin' then 'branch_manager'
      when 'branch manager' then 'branch_manager'
      when 'principal / owner' then 'principal'
      else lower(trim(coalesce(ou.role, '')))
    end
  from public.organisation_users ou
  where ou.organisation_id = target_org
    and ou.user_id = auth.uid()
    and ou.status = 'active'
  order by ou.created_at asc
  limit 1;
$$;

create or replace function public.bridge_is_active_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  );
$$;

create or replace function public.bridge_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_membership_role(target_org) in ('super_admin', 'principal', 'admin', 'developer', 'branch_manager'),
    false
  );
$$;

create or replace function public.bridge_can_access_assignment(target_org uuid, assigned_user uuid, assigned_email text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_value text;
  current_email text;
begin
  role_value := public.bridge_membership_role(target_org);
  if role_value is null then
    return false;
  end if;

  if role_value in ('super_admin', 'principal', 'admin', 'developer', 'branch_manager') then
    return true;
  end if;

  current_email := public.bridge_current_email();

  if role_value = 'agent' then
    return coalesce(assigned_user = auth.uid(), false)
      or (coalesce(assigned_email, '') <> '' and lower(assigned_email) = current_email);
  end if;

  if role_value in ('attorney', 'bond_originator') then
    return coalesce(assigned_user = auth.uid(), false)
      or (coalesce(assigned_email, '') <> '' and lower(assigned_email) = current_email);
  end if;

  return false;
end;
$$;

create or replace function public.bridge_can_access_transaction(
  target_org uuid,
  assigned_user uuid,
  owner_user uuid,
  assigned_agent_email text,
  assigned_attorney_email text,
  assigned_bond_originator_email text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_value text;
  current_email text;
begin
  role_value := public.bridge_membership_role(target_org);
  if role_value is null then
    return false;
  end if;

  if role_value in ('super_admin', 'principal', 'admin', 'developer', 'branch_manager') then
    return true;
  end if;

  current_email := public.bridge_current_email();

  if role_value = 'agent' then
    return coalesce(assigned_user = auth.uid(), false)
      or coalesce(owner_user = auth.uid(), false)
      or (coalesce(assigned_agent_email, '') <> '' and lower(assigned_agent_email) = current_email);
  end if;

  if role_value = 'attorney' then
    return coalesce(assigned_user = auth.uid(), false)
      or coalesce(owner_user = auth.uid(), false)
      or (coalesce(assigned_attorney_email, '') <> '' and lower(assigned_attorney_email) = current_email);
  end if;

  if role_value = 'bond_originator' then
    return coalesce(assigned_user = auth.uid(), false)
      or coalesce(owner_user = auth.uid(), false)
      or (coalesce(assigned_bond_originator_email, '') <> '' and lower(assigned_bond_originator_email) = current_email);
  end if;

  return false;
end;
$$;

create or replace function public.bridge_claim_pending_org_invite()
returns table (
  id uuid,
  organisation_id uuid,
  role text,
  status text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_email text;
begin
  invite_email := public.bridge_current_email();
  if auth.uid() is null or coalesce(invite_email, '') = '' then
    return;
  end if;

  return query
  update public.organisation_users ou
    set user_id = auth.uid(),
        status = 'active',
        accepted_at = now(),
        joined_at = coalesce(ou.joined_at, now()),
        updated_at = now()
  where ou.id = (
    select inner_ou.id
    from public.organisation_users inner_ou
    where lower(inner_ou.email) = invite_email
      and inner_ou.status = 'invited'
      and (inner_ou.invitation_expires_at is null or inner_ou.invitation_expires_at > now())
    order by inner_ou.created_at asc
    limit 1
  )
  returning ou.id, ou.organisation_id, ou.role, ou.status, ou.email;
end;
$$;

create or replace function public.bridge_claim_org_invite(invite_token text)
returns table (
  id uuid,
  organisation_id uuid,
  role text,
  status text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_email text;
  normalized_token text;
begin
  invite_email := public.bridge_current_email();
  normalized_token := nullif(trim(invite_token), '');

  if auth.uid() is null or coalesce(invite_email, '') = '' or normalized_token is null then
    return;
  end if;

  return query
  update public.organisation_users ou
    set user_id = auth.uid(),
        status = 'active',
        accepted_at = now(),
        joined_at = coalesce(ou.joined_at, now()),
        updated_at = now()
  where ou.id = (
    select inner_ou.id
    from public.organisation_users inner_ou
    where inner_ou.invitation_token = normalized_token
      and lower(inner_ou.email) = invite_email
      and inner_ou.status = 'invited'
      and (inner_ou.invitation_expires_at is null or inner_ou.invitation_expires_at > now())
    order by inner_ou.created_at asc
    limit 1
  )
  returning ou.id, ou.organisation_id, ou.role, ou.status, ou.email;
end;
$$;

grant execute on function public.bridge_current_email() to authenticated;
grant execute on function public.bridge_membership_role(uuid) to authenticated;
grant execute on function public.bridge_is_active_member(uuid) to authenticated;
grant execute on function public.bridge_is_org_admin(uuid) to authenticated;
grant execute on function public.bridge_can_access_assignment(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_can_access_transaction(uuid, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.bridge_claim_pending_org_invite() to authenticated;
grant execute on function public.bridge_claim_org_invite(text) to authenticated;

-- ---------------------------------------------
-- Enable RLS on agency-owned tables
-- ---------------------------------------------
alter table if exists public.organisations enable row level security;
alter table if exists public.organisation_users enable row level security;
alter table if exists public.organisation_branches enable row level security;
alter table if exists public.organisation_settings enable row level security;
alter table if exists public.organisation_preferred_partners enable row level security;
alter table if exists public.contacts enable row level security;
alter table if exists public.leads enable row level security;
alter table if exists public.lead_activities enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.appointments enable row level security;
alter table if exists public.crm_deals enable row level security;
alter table if exists public.transactions enable row level security;

-- Remove legacy permissive policy on transactions
drop policy if exists transactions_demo_all on public.transactions;

-- ---------------------------------------------
-- organisations
-- ---------------------------------------------
drop policy if exists organisations_agency_select on public.organisations;
create policy organisations_agency_select on public.organisations
for select to authenticated
using (
  public.bridge_is_active_member(id)
  or exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = organisations.id
      and ou.status = 'invited'
      and lower(ou.email) = public.bridge_current_email()
  )
);

drop policy if exists organisations_agency_insert on public.organisations;
create policy organisations_agency_insert on public.organisations
for insert to authenticated
with check (auth.uid() is not null);

drop policy if exists organisations_agency_update on public.organisations;
create policy organisations_agency_update on public.organisations
for update to authenticated
using (public.bridge_is_org_admin(id))
with check (public.bridge_is_org_admin(id));

drop policy if exists organisations_agency_delete on public.organisations;
create policy organisations_agency_delete on public.organisations
for delete to authenticated
using (public.bridge_is_org_admin(id));

-- ---------------------------------------------
-- organisation_users
-- ---------------------------------------------
drop policy if exists organisation_users_agency_select on public.organisation_users;
create policy organisation_users_agency_select on public.organisation_users
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or (status = 'invited' and lower(email) = public.bridge_current_email())
);

drop policy if exists organisation_users_agency_insert on public.organisation_users;
create policy organisation_users_agency_insert on public.organisation_users
for insert to authenticated
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    auth.uid() is not null
    and user_id = auth.uid()
    and lower(email) = public.bridge_current_email()
  )
);

drop policy if exists organisation_users_agency_update on public.organisation_users;
create policy organisation_users_agency_update on public.organisation_users
for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_users_agency_delete on public.organisation_users;
create policy organisation_users_agency_delete on public.organisation_users
for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));

-- ---------------------------------------------
-- organisation branches / settings / partners
-- ---------------------------------------------
drop policy if exists organisation_branches_agency_select on public.organisation_branches;
create policy organisation_branches_agency_select on public.organisation_branches
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_branches_agency_write on public.organisation_branches;
create policy organisation_branches_agency_write on public.organisation_branches
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_settings_agency_select on public.organisation_settings;
create policy organisation_settings_agency_select on public.organisation_settings
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_settings_agency_write on public.organisation_settings;
create policy organisation_settings_agency_write on public.organisation_settings
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_preferred_partners_agency_select on public.organisation_preferred_partners;
create policy organisation_preferred_partners_agency_select on public.organisation_preferred_partners
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_preferred_partners_agency_write on public.organisation_preferred_partners;
create policy organisation_preferred_partners_agency_write on public.organisation_preferred_partners
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

-- ---------------------------------------------
-- contacts
-- ---------------------------------------------
drop policy if exists contacts_agency_select on public.contacts;
create policy contacts_agency_select on public.contacts
for select to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null));

drop policy if exists contacts_agency_write on public.contacts;
create policy contacts_agency_write on public.contacts
for all to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null))
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and assigned_agent_id = auth.uid()
  )
);

-- ---------------------------------------------
-- leads
-- ---------------------------------------------
drop policy if exists leads_agency_select on public.leads;
create policy leads_agency_select on public.leads
for select to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null));

drop policy if exists leads_agency_write on public.leads;
create policy leads_agency_write on public.leads
for all to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null))
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and assigned_agent_id = auth.uid()
  )
);

-- ---------------------------------------------
-- lead activities
-- ---------------------------------------------
drop policy if exists lead_activities_agency_select on public.lead_activities;
create policy lead_activities_agency_select on public.lead_activities
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or exists (
    select 1
    from public.leads l
    where l.lead_id = lead_activities.lead_id
      and l.organisation_id = lead_activities.organisation_id
      and l.assigned_agent_id = auth.uid()
      and public.bridge_membership_role(lead_activities.organisation_id) = 'agent'
  )
);

drop policy if exists lead_activities_agency_write on public.lead_activities;
create policy lead_activities_agency_write on public.lead_activities
for all to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_activities.lead_id
        and l.organisation_id = lead_activities.organisation_id
        and l.assigned_agent_id = auth.uid()
    )
  )
);

-- ---------------------------------------------
-- tasks
-- ---------------------------------------------
drop policy if exists tasks_agency_select on public.tasks;
create policy tasks_agency_select on public.tasks
for select to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null));

drop policy if exists tasks_agency_write on public.tasks;
create policy tasks_agency_write on public.tasks
for all to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null))
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and assigned_agent_id = auth.uid()
  )
);

-- ---------------------------------------------
-- appointments
-- ---------------------------------------------
drop policy if exists appointments_agency_select on public.appointments;
create policy appointments_agency_select on public.appointments
for select to authenticated
using (public.bridge_can_access_assignment(organisation_id, agent_id, null));

drop policy if exists appointments_agency_write on public.appointments;
create policy appointments_agency_write on public.appointments
for all to authenticated
using (public.bridge_can_access_assignment(organisation_id, agent_id, null))
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
  )
);

-- ---------------------------------------------
-- crm_deals (agency deal entity)
-- ---------------------------------------------
drop policy if exists crm_deals_agency_select on public.crm_deals;
create policy crm_deals_agency_select on public.crm_deals
for select to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null));

drop policy if exists crm_deals_agency_write on public.crm_deals;
create policy crm_deals_agency_write on public.crm_deals
for all to authenticated
using (public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null))
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and assigned_agent_id = auth.uid()
  )
);

-- ---------------------------------------------
-- transactions (core operational workspace)
-- ---------------------------------------------
drop policy if exists transactions_agency_select on public.transactions;
create policy transactions_agency_select on public.transactions
for select to authenticated
using (
  public.bridge_can_access_transaction(
    organisation_id,
    assigned_user_id,
    owner_user_id,
    assigned_agent_email,
    assigned_attorney_email,
    assigned_bond_originator_email
  )
);

drop policy if exists transactions_agency_insert on public.transactions;
create policy transactions_agency_insert on public.transactions
for insert to authenticated
with check (
  public.bridge_can_access_transaction(
    organisation_id,
    assigned_user_id,
    owner_user_id,
    assigned_agent_email,
    assigned_attorney_email,
    assigned_bond_originator_email
  )
);

drop policy if exists transactions_agency_update on public.transactions;
create policy transactions_agency_update on public.transactions
for update to authenticated
using (
  public.bridge_can_access_transaction(
    organisation_id,
    assigned_user_id,
    owner_user_id,
    assigned_agent_email,
    assigned_attorney_email,
    assigned_bond_originator_email
  )
)
with check (
  public.bridge_can_access_transaction(
    organisation_id,
    assigned_user_id,
    owner_user_id,
    assigned_agent_email,
    assigned_attorney_email,
    assigned_bond_originator_email
  )
);

drop policy if exists transactions_agency_delete on public.transactions;
create policy transactions_agency_delete on public.transactions
for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));

-- ---------------------------------------------
-- Performance indexes for policy predicates
-- ---------------------------------------------
create index if not exists organisation_users_user_org_status_idx
  on public.organisation_users (user_id, organisation_id, status);

create index if not exists organisation_users_email_status_idx
  on public.organisation_users (lower(email), status);

create index if not exists transactions_org_assigned_user_idx
  on public.transactions (organisation_id, assigned_user_id);

create index if not exists transactions_org_owner_user_idx
  on public.transactions (organisation_id, owner_user_id);

create index if not exists transactions_org_assigned_agent_email_idx
  on public.transactions (organisation_id, lower(assigned_agent_email));

create index if not exists transactions_org_assigned_attorney_email_idx
  on public.transactions (organisation_id, lower(assigned_attorney_email));

create index if not exists transactions_org_assigned_bond_email_idx
  on public.transactions (organisation_id, lower(assigned_bond_originator_email));

commit;
