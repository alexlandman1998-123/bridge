begin;

-- Advertising expiry is separate from mandate dates. Each channel keeps its
-- own date, including when a later change is explicitly limited to one advert.
create table public.listing_channel_expiries (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.private_listings(id) on delete cascade,
 channel text not null check(channel in ('property24','private_property','agency_website','kingdom_website')),
 expiry_date date not null,
 setup_expiry_date date,
 requested_by uuid not null references auth.users(id),
 state text not null check(state in ('queued','updating','scheduled','update_failed','update_uncertain','expiring','expired','expiry_failed','expiry_uncertain','cancelled')),
 claim_id uuid, claimed_at timestamptz,
 message text not null,
 updated_at timestamptz not null default now(),
 unique(listing_id,channel)
);
create index listing_channel_expiries_pending on public.listing_channel_expiries(expiry_date)
 where state in ('queued','scheduled','update_failed','update_uncertain');
alter table public.listing_channel_expiries enable row level security;
revoke all on public.listing_channel_expiries from public,anon,authenticated;
grant select(channel,listing_id,expiry_date,state,message,updated_at) on public.listing_channel_expiries to authenticated;
grant all on public.listing_channel_expiries to service_role;
create policy listing_channel_expiries_read on public.listing_channel_expiries for select to authenticated
 using(public.bridge_can_access_private_listing(listing_id));

create function public.listing_expiry_channel_active(p_listing uuid,p_channel text) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_channel
 when 'property24' then exists(select 1 from public.property24_listing_syncs where private_listing_id=p_listing and environment='production' and listing_number>0 and external_status in ('submitted','on_portal') )
 when 'private_property' then exists(select 1 from public.private_property_listing_syncs where private_listing_id=p_listing and environment='production' and nullif(property_id,'') is not null and external_status in ('submitted','active'))
 when 'agency_website' then exists(select 1 from public.website_listing_publications where listing_id=p_listing and status='published')
 when 'kingdom_website' then exists(select 1 from public.website_partner_listing_publications where listing_id=p_listing and status='published')
 else false end;
$$;
revoke all on function public.listing_expiry_channel_active(uuid,text) from public,anon,authenticated;
grant execute on function public.listing_expiry_channel_active(uuid,text) to service_role;

