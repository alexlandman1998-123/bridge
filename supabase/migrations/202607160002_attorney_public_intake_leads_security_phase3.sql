begin;

-- Phase 3 is the Attorney Lead security boundary. Existing Agency policies are
-- permissive, so they must explicitly exclude Attorney rows before the new
-- role-scoped policies can be meaningful.

create or replace function public.bridge_attorney_lead_can_access(
  target_org uuid,
  target_assigned_user uuid default null,
  target_branch uuid default null,
  requested_action text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_branch uuid;
begin
  if auth.uid() is null or target_org is null then
    return false;
  end if;

  if not exists (
    select 1 from public.organisations organisation
    where organisation.id = target_org
      and organisation.type = 'attorney_firm'
  ) then
    return false;
  end if;

  select
    lower(trim(coalesce(
      nullif(trim(member.organisation_role), ''),
      nullif(trim(member.workspace_role), ''),
      nullif(trim(member.role), ''),
      nullif(trim(member.app_role), ''),
      'viewer'
    ))),
    coalesce(member.primary_branch_id, member.branch_id)
  into v_role, v_branch
  from public.organisation_users member
  where member.organisation_id = target_org
    and (
      member.user_id = auth.uid()
      or (
        member.user_id is null
        and nullif(lower(trim(member.email)), '') = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
    and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
    and coalesce(member.workspace_type, 'attorney_firm') in ('attorney', 'attorney_firm')
  order by
    case when member.user_id = auth.uid() then 0 else 1 end,
    member.is_primary_owner desc nulls last,
    member.updated_at desc nulls last,
    member.created_at desc
  limit 1;

  if v_role is null then
    -- Attorney memberships pre-date backed organisations in some tenants.
    select lower(trim(firm_member.role)), coalesce(firm_member.primary_branch_id, firm_member.branch_id)
    into v_role, v_branch
    from public.attorney_firm_members firm_member
    join public.attorney_firms firm on firm.id = firm_member.firm_id
    where firm.organisation_id = target_org
      and firm_member.user_id = auth.uid()
      and firm_member.status = 'active'
    order by firm_member.updated_at desc nulls last, firm_member.created_at desc
    limit 1;
  end if;

  if v_role is null then
    return false;
  end if;

  if v_role in ('owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner') then
    return requested_action in ('view', 'create', 'edit', 'assign', 'archive', 'view_link', 'manage_link');
  end if;

  if requested_action = 'view_link' then
    return v_role in (
      'branch_manager', 'admin_staff', 'reception_scheduling',
      'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'candidate_attorney',
      'paralegal', 'conveyancing_secretary', 'viewer'
    );
  end if;

  if v_role in ('branch_manager', 'admin_staff', 'reception_scheduling') then
    return requested_action in ('view', 'create', 'edit', 'assign')
      and target_branch is not null
      and v_branch is not null
      and target_branch = v_branch;
  end if;

  if v_role in ('attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'candidate_attorney') then
    return requested_action in ('view', 'create', 'edit')
      and (target_assigned_user is null or target_assigned_user = auth.uid());
  end if;

  if v_role in ('paralegal', 'conveyancing_secretary') then
    return requested_action in ('view', 'create', 'edit')
      and target_assigned_user = auth.uid();
  end if;

  if v_role = 'viewer' then
    return requested_action = 'view' and target_assigned_user = auth.uid();
  end if;

  return false;
end;
$$;

revoke all on function public.bridge_attorney_lead_can_access(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.bridge_attorney_lead_can_access(uuid, uuid, uuid, text) to authenticated;

create or replace function public.bridge_enforce_attorney_lead_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.lead_domain <> 'attorney' then
    return new;
  end if;

  if new.lead_domain <> 'attorney' or new.organisation_id is distinct from old.organisation_id then
    raise exception 'Attorney Lead domain and organisation cannot be changed';
  end if;

  if auth.role() = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if new.assigned_user_id is distinct from old.assigned_user_id
    or new.assigned_agent_id is distinct from old.assigned_agent_id
    or new.assigned_queue_id is distinct from old.assigned_queue_id
    or new.branch_id is distinct from old.branch_id then
    if not public.bridge_attorney_lead_can_access(
      old.organisation_id,
      old.assigned_user_id,
      old.branch_id,
      'assign'
    ) then
      raise exception 'Not authorised to assign this Attorney Lead';
    end if;
  end if;

  if new.status is distinct from old.status
    and (new.status = 'archived' or old.status = 'archived') then
    if not public.bridge_attorney_lead_can_access(
      old.organisation_id,
      old.assigned_user_id,
      old.branch_id,
      'archive'
    ) then
      raise exception 'Not authorised to archive this Attorney Lead';
    end if;
  end if;

  if not public.bridge_attorney_lead_can_access(
    old.organisation_id,
    old.assigned_user_id,
    old.branch_id,
    'edit'
  ) then
    raise exception 'Not authorised to edit this Attorney Lead';
  end if;

  return new;
end;
$$;

revoke all on function public.bridge_enforce_attorney_lead_update_scope() from public, anon, authenticated;

drop trigger if exists trg_enforce_attorney_lead_update_scope on public.leads;
create trigger trg_enforce_attorney_lead_update_scope
before update on public.leads
for each row execute function public.bridge_enforce_attorney_lead_update_scope();

-- Preserve Agency behaviour, but prevent those policies from authorising an
-- Attorney Lead. PostgreSQL combines permissive policies with OR.
drop policy if exists leads_agency_select on public.leads;
create policy leads_agency_select on public.leads
for select to authenticated
using (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
);

drop policy if exists leads_agency_write on public.leads;
create policy leads_agency_write on public.leads
for all to authenticated
using (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
)
with check (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and (
    public.bridge_is_org_admin(organisation_id)
    or (
      public.bridge_membership_role(organisation_id) = 'agent'
      and assigned_agent_id = auth.uid()
    )
  )
);

drop policy if exists leads_support_role_select on public.leads;
create policy leads_support_role_select on public.leads
for select to authenticated
using (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_user_id = auth.uid()
    or assigned_agent_id = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_support_can_access_record(
      organisation_id, branch_id, 'lead', assigned_user_id, assigned_agent_id, null
    )
  )
);

drop policy if exists leads_support_role_update on public.leads;
create policy leads_support_role_update on public.leads
for update to authenticated
using (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_user_id = auth.uid()
    or assigned_agent_id = auth.uid()
    or public.bridge_support_can_access_record(
      organisation_id, branch_id, 'lead', assigned_user_id, assigned_agent_id, null
    )
  )
)
with check (
  coalesce(lead_domain, 'agency') <> 'attorney'
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_user_id = auth.uid()
    or assigned_agent_id = auth.uid()
    or public.bridge_support_can_access_record(
      organisation_id, branch_id, 'lead', assigned_user_id, assigned_agent_id, null
    )
  )
);

drop policy if exists attorney_leads_select on public.leads;
create policy attorney_leads_select on public.leads
for select to authenticated
using (
  lead_domain = 'attorney'
  and public.bridge_attorney_lead_can_access(organisation_id, assigned_user_id, branch_id, 'view')
);

drop policy if exists attorney_leads_insert on public.leads;
create policy attorney_leads_insert on public.leads
for insert to authenticated
with check (
  lead_domain = 'attorney'
  and public.bridge_attorney_lead_can_access(organisation_id, assigned_user_id, branch_id, 'create')
);

drop policy if exists attorney_leads_update on public.leads;
create policy attorney_leads_update on public.leads
for update to authenticated
using (
  lead_domain = 'attorney'
  and public.bridge_attorney_lead_can_access(organisation_id, assigned_user_id, branch_id, 'edit')
)
with check (
  lead_domain = 'attorney'
  and public.bridge_attorney_lead_can_access(organisation_id, assigned_user_id, branch_id, 'edit')
);

-- Attorney contact access is derived from an accessible Attorney Lead. This
-- avoids making every contact in a mixed organisation visible by default.
drop policy if exists contacts_agency_select on public.contacts;
create policy contacts_agency_select on public.contacts
for select to authenticated
using (
  not exists (
    select 1 from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
  )
  and public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
);

drop policy if exists contacts_agency_write on public.contacts;
create policy contacts_agency_write on public.contacts
for all to authenticated
using (
  not exists (
    select 1 from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
  )
  and public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
)
with check (
  not exists (
    select 1 from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
  )
  and (
    public.bridge_is_org_admin(organisation_id)
    or (
      public.bridge_membership_role(organisation_id) = 'agent'
      and assigned_agent_id = auth.uid()
    )
  )
);

drop policy if exists attorney_lead_contacts_select on public.contacts;
create policy attorney_lead_contacts_select on public.contacts
for select to authenticated
using (
  exists (
    select 1
    from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

drop policy if exists attorney_lead_contacts_update on public.contacts;
create policy attorney_lead_contacts_update on public.contacts
for update to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
)
with check (
  exists (
    select 1 from public.leads lead
    where lead.contact_id = contacts.contact_id
      and lead.organisation_id = contacts.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
);

-- Keep legacy activity policies for non-Attorney Leads only.
drop policy if exists lead_activities_agency_select on public.lead_activities;
create policy lead_activities_agency_select on public.lead_activities
for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
      and (
        public.bridge_is_org_admin(lead_activities.organisation_id)
        or (
          lead.assigned_agent_id = auth.uid()
          and public.bridge_membership_role(lead_activities.organisation_id) = 'agent'
        )
      )
  )
);

drop policy if exists lead_activities_agency_write on public.lead_activities;
create policy lead_activities_agency_write on public.lead_activities
for all to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
  )
  and (
    public.bridge_is_org_admin(organisation_id)
    or (public.bridge_membership_role(organisation_id) = 'agent' and agent_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
      and (
        public.bridge_is_org_admin(lead_activities.organisation_id)
        or (
          public.bridge_membership_role(lead_activities.organisation_id) = 'agent'
          and lead.assigned_agent_id = auth.uid()
        )
      )
  )
  and (agent_id is null or agent_id = auth.uid() or public.bridge_is_org_admin(organisation_id))
);

drop policy if exists attorney_lead_activities_select on public.lead_activities;
create policy attorney_lead_activities_select on public.lead_activities
for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

drop policy if exists attorney_lead_activities_insert on public.lead_activities;
create policy attorney_lead_activities_insert on public.lead_activities
for insert to authenticated
with check (
  (agent_id is null or agent_id = auth.uid())
  and exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
);

drop policy if exists attorney_lead_activities_update on public.lead_activities;
create policy attorney_lead_activities_update on public.lead_activities
for update to authenticated
using (
  (agent_id is null or agent_id = auth.uid())
  and exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
)
with check (
  (agent_id is null or agent_id = auth.uid())
  and exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_activities.lead_id
      and lead.organisation_id = lead_activities.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
);

-- Attorney extension rows inherit access from their parent Lead.
drop policy if exists attorney_lead_details_select on public.attorney_lead_details;
create policy attorney_lead_details_select on public.attorney_lead_details
for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = attorney_lead_details.lead_id
      and lead.organisation_id = attorney_lead_details.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

drop policy if exists attorney_lead_details_insert on public.attorney_lead_details;
create policy attorney_lead_details_insert on public.attorney_lead_details
for insert to authenticated
with check (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = attorney_lead_details.lead_id
      and lead.organisation_id = attorney_lead_details.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'create'
      )
  )
);

