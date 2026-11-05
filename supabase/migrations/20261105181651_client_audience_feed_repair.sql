begin;

-- Private evidence is retained when a source disappears. Client history,
-- aliases, consent and source records themselves are never deleted here.
create table arch9_client_private.source_link_archive (
  link_id uuid primary key,
  organisation_id uuid not null,
  client_id uuid not null,
  source_kind text not null,
  source_id uuid not null,
  linked_at timestamptz not null,
  reason text not null check(reason in ('deleted','moved','missing_or_moved')),
  archived_at timestamptz not null default now()
);
alter table arch9_client_private.source_link_archive enable row level security;
revoke all on arch9_client_private.source_link_archive from public,anon,authenticated;
grant usage on schema arch9_client_private to service_role;
grant select,insert on arch9_client_private.source_link_archive to service_role;

create function arch9_client_private.source_exists(p_org uuid,p_kind text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  case p_kind
    when 'contact' then return exists(select 1 from public.contacts where contact_id=p_id and organisation_id=p_org);
    when 'lead' then return exists(select 1 from public.leads where lead_id=p_id and organisation_id=p_org);
    when 'buyer' then return exists(select 1 from public.buyers where id=p_id and organisation_id=p_org);
    when 'prospect' then return exists(select 1 from public.canvassing_prospects where id=p_id and organisation_id=p_org);
    when 'listing_seller' then return exists(select 1 from public.private_listings where id=p_id and organisation_id=p_org);
    when 'transaction_buyer','transaction_seller' then return exists(select 1 from public.transactions where id=p_id and organisation_id=p_org);
    else return true; -- Unknown sources fail closed through source_visible.
  end case;
end $$;
revoke all on function arch9_client_private.source_exists(uuid,text,uuid) from public,anon,authenticated;
grant execute on function arch9_client_private.source_exists(uuid,text,uuid) to service_role;

create or replace function arch9_client_private.can_read_client(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.agency_client_profiles requested join public.agency_client_profiles c on c.id=coalesce(requested.merged_into,requested.id)
  where requested.id=p_id and arch9_client_private.is_member(c.organisation_id)
   and (public.bridge_agency_open_operations(c.organisation_id) or (
    c.merged_into is null
    and exists(select 1 from public.agency_client_links l where l.client_id=c.id and arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id))
    and not exists(select 1 from public.agency_client_links l where l.client_id=c.id
      and arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id)
      and not arch9_client_private.source_visible(l.organisation_id,l.source_kind,l.source_id))
   )))
$$;

create function arch9_client_private.archive_client_source_links()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb:=to_jsonb(old); kinds text[]; scope uuid:=(old_row->>'organisation_id')::uuid; source uuid; lock_scope uuid;
begin
 if tg_op='UPDATE' and old_row->>'organisation_id' is not distinct from to_jsonb(new)->>'organisation_id' then return new; end if;
 kinds:=case tg_table_name when 'contacts' then array['contact'] when 'leads' then array['lead'] when 'buyers' then array['buyer'] when 'canvassing_prospects' then array['prospect'] when 'private_listings' then array['listing_seller'] else array['transaction_buyer','transaction_seller'] end;
 source:=coalesce(old_row->>'contact_id',old_row->>'lead_id',old_row->>'id')::uuid;
 -- Leads also contain contact_id; use their own key, not the parent contact.
 if tg_table_name='leads' then source:=(old_row->>'lead_id')::uuid; end if;
 if tg_table_name not in ('contacts','leads') then source:=(old_row->>'id')::uuid; end if;
 if scope is not null then
  for lock_scope in select value from unnest(array[scope,case when tg_op='UPDATE' then (to_jsonb(new)->>'organisation_id')::uuid end]) value where value is not null group by value order by value loop
   perform pg_advisory_xact_lock(hashtextextended(lock_scope::text,0));
  end loop;
  insert into arch9_client_private.source_link_archive(link_id,organisation_id,client_id,source_kind,source_id,linked_at,reason)
   select id,organisation_id,client_id,source_kind,source_id,created_at,case when tg_op='DELETE' then 'deleted' else 'moved' end
   from public.agency_client_links where organisation_id=scope and source_id=source and source_kind=any(kinds) on conflict do nothing;
  if tg_op='DELETE' then delete from public.agency_client_links where organisation_id=scope and source_id=source and source_kind=any(kinds); end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function arch9_client_private.archive_client_source_links() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['contacts','leads','buyers','canvassing_prospects','private_listings','transactions'] loop
  execute format('create trigger client_source_move_archive before update on public.%I for each row execute function arch9_client_private.archive_client_source_links()',t);
  -- Run after existing activity capture so the deletion can still be attributed.
  execute format('create trigger zzzz_client_source_delete_archive after delete on public.%I for each row execute function arch9_client_private.archive_client_source_links()',t);
 end loop;
