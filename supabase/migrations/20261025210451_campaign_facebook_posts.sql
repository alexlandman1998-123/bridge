begin;
-- Native organic Facebook results have their own campaign association. This
-- table never grants browser clients access to Page tokens or provider writes.
create table public.meta_campaign_posts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  campaign_id uuid not null,
  campaign_revision integer not null check(campaign_revision>0),
  connection_id uuid not null,
  request_id uuid not null,
  snapshot_json jsonb not null check(jsonb_typeof(snapshot_json)='object' and octet_length(snapshot_json::text)<=40000),
  status text not null default 'draft' check(status in ('draft','publishing','published','failed','unknown')),
  provider_post_id text,
  public_url text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz,
  foreign key(campaign_id,organisation_id) references public.marketing_campaigns(id,organisation_id),
  foreign key(connection_id,organisation_id) references public.meta_lead_ads_connections(id,organisation_id),
  unique(organisation_id,created_by,request_id),
  check(status<>'published' or (provider_post_id is not null and public_url is not null and provider_post_id ~ '^[0-9_]+$' and public_url='https://www.facebook.com/'||provider_post_id and published_at is not null)),
  check(error_message is null or length(error_message)<=500)
);
create index meta_campaign_posts_campaign on public.meta_campaign_posts(organisation_id,campaign_id,created_at desc,id);
alter table public.meta_campaign_posts enable row level security;
revoke all on public.meta_campaign_posts from public,anon,authenticated;
grant all on public.meta_campaign_posts to service_role;

create function public.meta_campaign_post_protect()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (new.id,new.organisation_id,new.campaign_id,new.campaign_revision,new.connection_id,new.request_id,new.snapshot_json,new.created_by,new.created_at)
    is distinct from (old.id,old.organisation_id,old.campaign_id,old.campaign_revision,old.connection_id,old.request_id,old.snapshot_json,old.created_by,old.created_at) then
    raise exception 'A reviewed campaign post preview cannot be changed.';
  end if;
  if new.status<>old.status and not ((old.status='draft' and new.status='publishing') or (old.status='publishing' and new.status in ('published','failed','unknown'))) then
    raise exception 'This campaign post was already submitted. Check its result before creating another preview.';
  end if;
  return new;
end $$;
revoke all on function public.meta_campaign_post_protect() from public,anon,authenticated;
grant execute on function public.meta_campaign_post_protect() to service_role;
create trigger meta_campaign_post_protect before update on public.meta_campaign_posts for each row execute function public.meta_campaign_post_protect();

-- The campaign row lock serialises a final revision/channel check with edits.
-- Publication happens after the claim and only after an explicit UI action.
create function public.meta_campaign_claim_post(p_org uuid,p_post uuid,p_actor uuid,p_revision integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.marketing_campaigns; p public.meta_campaign_posts; page public.meta_lead_ads_connections; member_role text;
begin
  select * into p from public.meta_campaign_posts where id=p_post and organisation_id=p_org and created_by=p_actor;
  if p.id is null then raise exception 'Post preview not found.'; end if;
  select * into c from public.marketing_campaigns where id=p.campaign_id and organisation_id=p_org for update;
  select role into member_role from public.organisation_users where organisation_id=p_org and user_id=p_actor and status='active';
  if c.id is null or c.revision<>p_revision or p.campaign_revision<>p_revision or c.status<>'draft' or not ('social'=any(c.planned_channels)) or c.campaign_builder->'reviewed' is distinct from 'true'::jsonb or c.campaign_builder#>'{contactProvenance,confirmed}' is distinct from 'true'::jsonb then
    raise exception 'The saved campaign changed. Prepare and review a new Facebook preview.' using errcode='40001';
  end if;
  if member_role is null or member_role not in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant') or (c.created_by<>p_actor and coalesce(public.bridge_organisation_role_authority_level(member_role),0)<400) then
    raise exception 'You no longer have permission to publish this campaign.' using errcode='42501';
  end if;
  if not exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=(c.campaign_builder->>'agentId')::uuid and status='active') then
    raise exception 'The campaign agent is no longer active in this agency.' using errcode='42501';
  end if;
  select * into page from public.meta_lead_ads_connections where id=p.connection_id and organisation_id=p_org for share;
  if page.id is null or page.connection_status is distinct from 'connected' or not coalesce(page.granted_scopes @> array['pages_manage_posts']::text[],false) or not coalesce(page.page_tasks && array['CREATE_CONTENT','MANAGE','PROFILE_PLUS_CREATE_CONTENT']::text[],false) then
    raise exception 'The Facebook Page no longer has posting permission.' using errcode='42501';
  end if;
  if page.page_id is distinct from (p.snapshot_json->>'pageId') then
    raise exception 'The connected Facebook Page changed. Prepare and review a new preview.' using errcode='40001';
  end if;
  update public.meta_campaign_posts set status='publishing',submitted_at=now() where id=p.id and organisation_id=p_org and status='draft';
  return found;
end $$;
revoke all on function public.meta_campaign_claim_post(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.meta_campaign_claim_post(uuid,uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
