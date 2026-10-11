-- Primary agency workspace: durable identity without rewriting source records.
begin;
create schema if not exists arch9_client_private;
revoke all on schema arch9_client_private from public, anon;
grant usage on schema arch9_client_private to authenticated;

create table public.agency_client_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (length(trim(name)) between 1 and 250),
  primary_email text,
  primary_phone text,
  version integer not null default 1,
  merged_into uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,id),
  foreign key (organisation_id,merged_into) references public.agency_client_profiles(organisation_id,id),
  check (merged_into is null or merged_into <> id)
);
create table public.agency_client_identifiers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  kind text not null check (kind in ('email','phone')),
  value text not null check (length(value) between 1 and 320),
  created_at timestamptz not null default now(),
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id),
  unique (client_id,kind,value)
);
-- Shared phone numbers are permitted. Email aliases identify a single profile per agency.
create unique index agency_client_email_identity on public.agency_client_identifiers(organisation_id,value) where kind='email';
create index agency_client_identifier_profile on public.agency_client_identifiers(client_id);
create table public.agency_client_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  source_kind text not null check (source_kind in ('contact','lead','buyer','prospect','transaction_buyer','transaction_seller','listing_seller')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id),
  unique (organisation_id,source_kind,source_id)
);
create index agency_client_link_profile on public.agency_client_links(client_id);
create table public.agency_client_merge_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  primary_id uuid not null,
  secondary_id uuid not null,
  actor_id uuid not null,
  reason text not null,
  before_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (organisation_id,primary_id) references public.agency_client_profiles(organisation_id,id),
  foreign key (organisation_id,secondary_id) references public.agency_client_profiles(organisation_id,id)
);
create index agency_client_merge_profile on public.agency_client_merge_audit(organisation_id,primary_id,created_at desc);
create index agency_client_profiles_org on public.agency_client_profiles(organisation_id,merged_into);

create function arch9_client_private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organisation_users m join public.organisations o on o.id=m.organisation_id
    where m.organisation_id=p_org and m.user_id=auth.uid() and o.type='agency'
      and lower(coalesce(m.membership_status,m.status,'')) in ('active','accepted')
  );
$$;

create function arch9_client_private.source_visible(p_org uuid,p_kind text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not arch9_client_private.is_member(p_org) then return false; end if;
  case p_kind
    when 'contact' then return exists(select 1 from public.contacts c where c.contact_id=p_id and c.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,null,c.assigned_agent_id));
    when 'lead' then return exists(select 1 from public.leads l where l.lead_id=p_id and l.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,l.assigned_user_id,l.assigned_agent_id));
    when 'buyer' then return exists(select 1 from public.buyers b where b.id=p_id and b.organisation_id=p_org);
    when 'prospect' then return exists(select 1 from public.canvassing_prospects c where c.id=p_id and c.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,c.assigned_user_id,c.assigned_agent_id));
    when 'listing_seller' then return exists(select 1 from public.private_listings l where l.id=p_id and l.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,(to_jsonb(l)->>'assigned_user_id')::uuid,l.assigned_agent_id));
    when 'transaction_buyer','transaction_seller' then return exists(select 1 from public.transactions t where t.id=p_id and t.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,t.assigned_user_id,t.assigned_agent_id,t.owner_user_id));
    else return false;
  end case;
end;
$$;

create function arch9_client_private.can_read_client(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.agency_client_profiles requested join public.agency_client_profiles c on c.id=coalesce(requested.merged_into,requested.id)
    where requested.id=p_id and arch9_client_private.is_member(c.organisation_id)
    and (public.bridge_agency_open_operations(c.organisation_id) or (
      c.merged_into is null
      and exists(select 1 from public.agency_client_links l where l.client_id=c.id)
      and not exists(select 1 from public.agency_client_links l where l.client_id=c.id
        and not arch9_client_private.source_visible(l.organisation_id,l.source_kind,l.source_id))
    )));
$$;