end $$;

create function public.email_campaign_repair_client_links(p_organisation_id uuid,p_apply boolean default false)
returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if p_organisation_id is null then raise exception 'Organisation is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,0));
 if not coalesce(p_apply,false) then
  select count(*)::integer into affected from public.agency_client_links l where organisation_id=p_organisation_id and not arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id);
  return affected;
 end if;
 insert into arch9_client_private.source_link_archive(link_id,organisation_id,client_id,source_kind,source_id,linked_at,reason)
  select id,organisation_id,client_id,source_kind,source_id,created_at,'missing_or_moved' from public.agency_client_links l
  where organisation_id=p_organisation_id and not arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id) on conflict do nothing;
 delete from public.agency_client_links l where organisation_id=p_organisation_id and not arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id);
 get diagnostics affected=row_count;
 return affected;
end $$;
revoke all on function public.email_campaign_repair_client_links(uuid,boolean) from public,anon,authenticated;
grant execute on function public.email_campaign_repair_client_links(uuid,boolean) to service_role;

create function arch9_client_private.email_projection_rows(p_org uuid)
returns table(contact_id uuid,organisation_id uuid,email text,first_name text,last_name text,role_type text,branch_id uuid,assigned_user_id uuid,lead_stage text,area text,source_updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.contact_id,c.organisation_id,lower(btrim(c.email)),nullif(btrim(c.first_name),''),nullif(btrim(c.last_name),''),nullif(lower(btrim(c.contact_type)),''),
  case when exists(select 1 from public.organisation_branches b where b.id=l.branch_id and b.organisation_id=c.organisation_id) then l.branch_id end,
  coalesce(l.assigned_user_id,c.assigned_agent_id),nullif(btrim(l.stage),''),nullif(btrim(l.area_interest),''),c.updated_at
 from public.contacts c join public.organisations o on o.id=c.organisation_id and o.type='agency'
 left join lateral(select s.branch_id,s.assigned_user_id,s.stage,s.area_interest from public.leads s
   where s.organisation_id=c.organisation_id and s.contact_id=c.contact_id and coalesce(s.lead_domain,'agency')='agency'
    and not coalesce(s.is_demo_data,false)
   order by s.updated_at desc nulls last,s.lead_id limit 1) l on true
 where c.organisation_id=p_org and length(btrim(c.email))<=320 and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  and not coalesce(c.is_demo_data,false)
  and not coalesce(to_jsonb(c)->'demo_metadata' @> '{"seedData":true}' or to_jsonb(c)->'demo_metadata' @> '{"isDemoData":true}' or to_jsonb(c)->'demo_metadata' @> '{"is_demo_data":true}' or to_jsonb(c)->'demo_metadata' @> '{"seed_data":true}' or to_jsonb(c)->'demo_metadata' @> '{"migratedFromLocalStorage":true}',false)
  and (not exists(select 1 from public.leads s where s.organisation_id=c.organisation_id and s.contact_id=c.contact_id and coalesce(s.lead_domain,'agency')<>'agency')
    or exists(select 1 from public.leads s where s.organisation_id=c.organisation_id and s.contact_id=c.contact_id and coalesce(s.lead_domain,'agency')='agency' and not coalesce(s.is_demo_data,false)))
$$;
revoke all on function arch9_client_private.email_projection_rows(uuid) from public,anon,authenticated;
grant execute on function arch9_client_private.email_projection_rows(uuid) to service_role;

create or replace function public.email_campaign_refresh_contact_projection(p_organisation_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if p_organisation_id is null then raise exception 'Organisation is required.' using errcode='22023'; end if;
 if not exists(select 1 from public.organisations where id=p_organisation_id and type='agency') then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended('email-projection:'||p_organisation_id::text,0));
 insert into public.email_marketing_contacts(organisation_id,branch_id,source_type,source_id,email,first_name,last_name,full_name,role_type,assigned_user_id,lead_stage,area,is_valid_email)
  select distinct on(r.email) r.organisation_id,r.branch_id,'crm',r.contact_id,r.email,r.first_name,r.last_name,nullif(concat_ws(' ',r.first_name,r.last_name),''),r.role_type,r.assigned_user_id,r.lead_stage,r.area,true
  from arch9_client_private.email_projection_rows(p_organisation_id) r order by r.email,r.source_updated_at desc nulls last,r.contact_id
  on conflict(organisation_id,email) do update set branch_id=excluded.branch_id,source_type='crm',source_id=excluded.source_id,first_name=excluded.first_name,last_name=excluded.last_name,
   full_name=excluded.full_name,role_type=excluded.role_type,assigned_user_id=excluded.assigned_user_id,lead_stage=excluded.lead_stage,area=excluded.area,is_valid_email=true;
 insert into public.email_marketing_contact_sources(organisation_id,marketing_contact_id,source_kind,source_id,source_snapshot)
  select r.organisation_id,m.id,'crm_contact',r.contact_id,jsonb_build_object('contactId',r.contact_id,'roleType',r.role_type,'leadStage',r.lead_stage,'area',r.area)
  from arch9_client_private.email_projection_rows(p_organisation_id) r join public.email_marketing_contacts m on m.organisation_id=r.organisation_id and m.email=r.email
  on conflict(organisation_id,source_kind,source_id) do update set marketing_contact_id=excluded.marketing_contact_id,source_snapshot=excluded.source_snapshot,synced_at=now();
 get diagnostics affected=row_count;
 -- Tag-only rows for other visible client sources are not owned by this feed.
 update public.email_marketing_contacts m set is_valid_email=false where m.organisation_id=p_organisation_id and m.source_type='crm' and m.is_valid_email
  and (m.source_id is not null or exists(select 1 from public.email_marketing_contact_sources s where s.organisation_id=m.organisation_id and s.marketing_contact_id=m.id and s.source_kind='crm_contact'))
  and not exists(select 1 from arch9_client_private.email_projection_rows(p_organisation_id) r where r.email=m.email);
 return affected;
end $$;
revoke all on function public.email_campaign_refresh_contact_projection(uuid) from public,anon,authenticated;
grant execute on function public.email_campaign_refresh_contact_projection(uuid) to service_role;

-- Initial tag rows for visible clients remain governed by source-access RLS.
-- Browser tag edits cannot turn a private CRM projection into a manual row
-- or rewrite its server-maintained source identity and metadata.
create function public.email_campaign_protect_crm_projection()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
  if tg_op='UPDATE' and (old.source_type='crm' or new.source_type='crm') and
   (to_jsonb(new)-'tags'-'updated_at') is distinct from (to_jsonb(old)-'tags'-'updated_at') then
   raise exception 'Only CRM projection tags may be edited here.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.email_campaign_protect_crm_projection() from public,anon,authenticated;
create trigger email_crm_projection_guard before update on public.email_marketing_contacts for each row execute function public.email_campaign_protect_crm_projection();

-- A statement trigger refreshes each affected organisation once for a batch.
create function arch9_client_private.refresh_email_projection_statement()
returns trigger language plpgsql security definer set search_path='' as $$
declare scope uuid;
begin
 if tg_op='INSERT' then
  for scope in select distinct organisation_id from new_crm_rows where organisation_id is not null order by organisation_id loop perform public.email_campaign_refresh_contact_projection(scope); end loop;
 elsif tg_op='DELETE' then
  for scope in select distinct organisation_id from old_crm_rows where organisation_id is not null order by organisation_id loop perform public.email_campaign_refresh_contact_projection(scope); end loop;
 else
  for scope in select organisation_id from new_crm_rows where organisation_id is not null union select organisation_id from old_crm_rows where organisation_id is not null order by organisation_id loop perform public.email_campaign_refresh_contact_projection(scope); end loop;
 end if;
 return null;
end $$;
revoke all on function arch9_client_private.refresh_email_projection_statement() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['contacts','leads'] loop
  execute format('create trigger email_projection_insert after insert on public.%I referencing new table as new_crm_rows for each statement execute function arch9_client_private.refresh_email_projection_statement()',t);
  execute format('create trigger email_projection_update after update on public.%I referencing new table as new_crm_rows old table as old_crm_rows for each statement execute function arch9_client_private.refresh_email_projection_statement()',t);
  execute format('create trigger email_projection_delete after delete on public.%I referencing old table as old_crm_rows for each statement execute function arch9_client_private.refresh_email_projection_statement()',t);
 end loop;
end $$;

-- Projection membership must not bypass the permanent client's source privacy.
create function arch9_client_private.email_contact_visible(p_org uuid,p_email text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.agency_client_identifiers i where i.organisation_id=p_org and i.kind='email' and i.value=p_email and arch9_client_private.can_read_client(i.client_id))
$$;
revoke all on function arch9_client_private.email_contact_visible(uuid,text) from public,anon;
grant execute on function arch9_client_private.email_contact_visible(uuid,text) to authenticated,service_role;
create policy email_crm_source_access on public.email_marketing_contacts as restrictive for all to authenticated
 using(source_type<>'crm' or arch9_client_private.email_contact_visible(organisation_id,email))
 with check(source_type<>'crm' or arch9_client_private.email_contact_visible(organisation_id,email));

create function public.email_campaign_contact_filter_matches(p_contact public.email_marketing_contacts,p_filter jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_typeof(p_filter)='object'
  and (p_filter->>'role_type' is null or p_contact.role_type=p_filter->>'role_type')
  and (p_filter->>'branch_id' is null or p_contact.branch_id::text=p_filter->>'branch_id')
  and (p_filter->>'assigned_user_id' is null or p_contact.assigned_user_id::text=p_filter->>'assigned_user_id')
  and (p_filter->>'lead_stage' is null or p_contact.lead_stage=p_filter->>'lead_stage')
  and (p_filter->>'area' is null or p_contact.area=p_filter->>'area')
  and (p_filter->>'tag' is null or p_filter->>'tag'=any(p_contact.tags))
  and (coalesce(jsonb_array_length(p_filter->'contact_ids'),0)=0 or p_contact.id::text in(select value from jsonb_array_elements_text(p_filter->'contact_ids')))
  and (coalesce(jsonb_typeof(p_filter->'rules'),'')<>'array' or public.email_audience_rule_matches(p_contact,p_filter)),false)
$$;
revoke all on function public.email_campaign_contact_filter_matches(public.email_marketing_contacts,jsonb) from public,anon;
grant execute on function public.email_campaign_contact_filter_matches(public.email_marketing_contacts,jsonb) to authenticated,service_role;

create or replace function public.email_audience_preview(p_organisation_id uuid,p_rules jsonb default '{}'::jsonb,p_limit integer default 8,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rules jsonb; total integer; contacts jsonb;
begin
 if not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
 rules:=public.email_campaign_resolve_audience_rules(p_organisation_id,coalesce(p_rules,'{}'));
 if jsonb_typeof(rules) is distinct from 'object' then raise exception 'Audience filters must be an object.' using errcode='22023'; end if;
 select count(*)::integer into total from public.email_marketing_contacts c where c.organisation_id=p_organisation_id and c.is_valid_email and public.email_campaign_contact_filter_matches(c,rules);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(full_name,''),email),'email',email,'contactType',role_type,'assignedAgentId',assigned_user_id,'area',area,'leadStage',lead_stage,'tags',tags)),'[]') into contacts
  from(select c.* from public.email_marketing_contacts c where c.organisation_id=p_organisation_id and c.is_valid_email and public.email_campaign_contact_filter_matches(c,rules)
   order by c.full_name nulls last,c.email limit greatest(1,least(coalesce(p_limit,8),50)) offset greatest(0,coalesce(p_offset,0))) page;
 return jsonb_build_object('count',total,'contacts',contacts);
