begin;

-- Test profiles cannot enrol other contacts or suppress their normal lead messages.
create function private.whatsapp_screening_delivery_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare config jsonb; expected text;
begin
  if tg_table_name='whatsapp_screening_profiles' then
    if coalesce(new.config->>'deliveryMode','') not in ('test','live') then raise exception 'Choose test-only or future-enquiry screening';end if;
    if new.config->>'deliveryMode'='test' and coalesce(new.config->>'testPhone','') !~ '^[1-9][0-9]{7,14}$' then raise exception 'Add an international test recipient';end if;
    return new;
  end if;
  select p.config into config from public.whatsapp_screening_profiles p where p.id=new.profile_id and p.organisation_id=new.organisation_id;
  if config is null then raise exception 'Screening profile unavailable';end if;
  if config->>'deliveryMode' is distinct from 'live' then
    expected:=config->>'testPhone';
    if expected is null or expected is distinct from new.phone then return null;end if;
  end if;
  return new;
end; $$;
revoke all on function private.whatsapp_screening_delivery_scope() from public,anon,authenticated;
create trigger whatsapp_screening_profile_scope before insert or update on public.whatsapp_screening_profiles
  for each row execute function private.whatsapp_screening_delivery_scope();
create trigger whatsapp_screening_enrol_scope before insert on public.whatsapp_screening_sessions
  for each row execute function private.whatsapp_screening_delivery_scope();

-- Recheck at the actual outbox boundary, including after a settings change.
create function private.whatsapp_screening_test_outbox() returns trigger
language plpgsql security definer set search_path='' as $$
declare config jsonb; phone text;
begin
  if new.direction<>'outbound' or not coalesce(new.request_json ? 'screeningJob',false) then return new;end if;
  select p.config,c.contact_phone into config,phone from public.whatsapp_screening_sessions s
    join public.whatsapp_screening_profiles p on p.id=s.profile_id and p.organisation_id=s.organisation_id
    join public.whatsapp_inbox_conversations c on c.id=new.conversation_id and c.organisation_id=s.organisation_id and c.channel_id=s.channel_id
    where s.id=(new.request_json->>'screeningSession')::uuid and s.organisation_id=new.organisation_id;
  if config is null or (config->>'deliveryMode' is distinct from 'live' and (nullif(config->>'testPhone','') is null or config->>'testPhone' is distinct from phone)) then raise exception 'Test-only screening cannot send to this contact';end if;
  return new;
end; $$;
revoke all on function private.whatsapp_screening_test_outbox() from public,anon,authenticated;
create trigger whatsapp_screening_test_outbox before insert on public.whatsapp_inbox_messages
  for each row execute function private.whatsapp_screening_test_outbox();
commit;
