begin;
create or replace function public.bridge_notify_transaction_roles(
 p_transaction_id uuid,p_role_types text[],p_notification_type text,p_title text,p_message text,
 p_event_type text default 'TransactionUpdated',p_event_data jsonb default '{}',
 p_dedupe_prefix text default 'notify',p_exclude_user_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $notify$
declare roles text[]; kind text; title text; body text; event_type text; data jsonb; prefix text; inserted integer;
begin
 if auth.uid() is null then
  if not (public.bridge_has_onboarding_token_transaction_access(p_transaction_id)
    or public.bridge_has_client_portal_token_transaction_access(p_transaction_id))
    or not exists(select 1 from public.transaction_onboarding where transaction_id=p_transaction_id and status='Submitted') then
   raise exception 'A submitted buyer onboarding context is required.' using errcode='42501';
  end if;
  roles:=array['agent','developer'];kind:='readiness_updated';title:='Buyer onboarding submitted';
  body:='Buyer details are ready for review.';event_type:='TransactionUpdated';
  data:=jsonb_build_object('source','buyer_onboarding_completed');prefix:='buyer-onboarding-submitted';
 else
  if not journey_private.can_read_professional_journey(p_transaction_id) then
   raise exception 'Transaction notification access denied.' using errcode='42501';
  end if;
  if p_exclude_user_id is not null and p_exclude_user_id<>auth.uid() then
   raise exception 'Only your own notification can be excluded.' using errcode='22023';
  end if;
  roles:=array(select distinct r from unnest(coalesce(p_role_types,'{}')) r where r in
    ('agent','agency_admin','developer','attorney','transfer_attorney','bond_attorney','cancellation_attorney','bond_originator','buyer','seller'));
  kind:=left(coalesce(nullif(trim(p_notification_type),''),'readiness_updated'),80);
  title:=left(coalesce(p_title,'Transaction updated'),240);body:=left(coalesce(p_message,''),4000);
  event_type:=left(coalesce(p_event_type,'TransactionUpdated'),120);
  if octet_length(coalesce(p_event_data,'{}')::text)>16000 then raise exception 'Notification context is too large.' using errcode='22023';end if;
  data:=coalesce(p_event_data,'{}');prefix:=left(coalesce(nullif(p_dedupe_prefix,''),'notify'),240);
 end if;
 -- Recipients are resolved from the actual transaction, never a caller's user IDs.
 with targets as (
 select * from public.bridge_resolve_transaction_notification_targets(p_transaction_id,roles)
 where p_exclude_user_id is null or user_id<>p_exclude_user_id
 ), saved as (
 insert into public.transaction_notifications(transaction_id,user_id,role_type,notification_type,title,message,is_read,dedupe_key,event_type,event_data)
 select p_transaction_id,targets.user_id,targets.role_type,kind,title,body,false,
 concat(prefix,':',p_transaction_id::text,':',targets.role_type,':',targets.user_id::text),event_type,
 data||jsonb_build_object('recipientRole',targets.role_type) from targets
 on conflict do nothing returning 1
 ) select count(*) into inserted from saved;
 return inserted;
end $notify$;
revoke all on function public.bridge_notify_transaction_roles(uuid,text[],text,text,text,text,jsonb,text,uuid) from public;
grant execute on function public.bridge_notify_transaction_roles(uuid,text[],text,text,text,text,jsonb,text,uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