alter table public.agency_client_profiles enable row level security;
alter table public.agency_client_identifiers enable row level security;
alter table public.agency_client_links enable row level security;
alter table public.agency_client_merge_audit enable row level security;
revoke all on public.agency_client_profiles,public.agency_client_identifiers,public.agency_client_links,public.agency_client_merge_audit from public,anon,authenticated;
grant all on public.agency_client_profiles,public.agency_client_identifiers,public.agency_client_links,public.agency_client_merge_audit to service_role;
grant select on public.agency_client_profiles,public.agency_client_identifiers,public.agency_client_links,public.agency_client_merge_audit to authenticated;
create policy agency_client_profile_read on public.agency_client_profiles for select to authenticated using (arch9_client_private.can_read_client(id));
create policy agency_client_identifier_read on public.agency_client_identifiers for select to authenticated using (arch9_client_private.can_read_client(client_id));
create policy agency_client_link_read on public.agency_client_links for select to authenticated using (
  arch9_client_private.source_visible(organisation_id,source_kind,source_id) and arch9_client_private.can_read_client(client_id));
create policy agency_client_merge_read on public.agency_client_merge_audit for select to authenticated using (
  arch9_client_private.is_member(organisation_id) and public.bridge_agency_open_operations(organisation_id));

-- Internal ingestion runs only from source-table triggers and this migration's backfill.
-- No authenticated caller can supply arbitrary source records or another agency's identity.
create function arch9_client_private.attach_source(p_org uuid,p_kind text,p_id uuid,p_name text,p_email text,p_phone text,p_parent_kind text default null,p_parent_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_email text:=lower(nullif(trim(p_email),'')); v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); v_changed integer:=0; v_count integer;
begin
  if p_org is null or not exists(select 1 from public.organisations where id=p_org and type='agency') then return; end if;
  if nullif(trim(p_name),'') is null and v_email is null and v_phone='' then return; end if;
  if v_email is not null and (length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then v_email:=null; end if;
  if length(v_phone)>15 then v_phone:=''; end if;
  if v_phone ~ '^0[0-9]{9}$' then v_phone:='27'||substr(v_phone,2); end if;
  -- Serialize identity creation, edits and merges within one agency, including empty-email profiles.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select client_id into v_client from public.agency_client_links where organisation_id=p_org and source_kind=p_kind and source_id=p_id;
  if v_client is null and p_parent_id is not null then
    select client_id into v_client from public.agency_client_links where organisation_id=p_org and source_kind=p_parent_kind and source_id=p_parent_id;
  end if;
  if v_client is null and v_email is not null then
    select client_id into v_client from public.agency_client_identifiers where organisation_id=p_org and kind='email' and value=v_email;
  end if;
  if v_client is null then
    insert into public.agency_client_profiles(organisation_id,name,primary_email,primary_phone,created_by)
      values(p_org,left(coalesce(nullif(trim(p_name),''),'Unnamed client'),250),v_email,nullif(v_phone,''),auth.uid()) returning id into v_client;
  end if;
  -- Source links survive email/name changes and reviewed merges.
  insert into public.agency_client_links(organisation_id,client_id,source_kind,source_id) values(p_org,v_client,p_kind,p_id) on conflict do nothing;
  get diagnostics v_changed=row_count;
  if v_email is not null then
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(p_org,v_client,'email',v_email) on conflict do nothing;
    get diagnostics v_count=row_count; v_changed:=v_changed+v_count;
  end if;
  if v_phone<>'' then
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(p_org,v_client,'phone',v_phone) on conflict do nothing;
    get diagnostics v_count=row_count; v_changed:=v_changed+v_count;
  end if;
  if v_changed>0 then
    update public.agency_client_profiles set primary_email=coalesce(primary_email,(select value from public.agency_client_identifiers where client_id=v_client and kind='email' and value=v_email)),
      primary_phone=coalesce(primary_phone,nullif(v_phone,'')),version=version+1,updated_at=now() where id=v_client;
  end if;
end;
$$;

create function arch9_client_private.ingest(p_table text,p_row jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(p_row->>'organisation_id')::uuid; v_id uuid; v_contact public.contacts%rowtype; v_buyer public.buyers%rowtype; v_facts jsonb; v_form jsonb; v_listing jsonb; v_parent uuid;
begin
  if coalesce((p_row->>'is_demo_data')::boolean,false) or coalesce((p_row->>'isDemoData')::boolean,false)
    or p_row->'demo_metadata' @> '{"isDemoData":true}'::jsonb
    or p_row->'demo_metadata' @> '{"is_demo_data":true}'::jsonb
    or p_row->'demo_metadata' @> '{"seedData":true}'::jsonb
    or p_row->'demo_metadata' @> '{"seed_data":true}'::jsonb
    or p_row->'demo_metadata' @> '{"migratedFromLocalStorage":true}'::jsonb then return; end if;
  case p_table
    when 'contacts' then
      perform arch9_client_private.attach_source(v_org,'contact',(p_row->>'contact_id')::uuid,concat_ws(' ',p_row->>'first_name',p_row->>'last_name'),p_row->>'email',p_row->>'phone');
    when 'leads' then
      select * into v_contact from public.contacts where contact_id=(p_row->>'contact_id')::uuid and organisation_id=v_org;
      if v_contact.contact_id is not null then
        perform arch9_client_private.attach_source(v_org,'lead',(p_row->>'lead_id')::uuid,concat_ws(' ',v_contact.first_name,v_contact.last_name),v_contact.email,v_contact.phone,'contact',v_contact.contact_id);
      end if;
    when 'buyers' then
      perform arch9_client_private.attach_source(v_org,'buyer',(p_row->>'id')::uuid,p_row->>'name',p_row->>'email',p_row->>'phone');
    when 'canvassing_prospects' then
      perform arch9_client_private.attach_source(v_org,'prospect',(p_row->>'id')::uuid,concat_ws(' ',p_row->>'first_name',p_row->>'last_name'),p_row->>'email',p_row->>'phone');
    when 'transactions' then
      v_id:=(p_row->>'id')::uuid;
      select * into v_buyer from public.buyers where id=(p_row->>'buyer_id')::uuid;
      if v_buyer.id is not null and not coalesce((to_jsonb(v_buyer)->>'is_demo_data')::boolean,false) then
        perform arch9_client_private.attach_source(v_org,'transaction_buyer',v_id,v_buyer.name,v_buyer.email,v_buyer.phone,'buyer',v_buyer.id);
      end if;
      perform arch9_client_private.attach_source(v_org,'transaction_seller',v_id,p_row->>'seller_name',p_row->>'seller_email',p_row->>'seller_phone');
    when 'private_listing_seller_onboarding' then
      select to_jsonb(l) into v_listing from public.private_listings l where l.id=(p_row->>'private_listing_id')::uuid;
      if v_listing is not null then perform arch9_client_private.ingest('private_listings',v_listing); end if;
    when 'private_listings' then
      select coalesce(canonical_facts_json,'{}'::jsonb)||coalesce(form_data,'{}'::jsonb) into v_form from public.private_listing_seller_onboarding where private_listing_id=(p_row->>'id')::uuid limit 1;
      v_form:=coalesce(v_form,'{}'::jsonb);
      v_facts:=coalesce(p_row->'seller_canonical_facts_json','{}'::jsonb);
      if (p_row->>'seller_lead_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_parent:=(p_row->>'seller_lead_id')::uuid; end if;
      perform arch9_client_private.attach_source(v_org,'listing_seller',(p_row->>'id')::uuid,
        coalesce(nullif(v_facts->>'fullName',''),nullif(v_facts->>'sellerName',''),nullif(v_facts->>'name',''),nullif(trim(concat_ws(' ',v_facts->>'firstName',v_facts->>'lastName')),''),nullif(v_form->>'sellerName',''),nullif(v_form->>'fullName',''),nullif(trim(concat_ws(' ',coalesce(v_form->>'sellerFirstName',v_form->>'firstName'),coalesce(v_form->>'sellerSurname',v_form->>'lastName'))),'')),
        coalesce(v_facts->>'email',v_facts->>'sellerEmail',v_form->>'sellerEmail',v_form->>'email',v_form->>'contactEmail'),coalesce(v_facts->>'phone',v_facts->>'sellerPhone',v_facts->>'mobile',v_form->>'sellerPhone',v_form->>'phone',v_form->>'contactNumber',v_form->>'mobile'),'lead',v_parent);
  end case;
end;
$$;
create function arch9_client_private.source_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare v_transaction jsonb; v_org uuid; v_old_org uuid;
begin
  v_org:=(to_jsonb(new)->>'organisation_id')::uuid;
  if tg_op='UPDATE' then v_old_org:=(to_jsonb(old)->>'organisation_id')::uuid; end if;
  if v_org is not null and v_old_org is not null and v_org<>v_old_org then
    perform pg_advisory_xact_lock(hashtextextended(least(v_org,v_old_org)::text,0));
    perform pg_advisory_xact_lock(hashtextextended(greatest(v_org,v_old_org)::text,0));
  elsif v_org is not null then perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
  end if;
  if tg_op='UPDATE' then
    if tg_table_name='transactions' and (to_jsonb(old)->>'buyer_id') is distinct from (to_jsonb(new)->>'buyer_id') then
      delete from public.agency_client_links where source_kind='transaction_buyer' and source_id=(to_jsonb(old)->>'id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    elsif tg_table_name='leads' and (to_jsonb(old)->>'contact_id') is distinct from (to_jsonb(new)->>'contact_id') then
      delete from public.agency_client_links where source_kind='lead' and source_id=(to_jsonb(old)->>'lead_id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    elsif tg_table_name='private_listings' and (to_jsonb(old)->>'seller_lead_id') is distinct from (to_jsonb(new)->>'seller_lead_id') then
      delete from public.agency_client_links where source_kind='listing_seller' and source_id=(to_jsonb(old)->>'id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    end if;
  end if;
  if tg_op='UPDATE' and (to_jsonb(old)->>'organisation_id') is distinct from (to_jsonb(new)->>'organisation_id') then
    delete from public.agency_client_links where organisation_id=(to_jsonb(old)->>'organisation_id')::uuid
      and source_id=coalesce(to_jsonb(old)->>'id',to_jsonb(old)->>'lead_id',to_jsonb(old)->>'contact_id')::uuid
      and source_kind=any(case tg_table_name when 'contacts' then array['contact'] when 'leads' then array['lead'] when 'buyers' then array['buyer'] when 'canvassing_prospects' then array['prospect'] when 'private_listings' then array['listing_seller'] else array['transaction_buyer','transaction_seller'] end);
  end if;
  perform arch9_client_private.ingest(tg_table_name,to_jsonb(new));
  if tg_table_name='buyers' then
    for v_transaction in select to_jsonb(t) from public.transactions t where t.buyer_id=(to_jsonb(new)->>'id')::uuid loop
      perform arch9_client_private.ingest('transactions',v_transaction);
    end loop;
  end if;
  return new;
end;
$$;
create trigger agency_client_identity_sync after insert or update of organisation_id,first_name,last_name,email,phone on public.contacts for each row execute function arch9_client_private.source_trigger();
create trigger agency_client_identity_sync after insert or update of organisation_id,contact_id on public.leads for each row execute function arch9_client_private.source_trigger();
create trigger agency_client_identity_sync after insert or update of organisation_id,name,email,phone on public.buyers for each row execute function arch9_client_private.source_trigger();
create trigger agency_client_identity_sync after insert or update of organisation_id,first_name,last_name,email,phone on public.canvassing_prospects for each row execute function arch9_client_private.source_trigger();
create trigger agency_client_identity_sync after insert or update of organisation_id,buyer_id,seller_name,seller_email,seller_phone on public.transactions for each row execute function arch9_client_private.source_trigger();
create trigger agency_client_identity_sync after insert or update of organisation_id,seller_canonical_facts_json,seller_lead_id on public.private_listings for each row execute function arch9_client_private.source_trigger();

create trigger agency_client_identity_sync after insert or update of form_data,canonical_facts_json on public.private_listing_seller_onboarding for each row execute function arch9_client_private.source_trigger();

-- Existing records are indexed without changing their emails, consent, enquiries or deals.
do $$ declare v_table text; v_row jsonb; begin
  foreach v_table in array array['contacts','buyers','canvassing_prospects','leads','private_listings','transactions'] loop
    for v_row in execute format('select to_jsonb(s) from public.%I s join public.organisations o on o.id=s.organisation_id where o.type=''agency'' order by s.created_at nulls last',v_table) loop
      perform arch9_client_private.ingest(v_table,v_row);
    end loop;
  end loop;
end $$;

create function arch9_client_private.update_client(p_client_id uuid,p_expected_version integer,p_name text,p_emails text[],p_phones text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_client public.agency_client_profiles%rowtype; v_value text; v_emails text[]; v_phones text[];
begin
  select * into v_client from public.agency_client_profiles where id=p_client_id;
  if v_client.id is null or not arch9_client_private.is_member(v_client.organisation_id) or not public.bridge_agency_open_operations(v_client.organisation_id) then
    raise exception 'Only an agency owner or principal can edit client identities.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_client.organisation_id::text,0));
  select * into v_client from public.agency_client_profiles where id=p_client_id for update;
  if v_client.merged_into is not null or v_client.version is distinct from p_expected_version then raise exception 'Client details changed. Reload the profile before saving.' using errcode='40001'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 250 or coalesce(cardinality(p_emails),0)>20 or coalesce(cardinality(p_phones),0)>20 then raise exception 'Invalid client details.' using errcode='22023'; end if;
  v_emails:=array(select distinct lower(trim(value)) from unnest(coalesce(p_emails,array[]::text[])) value where nullif(trim(value),'') is not null);
  v_phones:=array(select distinct case when digits ~ '^0[0-9]{9}$' then '27'||substr(digits,2) else digits end from (select regexp_replace(value,'[^0-9]','','g') digits from unnest(coalesce(p_phones,array[]::text[])) value) s where digits<>'');
  foreach v_value in array v_emails loop
    if v_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_value)>320 then raise exception 'Enter valid email addresses.' using errcode='22023'; end if;
    if exists(select 1 from public.agency_client_identifiers where organisation_id=v_client.organisation_id and kind='email' and value=v_value and client_id<>p_client_id) then
      raise exception 'An email belongs to another client. Review and merge the profiles first.' using errcode='23505';
    end if;
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(v_client.organisation_id,p_client_id,'email',v_value) on conflict do nothing;
  end loop;
  foreach v_value in array v_phones loop
    if length(v_value) not between 7 and 15 then raise exception 'Enter valid phone numbers.' using errcode='22023'; end if;
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(v_client.organisation_id,p_client_id,'phone',v_value) on conflict do nothing;
  end loop;
  -- Former identifiers remain aliases so editing primary details cannot break historical matching.
  update public.agency_client_profiles set name=trim(p_name),primary_email=nullif(lower(trim(p_emails[1])),''),
    primary_phone=(select case when digits ~ '^0[0-9]{9}$' then '27'||substr(digits,2) else nullif(digits,'') end from (select regexp_replace(coalesce(p_phones[1],''),'[^0-9]','','g') digits) s),
    version=version+1,updated_at=now() where id=p_client_id returning * into v_client;
  return to_jsonb(v_client);
end;
$$;

create function arch9_client_private.merge_clients(p_primary_id uuid,p_secondary_id uuid,p_primary_version integer,p_secondary_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_primary public.agency_client_profiles%rowtype; v_secondary public.agency_client_profiles%rowtype; v_audit uuid; v_snapshot jsonb;
begin
  select * into v_primary from public.agency_client_profiles where id=p_primary_id;
  if v_primary.id is null or not arch9_client_private.is_member(v_primary.organisation_id) or not public.bridge_agency_open_operations(v_primary.organisation_id) then
    raise exception 'Only an agency owner or principal can merge client profiles.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_primary.organisation_id::text,0));
  -- A consistent lock order and the agency lock protect simultaneous edits, intake and merges.
  perform id from public.agency_client_profiles where id in (p_primary_id,p_secondary_id) order by id for update;
  select * into v_primary from public.agency_client_profiles where id=p_primary_id;
  select * into v_secondary from public.agency_client_profiles where id=p_secondary_id;
  if p_primary_id=p_secondary_id or v_secondary.id is null or v_secondary.organisation_id<>v_primary.organisation_id then raise exception 'Choose two different clients from this agency.' using errcode='22023'; end if;
  if v_primary.merged_into is not null or v_secondary.merged_into is not null or v_primary.version is distinct from p_primary_version or v_secondary.version is distinct from p_secondary_version then
    raise exception 'Client details changed. Reload both profiles before merging.' using errcode='40001';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'Record why these profiles belong to the same client.' using errcode='22023'; end if;
  v_snapshot:=jsonb_build_object('primary',to_jsonb(v_primary),'secondary',to_jsonb(v_secondary),
    'identifiers',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.agency_client_identifiers i where client_id in (p_primary_id,p_secondary_id)),
    'links',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from public.agency_client_links l where client_id in (p_primary_id,p_secondary_id)));
  -- Move identity associations only. Original source records, messages, files and marketing consent remain untouched.
  delete from public.agency_client_identifiers s using public.agency_client_identifiers p where s.client_id=p_secondary_id and p.client_id=p_primary_id and s.kind=p.kind and s.value=p.value;
  update public.agency_client_identifiers set client_id=p_primary_id where client_id=p_secondary_id;
  update public.agency_client_links set client_id=p_primary_id where client_id=p_secondary_id;
  update public.agency_client_profiles set primary_email=coalesce(primary_email,v_secondary.primary_email),primary_phone=coalesce(primary_phone,v_secondary.primary_phone),version=version+1,updated_at=now() where id=p_primary_id;
  update public.agency_client_profiles set merged_into=p_primary_id,version=version+1,updated_at=now() where id=p_secondary_id;
  -- Flatten earlier redirects while retaining the immutable merge audit.
  update public.agency_client_profiles set merged_into=p_primary_id where organisation_id=v_primary.organisation_id and merged_into=p_secondary_id;
  insert into public.agency_client_merge_audit(organisation_id,primary_id,secondary_id,actor_id,reason,before_snapshot)
    values(v_primary.organisation_id,p_primary_id,p_secondary_id,auth.uid(),trim(p_reason),v_snapshot) returning id into v_audit;
  return jsonb_build_object('client_id',p_primary_id,'audit_id',v_audit);
end;
$$;

-- Thin invoker entrypoints; privileged implementations live in a non-exposed schema.
create function public.agency_client_update(p_client_id uuid,p_expected_version integer,p_name text,p_emails text[],p_phones text[]) returns jsonb
language sql security invoker set search_path='' as $$ select arch9_client_private.update_client(p_client_id,p_expected_version,p_name,p_emails,p_phones); $$;
create function public.agency_client_merge(p_primary_id uuid,p_secondary_id uuid,p_primary_version integer,p_secondary_version integer,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$ select arch9_client_private.merge_clients(p_primary_id,p_secondary_id,p_primary_version,p_secondary_version,p_reason); $$;
revoke all on all functions in schema arch9_client_private from public,anon,authenticated;
grant execute on function arch9_client_private.is_member(uuid),arch9_client_private.source_visible(uuid,text,uuid),arch9_client_private.can_read_client(uuid),
  arch9_client_private.update_client(uuid,integer,text,text[],text[]),arch9_client_private.merge_clients(uuid,uuid,integer,integer,text) to authenticated;
revoke all on function public.agency_client_update(uuid,integer,text,text[],text[]),public.agency_client_merge(uuid,uuid,integer,integer,text) from public,anon;
grant execute on function public.agency_client_update(uuid,integer,text,text[],text[]),public.agency_client_merge(uuid,uuid,integer,integer,text) to authenticated;
commit;
