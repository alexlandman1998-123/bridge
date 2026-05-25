-- Keep the service-level reminder insert RPC aligned with the canonical
-- document_requirement_reminders.reminder_type constraint.

begin;

create or replace function public.canonical_document_service_insert_reminder(
  p_requirement_instance_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_recipient_role text default null,
  p_recipient_contact_id uuid default null,
  p_recipient_email text default null,
  p_reminder_type text default 'missing_required_documents',
  p_channel text default 'manual',
  p_status text default 'scheduled',
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if coalesce(auth.role(), current_user) <> 'service_role' and current_user <> 'postgres' then
    raise exception 'service role required for canonical reminder inserts' using errcode = '42501';
  end if;

  insert into public.document_requirement_reminders (
    requirement_instance_id,
    context_type,
    context_id,
    recipient_role,
    recipient_contact_id,
    recipient_email,
    reminder_type,
    channel,
    status,
    metadata_json
  )
  values (
    p_requirement_instance_id,
    p_context_type,
    p_context_id,
    p_recipient_role,
    p_recipient_contact_id,
    p_recipient_email,
    p_reminder_type,
    p_channel,
    p_status,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.canonical_document_service_insert_reminder(uuid, text, uuid, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.canonical_document_service_insert_reminder(uuid, text, uuid, text, uuid, text, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