end $$;

revoke all on function public.email_audience_preview(uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.email_audience_preview(uuid,jsonb,integer,integer) to authenticated,service_role;

create or replace function public.email_campaign_preview_audience(
  p_organisation_id uuid,
  p_subscription_type_id uuid,
  p_filter jsonb default '{}'::jsonb
) returns integer language plpgsql stable security definer set search_path = public as $$
declare v_count integer; v_rules jsonb;
begin
  if p_organisation_id is null or p_subscription_type_id is null then return 0; end if;
  if not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode = '42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(p_organisation_id, p_filter);
  select count(*)::integer into v_count
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email and p.marketing_consent_status='opted_in'
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=p_subscription_type_id and cs.status='subscribed'
  where c.organisation_id=p_organisation_id and c.is_valid_email and s.id is null
    and (c.source_type<>'crm' or arch9_client_private.email_contact_visible(c.organisation_id,c.email))
    and (coalesce(jsonb_typeof(v_rules->'rules'), '') <> 'array' or public.email_audience_rule_matches(c, v_rules))
    and (v_rules->>'role_type' is null or c.role_type=v_rules->>'role_type')
    and (v_rules->>'branch_id' is null or c.branch_id::text=v_rules->>'branch_id')
    and (v_rules->>'assigned_user_id' is null or c.assigned_user_id::text=v_rules->>'assigned_user_id')
    and (v_rules->>'lead_stage' is null or c.lead_stage=v_rules->>'lead_stage')
    and (v_rules->>'area' is null or c.area=v_rules->>'area')
    and (v_rules->>'tag' is null or v_rules->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_rules->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_rules->'contact_ids')));
  return coalesce(v_count,0);
