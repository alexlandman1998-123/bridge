begin;

-- Independent website connections reuse the canonical listing projection and
-- website enquiry command. This is configuration + a durable event/outbox log,
-- never a second listing or CRM store.
create schema if not exists external_websites_private;
revoke all on schema external_websites_private from public, anon, authenticated;
grant usage on schema external_websites_private to service_role;

create table public.external_website_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) check (organisation_id='322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid),
  name text not null check (length(trim(name)) between 2 and 160),
  website_url text not null check (website_url ~ '^https://'),
  mode text not null check (mode in ('leads_only','listings_and_leads')),
  scope text not null check (scope in ('organisation','branches','development')),
  branch_ids uuid[] not null default '{}',
  development_id uuid references public.developments(id),
  fallback_user_id uuid not null references auth.users(id),
  enabled boolean not null default true,
  include_sold boolean not null default false,
  include_rented boolean not null default false,
  public_contacts boolean not null default false,
  token_hash text,
  credential_updated_at timestamptz,
  webhook_url text,
  webhook_secret_id uuid,
  last_listing_request_at timestamptz,
  last_enquiry_at timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope='organisation' and cardinality(branch_ids)=0 and development_id is null)
    or (scope='branches' and cardinality(branch_ids)>0 and development_id is null)
    or (scope='development' and cardinality(branch_ids)=0 and development_id is not null))
);
create index external_website_connections_org_idx on public.external_website_connections(organisation_id);
create table public.external_website_events (
  sequence bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  connection_id uuid not null references public.external_website_connections(id),
  listing_id uuid not null, -- retained when a source listing is deleted
  event_type text not null check (event_type in ('listing.published','listing.updated','listing.withdrawn')),
  occurred_at timestamptz not null default clock_timestamp(),
  schema_version integer not null default 1
);
create index external_website_events_connection_cursor_idx on public.external_website_events(connection_id,sequence);
create index external_website_events_listing_idx on public.external_website_events(connection_id,listing_id,sequence desc);
create table public.external_website_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.external_website_events(id),
  connection_id uuid not null references public.external_website_connections(id),
  status text not null default 'queued' check (status in ('queued','processing','retry','delivered','failed','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_id uuid,
  completed_at timestamptz,
  http_status integer,
  error_code text
);
create index external_website_deliveries_due_idx on public.external_website_deliveries(next_attempt_at)
  where status in ('queued','retry','processing');
create index external_website_deliveries_connection_idx on public.external_website_deliveries(connection_id,status);
create table public.external_website_activity (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.external_website_connections(id),
  action text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);
create index external_website_activity_connection_idx on public.external_website_activity(connection_id,created_at desc);
create table public.external_website_rate_buckets (
  connection_id uuid not null references public.external_website_connections(id),
  bucket timestamptz not null,
  requests integer not null default 0,
  primary key(connection_id,bucket)
);

do $security$
declare t text;
begin
  foreach t in array array['external_website_connections','external_website_events','external_website_deliveries','external_website_activity','external_website_rate_buckets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end;
$security$;
grant usage, select on sequence public.external_website_events_sequence_seq to service_role;

create function external_websites_private.in_scope(c public.external_website_connections,l public.private_listings)
returns boolean language sql stable set search_path='' as $$
  select l.organisation_id=c.organisation_id and (c.scope='organisation'
    or (c.scope='branches' and l.branch_id=any(c.branch_ids))
    or (c.scope='development' and l.development_id=c.development_id));
$$;

create function external_websites_private.public_media_url(p_url text)
returns boolean language sql immutable set search_path='' as $$
  select p_url ~ '^https://[^[:space:]@]+$'
    and p_url !~* '(token=|signature=|x-amz-|/object/sign/|/object/authenticated/|/documents/)'
    and (p_url !~* '/storage/v1/' or p_url ~ '/storage/v1/object/public/(listing-media|website-listing-media)/');
$$;

-- Reuse already prepared public website assets for private source uploads.
-- A copy must remain active, match the current marketing media and belong to
-- a hosted site in the listing's organisation. No new media store is created.
create function external_websites_private.marketing_media(p_listing uuid)
returns table(id uuid,media_type text,url text,caption text,sort_order integer)
language sql stable set search_path='' as $$
  select m.id,m.media_type,coalesce(asset.public_url,m.file_url),m.caption,m.sort_order
  from public.listing_media m join public.private_listings l on l.id=m.listing_id
  left join lateral (
    select a.public_url from public.website_listing_media_assets a
      join public.website_sites s on s.id=a.website_site_id and s.organisation_id=l.organisation_id
    where a.listing_id=l.id and a.source_media_id=m.id and a.media_type=m.media_type
      and a.status='active' and external_websites_private.public_media_url(a.public_url)
    order by a.updated_at desc,a.id limit 1
  ) asset on true
  where m.listing_id=p_listing and m.media_type in ('image','floor_plan','video','virtual_tour')
    and external_websites_private.public_media_url(coalesce(asset.public_url,m.file_url));
$$;

-- Exact addresses and coordinates are omitted regardless of legacy privacy
-- settings. Media is explicitly marketing media, never documents or signed URLs.
create function external_websites_private.listing(c public.external_website_connections,p_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',l.id,'reference',coalesce(to_jsonb(l)->>'arch9_reference',l.listing_reference),'title',p.title,'description',p.description,
    'price',p.asking_price,'currency','ZAR','propertyType',p.property_type,
    'transactionType',lower(p.listing_type),
    'location',jsonb_build_object('suburb',p.suburb,'city',l.city,'province',p.province),
    'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,'parking',p.parking_bays,'garages',p.garages,
    'size',jsonb_build_object('floor',p.floor_size,'land',p.erf_size,'unit','m2'),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'caption',m.caption,'order',m.sort_order) order by m.sort_order,m.id)
      from external_websites_private.marketing_media(l.id) m where m.media_type='image'),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('type',m.media_type,'url',m.url,'caption',m.caption,'order',m.sort_order) order by m.sort_order,m.id)
      from external_websites_private.marketing_media(l.id) m where m.media_type in ('floor_plan','video','virtual_tour')),'[]'::jsonb),
    'agent',case when c.public_contacts then (select jsonb_build_object('id',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'email',u.email,'phone',to_jsonb(u)->>'phone')
      from public.organisation_users u where u.organisation_id=c.organisation_id and u.user_id=l.assigned_agent_id and u.status='active' order by u.updated_at desc limit 1) end,
    'branch',case when c.public_contacts then (select jsonb_build_object('id',b.id,'name',b.name,'email',b.email,'phone',b.phone)
      from public.organisation_branches b where b.id=l.branch_id and b.organisation_id=c.organisation_id and b.is_active) else jsonb_build_object('id',l.branch_id) end,
    'development',case when d.id is not null then jsonb_build_object('id',d.id,'name',d.name) end,
    'status',case when l.listing_status in ('sold','rented','let') then l.listing_status else 'published' end,
    'publishedAt',coalesce((select min(occurred_at) from public.external_website_events where connection_id=c.id and listing_id=l.id and event_type='listing.published'),p.created_at),'updatedAt',greatest(p.updated_at,l.updated_at,coalesce((select max(m.updated_at) from public.listing_media m where m.listing_id=l.id),p.updated_at),coalesce((select max(occurred_at) from public.external_website_events where connection_id=c.id and listing_id=l.id),p.updated_at))
  ) from public.private_listings l join public.listing_publication_data p on p.listing_id=l.id
    left join public.developments d on d.id=l.development_id and d.organisation_id=c.organisation_id
  where l.id=p_id and external_websites_private.in_scope(c,l)
    and p.status='Published' and l.listing_visibility='active_market'
    and (l.listing_status in ('active','under_offer')
      or (l.listing_status='sold' and c.include_sold)
      or (l.listing_status in ('rented','let') and c.include_rented))
    and nullif(trim(p.title),'') is not null and p.asking_price>0;