drop policy if exists attorney_lead_details_update on public.attorney_lead_details;
create policy attorney_lead_details_update on public.attorney_lead_details
for update to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = attorney_lead_details.lead_id
      and lead.organisation_id = attorney_lead_details.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
)
with check (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = attorney_lead_details.lead_id
      and lead.organisation_id = attorney_lead_details.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'edit'
      )
  )
);

drop policy if exists public_intake_links_member_select on public.public_intake_links;
create policy public_intake_links_member_select on public.public_intake_links
for select to authenticated
using (public.bridge_attorney_lead_can_access(organisation_id, null, null, 'view_link'));

drop policy if exists public_intake_links_admin_insert on public.public_intake_links;
create policy public_intake_links_admin_insert on public.public_intake_links
for insert to authenticated
with check (public.bridge_attorney_lead_can_access(organisation_id, null, null, 'manage_link'));

drop policy if exists public_intake_links_admin_update on public.public_intake_links;
create policy public_intake_links_admin_update on public.public_intake_links
for update to authenticated
using (public.bridge_attorney_lead_can_access(organisation_id, null, null, 'manage_link'))
with check (public.bridge_attorney_lead_can_access(organisation_id, null, null, 'manage_link'));

drop policy if exists public_intake_submissions_member_select on public.public_intake_submissions;
create policy public_intake_submissions_member_select on public.public_intake_submissions
for select to authenticated
using (
  (
    lead_id is not null
    and exists (
      select 1 from public.leads lead
      where lead.lead_id = public_intake_submissions.lead_id
        and lead.organisation_id = public_intake_submissions.organisation_id
        and lead.lead_domain = 'attorney'
        and public.bridge_attorney_lead_can_access(
          lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
        )
    )
  )
  or public.bridge_attorney_lead_can_access(organisation_id, null, null, 'manage_link')
);

