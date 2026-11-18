begin;

-- Reconnect refreshes credentials only. It must not implicitly transfer an
-- existing number or its full message history, even for an administrator.
create or replace function public.whatsapp_finish_authorization(p_org uuid,p_actor uuid,p_state text,p_waba text,p_phone text,p_metadata jsonb,p_encrypted text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare admin boolean; session public.meta_whatsapp_authorizations%rowtype; sender public.organisation_communication_channels%rowtype; foreign_org uuid; mode text; at timestamptz;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  select * into session from public.meta_whatsapp_authorizations where state_hash=p_state and organisation_id=p_org and requested_by=p_actor and consumed_at is null and expires_at>now() and token_ciphertext is not null for update;
  if session.state_hash is null then raise exception 'WhatsApp authorization expired. Start the connection again'; end if;
  if p_phone !~ '^[0-9]{1,32}$' or p_waba !~ '^[0-9]{1,32}$' or nullif(p_encrypted,'') is null then raise exception 'Invalid verified WhatsApp assets'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-number:'||p_phone,0));
  select organisation_id into foreign_org from public.organisation_communication_channels where phone_number_id=p_phone and provider='meta' and channel_type='whatsapp' and connection_status='connected' and organisation_id<>p_org;
  if foreign_org is not null then raise exception 'This phone number is already connected to another workspace'; end if;
  select * into sender from public.organisation_communication_channels where organisation_id=p_org and phone_number_id=p_phone and provider='meta' and channel_type='whatsapp' for update;
  if sender.id is not null and sender.owner_user_id is distinct from session.owner_user_id then
    raise exception 'This number already has a different inbox owner. Reconnect with its existing owner; change ownership separately in WhatsApp settings';
  end if;
  if not admin and (session.owner_user_id is distinct from p_actor or (sender.id is not null and sender.owner_user_id is distinct from p_actor)) then raise exception 'An administrator must transfer an existing agency or agent number'; end if;
  if session.owner_user_id is not null then perform public.whatsapp_staff_is_admin(p_org,session.owner_user_id); end if;
  mode:=case when session.coexistence then 'coexistence' else 'cloud_api' end;
  at:=(p_metadata->>'at')::timestamptz;
  if session.coexistence and (p_metadata->>'is_on_biz_app' is distinct from 'true' or p_metadata->>'platform_type' is distinct from 'CLOUD_API') then raise exception 'Meta has not confirmed the phone app connection'; end if;
  if sender.id is null then
    insert into public.organisation_communication_channels(organisation_id,owner_user_id,ownership_changed_by,provider,channel_type,waba_id,phone_number_id,display_phone_number,business_display_name,connection_status,verification_status,meta_access_token,token_ciphertext,connected_at,created_by,onboarding_mode,business_app_session,business_app_connected_at)
      values(p_org,session.owner_user_id,p_actor,'meta','whatsapp',p_waba,p_phone,p_metadata->>'display_phone_number',p_metadata->>'business_display_name',p_metadata->>'connection_status',p_metadata->>'verification_status','',p_encrypted,at,p_actor,mode,case when session.coexistence then gen_random_uuid() else null end,case when session.coexistence then at else null end) returning * into sender;
  else
    update public.organisation_communication_channels set owner_user_id=session.owner_user_id,ownership_changed_by=p_actor,waba_id=p_waba,display_phone_number=p_metadata->>'display_phone_number',business_display_name=p_metadata->>'business_display_name',connection_status=p_metadata->>'connection_status',verification_status=p_metadata->>'verification_status',meta_access_token='',token_ciphertext=p_encrypted,connected_at=at,created_by=p_actor,last_error_message=null,onboarding_mode=mode,business_app_session=case when session.coexistence then gen_random_uuid() else null end,business_app_connected_at=case when session.coexistence then at else null end,business_app_history_progress=0,business_app_history_state='none',business_app_contacts_received_at=null,business_app_state_at=null where id=sender.id returning * into sender;
  end if;
  if session.coexistence then update public.whatsapp_inbox_conversations set last_inbound_at=null where channel_id=sender.id; end if;
  update public.meta_whatsapp_authorizations set consumed_at=now(),token_ciphertext=null where state_hash=session.state_hash;
  return jsonb_build_object('sender',to_jsonb(sender));
end; $$;

commit;