$$;

-- Row locks serialize cursor allocation and feed reads per connection, so a
-- transaction cannot commit an earlier sequence after a client advances past it.
create function external_websites_private.emit(p_connection uuid,p_listing uuid,p_force boolean default false)
returns void language plpgsql set search_path='' as $$
declare c public.external_website_connections%rowtype; previous text; payload jsonb; event_id uuid; kind text;
begin
  select * into c from public.external_website_connections where id=p_connection for update;
  select event_type into previous from public.external_website_events
    where connection_id=c.id and listing_id=p_listing order by sequence desc limit 1;
  payload := case when c.mode='listings_and_leads' then external_websites_private.listing(c,p_listing) end;
  if payload is null and (previous is null or previous='listing.withdrawn') then return; end if;
  kind := case when payload is null then 'listing.withdrawn'
    when previous is null or previous='listing.withdrawn' then 'listing.published' else 'listing.updated' end;
  if not p_force and not c.enabled then return; end if;
  insert into public.external_website_events(connection_id,listing_id,event_type)
    values(c.id,p_listing,kind) returning id into event_id;
  if c.enabled and c.token_hash is not null and c.webhook_url is not null then
    insert into public.external_website_deliveries(event_id,connection_id) values(event_id,c.id);
  end if;
end;
$$;

create function external_websites_private.listing_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare listing_id uuid; c record;
begin
  listing_id := (coalesce(to_jsonb(new),to_jsonb(old))->>case when tg_table_name='private_listings' then 'id' else 'listing_id' end)::uuid;
  for c in select id from public.external_website_connections where enabled order by id loop
    perform external_websites_private.emit(c.id,listing_id);
  end loop;
  return null;
end;
$$;
create trigger external_website_listing_changed after insert or update or delete on public.private_listings
for each row execute function external_websites_private.listing_changed();
create trigger external_website_projection_changed after insert or update or delete on public.listing_publication_data
for each row execute function external_websites_private.listing_changed();
create trigger external_website_media_changed after insert or update or delete on public.listing_media
for each row execute function external_websites_private.listing_changed();
create trigger external_website_public_media_changed after insert or update or delete on public.website_listing_media_assets
for each row execute function external_websites_private.listing_changed();

-- Public related details can change without a listing row changing.
create function external_websites_private.related_details_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record; c record; changed jsonb:=coalesce(to_jsonb(new),to_jsonb(old));
begin
  for item in select l.id from public.private_listings l where
    (tg_table_name='developments' and l.development_id=(changed->>'id')::uuid)
    or (tg_table_name='organisation_branches' and l.branch_id=(changed->>'id')::uuid)
    or (tg_table_name='organisation_users' and l.assigned_agent_id=(changed->>'user_id')::uuid and l.organisation_id=(changed->>'organisation_id')::uuid)
  loop
    for c in select id from public.external_website_connections where enabled and
      (tg_table_name='developments' or public_contacts) order by id
    loop perform external_websites_private.emit(c.id,item.id); end loop;
  end loop;
  return null;