end $$;

create or replace function public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.email_campaigns%rowtype; v_count integer; v_rules jsonb;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised to schedule this campaign.' using errcode = '42501'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'Only an unsent campaign can be scheduled.' using errcode = '22023'; end if;
  if v_campaign.subscription_type_id is null or not exists (select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active) then raise exception 'Choose an active email subscription type before scheduling.' using errcode = '22023'; end if;
  if exists (select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.paused_at is not null) then raise exception 'Sending is paused for this organisation.' using errcode = '22023'; end if;
  if not public.email_campaign_sender_ready(v_campaign.organisation_id,v_campaign.sender_identity_id) then raise exception 'Choose a ready sender before scheduling.' using errcode='22023'; end if;
  if not exists(select 1 from public.email_sending_policies p where p.organisation_id=v_campaign.organisation_id and p.approved_at is not null and p.paused_at is null and p.manual_paused_at is null and not p.self_service_blocked) then raise exception 'Organisation sending is not approved and active.' using errcode='42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(v_campaign.organisation_id, v_campaign.audience_filter);
  insert into public.email_campaign_recipients (organisation_id, campaign_id, contact_id, email, recipient_snapshot)
  select c.organisation_id, v_campaign.id, c.id, c.email, jsonb_build_object('first_name',c.first_name,'last_name',c.last_name,'full_name',c.full_name,'agent_name','', 'agency_name','', 'branch_name','')
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=v_campaign.subscription_type_id and cs.status='subscribed'
  where c.organisation_id=v_campaign.organisation_id and c.is_valid_email and s.id is null
    and (c.source_type<>'crm' or arch9_client_private.email_contact_visible(c.organisation_id,c.email)) and coalesce(p.marketing_consent_status,'unknown') = 'opted_in'
    and (coalesce(jsonb_typeof(v_rules->'rules'), '') <> 'array' or public.email_audience_rule_matches(c, v_rules))
    and (v_rules->>'role_type' is null or c.role_type = v_rules->>'role_type')
    and (v_rules->>'branch_id' is null or c.branch_id::text = v_rules->>'branch_id')
    and (v_rules->>'assigned_user_id' is null or c.assigned_user_id::text = v_rules->>'assigned_user_id')
    and (v_rules->>'lead_stage' is null or c.lead_stage = v_rules->>'lead_stage')
    and (v_rules->>'area' is null or c.area = v_rules->>'area')
    and (v_rules->>'tag' is null or v_rules->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_rules->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_rules->'contact_ids')))
  on conflict (campaign_id,email) do nothing;
  get diagnostics v_count = row_count;
  update public.email_campaigns set status = case when p_send_at <= now() then 'sending' else 'scheduled' end, scheduled_for=p_send_at, audience_snapshot_at=coalesce(audience_snapshot_at,now()), updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'scheduled',jsonb_build_object('scheduled_for',p_send_at,'eligible_recipients',v_count));
  insert into public.email_campaign_dispatch_jobs (campaign_id, organisation_id, run_at) values (v_campaign.id, v_campaign.organisation_id, p_send_at) on conflict (campaign_id) do update set run_at=excluded.run_at, status='queued', last_error=null, locked_at=null;
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*)::integer from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

-- Existing data is not bulk-modified here. Approved releases can preview source
-- repairs and invoke the service-only projection refresh before enabling sends.
commit;
