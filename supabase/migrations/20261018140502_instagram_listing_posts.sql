begin;

alter table public.meta_lead_ads_connections
  add column publishing_version bigint not null default 1 check (publishing_version > 0);

create function public.meta_connection_publishing_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.publishing_version := old.publishing_version;
  if row(new.token_ciphertext,new.connection_status,new.granted_scopes,new.page_tasks,new.page_id)
     is distinct from row(old.token_ciphertext,old.connection_status,old.granted_scopes,old.page_tasks,old.page_id) then
    new.publishing_version := old.publishing_version + 1;
  end if;
  return new;
end;
$$;
revoke all on function public.meta_connection_publishing_version() from public,anon,authenticated;
create trigger meta_connection_publishing_version before update on public.meta_lead_ads_connections
  for each row execute function public.meta_connection_publishing_version();

alter table public.meta_listing_posts
  add column platform text not null default 'facebook' check (platform in ('facebook','instagram')),
  add column target_account_id text,
  add column target_account_name text,
  add column connection_version bigint,
  add column provider_container_id text,
  add column publishing_started_at timestamptz,
  add column publish_requested_at timestamptz,
  add constraint meta_instagram_post_target check (platform <> 'instagram' or
    (target_account_id ~ '^[0-9]{1,32}$' and target_account_id is not null and connection_version > 0 and connection_version is not null));
create unique index meta_instagram_container_identity on public.meta_listing_posts(provider_container_id)
  where platform='instagram' and provider_container_id is not null;

-- Only the authenticated Edge Function can claim work. A browser cannot choose
-- another actor, bypass membership, or repeat a provider submission directly.
create function public.meta_instagram_post_claim(p_org uuid,p_actor uuid,p_post uuid,p_stage text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare post public.meta_listing_posts; connection public.meta_lead_ads_connections;
begin
  perform 1 from public.organisation_users where organisation_id=p_org and user_id=p_actor and status='active'
    and role in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant') for share;
  if not found then raise exception 'Active staff membership is required.'; end if;
  select * into post from public.meta_listing_posts where id=p_post and organisation_id=p_org
    and created_by=p_actor and platform='instagram' for update;
  if not found then raise exception 'Instagram post preview not found.'; end if;
  select * into connection from public.meta_lead_ads_connections where id=post.connection_id and organisation_id=p_org for share;
  if not found or connection.connection_status <> 'connected' or connection.publishing_version <> post.connection_version
    or not (connection.granted_scopes @> array['instagram_basic','instagram_content_publish','pages_read_engagement'])
    or not (connection.page_tasks && array['CREATE_CONTENT','MANAGE','PROFILE_PLUS_CREATE_CONTENT']) then
    raise exception 'This connection changed. Reconnect and prepare a new preview.';
  end if;
  if p_stage='container' and post.status='draft' then
    update public.meta_listing_posts set status='publishing',publishing_started_at=now(),error_message=null where id=post.id;
    return true;
  elsif p_stage='publish' and post.status='publishing' and post.provider_container_id is not null and post.publish_requested_at is null then
    update public.meta_listing_posts set publish_requested_at=now() where id=post.id;
    return true;
  elsif p_stage not in ('container','publish') or p_stage is null then
    raise exception 'Invalid Instagram publish step.';
  end if;
  return false;
end;
$$;
revoke all on function public.meta_instagram_post_claim(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.meta_instagram_post_claim(uuid,uuid,uuid,text) to service_role;
grant select,update(user_id) on public.organisation_users to service_role;
grant select,update(id) on public.meta_lead_ads_connections to service_role;

commit;