end;
$$;
create trigger external_website_agent_changed after update or delete on public.organisation_users for each row execute function external_websites_private.related_details_changed();
create trigger external_website_branch_changed after update or delete on public.organisation_branches for each row execute function external_websites_private.related_details_changed();
create trigger external_website_development_changed after update or delete on public.developments for each row execute function external_websites_private.related_details_changed();

create function external_websites_private.validate_connection()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from unnest(new.branch_ids) b where not exists(select 1 from public.organisation_branches where id=b and organisation_id=new.organisation_id and is_active))
    or (new.development_id is not null and not exists(select 1 from public.developments where id=new.development_id and organisation_id=new.organisation_id))
    or not exists(select 1 from public.organisation_users where organisation_id=new.organisation_id and user_id=new.fallback_user_id and status='active'
      and (new.scope<>'branches' or branch_id=any(new.branch_ids))) then
    raise exception 'Choose branches, development and an active fallback user within the approved organisation scope.' using errcode='22023';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger external_website_connection_boundary before insert or update of organisation_id,branch_ids,development_id,fallback_user_id,scope
on public.external_website_connections for each row execute function external_websites_private.validate_connection();

create function external_websites_private.safe_connection(c public.external_website_connections)
returns jsonb language sql stable set search_path='' as $$
  select (to_jsonb(c)-'token_hash'-'webhook_secret_id') || jsonb_build_object('credentialsConfigured',c.token_hash is not null,
    'recentFailures',(select count(*) from public.external_website_deliveries where connection_id=c.id and status in ('retry','failed'))+(select count(*) from public.external_website_activity where connection_id=c.id and outcome like 'rejected_%' and created_at>=now()-interval '24 hours'),
    'scopeLabel',case c.scope when 'organisation' then 'Revo organisation' when 'branches' then 'Selected branches' else 'Selected development' end);
$$;

create function public.external_website_manage(p_organisation_id uuid,p_connection_id uuid default null,p_action text default 'list',p_config jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.external_website_connections%rowtype; credential text; secret text; row_id uuid; l record; result jsonb;
begin
  if auth.uid() is null or p_organisation_id<>'322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
    or not public.bridge_is_org_admin(p_organisation_id) then
    raise exception 'Revo organisation administrator access is required.' using errcode='42501';
  end if;
  if p_action='list' then
    return jsonb_build_object('connections',coalesce((select jsonb_agg(external_websites_private.safe_connection(x) order by x.created_at) from public.external_website_connections x where organisation_id=p_organisation_id),'[]'::jsonb),
      'branches',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.organisation_branches where organisation_id=p_organisation_id and is_active),'[]'::jsonb),
      'developments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.developments where organisation_id=p_organisation_id),'[]'::jsonb),
      'users',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'name',coalesce(nullif(trim(concat_ws(' ',first_name,last_name)),''),email,user_id::text),'branchId',branch_id)) from public.organisation_users where organisation_id=p_organisation_id and status='active' and user_id is not null),'[]'::jsonb));
  end if;
  if p_action='create' then
    insert into public.external_website_connections(organisation_id,name,website_url,mode,scope,branch_ids,development_id,fallback_user_id,enabled,public_contacts,include_sold,include_rented,webhook_url)
    values(p_organisation_id,p_config->>'name',p_config->>'website_url',p_config->>'mode',p_config->>'scope',
      coalesce(array(select jsonb_array_elements_text(p_config->'branch_ids')::uuid),'{}'),nullif(p_config->>'development_id','')::uuid,
      (p_config->>'fallback_user_id')::uuid,coalesce((p_config->>'enabled')::boolean,true),coalesce((p_config->>'public_contacts')::boolean,false),
      coalesce((p_config->>'include_sold')::boolean,false),coalesce((p_config->>'include_rented')::boolean,false),nullif(p_config->>'webhook_url','')) returning * into c;
  else
    select * into c from public.external_website_connections where id=p_connection_id and organisation_id=p_organisation_id for update;
    if not found then raise exception 'Connection not found.' using errcode='P0002'; end if;
  end if;
  if p_action in ('create','save') then
    if p_action='save' then
      update public.external_website_connections set name=p_config->>'name',website_url=p_config->>'website_url',mode=p_config->>'mode',scope=p_config->>'scope',
        branch_ids=coalesce(array(select jsonb_array_elements_text(p_config->'branch_ids')::uuid),'{}'),development_id=nullif(p_config->>'development_id','')::uuid,
        fallback_user_id=(p_config->>'fallback_user_id')::uuid,enabled=(p_config->>'enabled')::boolean,public_contacts=(p_config->>'public_contacts')::boolean,
        include_sold=(p_config->>'include_sold')::boolean,include_rented=(p_config->>'include_rented')::boolean,webhook_url=nullif(p_config->>'webhook_url',''),updated_at=clock_timestamp()
      where id=c.id returning * into c;
    end if;
    -- Strict HTTPS syntax; DNS and destination IP are checked again by the worker.
    if c.website_url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+(:443)?(/[^[:space:]]*)?$'
      or (c.webhook_url is not null and c.webhook_url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+(:443)?/[^[:space:]]*$') then
      raise exception 'Use a public HTTPS website URL and HTTPS webhook URL.' using errcode='22023';
    end if;
    if not c.enabled or c.mode='leads_only' then
      update public.external_website_deliveries set status='cancelled',claim_id=null where connection_id=c.id and status in ('queued','retry','processing');
    end if;
    for l in select id from public.private_listings where organisation_id=c.organisation_id
      union select listing_id from public.external_website_events where connection_id=c.id
    loop perform external_websites_private.emit(c.id,l.id,true); end loop;
  elsif p_action='revoke' then
    update public.external_website_connections set token_hash=null,credential_updated_at=clock_timestamp() where id=c.id returning * into c;
    update public.external_website_deliveries set status='cancelled',claim_id=null where connection_id=c.id and status in ('queued','retry','processing');
  elsif p_action='retry' then
    if not c.enabled or c.token_hash is null or c.webhook_url is null or c.mode<>'listings_and_leads' then raise exception 'Enable the connection, credentials and webhook before retrying.' using errcode='22023'; end if;
    update public.external_website_deliveries set status='queued',attempts=0,next_attempt_at=clock_timestamp(),claim_id=null,error_code=null
      where connection_id=c.id and id=(p_config->>'delivery_id')::uuid and status in ('failed','retry');
    if not found then raise exception 'Failed delivery not found.' using errcode='P0002'; end if;
  elsif p_action not in ('rotate','detail') then
    raise exception 'Unknown connection action.' using errcode='22023';
  end if;
  if p_action in ('create','rotate') then
    credential := 'a9w_'||c.id::text||'_'||replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
    secret := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
    if c.webhook_secret_id is null then
      row_id := vault.create_secret(secret,'external-website:'||c.id::text,'External website webhook signing secret');
    else
      perform vault.update_secret(c.webhook_secret_id,secret); row_id := c.webhook_secret_id;
    end if;
    update public.external_website_connections set token_hash=encode(sha256(convert_to(credential,'UTF8')),'hex'),
      webhook_secret_id=row_id,credential_updated_at=clock_timestamp() where id=c.id returning * into c;
  end if;
  if p_action<>'detail' then
    insert into public.external_website_activity(connection_id,action,outcome) values(c.id,p_action,'success');
  end if;
  result := jsonb_build_object('connection',external_websites_private.safe_connection(c),
    'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select action,outcome,created_at from public.external_website_activity where connection_id=c.id order by created_at desc limit 30) a),'[]'::jsonb),
    'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by e.occurred_at desc) from (select * from public.external_website_deliveries where connection_id=c.id order by next_attempt_at desc limit 30) d join public.external_website_events e on e.id=d.event_id),'[]'::jsonb));
  result := result || jsonb_build_object('notifications',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'attempts',e.dispatch_attempt_count,'maxAttempts',e.max_dispatch_attempts,'nextAttemptAt',e.next_dispatch_attempt_at,'sentAt',e.sent_at)) from (select event.* from public.notification_events event join public.website_lead_submissions r on (r.notification_event_id=event.id or r.fallback_notification_event_id=event.id) where r.external_connection_id=c.id order by event.created_at desc limit 30) e),'[]'::jsonb));
  if credential is not null then result := result||jsonb_build_object('credential',credential,'webhookSecret',secret); end if;
  return result;
