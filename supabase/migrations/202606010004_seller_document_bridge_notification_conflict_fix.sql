begin;

create or replace function public.bridge_create_transaction_notifications_for_roles(
  p_transaction_id uuid,
  p_role_types text[],
  p_notification_type text,
  p_title text,
  p_message text,
  p_event_type text default 'TransactionUpdated',
  p_event_data jsonb default '{}'::jsonb,
  p_dedupe_prefix text default 'notify'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_count integer := 0;
begin
  if p_transaction_id is null or coalesce(array_length(p_role_types, 1), 0) = 0 then
    return 0;
  end if;

  with targets as (
    select *
    from public.bridge_resolve_transaction_notification_targets(p_transaction_id, p_role_types)
  ),
  inserted as (
    insert into public.transaction_notifications (
      transaction_id,
      user_id,
      role_type,
      notification_type,
      title,
      message,
      is_read,
      dedupe_key,
      event_type,
      event_data
    )
    select
      p_transaction_id,
      targets.user_id,
      targets.role_type,
      coalesce(nullif(trim(p_notification_type), ''), 'document_uploaded'),
      coalesce(nullif(trim(p_title), ''), 'Document uploaded'),
      coalesce(p_message, ''),
      false,
      concat(
        coalesce(nullif(trim(p_dedupe_prefix), ''), 'notify'),
        ':',
        p_transaction_id::text,
        ':',
        targets.role_type,
        ':',
        targets.user_id::text
      ),
      coalesce(nullif(trim(p_event_type), ''), 'TransactionUpdated'),
      coalesce(p_event_data, '{}'::jsonb) || jsonb_build_object('recipientRole', targets.role_type)
    from targets
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted_count
  from inserted;

  return coalesce(v_inserted_count, 0);
end;
$$;

commit;
