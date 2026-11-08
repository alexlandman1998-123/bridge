-- One catalogue, with exact compatibility for existing email targeting.
begin;
lock table public.email_saved_audiences,public.marketing_audiences in access exclusive mode;

alter table public.marketing_audiences add column created_at timestamptz not null default now();
alter table public.marketing_audiences alter column created_by drop not null;
alter table public.marketing_audiences drop constraint marketing_audiences_name_check;
alter table public.marketing_audiences drop constraint marketing_audiences_description_check;
alter table public.marketing_audiences add constraint marketing_audiences_name_check check(length(btrim(name)) between 1 and case when definition ? 'emailFilter' then 140 else 120 end);
alter table public.marketing_audiences add constraint marketing_audiences_description_check check(length(description)<=600 or definition ? 'emailFilter');

alter function public.marketing_audience_validate(jsonb) rename to marketing_audience_validate_crm;
create function public.marketing_audience_validate(p_definition jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case when p_definition ? 'emailFilter' then
   jsonb_typeof(p_definition)='object' and jsonb_typeof(p_definition->'emailFilter')='object'
   and (p_definition-'emailFilter')='{}'::jsonb
 else public.marketing_audience_validate_crm(p_definition) end
$$;
revoke all on function public.marketing_audience_validate(jsonb) from public,anon;
grant execute on function public.marketing_audience_validate(jsonb) to authenticated,service_role;

create or replace function public.marketing_audience_protect() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce(public.marketing_audience_validate(new.definition),false) then raise exception 'Complete the audience rules before saving.'; end if;
 if tg_op='UPDATE' then
  if current_user='authenticated' and new.visibility='agency' and not public.email_campaign_can_send(new.organisation_id) and (old.visibility<>'agency' or new.definition is distinct from old.definition) then raise exception 'Workspace sharing access is required to change shared targeting.' using errcode='42501'; end if;
  if new.revision<>old.revision+1 then raise exception 'This audience changed. Refresh before saving.' using errcode='40001'; end if;
  new.updated_at:=now();
 end if;
 return new;
end $$;

alter policy marketing_audiences_update on public.marketing_audiences with check (public.bridge_is_active_member(organisation_id) and ((visibility='personal' and created_by=auth.uid()) or (visibility='agency' and (created_by=auth.uid() or public.email_campaign_can_send(organisation_id)))));

-- A collision must be reviewed; never overwrite another stored definition.
do $$ begin
 if exists(select 1 from public.email_saved_audiences e join public.marketing_audiences a on a.id=e.id) then
  raise exception 'Audience ID collision. Review the legacy and shared definitions before release.' using errcode='23505';
 end if;
end $$;
insert into public.marketing_audiences(id,organisation_id,name,description,visibility,definition,created_by,created_at,updated_at,archived_at)
 select id,organisation_id,name,description,'agency',jsonb_build_object('emailFilter',filter_json),created_by,created_at,updated_at,archived_at from public.email_saved_audiences;

-- Keep the original evidence, but remove the second writable library.
alter table public.email_saved_audiences rename to email_saved_audiences_archive;
revoke all on public.email_saved_audiences_archive from public,anon,authenticated,service_role;
grant select on public.email_saved_audiences_archive to service_role;
create view public.email_saved_audiences with(security_invoker=true) as
 select id,organisation_id,name,description,
  case when definition ? 'emailFilter' then definition->'emailFilter' else jsonb_build_object('shared_audience_id',id) end filter_json,
  created_by,created_at,updated_at,archived_at,revision,visibility,definition
 from public.marketing_audiences;
revoke all on public.email_saved_audiences from public,anon,authenticated,service_role;
grant select on public.email_saved_audiences to authenticated,service_role;

-- Called by privileged dispatch too: explicitly check personal/shared access.
create or replace function public.email_campaign_resolve_audience_rules(p_organisation_id uuid,p_filter jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare audience_id uuid; a public.marketing_audiences; rules jsonb:=coalesce(p_filter,'{}'); visited uuid[]:='{}';
begin
 loop
  audience_id:=coalesce(nullif(rules->>'saved_audience_id',''),nullif(rules->>'shared_audience_id',''))::uuid;
  if audience_id is null then return rules; end if;
  if rules ? 'saved_audience_id' and rules ? 'shared_audience_id' and rules->>'saved_audience_id' is distinct from rules->>'shared_audience_id' then raise exception 'Choose one saved audience.' using errcode='22023'; end if;
  if (rules-'saved_audience_id'-'shared_audience_id'-'audience_revision')<>'{}'::jsonb then raise exception 'Choose a saved audience or custom filters separately.' using errcode='22023'; end if;
  if audience_id=any(visited) then raise exception 'Audience references form a cycle.' using errcode='22023'; end if;
  visited:=array_append(visited,audience_id);
  if cardinality(visited)>20 then raise exception 'Audience reference limit exceeded.' using errcode='22023'; end if;
  select * into a from public.marketing_audiences where id=audience_id and organisation_id=p_organisation_id and archived_at is null
   and auth.uid() is not null and public.bridge_is_active_member(p_organisation_id)
   and (visibility='agency' or created_by=auth.uid());
  if a.id is null then raise exception 'The selected audience is unavailable.' using errcode='42501'; end if;
  if rules ? 'audience_revision' and (rules->>'audience_revision')::integer is distinct from a.revision then raise exception 'The saved audience changed. Refresh and choose it again.' using errcode='40001'; end if;
  if not (a.definition ? 'emailFilter') then return jsonb_build_object('shared_audience_id',a.id,'audience_revision',a.revision); end if;
  rules:=a.definition->'emailFilter';
 end loop;
end $$;

revoke all on function public.email_campaign_resolve_audience_rules(uuid,jsonb) from public,anon;
grant execute on function public.email_campaign_resolve_audience_rules(uuid,jsonb) to authenticated,service_role;

alter function public.marketing_audience_members(uuid,jsonb,uuid) rename to marketing_audience_crm_members;
create function public.marketing_audience_members(p_org uuid,p_definition jsonb,p_subscription uuid default null)
returns table(contact_id uuid,name text,email text,phone text,role text,stage text,area text,owner_id uuid,last_contacted_at timestamptz,email_id uuid,whatsapp_id uuid,email_reason text,whatsapp_reason text,recent boolean)
language plpgsql stable security invoker set search_path='' as $$
declare rules jsonb;
begin
 if not coalesce(public.marketing_audience_validate(p_definition),false) or auth.uid() is null or not public.bridge_is_active_member(p_org) then return; end if;
 if not (p_definition ? 'emailFilter') then
  return query select * from public.marketing_audience_crm_members(p_org,p_definition,p_subscription);
  return;
 end if;
 rules:=public.email_campaign_resolve_audience_rules(p_org,p_definition->'emailFilter');
 return query select c.id,coalesce(nullif(c.full_name,''),c.email),c.email,null::text,c.role_type,c.lead_stage,c.area,c.assigned_user_id,
  null::timestamptz,c.id,null::uuid,
  case when not public.email_campaign_can_send(p_org) then 'Email sending access required'
   when not c.is_valid_email then 'Not a valid email marketing contact'
   when exists(select 1 from public.email_suppressions s where s.organisation_id=p_org and s.email=c.email) then 'Email suppressed'
   when not exists(select 1 from public.contact_marketing_preferences p where p.organisation_id=p_org and p.email=c.email and p.marketing_consent_status='opted_in' and p.unsubscribed_at is null) then 'Email permission not recorded'
   when p_subscription is null then 'Choose an email subscription category'
   when not exists(select 1 from public.contact_email_subscriptions cs join public.email_subscription_types st on st.id=cs.subscription_type_id and st.organisation_id=cs.organisation_id and st.is_active where cs.organisation_id=p_org and cs.email=c.email and cs.subscription_type_id=p_subscription and cs.status='subscribed') then 'Not subscribed to this category' else null end,
  'Email targeting only. Create a CRM audience to use WhatsApp.'::text,false
 from public.email_marketing_contacts c where c.organisation_id=p_org and c.is_valid_email and public.email_campaign_contact_filter_matches(c,rules);
end $$;
revoke all on function public.marketing_audience_members(uuid,jsonb,uuid) from public,anon;
grant execute on function public.marketing_audience_members(uuid,jsonb,uuid) to authenticated,service_role;
grant execute on function public.marketing_audience_validate_crm(jsonb),public.marketing_audience_matches(jsonb,jsonb),public.marketing_audience_crm_members(uuid,jsonb,uuid) to service_role;

-- A caller's readable profile remains the boundary when a privileged email
-- selector invokes the CRM matcher. Do not raise on an unrelated private row.
create or replace function public.client_tags_for_contact(p_org uuid,p_contact uuid) returns text[]
language sql stable security invoker set search_path='' as $$
 select case when arch9_client_private.can_read_client(l.client_id) then
  array(select jsonb_array_elements_text(public.client_tag_workspace(p_org,l.client_id)->'tags')) end
 from public.agency_client_links l where l.organisation_id=p_org and l.source_kind='contact' and l.source_id=p_contact
$$;

create or replace function public.email_campaign_contact_filter_matches(p_contact public.email_marketing_contacts,p_filter jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare rules jsonb; a public.marketing_audiences;
begin
 rules:=public.email_campaign_resolve_audience_rules(p_contact.organisation_id,p_filter);
 if rules ? 'shared_audience_id' then
  select * into a from public.marketing_audiences where id=(rules->>'shared_audience_id')::uuid and organisation_id=p_contact.organisation_id and archived_at is null;
  if a.id is null or not public.bridge_is_active_member(p_contact.organisation_id) or not (a.visibility='agency' or a.created_by=auth.uid()) then raise exception 'The selected audience is unavailable.' using errcode='42501'; end if;
  -- Dispatch is privileged; a manual address must not expose private CRM targeting.
  if not arch9_client_private.email_contact_visible(p_contact.organisation_id,p_contact.email) then return false; end if;
  return exists(select 1 from public.marketing_audience_crm_members(p_contact.organisation_id,a.definition,null) m where m.email_id=p_contact.id and not (coalesce((a.definition->>'quietDays')::integer,0)>0 and m.recent));
 end if;
 p_contact.tags:=coalesce(arch9_client_private.client_tags_for_email(p_contact.organisation_id,p_contact.email),p_contact.tags);
 return (select coalesce(jsonb_typeof(rules)='object'
  and (rules->>'role_type' is null or p_contact.role_type=rules->>'role_type')
  and (rules->>'branch_id' is null or p_contact.branch_id::text=rules->>'branch_id')
  and (rules->>'assigned_user_id' is null or p_contact.assigned_user_id::text=rules->>'assigned_user_id')
  and (rules->>'lead_stage' is null or p_contact.lead_stage=rules->>'lead_stage')
  and (rules->>'area' is null or p_contact.area=rules->>'area')
  and (rules->>'tag' is null or rules->>'tag'=any(p_contact.tags))
  and (coalesce(jsonb_array_length(rules->'contact_ids'),0)=0 or p_contact.id::text in(select value from jsonb_array_elements_text(rules->'contact_ids')))
  and (coalesce(jsonb_typeof(rules->'rules'),'')<>'array' or public.email_audience_rule_matches(p_contact,rules)),false));
end $$;

create function public.marketing_audience_has_email_contact(p_org uuid,p_audience uuid,p_contact uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.marketing_audiences a cross join lateral public.marketing_audience_members(p_org,a.definition,null) m where a.organisation_id=p_org and a.id=p_audience and a.archived_at is null and m.email_id=p_contact)
$$;
revoke all on function public.marketing_audience_has_email_contact(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketing_audience_has_email_contact(uuid,uuid,uuid) to authenticated;

create function public.client_audience_memberships(p_org uuid,p_client uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare target uuid; memberships jsonb;
begin
 select coalesce(merged_into,id) into target from public.agency_client_profiles where organisation_id=p_org and id=p_client;
 if target is null or not arch9_client_private.can_read_client(target) then raise exception 'Client access required.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'description',a.description,'visibility',a.visibility,'revision',a.revision) order by a.name,a.id),'[]') into memberships
 from public.marketing_audiences a where a.organisation_id=p_org and a.archived_at is null and exists(
  select 1 from public.marketing_audience_members(p_org,a.definition,null) m where
   (not (a.definition ? 'emailFilter') and exists(select 1 from public.agency_client_links l where l.client_id=target and l.source_kind='contact' and l.source_id=m.contact_id))
   or (a.definition ? 'emailFilter' and exists(select 1 from public.agency_client_identifiers i where i.client_id=target and i.kind='email' and i.value=m.email))
 );
 return memberships;
end $$;
revoke all on function public.client_audience_memberships(uuid,uuid) from public,anon;
grant execute on function public.client_audience_memberships(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