end;
$$;
revoke all on function public.external_website_manage(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.external_website_manage(uuid,uuid,text,jsonb) to authenticated;

alter table public.website_lead_submissions alter column website_site_id drop not null;
alter table public.website_lead_submissions
  add column external_connection_id uuid references public.external_website_connections(id),
  add column development_id uuid references public.developments(id),
  add constraint website_lead_one_source check ((website_site_id is not null)::integer+(external_connection_id is not null)::integer=1);
create unique index website_lead_external_idempotency_idx on public.website_lead_submissions(external_connection_id,idempotency_key) where external_connection_id is not null;

-- Adapt the installed canonical command rather than duplicating contact matching,
-- lead creation, rental classification, principal routing or automation logic.
-- Assertions intentionally fail migration if the installed contract has drifted.
do $shared_intake$
declare definition text; old_block text; new_block text;
begin
  select pg_get_functiondef('public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::regprocedure) into definition;
  if position('  v_site public.website_sites%rowtype;' in definition)=0
    or position('  if v_type = ''property_enquiry'' then' in definition)=0
    or position('  select member.user_id,' in definition)=0 then
    raise exception 'Website intake contract changed; review external website adaptation.';
  end if;
  definition := replace(definition,'public.website_capture_lead_submission(p_hostname text,','external_websites_private.capture_enquiry(p_external_connection_id uuid, p_hostname text,');
  definition := replace(definition,'  v_site public.website_sites%rowtype;', E'  v_site public.website_sites%rowtype;\n  v_connection public.external_website_connections%rowtype;\n  v_source_id uuid;');
  old_block := substring(definition from '  select site\.\* into v_site[\s\S]*?  if v_site.id is null then[\s\S]*?  end if;');
  if old_block is null then raise exception 'Website source lookup changed.'; end if;
  new_block := $block$
  if p_external_connection_id is not null then
    select * into v_connection from public.external_website_connections where id=p_external_connection_id and enabled and token_hash is not null for update;
    if not found then raise exception 'Website connection unavailable.' using errcode='42501'; end if;
    v_site.organisation_id := v_connection.organisation_id;
    v_source_id := v_connection.id;
  else
$block$ || old_block || E'\n    v_source_id := v_site.id;\n  end if;';
  definition := replace(definition,old_block,new_block);
  definition := replace(definition,'v_site.id::text || '':'' || v_key','v_source_id::text || '':'' || v_key');
  definition := replace(definition,'submission.website_site_id = v_site.id','((p_external_connection_id is null and submission.website_site_id = v_site.id) or submission.external_connection_id = p_external_connection_id)');
  definition := replace(definition,'recent.website_site_id = v_site.id','((p_external_connection_id is null and recent.website_site_id = v_site.id) or recent.external_connection_id = p_external_connection_id)');
  definition := replace(definition,'website_site_id, organisation_id, listing_id, page_id, submission_type,','website_site_id, organisation_id, external_connection_id, development_id, listing_id, page_id, submission_type,');
  definition := replace(definition,'v_site.id, v_site.organisation_id, null, null, v_type,','v_site.id, v_site.organisation_id, p_external_connection_id, nullif(p_attribution->>''developmentId'','''')::uuid, null, null, v_type,');
  definition := replace(definition,'v_site.id, v_site.organisation_id, p_listing_id, p_page_id, v_type,','v_site.id, v_site.organisation_id, p_external_connection_id, nullif(p_attribution->>''developmentId'','''')::uuid, p_listing_id, p_page_id, v_type,');
  old_block := substring(definition from '    select listing\.\* into v_listing[\s\S]*?      and publication.status = ''Published'';');
  if old_block is null then raise exception 'Website listing validation changed.'; end if;
  new_block := $block$
    if p_external_connection_id is not null then
      select listing.* into v_listing from public.private_listings listing where listing.id=p_listing_id
        and external_websites_private.listing(v_connection,listing.id) is not null;
    else
$block$ || old_block || E'\n    end if;';
  definition := replace(definition,old_block,new_block);
  definition := replace(definition, E'  else\n    if p_listing_id is not null or p_page_id is null then', $block$
  elsif p_external_connection_id is not null then
    if p_listing_id is not null or p_page_id is not null then raise exception 'Invalid enquiry target.' using errcode='22023'; end if;
  else
    if p_listing_id is not null or p_page_id is null then$block$);
  -- Listing agent remains first choice. The configured active fallback follows
  -- the same member validation; the existing principal notification rule stays.
  old_block := E'  select member.user_id,\n         pg_catalog.lower(trim(member.email)),';
  if position(old_block in definition)=0 then raise exception 'Website manager routing changed.'; end if;
  definition := replace(definition,old_block,$block$
  if p_external_connection_id is not null and v_assignee_id is null then
    select member.user_id,lower(trim(member.email)),concat_ws(' ',member.first_name,member.last_name),member.branch_id
      into v_assignee_id,v_assignee_email,v_assignee_name,v_assignee_branch_id
    from public.organisation_users member where member.organisation_id=v_connection.organisation_id
      and member.user_id=v_connection.fallback_user_id and member.status='active'
      and (v_connection.scope<>'branches' or member.branch_id=any(v_connection.branch_ids))
    order by member.updated_at desc limit 1;
    if v_assignee_id is null then raise exception 'Configured fallback is unavailable.' using errcode='22023'; end if;
  end if;
$block$ || old_block);
  -- Carry source and consent evidence into the existing receipt and lead snapshot.
  definition := replace(definition,'  if v_fingerprint is not null and (',$block$
  if p_external_connection_id is not null then
    v_attribution := v_attribution || jsonb_build_object('externalConnectionId',p_external_connection_id,
      'developmentId',p_attribution->>'developmentId','sourcePageUrl',p_attribution->>'sourcePageUrl','requestHash',p_attribution->>'requestHash',
      'consent',p_attribution->'consent');
  end if;
  if v_fingerprint is not null and ($block$);
  definition := replace(definition,$consent$'acceptedAt', v_now)$consent$,$consent$'acceptedAt', v_now) || case when p_external_connection_id is not null then jsonb_build_object('evidence',p_attribution->'consent') else '{}'::jsonb end$consent$);
  definition := replace(definition,'  select contact.contact_id into v_contact_id', $block$
  if p_external_connection_id is not null then
    if v_email is not null then perform pg_advisory_xact_lock(hashtextextended(v_site.organisation_id::text||':email:'||v_email,0)); end if;
    if v_phone_digits is not null then perform pg_advisory_xact_lock(hashtextextended(v_site.organisation_id::text||':phone:'||v_phone_digits,0)); end if;
  end if;
  select contact.contact_id into v_contact_id$block$);
  -- The canonical receipt dedupe remains the sole owner of side effects.
  definition := replace(definition,'  if v_existing.id is not null then',$block$
  if v_existing.id is not null then
    if p_external_connection_id is not null and v_existing.attribution_json->>'requestHash' is distinct from p_attribution->>'requestHash' then
      raise exception 'Idempotency key already used for a different enquiry.' using errcode='23505';
    end if;$block$);
  execute definition;
end;
$shared_intake$;

-- Keep every established hosted website caller on its original signature.
create or replace function public.website_capture_lead_submission(
  p_hostname text,p_submission_type text,p_listing_id uuid default null,p_page_id uuid default null,
  p_name text default null,p_email text default null,p_phone text default null,p_message text default null,
  p_privacy_accepted boolean default false,p_marketing_consent boolean default false,
  p_idempotency_key text default null,p_request_fingerprint text default null,p_attribution jsonb default '{}'
) returns jsonb language sql security definer set search_path='' as $$
  select external_websites_private.capture_enquiry(null,p_hostname,p_submission_type,p_listing_id,p_page_id,p_name,p_email,p_phone,p_message,
    p_privacy_accepted,p_marketing_consent,p_idempotency_key,p_request_fingerprint,p_attribution);
$$;
revoke all on function public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb) to service_role;

