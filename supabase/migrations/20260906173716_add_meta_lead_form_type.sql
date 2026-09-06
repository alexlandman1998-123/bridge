begin;

alter table public.meta_lead_ads_forms
  add column if not exists lead_type text not null default 'buyer';

alter table public.meta_lead_ads_forms
  drop constraint if exists meta_lead_ads_forms_lead_type_check;

alter table public.meta_lead_ads_forms
  add constraint meta_lead_ads_forms_lead_type_check
  check (lead_type in ('buyer', 'seller'));

create or replace function public.meta_ingest_lead_ad(
  p_leadgen_id text, p_organisation_id uuid, p_page_id text, p_form_id text,
  p_full_name text, p_email text, p_phone text, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_mapping public.meta_lead_ads_forms%rowtype;
  v_connection public.meta_lead_ads_connections%rowtype;
  v_contact_id uuid; v_lead_id uuid; v_first text; v_last text; v_now timestamptz := clock_timestamp();
  v_lead_type text;
begin
  select * into v_connection from public.meta_lead_ads_connections
   where organisation_id=p_organisation_id and page_id=p_page_id and connection_status='connected';
  if v_connection.id is null then raise exception 'Meta Page is not connected to this organisation'; end if;
  select * into v_mapping from public.meta_lead_ads_forms
   where organisation_id=p_organisation_id and page_id=p_page_id and form_id=p_form_id and is_active;
  if v_mapping.id is null then raise exception 'Meta form is not enabled for this organisation'; end if;
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
    source_reference_id,raw_enquiry_payload,notes)
  values(p_organisation_id,v_mapping.branch_id,v_mapping.assigned_agent_id,v_mapping.assigned_agent_id,v_contact_id,'agency',
    v_lead_type,v_lead_type,'Inbound','Facebook','facebook_lead_ads','New Lead','New Lead','High',
    case when v_mapping.assigned_agent_id is null then 'awaiting_assignment' else 'assigned' end,
    case when v_mapping.assigned_agent_id is null then null else v_now end,v_now+interval '15 minutes',
    'meta-leadgen:'||p_leadgen_id,coalesce(p_payload,'{}'::jsonb),'Facebook '||initcap(v_lead_type)||' Lead Ad: '||v_mapping.form_name)
  returning lead_id into v_lead_id;
  insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
  values(p_organisation_id,v_lead_id,v_mapping.assigned_agent_id,'Lead Created','Facebook '||initcap(v_lead_type)||' Lead Ad received',v_now,'New');
  return v_lead_id;
end $$;

revoke all on function public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;

commit;
