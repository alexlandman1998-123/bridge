-- Phase 62: catalogue and traceability only. Delivery remains an internal
-- record until a later orchestration phase enables an approved sender.
create table public.rental_notification_templates (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), event_key text not null,
  channel text not null check (channel in ('email','sms','portal')), version integer not null, subject text, body text not null,
  status text not null default 'active' check (status in ('draft','active','retired')), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique (organisation_id,event_key,channel,version)
);
create table public.rental_notification_policies (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), event_key text not null,
  enabled boolean not null default true, channel_order jsonb not null default '["email","sms","portal"]'::jsonb, fallback_enabled boolean not null default true,
  created_by uuid not null references auth.users(id), updated_at timestamptz not null default now(), unique (organisation_id,event_key)
);
create table public.rental_notification_deliveries (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), event_key text not null, entity_type text not null, entity_id uuid,
  policy_id uuid references public.rental_notification_policies(id), template_id uuid references public.rental_notification_templates(id), template_version integer,
  channel text check (channel in ('email','sms','portal')), recipient_reference text, status text not null check (status in ('planned','suppressed','fallback_planned','failed','delivered')),
  suppression_reason text, created_at timestamptz not null default now()
);
create index rental_notification_templates_catalogue_idx on public.rental_notification_templates (organisation_id,event_key,channel,version desc);
create index rental_notification_policies_catalogue_idx on public.rental_notification_policies (organisation_id,event_key);
create index rental_notification_deliveries_history_idx on public.rental_notification_deliveries (organisation_id,created_at desc);
create index rental_notification_deliveries_template_idx on public.rental_notification_deliveries (template_id);
create index rental_notification_deliveries_policy_idx on public.rental_notification_deliveries (policy_id);
alter table public.rental_notification_templates enable row level security;
alter table public.rental_notification_policies enable row level security;
alter table public.rental_notification_deliveries enable row level security;
create policy "rental_notification_templates_manager_read" on public.rental_notification_templates for select to authenticated using (public.rental_financial_manager_authorized(organisation_id));
create policy "rental_notification_policies_manager_read" on public.rental_notification_policies for select to authenticated using (public.rental_financial_manager_authorized(organisation_id));
create policy "rental_notification_deliveries_manager_read" on public.rental_notification_deliveries for select to authenticated using (public.rental_financial_manager_authorized(organisation_id));

create or replace function public.rental_create_notification_template(p_org uuid,p_event_key text,p_channel text,p_subject text,p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_version integer; v_id uuid;
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) or p_event_key not in ('invitation','application','lease','collection','maintenance','inspection','renewal') or p_channel not in ('email','sms','portal') or length(btrim(coalesce(p_body,''))) < 3 then raise exception 'Invalid notification template'; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_event_key || ':' || p_channel, 62));
  update public.rental_notification_templates set status='retired' where organisation_id=p_org and event_key=p_event_key and channel=p_channel and status='active';
  select coalesce(max(version),0)+1 into v_version from public.rental_notification_templates where organisation_id=p_org and event_key=p_event_key and channel=p_channel;
  insert into public.rental_notification_templates(organisation_id,event_key,channel,version,subject,body,status,created_by) values(p_org,p_event_key,p_channel,v_version,nullif(btrim(coalesce(p_subject,'')),''),btrim(p_body),'active',auth.uid()) returning id into v_id;
  insert into public.rental_notification_policies(organisation_id,event_key,created_by) values(p_org,p_event_key,auth.uid()) on conflict(organisation_id,event_key) do nothing;
  return jsonb_build_object('template_id',v_id,'version',v_version);
end $$;
create or replace function public.rental_get_notification_catalogue(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then raise exception 'Not authorized'; end if;
  return jsonb_build_object('templates',coalesce((select jsonb_agg(to_jsonb(t) order by t.event_key,t.channel,t.version desc) from public.rental_notification_templates t where t.organisation_id=p_org),'[]'::jsonb),'policies',coalesce((select jsonb_agg(to_jsonb(p) order by p.event_key) from public.rental_notification_policies p where p.organisation_id=p_org),'[]'::jsonb),'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select * from public.rental_notification_deliveries where organisation_id=p_org order by created_at desc limit 100) d),'[]'::jsonb));
end $$;
create or replace function public.rental_plan_notification(p_org uuid,p_event_key text,p_entity_type text,p_entity_id uuid,p_recipient_reference text,p_channel_preferences jsonb default '["email","sms","portal"]'::jsonb,p_suppression_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_policy public.rental_notification_policies%rowtype; v_channel text; v_template public.rental_notification_templates%rowtype; v_id uuid; v_status text;
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) or length(btrim(coalesce(p_recipient_reference,'')))=0 or jsonb_typeof(p_channel_preferences) <> 'array' then raise exception 'Invalid notification plan'; end if;
  select * into v_policy from public.rental_notification_policies where organisation_id=p_org and event_key=p_event_key;
  if not found then insert into public.rental_notification_policies(organisation_id,event_key,created_by) values(p_org,p_event_key,auth.uid()) returning * into v_policy; end if;
  if not v_policy.enabled or length(btrim(coalesce(p_suppression_reason,'')))>0 then v_status:='suppressed'; else select value into v_channel from jsonb_array_elements_text(p_channel_preferences) value where value in ('email','sms','portal') limit 1; select * into v_template from public.rental_notification_templates where organisation_id=p_org and event_key=p_event_key and channel=v_channel and status='active' order by version desc limit 1; v_status:=case when v_template.id is null then 'failed' else 'planned' end; end if;
  insert into public.rental_notification_deliveries(organisation_id,event_key,entity_type,entity_id,policy_id,template_id,template_version,channel,recipient_reference,status,suppression_reason) values(p_org,p_event_key,btrim(p_entity_type),p_entity_id,v_policy.id,v_template.id,v_template.version,v_channel,btrim(p_recipient_reference),v_status,nullif(btrim(coalesce(p_suppression_reason,'')),'')) returning id into v_id;
  return jsonb_build_object('delivery_id',v_id,'status',v_status,'channel',v_channel,'template_version',v_template.version);
end $$;
revoke all on function public.rental_create_notification_template(uuid,text,text,text,text) from public,anon;
revoke all on function public.rental_get_notification_catalogue(uuid) from public,anon;
revoke all on function public.rental_plan_notification(uuid,text,text,uuid,text,jsonb,text) from public,anon;
grant execute on function public.rental_create_notification_template(uuid,text,text,text,text) to authenticated;
grant execute on function public.rental_get_notification_catalogue(uuid) to authenticated;
grant execute on function public.rental_plan_notification(uuid,text,text,uuid,text,jsonb,text) to authenticated;