-- Preserve hosted-site boundaries and enrolment gates; independent connections
-- use their own explicit authorised configuration instead of creating fake sites.
do $receipt_boundary$
declare definition text; old_block text;
begin
  select pg_get_functiondef('public.website_assert_tenant_boundary()'::regprocedure) into definition;
  old_block := E'  elsif tg_table_name = ''website_lead_submissions'' then\n    select organisation_id into v_site_organisation_id from public.website_sites where id = new.website_site_id;';
  if position(old_block in definition)=0 then raise exception 'Website receipt boundary changed.'; end if;
  definition := replace(definition,old_block,$block$
  elsif tg_table_name = 'website_lead_submissions' then
    if new.external_connection_id is not null then
      select organisation_id into v_site_organisation_id from public.external_website_connections where id=new.external_connection_id;
      if new.website_site_id is not null or new.page_id is not null or new.organisation_id is distinct from v_site_organisation_id
        or (new.development_id is not null and not exists(select 1 from public.developments where id=new.development_id and organisation_id=v_site_organisation_id)) then
        raise exception 'External website receipt crosses its organisation boundary.' using errcode='23514';
      end if;
    else
      select organisation_id into v_site_organisation_id from public.website_sites where id=new.website_site_id;
    end if;$block$);
  execute definition;
  select pg_get_functiondef('public.website_require_active_pilot_for_lead()'::regprocedure) into definition;
  definition := replace(definition,E'begin\n', $block$begin
  if new.external_connection_id is not null then
    if not exists(select 1 from public.external_website_connections where id=new.external_connection_id and organisation_id=new.organisation_id and enabled and token_hash is not null) then
      raise exception 'External website connection is unavailable.' using errcode='42501';
    end if;
    return new;
  end if;
$block$);
  execute definition;
