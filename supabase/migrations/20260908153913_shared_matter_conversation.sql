begin;
create table journey_private.messages (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  id uuid not null,
  actor_key text not null,
  author_role text not null,
  author_name text not null,
  audience text not null check (audience in ('everyone','professionals','buyer','seller','private')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  primary key(transaction_id,id)
);
alter table journey_private.messages enable row level security;
revoke all on journey_private.messages from public,anon,authenticated;
create index on journey_private.messages(transaction_id,created_at desc,id);
create index on journey_private.task_events(transaction_id,created_at desc,command_id);

-- Credential type, not a caller-supplied role, determines identity and audience.
create function journey_private.conversation_actor(p_transaction_id uuid,p_seller_token text,p_seller_session text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_listing uuid; v_matter uuid; v_role text; v_name text; v_link uuid;
begin
  if nullif(p_seller_token,'') is not null then
    if nullif(p_seller_session,'') is null then raise exception 'Portal access required.' using errcode='42501'; end if;
    v_payload := public.bridge_private_listing_seller_portal_payload(p_seller_token,p_seller_session,true);
    if v_payload is null or coalesce((v_payload->>'authRequired')::boolean,false) then
      raise exception 'Portal access required.' using errcode='42501'; end if;
    v_listing := nullif(v_payload#>>'{listing,id}','')::uuid;
    v_matter := public.bridge_resolve_private_listing_transaction_id(v_listing);
    if v_matter is null or v_matter is distinct from p_transaction_id then
      raise exception 'Matter access denied.' using errcode='42501'; end if;
    return jsonb_build_object('key','seller:'||v_listing,'role','seller','name','Seller','professional',false);
  end if;
  -- A portal header must never inherit a signed-in professional's privileges.
  if nullif(public.bridge_client_portal_request_token(),'') is not null then
    if not coalesce(public.bridge_has_client_portal_token_transaction_access(p_transaction_id),false) then
      raise exception 'Portal access required.' using errcode='42501'; end if;
    select id into v_link from public.client_portal_links
      where transaction_id=p_transaction_id and token=public.bridge_client_portal_request_token() and is_active is true limit 1;
    if v_link is null then raise exception 'Portal access required.' using errcode='42501'; end if;
    return jsonb_build_object('key','buyer:'||v_link,'role','buyer','name','Buyer','professional',false);
  end if;
  if auth.uid() is null or not coalesce(public.bridge_can_access_transaction_spine(p_transaction_id),false) then
    raise exception 'Matter access denied.' using errcode='42501'; end if;
  select lower(p.role),coalesce(nullif(to_jsonb(p)->>'full_name',''),initcap(p.role)) into v_role,v_name
    from public.profiles p where p.id=auth.uid();
  if v_role is null or v_role not in ('attorney','conveyancer','agent','developer','bond_originator','internal_admin','admin','agency_admin') then
    raise exception 'Professional matter access required.' using errcode='42501'; end if;
  return jsonb_build_object('key','user:'||auth.uid(),'role',v_role,'name',v_name,'professional',true);
end;
$$;
revoke all on function journey_private.conversation_actor(uuid,text,text) from public,anon,authenticated;

create function journey_private.can_post_message(p_transaction_id uuid,p_actor jsonb,p_audience text)
returns boolean language sql stable security definer set search_path='' as $$
  select case when not (p_actor->>'professional')::boolean then p_audience in ('everyone',p_actor->>'role')
    when p_actor->>'role' in ('attorney','conveyancer') then exists (
      select 1 from unnest(array['transfer_attorney','bond_attorney','cancellation_attorney']) lane
      where public.bridge_can_mutate_attorney_lane(p_transaction_id,lane,
        case when p_audience='private' then 'internal_notes' else 'shared_updates' end))
    else coalesce(public.bridge_has_transaction_permission(p_transaction_id,'comment'),false) end;
$$;
revoke all on function journey_private.can_post_message(uuid,jsonb,text) from public,anon,authenticated;

create function public.bridge_read_matter_conversation(p_transaction_id uuid,p_seller_token text default null,p_seller_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor jsonb; v_items jsonb;
begin
  v_actor := journey_private.conversation_actor(p_transaction_id,p_seller_token,p_seller_session);
  -- Routine updates come directly from committed, idempotent task events.
  -- No manual note, work packet, attachment or email is copied into this feed.
  with items as (
    select 'message:'||m.id id,m.created_at,jsonb_build_object('id','message:'||m.id,'kind','message',
      'authorRole',m.author_role,'authorName',m.author_name,'audience',m.audience,'body',m.body,'createdAt',m.created_at) item
    from journey_private.messages m where m.transaction_id=p_transaction_id and (
      m.audience='everyone' or m.audience=v_actor->>'role'
      or ((v_actor->>'professional')::boolean and m.audience in ('professionals','buyer','seller'))
      or (m.audience='private' and m.actor_key=v_actor->>'key'))
    union all
    select 'task:'||e.command_id,e.created_at,jsonb_build_object('id','task:'||e.command_id,'kind','milestone',
      'authorRole','system','authorName','Matter progress','audience','everyone',
      'laneKey',e.lane_key,'taskKey',e.step_key,'status',e.status,'previousStatus',e.previous_status,'revision',e.revision,
      'body',coalesce(c.definition#>>'{client,title}','Matter task')||' — '||case e.status
        when 'completed' then 'completed.' when 'completed_externally' then 'recorded as completed externally.'
        when 'not_applicable' then 'marked not applicable.' when 'not_started' then 'reopened.'
        when 'in_progress' then 'in progress.' when 'waiting' then 'waiting.' when 'blocked' then 'blocked.' end,
      'createdAt',e.created_at)
    from journey_private.task_events e join journey_private.task_catalog c on c.lane_key=e.lane_key and c.step_key=e.step_key
    where e.transaction_id=p_transaction_id and e.status<>e.previous_status
  ), recent as (select * from items order by created_at desc,id desc limit 100)
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_items from recent;
  return jsonb_build_object('transactionId',p_transaction_id,'items',v_items,'actorRole',v_actor->>'role',
    'audiences',(select coalesce(jsonb_agg(a order by position),'[]'::jsonb)
      from unnest(array['professionals','everyone','buyer','seller','private']) with ordinality as choices(a,position)
      where journey_private.can_post_message(p_transaction_id,v_actor,a)));
end;
$$;

create function public.bridge_post_matter_message(p_transaction_id uuid,p_command_id uuid,p_body text,p_audience text,
  p_seller_token text default null,p_seller_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor jsonb; v_existing journey_private.messages%rowtype; v_body text:=btrim(p_body);
begin
  v_actor := journey_private.conversation_actor(p_transaction_id,p_seller_token,p_seller_session);
  if p_command_id is null or v_body is null or length(v_body) not between 1 and 4000
    or p_audience is null or p_audience not in ('everyone','professionals','buyer','seller','private') then
    raise exception 'Message, audience and request ID are required (maximum 4000 characters).' using errcode='22023'; end if;
  if not coalesce(journey_private.can_post_message(p_transaction_id,v_actor,p_audience),false) then
    raise exception 'Message audience is not permitted.' using errcode='42501'; end if;
  -- Serialise only retries of this message, never all matters or conversations.
  perform pg_advisory_xact_lock(hashtextextended(p_transaction_id::text||p_command_id::text,0));
  select * into v_existing from journey_private.messages where transaction_id=p_transaction_id and id=p_command_id;
  if found then
    if v_existing.actor_key<>v_actor->>'key' or v_existing.body<>v_body or v_existing.audience<>p_audience then
      raise exception 'Request ID already used for another message.' using errcode='23505'; end if;
    return jsonb_build_object('id',p_command_id,'replayed',true);
  end if;
  insert into journey_private.messages(transaction_id,id,actor_key,author_role,author_name,audience,body)
    values(p_transaction_id,p_command_id,v_actor->>'key',v_actor->>'role',v_actor->>'name',p_audience,v_body);
  insert into public.transaction_refresh_signals(transaction_id,version,changed_at) values(p_transaction_id,1,now())
    on conflict(transaction_id) do update set version=public.transaction_refresh_signals.version+1,changed_at=excluded.changed_at;
  -- No notification enqueue: feed delivery is independent of push/email consent.
  return jsonb_build_object('id',p_command_id,'replayed',false);
end;
$$;
revoke all on function public.bridge_read_matter_conversation(uuid,text,text) from public;
revoke all on function public.bridge_post_matter_message(uuid,uuid,text,text,text,text) from public;
grant execute on function public.bridge_read_matter_conversation(uuid,text,text) to anon,authenticated;
grant execute on function public.bridge_post_matter_message(uuid,uuid,text,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
