-- Keep an agent-owned business number's conversations with that number owner.
-- Shared number routing and the existing management access checks are unchanged.
begin;
create function public.whatsapp_personal_number_assignment_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare number_owner uuid;
begin
  select c.owner_user_id into number_owner
    from public.organisation_communication_channels c
    where c.id=new.channel_id and c.organisation_id=new.organisation_id;
  if not found then
    raise exception 'The WhatsApp number is unavailable in this organisation.' using errcode='42501';
  end if;
  if number_owner is not null and new.assigned_user_id is distinct from number_owner then
    raise exception 'This is a personal business number. Its conversations must stay with the number owner. Change number ownership in WhatsApp settings to transfer it.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.whatsapp_personal_number_assignment_guard() from public,anon,authenticated;
grant execute on function public.whatsapp_personal_number_assignment_guard() to service_role;
create trigger whatsapp_inbox_personal_assignment_guard
  before update of assigned_user_id on public.whatsapp_inbox_conversations
  for each row execute function public.whatsapp_personal_number_assignment_guard();
commit;
