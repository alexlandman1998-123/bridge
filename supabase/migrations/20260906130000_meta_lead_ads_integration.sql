begin;

create table if not exists public.meta_lead_ads_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  page_id text not null,
  page_name text not null,
  business_id text,
  token_ciphertext text not null,
  token_expires_at timestamptz,
  connection_status text not null default 'connected' check (connection_status in ('connected','disconnected','error')),
  last_error_message text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, page_id),
  unique (page_id)
);

create table if not exists public.meta_lead_ads_forms (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.meta_lead_ads_connections(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  page_id text not null,
  form_id text not null,
  form_name text not null,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, form_id),
  unique (form_id)
);

create table if not exists public.meta_lead_ads_oauth_states (
  state_hash text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  return_url text not null,
  token_ciphertext text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.meta_lead_ads_events (
  id uuid primary key default gen_random_uuid(),
  leadgen_id text not null unique,
  organisation_id uuid references public.organisations(id) on delete set null,
  connection_id uuid references public.meta_lead_ads_connections(id) on delete set null,
  form_mapping_id uuid references public.meta_lead_ads_forms(id) on delete set null,
  page_id text not null,
  form_id text,
  crm_lead_id uuid references public.leads(lead_id) on delete set null,
  status text not null default 'received' check (status in ('received','processed','duplicate','failed','ignored')),
  attempts integer not null default 0,
  payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists meta_lead_ads_forms_routing_idx on public.meta_lead_ads_forms (page_id, form_id) where is_active;
create index if not exists meta_lead_ads_events_org_idx on public.meta_lead_ads_events (organisation_id, received_at desc);

alter table public.meta_lead_ads_connections enable row level security;
alter table public.meta_lead_ads_forms enable row level security;
alter table public.meta_lead_ads_oauth_states enable row level security;
alter table public.meta_lead_ads_events enable row level security;

drop policy if exists meta_lead_ads_connections_admin_read on public.meta_lead_ads_connections;
create policy meta_lead_ads_connections_admin_read on public.meta_lead_ads_connections for select to authenticated
  using (public.bridge_is_org_admin(organisation_id));
drop policy if exists meta_lead_ads_forms_member_read on public.meta_lead_ads_forms;
create policy meta_lead_ads_forms_member_read on public.meta_lead_ads_forms for select to authenticated
  using (public.bridge_is_active_member(organisation_id));
drop policy if exists meta_lead_ads_forms_admin_write on public.meta_lead_ads_forms;
create policy meta_lead_ads_forms_admin_write on public.meta_lead_ads_forms for all to authenticated
  using (public.bridge_is_org_admin(organisation_id)) with check (public.bridge_is_org_admin(organisation_id));
drop policy if exists meta_lead_ads_events_member_read on public.meta_lead_ads_events;
create policy meta_lead_ads_events_member_read on public.meta_lead_ads_events for select to authenticated
  using (public.bridge_is_active_member(organisation_id));

create or replace function public.meta_ingest_lead_ad(
  p_leadgen_id text, p_organisation_id uuid, p_page_id text, p_form_id text,
  p_full_name text, p_email text, p_phone text, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_mapping public.meta_lead_ads_forms%rowtype;
  v_connection public.meta_lead_ads_connections%rowtype;
  v_contact_id uuid; v_lead_id uuid; v_first text; v_last text; v_now timestamptz := clock_timestamp();
begin
  select * into v_connection from public.meta_lead_ads_connections
   where organisation_id=p_organisation_id and page_id=p_page_id and connection_status='connected';
  if v_connection.id is null then raise exception 'Meta Page is not connected to this organisation'; end if;
  select * into v_mapping from public.meta_lead_ads_forms
   where organisation_id=p_organisation_id and page_id=p_page_id and form_id=p_form_id and is_active;
  if v_mapping.id is null then raise exception 'Meta form is not enabled for this organisation'; end if;
  if v_mapping.branch_id is not null and not exists (
    select 1 from public.organisation_branches b where b.id=v_mapping.branch_id and b.organisation_id=p_organisation_id
  ) then raise exception 'Meta form branch routing crosses organisation boundary'; end if;
  if v_mapping.assigned_agent_id is not null and not exists (
    select 1 from public.organisation_users u where u.organisation_id=p_organisation_id and u.user_id=v_mapping.assigned_agent_id and u.status='active'
  ) then raise exception 'Meta form agent routing crosses organisation boundary'; end if;

  perform pg_advisory_xact_lock(hashtextextended('meta-lead:' || p_leadgen_id, 0));
  select lead_id into v_lead_id from public.leads
   where organisation_id=p_organisation_id and source_reference_id='meta-leadgen:' || p_leadgen_id limit 1;
  if v_lead_id is not null then return v_lead_id; end if;

  v_first := split_part(trim(coalesce(p_full_name,'Meta Lead')), ' ', 1);
  v_last := nullif(trim(substr(trim(coalesce(p_full_name,'Meta Lead')), char_length(v_first)+1)), '');
  select c.contact_id into v_contact_id from public.contacts c where c.organisation_id=p_organisation_id
    and ((nullif(lower(trim(p_email)),'') is not null and lower(trim(c.email))=lower(trim(p_email)))
      or (nullif(regexp_replace(p_phone,'[^0-9]+','','g'),'') is not null and regexp_replace(coalesce(c.phone,''),'[^0-9]+','','g')=regexp_replace(p_phone,'[^0-9]+','','g')))
    order by c.updated_at desc limit 1;
  if v_contact_id is null then
    insert into public.contacts(organisation_id,assigned_agent_id,first_name,last_name,email,phone,contact_type,notes)
    values(p_organisation_id,v_mapping.assigned_agent_id,v_first,v_last,nullif(lower(trim(p_email)),''),nullif(trim(p_phone),''),'buyer','Facebook Lead Ad') returning contact_id into v_contact_id;
  end if;
  insert into public.leads(organisation_id,branch_id,assigned_agent_id,assigned_user_id,contact_id,lead_domain,
    lead_category,lead_direction,lead_source,source_channel,stage,status,priority,ownership_status,assigned_at,sla_due_at,
    source_reference_id,raw_enquiry_payload,notes)
  values(p_organisation_id,v_mapping.branch_id,v_mapping.assigned_agent_id,v_mapping.assigned_agent_id,v_contact_id,'agency',
    'buyer','Inbound','Facebook','facebook_lead_ads','New Lead','New Lead','High',
    case when v_mapping.assigned_agent_id is null then 'awaiting_assignment' else 'assigned' end,
    case when v_mapping.assigned_agent_id is null then null else v_now end,v_now+interval '15 minutes',
    'meta-leadgen:'||p_leadgen_id,coalesce(p_payload,'{}'::jsonb),'Facebook Lead Ad: '||v_mapping.form_name)
  returning lead_id into v_lead_id;
  insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
  values(p_organisation_id,v_lead_id,v_mapping.assigned_agent_id,'Lead Created','Facebook Lead Ad received',v_now,'New');
  return v_lead_id;
end $$;
revoke all on function public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;

commit;