create function public.save_listing_channel_expiry(p_listing_id uuid,p_expiry_date date,p_channels text[],p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c text; previous public.listing_channel_expiries; result jsonb;
begin
 if auth.uid() is null or not public.listing_publication_actor_allowed(p_listing_id,auth.uid()) then raise exception 'You cannot change expiry for this listing.' using errcode='42501'; end if;
 perform 1 from public.private_listings where id=p_listing_id and listing_status in ('active','under_offer') and coalesce(listing_visibility,'') <> 'archived' for update;
 if not found then raise exception 'Activate or relist this listing before changing expiry.'; end if;
 if p_expiry_date is null or p_expiry_date <= (now() at time zone 'Africa/Johannesburg')::date then raise exception 'Listing expiry must be a future date.'; end if;
 if coalesce(cardinality(p_channels),0) not between 1 and 4 or exists(select 1 from unnest(p_channels) candidate where candidate is null or candidate not in ('property24','private_property','agency_website','kingdom_website')) then raise exception 'Choose valid active listing channels.'; end if;
 if exists(select 1 from public.listing_publication_jobs where listing_id=p_listing_id and state in ('queued','processing','dispatching','uncertain')) then raise exception 'Check pending advertising requests before changing expiry.'; end if;
 foreach c in array p_channels loop
  if not public.listing_expiry_channel_active(p_listing_id,c) then raise exception 'Check the channel status before changing expiry. Only existing active adverts can be updated.'; end if;
  select * into previous from public.listing_channel_expiries where listing_id=p_listing_id and channel=c for update;
  if not coalesce(p_expected ? c,false) or (p_expected->>c)::timestamptz is distinct from previous.updated_at then raise exception 'Expiry changed elsewhere. Refresh before saving.' using errcode='40001'; end if;
  if previous.state in ('updating','expiring','update_uncertain','expiry_uncertain') then raise exception 'An expiry request is pending or uncertain. Check the channel before changing its date.'; end if;
 end loop;
 foreach c in array p_channels loop
  insert into public.listing_channel_expiries(listing_id,channel,expiry_date,setup_expiry_date,requested_by,state,message)
  values(p_listing_id,c,p_expiry_date,(select nullif(form_data->>'listingExpiryDate','')::date from public.private_listing_seller_onboarding where private_listing_id=p_listing_id),auth.uid(),case when c in ('property24','private_property') then 'queued' else 'scheduled' end,case when c in ('property24','private_property') then 'Expiry date saved. Portal update queued.' else 'Removal scheduled for the end of the selected day (South African time).' end)
  on conflict(listing_id,channel) do update set expiry_date=excluded.expiry_date,requested_by=excluded.requested_by,state=excluded.state,message=excluded.message,claim_id=null,claimed_at=null,updated_at=clock_timestamp();
 end loop;
 insert into public.private_listing_activity(private_listing_id,performed_by,visibility,activity_type,activity_title,metadata)
 values(p_listing_id,auth.uid(),'internal','listing_expiry_saved','Listing expiry saved',jsonb_build_object('expiryDate',p_expiry_date,'channels',p_channels));
 select jsonb_agg(jsonb_build_object('channel',channel,'expiry_date',expiry_date,'state',state,'message',message,'updated_at',updated_at)) into result from public.listing_channel_expiries where listing_id=p_listing_id and channel=any(p_channels);
 return result;
end; $$;
revoke all on function public.save_listing_channel_expiry(uuid,date,text[],jsonb) from public,anon;
grant execute on function public.save_listing_channel_expiry(uuid,date,text[],jsonb) to authenticated;

-- Initialize dates from setup only after a channel has an actual publishing
-- receipt. Draft capture itself never queues or removes an advert.
create function public.initialize_listing_channel_expiry() returns trigger
language plpgsql security definer set search_path='' as $$
declare listing uuid; channel_name text; setup_date text; actor uuid;
begin
 listing := case when tg_table_name in ('property24_listing_syncs','private_property_listing_syncs') then (to_jsonb(new)->>'private_listing_id')::uuid else (to_jsonb(new)->>'listing_id')::uuid end;
 channel_name := case tg_table_name when 'property24_listing_syncs' then 'property24' when 'private_property_listing_syncs' then 'private_property' when 'website_listing_publications' then 'agency_website' else 'kingdom_website' end;
 if not public.listing_expiry_channel_active(listing,channel_name) then return new; end if;
 if tg_table_name in ('property24_listing_syncs','private_property_listing_syncs') and to_jsonb(new)->>'environment' <> 'production' then return new; end if;
 select o.form_data->>'listingExpiryDate',coalesce(l.assigned_agent_id,l.created_by) into setup_date,actor
 from public.private_listings l join public.private_listing_seller_onboarding o on o.private_listing_id=l.id where l.id=listing and l.listing_status in ('active','under_offer');
 if coalesce(setup_date,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or actor is null then return new; end if;
 begin
  if setup_date::date <= (now() at time zone 'Africa/Johannesburg')::date then return new; end if;
 exception when invalid_datetime_format or datetime_field_overflow then return new;
 end;
 insert into public.listing_channel_expiries(listing_id,channel,expiry_date,setup_expiry_date,requested_by,state,message)
 values(listing,channel_name,setup_date::date,setup_date::date,actor,'scheduled','Expiry captured in listing setup. Removal scheduled for the end of that day.')
 on conflict(listing_id,channel) do update set expiry_date=excluded.expiry_date,setup_expiry_date=excluded.setup_expiry_date,requested_by=excluded.requested_by,state='scheduled',message=excluded.message,claim_id=null,claimed_at=null,updated_at=clock_timestamp()
 where (public.listing_channel_expiries.setup_expiry_date is distinct from excluded.setup_expiry_date or public.listing_channel_expiries.state in ('expired','cancelled')) and public.listing_channel_expiries.state not in ('updating','expiring','update_uncertain','expiry_uncertain');
 return new;
end; $$;
revoke all on function public.initialize_listing_channel_expiry() from public,anon,authenticated;
create trigger listing_setup_expiry_property24 after insert or update on public.property24_listing_syncs for each row execute function public.initialize_listing_channel_expiry();
create trigger listing_setup_expiry_private_property after insert or update on public.private_property_listing_syncs for each row execute function public.initialize_listing_channel_expiry();
create trigger listing_setup_expiry_agency after insert or update on public.website_listing_publications for each row execute function public.initialize_listing_channel_expiry();
create trigger listing_setup_expiry_kingdom after insert or update on public.website_partner_listing_publications for each row execute function public.initialize_listing_channel_expiry();

-- Content updates must not resurrect a website advert after its expiry. A new
-- future date in setup is the explicit way to advertise that channel again.
create function public.guard_website_listing_expiry() returns trigger
language plpgsql security definer set search_path='' as $$
declare channel_name text; existing public.listing_channel_expiries; setup_date text; effective_date date;
begin
 if new.status <> 'published' then return new; end if;
 channel_name := case tg_table_name when 'website_listing_publications' then 'agency_website' else 'kingdom_website' end;
 select * into existing from public.listing_channel_expiries where listing_id=new.listing_id and channel=channel_name;
 select form_data->>'listingExpiryDate' into setup_date from public.private_listing_seller_onboarding where private_listing_id=new.listing_id;
 if existing.state in ('updating','expiring','expiry_uncertain') then raise exception 'An expiry request needs confirmation before this advert can be updated.'; end if;
 effective_date := case when nullif(setup_date,'') is not null and setup_date::date is distinct from existing.setup_expiry_date then setup_date::date else existing.expiry_date end;
 if effective_date < (now() at time zone 'Africa/Johannesburg')::date then raise exception 'Choose a future listing expiry date in listing setup before republishing this website advert.'; end if;
 return new;
end; $$;
revoke all on function public.guard_website_listing_expiry() from public,anon,authenticated;
create trigger guard_agency_listing_expiry before insert or update on public.website_listing_publications for each row execute function public.guard_website_listing_expiry();
create trigger guard_kingdom_listing_expiry before insert or update on public.website_partner_listing_publications for each row execute function public.guard_website_listing_expiry();

create function public.claim_listing_channel_expiries() returns setof public.listing_channel_expiries
language plpgsql security definer set search_path='' as $$
begin
 update public.listing_channel_expiries set state=case when state='updating' then 'update_uncertain' else 'expiry_uncertain' end,message='Request interrupted. Check the channel before sending again.',updated_at=clock_timestamp()
 where state in ('updating','expiring') and claimed_at < now()-interval '10 minutes';
 update public.listing_channel_expiries e set state='cancelled',message='Listing or channel is inactive, or access changed.',updated_at=clock_timestamp()
 where e.state in ('queued','scheduled','update_failed','update_uncertain') and (not public.listing_publication_actor_allowed(e.listing_id,e.requested_by) or not exists(select 1 from public.private_listings l where l.id=e.listing_id and l.listing_status in ('active','under_offer') and coalesce(l.listing_visibility,'') <> 'archived') or not public.listing_expiry_channel_active(e.listing_id,e.channel));
 return query with jobs as (
  select e.id from public.listing_channel_expiries e where (e.state='queued' or (e.state in ('scheduled','update_failed','update_uncertain') and e.expiry_date < (now() at time zone 'Africa/Johannesburg')::date))
  and not exists(select 1 from public.listing_publication_jobs p where p.listing_id=e.listing_id and p.state in ('queued','processing','dispatching','uncertain'))
  order by e.expiry_date,e.id for update skip locked limit 3
 ) update public.listing_channel_expiries e set state=case when e.expiry_date < (now() at time zone 'Africa/Johannesburg')::date then 'expiring' else 'updating' end,claim_id=gen_random_uuid(),claimed_at=now(),updated_at=clock_timestamp(),message='Sending expiry change to channel.'
 from jobs j where e.id=j.id returning e.*;
end; $$;
revoke all on function public.claim_listing_channel_expiries() from public,anon,authenticated;
grant execute on function public.claim_listing_channel_expiries() to service_role;

-- Reuse existing website authorization and unpublish handlers; delegation is
-- bound to one claimed expiry and cannot publish or act on another listing.
create function public.listing_expiry_website_context(p_job uuid,p_claim uuid,p_partner boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.listing_channel_expiries; actor auth.users; status jsonb; claims text; sub text;
begin
 select * into j from public.listing_channel_expiries where id=p_job and claim_id=p_claim and state='expiring' and channel=case when p_partner then 'kingdom_website' else 'agency_website' end and expiry_date < (now() at time zone 'Africa/Johannesburg')::date;
 if not found or not public.listing_publication_actor_allowed(j.listing_id,j.requested_by) or not exists(select 1 from public.private_listings where id=j.listing_id and listing_status in ('active','under_offer') and coalesce(listing_visibility,'') <> 'archived') then raise exception 'Expiry job is unavailable.' using errcode='42501'; end if;
 select * into actor from auth.users where id=j.requested_by;
 claims := current_setting('request.jwt.claims',true); sub := current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'email',actor.email,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',actor.id::text,true);
 if p_partner then status := public.website_get_partner_listing_status(j.listing_id); else status := public.website_get_listing_publication_status(j.listing_id); end if;
 perform set_config('request.jwt.claims',coalesce(claims,''),true); perform set_config('request.jwt.claim.sub',coalesce(sub,''),true);
 return jsonb_build_object('listingId',j.listing_id,'actorId',actor.id,'actorEmail',actor.email,'status',status);
end; $$;
revoke all on function public.listing_expiry_website_context(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.listing_expiry_website_context(uuid,uuid,boolean) to service_role;
commit;
