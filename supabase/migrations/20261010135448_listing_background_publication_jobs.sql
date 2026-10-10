begin;

create table public.listing_publication_jobs (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.private_listings(id) on delete cascade,
 requested_by uuid not null references auth.users(id),
 channel text not null check(channel in ('property24','private_property','agency_website')),
 state text not null default 'queued' check(state in ('queued','processing','dispatching','accepted','failed','uncertain','cancelled')),
 claim_id uuid,
 claimed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 message text not null default 'Queued for publication.',
 unique(listing_id,channel)
);
create index listing_publication_jobs_pending on public.listing_publication_jobs(created_at) where state='queued';
alter table public.listing_publication_jobs enable row level security;
revoke all on public.listing_publication_jobs from public,anon,authenticated;
grant select(id,listing_id,channel,state,created_at,updated_at,message) on public.listing_publication_jobs to authenticated;
grant all on public.listing_publication_jobs to service_role;
create policy listing_publication_jobs_read on public.listing_publication_jobs for select to authenticated
 using(public.bridge_can_access_private_listing(listing_id));

-- Shared with enqueue and the worker; authority is checked again at dispatch.
create function public.listing_publication_actor_allowed(p_listing uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(
  select 1 from public.private_listings l join public.organisation_users m on m.organisation_id=l.organisation_id
  join auth.users u on u.id=p_actor
  where l.id=p_listing and (m.user_id=u.id or lower(m.email)=lower(u.email))
   and lower(coalesce(nullif(to_jsonb(m)->>'membership_status',''),to_jsonb(m)->>'status','')) in ('active','accepted','approved')
   and (
    lower(coalesce(nullif(to_jsonb(m)->>'workspace_role',''),nullif(to_jsonb(m)->>'organisation_role',''),nullif(to_jsonb(m)->>'organization_role',''),to_jsonb(m)->>'role','')) in ('principal','owner','admin','manager','branch_manager','agency_principal')
    or ((l.assigned_agent_id=u.id or l.created_by=u.id or (u.email is not null and lower(l.assigned_agent_email)=lower(u.email)))
      and lower(coalesce(nullif(to_jsonb(m)->>'workspace_role',''),nullif(to_jsonb(m)->>'organisation_role',''),nullif(to_jsonb(m)->>'organization_role',''),to_jsonb(m)->>'role','')) in ('agent','estate_agent','sales_agent','developer'))
   )
 );
$$;
revoke all on function public.listing_publication_actor_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.listing_publication_actor_allowed(uuid,uuid) to service_role;

create function public.enqueue_listing_publication(p_listing_id uuid,p_channels text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel text; v_result jsonb;
begin
 if auth.uid() is null or not public.listing_publication_actor_allowed(p_listing_id,auth.uid()) then raise exception 'You cannot publish this listing.' using errcode='42501'; end if;
 if not exists(select 1 from public.private_listings where id=p_listing_id and listing_status in ('active','under_offer') and coalesce(listing_visibility,'') <> 'archived') then raise exception 'Activate this saved listing before publishing.'; end if;
 if coalesce(cardinality(p_channels),0) not between 1 and 3 or exists(select 1 from unnest(p_channels) c where c is null or c not in ('property24','private_property','agency_website')) then raise exception 'Choose valid listing channels.'; end if;
 foreach v_channel in array p_channels loop
  insert into public.listing_publication_jobs(listing_id,requested_by,channel) values(p_listing_id,auth.uid(),v_channel)
  on conflict(listing_id,channel) do nothing;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'listing_id',listing_id,'channel',channel,'state',state,'message',message,'created_at',created_at,'updated_at',updated_at)),'[]'::jsonb)
 into v_result from public.listing_publication_jobs where listing_id=p_listing_id and channel=any(p_channels);
 return v_result;
end; $$;
revoke all on function public.enqueue_listing_publication(uuid,text[]) from public,anon;
grant execute on function public.enqueue_listing_publication(uuid,text[]) to authenticated;

create function public.claim_listing_publications(p_listing_id uuid default null) returns setof public.listing_publication_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- An interrupted provider call is never safe to retry automatically.
 update public.listing_publication_jobs set state='uncertain',message='Submission interrupted. Check the channel before submitting again.',updated_at=now()
 where state='dispatching' and claimed_at < now()-interval '10 minutes';
 update public.listing_publication_jobs set state='queued',claim_id=null,claimed_at=null,updated_at=now()
 where state='processing' and claimed_at < now()-interval '10 minutes';
 return query with next_jobs as (
  select id from public.listing_publication_jobs where state='queued' and (p_listing_id is null or listing_id=p_listing_id)
  order by created_at,id for update skip locked limit 3
 ) update public.listing_publication_jobs j set state='processing',claim_id=gen_random_uuid(),claimed_at=now(),updated_at=now(),message='Preparing publication.'
 from next_jobs n where j.id=n.id returning j.*;
end; $$;
revoke all on function public.claim_listing_publications(uuid) from public,anon,authenticated;
grant execute on function public.claim_listing_publications(uuid) to service_role;

create function public.begin_listing_publication_dispatch(p_job uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.listing_publication_jobs;
begin
 select * into j from public.listing_publication_jobs where id=p_job and claim_id=p_claim and state='processing' for update;
 if not found then return false; end if;
 if not public.listing_publication_actor_allowed(j.listing_id,j.requested_by) or not exists(select 1 from public.private_listings where id=j.listing_id and listing_status in ('active','under_offer') and coalesce(listing_visibility,'') <> 'archived') then
  update public.listing_publication_jobs set state='cancelled',message='Listing is inactive or publishing access changed.',updated_at=now() where id=j.id;
  return false;
 end if;
 update public.listing_publication_jobs set state='dispatching',message='Submitting to channel.',updated_at=now() where id=j.id;
 return true;
end; $$;
revoke all on function public.begin_listing_publication_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_listing_publication_dispatch(uuid,uuid) to service_role;

-- Server-only delegation for the existing website membership-guarded status
-- functions. No user tokens are stored, minted or trusted from job payloads.
create function public.listing_publication_website_context(p_job uuid,p_claim uuid,p_partner boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.listing_publication_jobs; v_actor auth.users; v_status jsonb; v_claims text; v_sub text;
begin
 select * into j from public.listing_publication_jobs where id=p_job and claim_id=p_claim and state='dispatching' and channel='agency_website';
 if not found or not public.listing_publication_actor_allowed(j.listing_id,j.requested_by) then raise exception 'Publication job is unavailable.' using errcode='42501'; end if;
 if not exists(select 1 from public.private_listings where id=j.listing_id and listing_status in ('active','under_offer') and coalesce(listing_visibility,'') <> 'archived') then raise exception 'Listing is no longer active.'; end if;
 select * into v_actor from auth.users where id=j.requested_by;
 v_claims := current_setting('request.jwt.claims',true);
 v_sub := current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',v_actor.id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor.id,'email',v_actor.email,'role','authenticated')::text,true);
 if p_partner then v_status:=public.website_get_partner_listing_status(j.listing_id); else v_status:=public.website_get_listing_publication_status(j.listing_id); end if;
 perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
 return jsonb_build_object('listingId',j.listing_id,'actorId',v_actor.id,'actorEmail',v_actor.email,'status',v_status);
end; $$;
revoke all on function public.listing_publication_website_context(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.listing_publication_website_context(uuid,uuid,boolean) to service_role;
commit;