end;
$receipt_boundary$;
drop trigger trg_website_lead_submissions_tenant_boundary on public.website_lead_submissions;
create trigger trg_website_lead_submissions_tenant_boundary before insert or update of website_site_id,organisation_id,listing_id,page_id,external_connection_id,development_id
on public.website_lead_submissions for each row execute function public.website_assert_tenant_boundary();

create function public.external_website_request(p_connection_id uuid,p_token_hash text,p_action text,p_params jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.external_website_connections%rowtype; count_requests integer; payload jsonb; lead_result jsonb; records jsonb; high_water bigint; next_cursor bigint; size integer:=least(100,greatest(1,coalesce((p_params->>'limit')::integer,25))); page_offset integer:=greatest(0,coalesce((p_params->>'offset')::integer,0));
begin
  select * into c from public.external_website_connections where id=p_connection_id for update;
  if not found or not c.enabled or c.token_hash is null or c.token_hash is distinct from p_token_hash then
    return jsonb_build_object('status',401,'body',jsonb_build_object('error','invalid_credentials','message','Connection credentials are unavailable.'));
  end if;
  if p_action not in ('listings','listing','changes','lead') then raise exception 'Unknown API action.' using errcode='22023'; end if;
  if p_action<>'lead' and c.mode<>'listings_and_leads' then
    return jsonb_build_object('status',403,'body',jsonb_build_object('error','listings_not_permitted','message','This connection accepts leads only.'));
  end if;
  insert into public.external_website_rate_buckets(connection_id,bucket,requests) values(c.id,date_trunc('minute',clock_timestamp()),1)
    on conflict(connection_id,bucket) do update set requests=public.external_website_rate_buckets.requests+1 returning requests into count_requests;
  if count_requests>120 then
    insert into public.external_website_activity(connection_id,action,outcome) values(c.id,p_action,'rate_limited');
    return jsonb_build_object('status',429,'body',jsonb_build_object('error','rate_limited','message','Retry after one minute.'));
  end if;
  if p_action='lead' then
    if lower(substring(p_params->>'sourcePageUrl' from '^https://([^/]+)')) is distinct from lower(substring(c.website_url from '^https://([^/]+)')) then
      raise exception 'Source page must belong to this website connection.' using errcode='22023';
    end if;
    if p_params->>'developmentId' is not null and not exists(select 1 from public.developments d where d.id=(p_params->>'developmentId')::uuid and d.organisation_id=c.organisation_id
      and (c.scope='organisation' or (c.scope='development' and d.id=c.development_id)
        or (c.scope='branches' and exists(select 1 from public.private_listings l where l.development_id=d.id and external_websites_private.in_scope(c,l))))) then
      raise exception 'Development not found in the permitted scope.' using errcode='P0002';
    end if;
    if p_params->>'listingId' is not null and p_params->>'developmentId' is not null and not exists(select 1 from public.private_listings where id=(p_params->>'listingId')::uuid and development_id=(p_params->>'developmentId')::uuid) then
      raise exception 'Listing and development do not match.' using errcode='22023';
    end if;
    -- Connection and submission locks serialize both retries and burst limits.
    if not exists(select 1 from public.website_lead_submissions where external_connection_id=c.id and idempotency_key=p_params->>'idempotencyKey')
      and (select count(*) from public.website_lead_submissions where external_connection_id=c.id and created_at>=clock_timestamp()-interval '1 minute')>=30 then
      insert into public.external_website_activity(connection_id,action,outcome) values(c.id,'lead','rate_limited');
      return jsonb_build_object('status',429,'body',jsonb_build_object('error','rate_limited','message','Retry after one minute.'));
    end if;
    lead_result := external_websites_private.capture_enquiry(c.id,null,
      case when p_params->>'listingId' is null then 'general_enquiry' else 'property_enquiry' end,
      (p_params->>'listingId')::uuid,null,p_params->>'name',p_params->>'email',p_params->>'phone',p_params->>'message',
      (p_params#>>'{consent,privacyAccepted}')::boolean,(p_params#>>'{consent,marketingConsent}')::boolean,
      p_params->>'idempotencyKey',null,
      coalesce(p_params->'utm','{}')||jsonb_build_object('developmentId',coalesce(p_params->>'developmentId',c.development_id::text,(select development_id::text from public.private_listings where id=(p_params->>'listingId')::uuid and organisation_id=c.organisation_id)),
        'sourcePageUrl',p_params->>'sourcePageUrl','pagePath',p_params->>'sourcePageUrl','leadSource','Website',
        'consent',p_params->'consent','requestHash',p_params->>'requestHash'));
    update public.external_website_connections set last_enquiry_at=clock_timestamp() where id=c.id;
    insert into public.external_website_activity(connection_id,action,outcome) values(c.id,'lead',case when (lead_result->>'duplicate')::boolean then 'duplicate' else 'accepted' end);
    return jsonb_build_object('status',case when (lead_result->>'duplicate')::boolean then 200 else 201 end,'body',jsonb_build_object(
      'accepted',true,'duplicate',lead_result->'duplicate','leadId',lead_result->'leadId','enquiryId',lead_result->'receiptId','connectionId',c.id));
  end if;
  update public.external_website_connections set last_listing_request_at=clock_timestamp() where id=c.id;
  select coalesce(max(sequence),0) into high_water from public.external_website_events where connection_id=c.id;
  if p_action='changes' then
    if coalesce((p_params->>'cursor')::bigint,0)>high_water then raise exception 'Cursor is ahead of this connection feed.' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',event_type,'schemaVersion',schema_version,'connectionId',connection_id,'listingId',listing_id,
      'occurredAt',occurred_at,'version',sequence::text) order by sequence),'[]'),max(sequence) into records,next_cursor
    from (select * from public.external_website_events where connection_id=c.id and sequence>coalesce((p_params->>'cursor')::bigint,0) and sequence<=high_water order by sequence limit size) events;
    payload := jsonb_build_object('data',records,'nextCursor',coalesce(next_cursor,coalesce((p_params->>'cursor')::bigint,0))::text,'highWatermark',high_water::text,
      'hasMore',coalesce(next_cursor,coalesce((p_params->>'cursor')::bigint,0))<high_water,'schemaVersion',1);
  elsif p_action='listing' then
    payload := external_websites_private.listing(c,(p_params->>'id')::uuid);
    if payload is null then return jsonb_build_object('status',404,'body',jsonb_build_object('error','listing_not_found','message','Listing is unavailable in this connection scope.')); end if;
    payload := jsonb_build_object('data',payload||jsonb_build_object('version',coalesce((select max(sequence) from public.external_website_events where connection_id=c.id and listing_id=(p_params->>'id')::uuid),0)::text),'schemaVersion',1);
  else
    with candidates as (
      select external_websites_private.listing(c,l.id) as data,
        coalesce(e.sequence,0) as version,coalesce(e.occurred_at,l.updated_at) as changed_at
      from public.private_listings l left join lateral (select sequence,occurred_at from public.external_website_events where connection_id=c.id and listing_id=l.id order by sequence desc limit 1) e on true
      where external_websites_private.in_scope(c,l)
    ), filtered as (
      select data||jsonb_build_object('version',version::text,'updatedAt',changed_at) as data,changed_at from candidates
      where data is not null
        and (p_params->>'updatedSince' is null or changed_at>=(p_params->>'updatedSince')::timestamptz)
        and (p_params->>'transactionType' is null or data->>'transactionType'=p_params->>'transactionType')
        and (p_params->>'propertyType' is null or lower(data->>'propertyType')=lower(p_params->>'propertyType'))
        and (p_params->>'location' is null or lower((data->'location')::text) like '%'||lower(p_params->>'location')||'%')
        and (p_params->>'minPrice' is null or (data->>'price')::numeric>=(p_params->>'minPrice')::numeric)
        and (p_params->>'maxPrice' is null or (data->>'price')::numeric<=(p_params->>'maxPrice')::numeric)
        and (p_params->>'bedrooms' is null or (data->>'bedrooms')::numeric>=(p_params->>'bedrooms')::numeric)
        and (p_params->>'branchId' is null or data#>>'{branch,id}'=p_params->>'branchId')
        and (p_params->>'developmentId' is null or data#>>'{development,id}'=p_params->>'developmentId')
    ), page as (
      select * from filtered order by
        case when p_params->>'sort'='price_asc' then (data->>'price')::numeric end asc,
        case when p_params->>'sort'='price_desc' then (data->>'price')::numeric end desc,
        changed_at desc,data->>'id' limit size offset page_offset
    ) select jsonb_build_object('data',coalesce((select jsonb_agg(data) from page),'[]'),'pagination',jsonb_build_object('limit',size,'offset',page_offset,'total',(select count(*) from filtered)),
      'schemaVersion',1,'highWatermark',high_water::text) into payload;
  end if;
  insert into public.external_website_activity(connection_id,action,outcome) values(c.id,p_action,'success');
  return jsonb_build_object('status',200,'body',payload);
end;
$$;
revoke all on function public.external_website_request(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.external_website_request(uuid,text,text,jsonb) to service_role;

create function public.external_website_claim_deliveries(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update public.external_website_deliveries d set status='cancelled',claim_id=null
    from public.external_website_connections c where c.id=d.connection_id and (not c.enabled or c.token_hash is null or c.mode<>'listings_and_leads' or c.webhook_url is null)
    and d.status in ('queued','retry','processing');
  update public.external_website_deliveries set status=case when attempts>=8 then 'failed' else 'retry' end,claim_id=null,next_attempt_at=clock_timestamp(),error_code='interrupted_delivery'
    where status='processing' and claimed_at<clock_timestamp()-interval '2 minutes';
  with due as (select id from public.external_website_deliveries where status in ('queued','retry') and next_attempt_at<=clock_timestamp() order by next_attempt_at limit least(20,greatest(1,p_limit)) for update skip locked),
    claimed as (update public.external_website_deliveries d set status='processing',attempts=d.attempts+1,claimed_at=clock_timestamp(),claim_id=gen_random_uuid() from due where d.id=due.id returning d.*)
  select coalesce(jsonb_agg(jsonb_build_object('deliveryId',d.id,'claimId',d.claim_id,'url',c.webhook_url,'secret',s.decrypted_secret,
    'event',jsonb_build_object('id',e.id,'type',e.event_type,'schemaVersion',e.schema_version,'connectionId',c.id,'listingId',e.listing_id,'occurredAt',e.occurred_at,'version',e.sequence::text))),'[]') into result
    from claimed d join public.external_website_connections c on c.id=d.connection_id join public.external_website_events e on e.id=d.event_id
    left join vault.decrypted_secrets s on s.id=c.webhook_secret_id;
  delete from public.external_website_rate_buckets where bucket<now()-interval '1 day';
  delete from public.external_website_activity where created_at<now()-interval '90 days';
  return result;
end;
$$;
create function public.external_website_delivery_active(p_id uuid,p_claim uuid)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from public.external_website_deliveries d join public.external_website_connections c on c.id=d.connection_id
    where d.id=p_id and d.claim_id=p_claim and d.status='processing' and c.enabled and c.token_hash is not null and c.webhook_url is not null and c.mode='listings_and_leads');
$$;
create function public.external_website_complete_delivery(p_id uuid,p_claim uuid,p_status integer,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare d public.external_website_deliveries%rowtype;
begin
  select * into d from public.external_website_deliveries where id=p_id and claim_id=p_claim and status='processing' for update;
  if not found then return; end if;
  update public.external_website_deliveries set
    status=case when p_status between 200 and 299 then 'delivered' when d.attempts>=8 or (p_status between 400 and 499 and p_status not in (408,429)) then 'failed' else 'retry' end,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,d.attempts-1))::integer),
    completed_at=clock_timestamp(),http_status=p_status,error_code=case when p_status between 200 and 299 then null else left(p_error,80) end,claim_id=null where id=d.id;
  if p_status between 200 and 299 then update public.external_website_connections set last_webhook_at=clock_timestamp() where id=d.connection_id; end if;
end;
$$;
create function public.external_website_pending_notifications()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.notification_events e set status='failed',next_dispatch_attempt_at=clock_timestamp()
    where e.status='processing' and e.last_dispatch_attempt_at<clock_timestamp()-interval '5 minutes'
      and exists(select 1 from public.website_lead_submissions r where r.external_connection_id is not null and (r.notification_event_id=e.id or r.fallback_notification_event_id=e.id));
  return coalesce((select jsonb_agg(id) from (select e.id from public.notification_events e join public.website_lead_submissions r
    on (r.notification_event_id=e.id or r.fallback_notification_event_id=e.id) where r.external_connection_id is not null and r.status='routed'
    and e.status in ('queued','failed') and e.dispatch_attempt_count<e.max_dispatch_attempts
    and coalesce(e.next_dispatch_attempt_at,e.created_at)<=clock_timestamp() order by e.created_at limit 20) pending),'[]'::jsonb);
end;
$$;
revoke all on function public.external_website_claim_deliveries(integer),public.external_website_delivery_active(uuid,uuid),public.external_website_complete_delivery(uuid,uuid,integer,text),public.external_website_pending_notifications() from public,anon,authenticated;
grant execute on function public.external_website_claim_deliveries(integer),public.external_website_delivery_active(uuid,uuid),public.external_website_complete_delivery(uuid,uuid,integer,text),public.external_website_pending_notifications() to service_role;
create function public.external_website_record_failure(p_connection_id uuid,p_token_hash text,p_action text,p_outcome text)
returns void language sql security definer set search_path='' as $$
  insert into public.external_website_activity(connection_id,action,outcome)
    select id,left(p_action,24),left(p_outcome,32) from public.external_website_connections
    where id=p_connection_id and enabled and token_hash=p_token_hash;
$$;
revoke all on function public.external_website_record_failure(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.external_website_record_failure(uuid,text,text,text) to service_role;
-- All internal functions are unreachable through the Data API.
revoke all on all functions in schema external_websites_private from public,anon,authenticated;
grant execute on all functions in schema external_websites_private to service_role;
notify pgrst,'reload schema';
commit;
