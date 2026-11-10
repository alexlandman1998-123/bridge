-- Depends on the development write-receipt foundation. Creating an event and
-- its receipt is one transaction; retries cannot create a second event.
create or replace function public.bridge_create_development_marketing_event(
 p_development_id uuid, p_request_id uuid, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
 v_receipt arch9_private.development_write_receipts%rowtype;
 v_payload jsonb := jsonb_build_object('kind','marketing_event','event',p_event);
 v_organisation_id uuid;
 v_event public.marketing_events%rowtype;
 v_result jsonb;
 v_activity_saved boolean := true;
 v_count integer;
begin
 if auth.uid() is null or p_request_id is null or not coalesce(public.bridge_can_manage_development_record(p_development_id),false) then
  raise exception 'You do not have access to create events for this development.' using errcode='42501';
 end if;
 select organisation_id into v_organisation_id from public.developments where id=p_development_id for no key update;
 if not found then raise exception 'This development is unavailable.' using errcode='42501'; end if;
 select * into v_receipt from arch9_private.development_write_receipts where request_id=p_request_id;
 if found then
  if v_receipt.development_id<>p_development_id or v_receipt.actor_id<>auth.uid() or v_receipt.payload is distinct from v_payload then
   raise exception 'This event form was already saved with different details. Cancel this form and review the event list before creating another event.' using errcode='22023';
  end if;
  return v_receipt.result;
 end if;
 if jsonb_typeof(p_event) is distinct from 'object' or
    (p_event->>'organisation_id')::uuid is distinct from v_organisation_id then
  raise exception 'Choose the organisation that owns this development.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(p_event) k where k not in
   ('organisation_id','event_type','status','title','subject_label','starts_at','location','description')) or
    coalesce(length(btrim(p_event->>'title')),0) not between 1 and 180 or
    coalesce(p_event->>'event_type','') not in ('show_day','launch') or
    coalesce(p_event->>'status','') not in ('draft','planning','upcoming','completed','cancelled') or
    nullif(p_event->>'starts_at','') is null then
  raise exception 'Enter a valid event title, type, status and date.' using errcode='22023';
 end if;
 insert into public.marketing_events(
  organisation_id,event_type,status,title,subject_type,subject_id,subject_label,
  starts_at,location,address,description,created_by
 ) values(
  v_organisation_id,p_event->>'event_type',p_event->>'status',btrim(p_event->>'title'),
  'development',p_development_id,p_event->>'subject_label',(p_event->>'starts_at')::timestamptz,
  p_event->>'location',p_event->>'location',p_event->>'description',auth.uid()
 ) returning * into v_event;
 if not found then raise exception 'The saved event could not be confirmed.' using errcode='42501'; end if;
 -- Activity history is optional. A failure here must not invite a second event.
 begin
  insert into public.development_marketing_activity(development_id,actor_user_id,action_type,metadata)
  values(p_development_id,auth.uid(),'event_created',jsonb_build_object('event_id',v_event.id,'title',v_event.title,'event_type',v_event.event_type));
  get diagnostics v_count=row_count;
  v_activity_saved:=v_count=1;
 exception when others then
  v_activity_saved:=false;
 end;
 v_result:=jsonb_build_object('requestId',p_request_id,'developmentId',p_development_id,
   'event',to_jsonb(v_event),'activitySaved',v_activity_saved);
 insert into arch9_private.development_write_receipts(request_id,development_id,actor_id,payload,result)
 values(p_request_id,p_development_id,auth.uid(),v_payload,v_result);
 return v_result;
end; $$;
revoke all on function public.bridge_create_development_marketing_event(uuid,uuid,jsonb) from public,anon;
grant execute on function public.bridge_create_development_marketing_event(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
