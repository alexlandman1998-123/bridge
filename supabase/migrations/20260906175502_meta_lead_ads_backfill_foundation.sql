begin;

create table if not exists public.meta_lead_ads_imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  connection_id uuid not null references public.meta_lead_ads_connections(id) on delete cascade,
  form_mapping_id uuid not null references public.meta_lead_ads_forms(id) on delete cascade,
  page_id text not null,
  form_id text not null,
  requested_from timestamptz,
  requested_to timestamptz,
  status text not null default 'previewing'
    check (status in ('previewing', 'ready', 'importing', 'paused', 'completed', 'failed', 'cancelled')),
  next_cursor text,
  discovered_count integer not null default 0 check (discovered_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  invalid_count integer not null default 0 check (invalid_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  suppress_notifications boolean not null default true,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_lead_ads_imports_active_form_idx
  on public.meta_lead_ads_imports (form_mapping_id)
  where status in ('previewing', 'ready', 'importing', 'paused');
create index if not exists meta_lead_ads_imports_org_created_idx
  on public.meta_lead_ads_imports (organisation_id, created_at desc);

create or replace function public.bridge_meta_lead_ads_imports_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_meta_lead_ads_imports_updated_at on public.meta_lead_ads_imports;
create trigger trg_meta_lead_ads_imports_updated_at
before update on public.meta_lead_ads_imports
for each row execute function public.bridge_meta_lead_ads_imports_set_updated_at();

alter table public.meta_lead_ads_imports enable row level security;
drop policy if exists meta_lead_ads_imports_admin_read on public.meta_lead_ads_imports;
create policy meta_lead_ads_imports_admin_read on public.meta_lead_ads_imports
  for select to authenticated
  using (public.bridge_is_org_admin(organisation_id));
drop policy if exists meta_lead_ads_imports_admin_write on public.meta_lead_ads_imports;
create policy meta_lead_ads_imports_admin_write on public.meta_lead_ads_imports
  for all to authenticated
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

alter table public.meta_lead_ads_events
  add column if not exists import_id uuid references public.meta_lead_ads_imports(id) on delete set null,
  add column if not exists ingestion_source text not null default 'live',
  add column if not exists meta_created_at timestamptz;

alter table public.meta_lead_ads_events
  drop constraint if exists meta_lead_ads_events_ingestion_source_check;
alter table public.meta_lead_ads_events
  add constraint meta_lead_ads_events_ingestion_source_check
  check (ingestion_source in ('live', 'historical'));

create index if not exists meta_lead_ads_events_import_idx
  on public.meta_lead_ads_events (import_id, received_at desc)
  where import_id is not null;

alter table public.leads
  add column if not exists source_received_at timestamptz;
create index if not exists leads_source_received_at_idx
  on public.leads (organisation_id, source_received_at desc)
  where source_received_at is not null;

drop function if exists public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb);
create function public.meta_ingest_lead_ad(
  p_leadgen_id text, p_organisation_id uuid, p_page_id text, p_form_id text,
  p_full_name text, p_email text, p_phone text, p_payload jsonb,
  p_ingestion_source text default 'live', p_meta_created_at timestamptz default null,
  p_import_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_mapping public.meta_lead_ads_forms%rowtype;
  v_connection public.meta_lead_ads_connections%rowtype;
  v_contact_id uuid; v_lead_id uuid; v_first text; v_last text;
  v_now timestamptz := clock_timestamp(); v_occurred_at timestamptz;
  v_lead_type text; v_source text;
begin
  v_source := case when p_ingestion_source = 'historical' then 'historical' else 'live' end;
  v_occurred_at := coalesce(p_meta_created_at, v_now);
  if v_source = 'historical' and p_import_id is null then
    raise exception 'Historical Meta ingestion requires an import job';
  end if;
  select * into v_connection from public.meta_lead_ads_connections
   where organisation_id=p_organisation_id and page_id=p_page_id and connection_status='connected';
  if v_connection.id is null then raise exception 'Meta Page is not connected to this organisation'; end if;
  select * into v_mapping from public.meta_lead_ads_forms
   where organisation_id=p_organisation_id and page_id=p_page_id and form_id=p_form_id and is_active;
  if v_mapping.id is null then raise exception 'Meta form is not enabled for this organisation'; end if;
  if p_import_id is not null and not exists (
    select 1 from public.meta_lead_ads_imports i
    where i.id=p_import_id and i.organisation_id=p_organisation_id and i.connection_id=v_connection.id
      and i.form_mapping_id=v_mapping.id and i.status in ('ready', 'importing', 'paused')
  ) then raise exception 'Meta import job does not belong to this organisation and form'; end if;
  v_lead_type := case when v_mapping.lead_type = 'seller' then 'seller' else 'buyer' end;
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
    values(p_organisation_id,v_mapping.assigned_agent_id,v_first,v_last,nullif(lower(trim(p_email)),''),nullif(trim(p_phone),''),v_lead_type,'Facebook Lead Ad') returning contact_id into v_contact_id;
  end if;
  insert into public.leads(organisation_id,branch_id,assigned_agent_id,assigned_user_id,contact_id,lead_domain,
    lead_category,lead_type,lead_direction,lead_source,source_channel,stage,status,priority,ownership_status,assigned_at,sla_due_at,
    source_reference_id,source_received_at,raw_enquiry_payload,notes,acknowledgement_status,created_at)
  values(p_organisation_id,v_mapping.branch_id,v_mapping.assigned_agent_id,v_mapping.assigned_agent_id,v_contact_id,'agency',
    v_lead_type,v_lead_type,'Inbound','Facebook','facebook_lead_ads','New Lead','New Lead','High',
    case when v_mapping.assigned_agent_id is null then 'awaiting_assignment' else 'assigned' end,
    case when v_mapping.assigned_agent_id is null then null else v_now end,
    case when v_source='historical' then null else v_now+interval '15 minutes' end,
    'meta-leadgen:'||p_leadgen_id,v_occurred_at,
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('arch9_meta',jsonb_build_object('ingestion_source',v_source,'import_id',p_import_id,'submitted_at',v_occurred_at)),
    'Facebook '||initcap(v_lead_type)||case when v_source='historical' then ' Lead Ad imported: ' else ' Lead Ad: ' end||v_mapping.form_name,
    case when v_source='historical' then 'skipped' else null end,v_occurred_at)
  returning lead_id into v_lead_id;
  insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
  values(p_organisation_id,v_lead_id,v_mapping.assigned_agent_id,'Lead Created',
    case when v_source='historical' then 'Facebook '||initcap(v_lead_type)||' Lead Ad imported' else 'Facebook '||initcap(v_lead_type)||' Lead Ad received' end,
    v_occurred_at,'New');
  return v_lead_id;
end $$;

revoke all on function public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid) from public, anon, authenticated;

commit;