-- Assignment history remains immutable for Attorney Leads and derives access
-- from the parent. Legacy history policies continue only for other domains.
drop policy if exists lead_assignment_history_select_member on public.lead_assignment_history;
create policy lead_assignment_history_select_member on public.lead_assignment_history
for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_assignment_history.lead_id
      and lead.organisation_id = lead_assignment_history.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
      and public.bridge_is_active_member(lead_assignment_history.organisation_id)
  )
);

drop policy if exists lead_assignment_history_insert_member on public.lead_assignment_history;
create policy lead_assignment_history_insert_member on public.lead_assignment_history
for insert to authenticated
with check (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_assignment_history.lead_id
      and lead.organisation_id = lead_assignment_history.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
      and public.bridge_is_active_member(lead_assignment_history.organisation_id)
  )
);

drop policy if exists lead_assignment_history_update_member on public.lead_assignment_history;
create policy lead_assignment_history_update_member on public.lead_assignment_history
for update to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_assignment_history.lead_id
      and lead.organisation_id = lead_assignment_history.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
      and public.bridge_is_active_member(lead_assignment_history.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_assignment_history.lead_id
      and lead.organisation_id = lead_assignment_history.organisation_id
      and coalesce(lead.lead_domain, 'agency') <> 'attorney'
      and public.bridge_is_active_member(lead_assignment_history.organisation_id)
  )
);

