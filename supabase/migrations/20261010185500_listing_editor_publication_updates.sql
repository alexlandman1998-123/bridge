begin;
alter table public.listing_publication_jobs add column update_request_key uuid;

-- Updates reuse the existing worker and provider references. Do not reset a
-- dispatched request whose outcome is unknown, or overwrite an in-flight edit.
create function public.enqueue_listing_publication_update(p_listing_id uuid, p_channels text[], p_request_key uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel text; v_job public.listing_publication_jobs; v_result jsonb;
begin
 if auth.uid() is null or not public.listing_publication_actor_allowed(p_listing_id,auth.uid()) then raise exception 'You cannot publish this listing.' using errcode='42501'; end if;
 perform 1 from public.private_listings where id=p_listing_id and listing_status in ('active','under_offer') and coalesce(listing_visibility,'') <> 'archived' for update;
 if not found then raise exception 'Activate this saved listing before publishing.'; end if;
 if p_request_key is null or coalesce(cardinality(p_channels),0) not between 1 and 3 or exists(select 1 from unnest(p_channels) c where c is null or c not in ('property24','private_property','agency_website')) then raise exception 'Choose valid listing channels and an update request.'; end if;
 foreach v_channel in array p_channels loop
  insert into public.listing_publication_jobs(listing_id,requested_by,channel,update_request_key) values(p_listing_id,auth.uid(),v_channel,p_request_key) on conflict(listing_id,channel) do nothing;
  select * into v_job from public.listing_publication_jobs where listing_id=p_listing_id and channel=v_channel for update;
  if v_job.update_request_key = p_request_key then continue; end if;
  if v_job.state in ('processing','dispatching','uncertain') then raise exception 'A previous submission needs to finish or be checked before sending these saved changes. Refresh the channel status, then retry.'; end if;
  update public.listing_publication_jobs set state='queued', requested_by=auth.uid(), update_request_key=p_request_key, claim_id=null, claimed_at=null, created_at=now(), updated_at=now(), message='Queued for update.' where id=v_job.id;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'listing_id',listing_id,'channel',channel,'state',state,'message',message,'created_at',created_at,'updated_at',updated_at)),'[]'::jsonb) into v_result from public.listing_publication_jobs where listing_id=p_listing_id and channel=any(p_channels);
 return v_result;
end; $$;
revoke all on function public.enqueue_listing_publication_update(uuid,text[],uuid) from public,anon;
grant execute on function public.enqueue_listing_publication_update(uuid,text[],uuid) to authenticated;
commit;