drop policy if exists attorney_lead_assignment_history_select on public.lead_assignment_history;
create policy attorney_lead_assignment_history_select on public.lead_assignment_history
for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_assignment_history.lead_id
      and lead.organisation_id = lead_assignment_history.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

drop policy if exists attorney_lead_assignment_history_insert on public.lead_assignment_history;
create policy attorney_lead_assignment_history_insert on public.lead_assignment_history
for insert to authenticated
with check (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = lead_assignment_history.lead_id
      and lead.organisation_id = lead_assignment_history.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'assign'
      )
  )
);

grant select, insert, update on public.attorney_lead_details to authenticated;
grant select, insert, update on public.public_intake_links to authenticated;
grant select on public.public_intake_submissions to authenticated;

-- Public resolver: active links only, and only presentation-safe fields. It
-- deliberately returns no organisation, firm, member, or settings identifiers.
create or replace function public.resolve_attorney_public_intake(p_slug text)
returns table (
  slug text,
  status text,
  heading text,
  introduction text,
  service_types jsonb,
  firm_name text,
  logo_url text,
  primary_colour text,
  secondary_colour text,
  website text,
  contact_email text,
  contact_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    link.slug,
    'active'::text,
    link.heading,
    link.introduction,
    link.service_config_json,
    firm.name,
    coalesce(branding.logo_url, firm.logo_url),
    coalesce(branding.primary_colour, firm.primary_colour),
    coalesce(branding.secondary_colour, firm.secondary_colour),
    firm.website,
    firm.email,
    firm.phone
  from public.public_intake_links link
  join public.attorney_firms firm
    on firm.id = link.attorney_firm_id
   and firm.organisation_id = link.organisation_id
  left join public.attorney_firm_branding branding on branding.firm_id = firm.id
  join public.organisations organisation on organisation.id = link.organisation_id
  where lower(link.slug) = lower(trim(p_slug))
    and link.status = 'active'
    and link.disabled_at is null
    and firm.is_active = true
    and organisation.status = 'active'
  limit 1
$$;

revoke all on function public.resolve_attorney_public_intake(text) from public;
grant execute on function public.resolve_attorney_public_intake(text) to anon, authenticated;

-- Trusted command invoked by the future Edge Function with its service-role
-- client. Tenant identity is resolved from the slug and cannot be supplied by
-- the caller. One idempotency key creates at most one Lead.
create or replace function public.submit_attorney_public_intake(
  p_slug text,
  p_idempotency_key text,
  p_payload jsonb,
  p_ip_hash text default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.public_intake_links%rowtype;
  v_submission_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_service_type text;
  v_source_channel text;
  v_campaign_code text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_policy_version text;
  v_short_window_count integer := 0;
  v_long_window_count integer := 0;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception 'Invalid intake payload';
  end if;

  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Invalid idempotency key';
  end if;

  select link.* into v_link
  from public.public_intake_links link
  join public.attorney_firms firm
    on firm.id = link.attorney_firm_id
   and firm.organisation_id = link.organisation_id
  join public.organisations organisation on organisation.id = link.organisation_id
  where lower(link.slug) = lower(trim(p_slug))
    and link.status = 'active'
    and link.disabled_at is null
    and firm.is_active = true
    and organisation.status = 'active'
  ;

  if not found then
    return jsonb_build_object('accepted', false, 'duplicate', false, 'code', 'intake_unavailable');
  end if;

  select submission.lead_id into v_lead_id
  from public.public_intake_submissions submission
  where submission.intake_link_id = v_link.id
    and submission.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'accepted', v_lead_id is not null,
      'duplicate', true,
      'code', case when v_lead_id is null then 'request_already_received' else 'accepted' end
    );
  end if;

  if p_ip_hash is not null then
    -- The Edge Function performs an early throttle check, but this lock and
    -- count are the authoritative race-safe boundary for concurrent requests.
    perform pg_advisory_xact_lock(
      hashtextextended('attorney-intake-rate:' || v_link.id::text || ':' || p_ip_hash, 0)
    );

    select
      count(*) filter (where submission.created_at >= v_now - interval '10 minutes'),
      count(*)
    into v_short_window_count, v_long_window_count
    from public.public_intake_submissions submission
    where submission.intake_link_id = v_link.id
      and submission.ip_hash = p_ip_hash
      and submission.created_at >= v_now - interval '1 hour';

    if v_short_window_count >= 5 or v_long_window_count >= 15 then
      raise exception 'Attorney public intake rate limit exceeded';
    end if;
  end if;

  v_service_type := lower(trim(coalesce(p_payload ->> 'service_type', '')));
  if v_service_type not in (
    'transfer_quote', 'property_transfer', 'bond_registration',
    'bond_cancellation', 'property_legal_advice', 'general_enquiry'
  ) or not (v_link.service_config_json ? v_service_type) then
    raise exception 'Invalid or unavailable service type';
  end if;

  if coalesce((p_payload ->> 'privacy_consent')::boolean, false) is not true then
    raise exception 'Privacy consent is required';
  end if;

  v_policy_version := nullif(trim(p_payload ->> 'privacy_policy_version'), '');
  if v_policy_version is null or char_length(v_policy_version) > 80 then
    raise exception 'Invalid privacy policy version';
  end if;

  v_first_name := nullif(trim(p_payload ->> 'first_name'), '');
  v_last_name := nullif(trim(p_payload ->> 'last_name'), '');
  v_email := nullif(lower(trim(p_payload ->> 'email')), '');
  v_phone := nullif(trim(p_payload ->> 'phone'), '');
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]+', '', 'g'), '');

  if v_first_name is null or char_length(v_first_name) > 120
    or char_length(coalesce(v_last_name, '')) > 120 then
    raise exception 'Invalid contact name';
  end if;

  if v_email is null and v_phone_digits is null then
    raise exception 'Email or phone is required';
  end if;

  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Invalid email';
  end if;

  if v_phone_digits is not null and char_length(v_phone_digits) not between 7 and 20 then
    raise exception 'Invalid phone';
  end if;

  v_source_channel := lower(trim(coalesce(p_payload ->> 'source_channel', 'other')));
  if v_source_channel not in (
    'instagram', 'facebook', 'linkedin', 'website', 'whatsapp',
    'email', 'qr', 'referral', 'manual', 'other'
  ) then
    v_source_channel := 'other';
  end if;

  v_campaign_code := nullif(lower(trim(p_payload ->> 'campaign_code')), '');
  if v_campaign_code is not null
    and (char_length(v_campaign_code) > 80 or v_campaign_code !~ '^[a-z0-9][a-z0-9._-]*$') then
    raise exception 'Invalid campaign code';
  end if;

  insert into public.public_intake_submissions (
    intake_link_id, organisation_id, idempotency_key, source_channel,
    campaign_code, utm_json, ip_hash, request_metadata_json,
    privacy_consent, privacy_consented_at, privacy_policy_version, status
  ) values (
    v_link.id, v_link.organisation_id, p_idempotency_key, v_source_channel,
    v_campaign_code, coalesce(p_payload -> 'utm', '{}'::jsonb), p_ip_hash,
    coalesce(p_request_metadata, '{}'::jsonb), true, v_now, v_policy_version, 'received'
  )
  on conflict (intake_link_id, idempotency_key) do nothing
  returning id into v_submission_id;

  if v_submission_id is null then
    select submission.lead_id into v_lead_id
    from public.public_intake_submissions submission
    where submission.intake_link_id = v_link.id
      and submission.idempotency_key = p_idempotency_key;

    return jsonb_build_object(
      'accepted', v_lead_id is not null,
      'duplicate', true,
      'code', case when v_lead_id is null then 'request_already_received' else 'accepted' end
    );
  end if;

  -- Serialize exact identity resolution without serializing every submission
  -- for the link. This prevents concurrent requests for the same email/phone
  -- from racing into duplicate contact rows.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_link.organisation_id::text || ':' || coalesce(v_email, '') || ':' || coalesce(v_phone_digits, ''),
      0
    )
  );

  -- Exact tenant-scoped email/phone matching only. Names are never used for
  -- identity. A matched contact still receives a new Lead for this submission.
  select contact.contact_id into v_contact_id
  from public.contacts contact
  where contact.organisation_id = v_link.organisation_id
    and (
      (v_email is not null and lower(trim(contact.email)) = v_email)
      or (
        v_phone_digits is not null
        and regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = v_phone_digits
      )
    )
  order by
    case when v_email is not null and lower(trim(contact.email)) = v_email then 0 else 1 end,
    contact.updated_at desc nulls last,
    contact.created_at desc
  limit 1;

  if v_contact_id is null then
    insert into public.contacts (
      organisation_id, first_name, last_name, email, phone, contact_type
    ) values (
      v_link.organisation_id, v_first_name, v_last_name, v_email, v_phone, 'other'
    )
    returning contact_id into v_contact_id;
  end if;

  insert into public.leads (
    organisation_id, contact_id, lead_domain, lead_category, lead_direction,
    lead_source, source_channel, campaign_code, stage, status, priority,
    ownership_status, notes
  ) values (
    v_link.organisation_id, v_contact_id, 'attorney', 'other', 'Inbound',
    initcap(replace(v_source_channel, '_', ' ')), v_source_channel, v_campaign_code,
    'new', 'open', 'Medium', 'awaiting_assignment',
    nullif(trim(p_payload ->> 'message'), '')
  )
  returning lead_id into v_lead_id;

  insert into public.attorney_lead_details (
    lead_id, organisation_id, service_type, property_address, property_value,
    party_role, enquiry_message, intake_link_id, privacy_consent,
    privacy_consented_at, privacy_policy_version, metadata_json
  ) values (
    v_lead_id,
    v_link.organisation_id,
    v_service_type,
    nullif(trim(p_payload ->> 'property_address'), ''),
    case
      when nullif(trim(p_payload ->> 'property_value'), '') is null then null
      else (p_payload ->> 'property_value')::numeric
    end,
    case
      when lower(trim(coalesce(p_payload ->> 'party_role', 'unknown'))) in ('buyer', 'seller', 'other')
        then lower(trim(p_payload ->> 'party_role'))
      else 'unknown'
    end,
    nullif(trim(p_payload ->> 'message'), ''),
    v_link.id,
    true,
    v_now,
    v_policy_version,
    jsonb_build_object('submission_id', v_submission_id)
  );

  insert into public.lead_activities (
    organisation_id, lead_id, activity_type, activity_note, activity_date, outcome
  ) values (
    v_link.organisation_id, v_lead_id, 'Lead Created',
    'Public Attorney intake received', v_now, 'New'
  );

  update public.public_intake_submissions
  set lead_id = v_lead_id,
      status = 'processed',
      processed_at = v_now
  where id = v_submission_id;

  return jsonb_build_object('accepted', true, 'duplicate', false, 'code', 'accepted');
end;
$$;

revoke all on function public.submit_attorney_public_intake(text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_attorney_public_intake(text, text, jsonb, text, jsonb) to service_role;

comment on function public.resolve_attorney_public_intake(text) is
  'Public-safe resolver for an active Attorney intake slug. Returns no tenant or membership identifiers.';
comment on function public.submit_attorney_public_intake(text, text, jsonb, text, jsonb) is
  'Service-role-only atomic public intake command. Resolves tenant from slug and creates one Attorney Lead per idempotency key.';

commit;
