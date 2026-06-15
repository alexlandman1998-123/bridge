begin;

drop function if exists public.bridge_nudge_commercial_access_request(uuid);

create or replace function public.bridge_nudge_commercial_access_request(p_request_id uuid)
returns table(notification_id uuid, recipient_user_id uuid, recipient_email text, recipient_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.commercial_access_requests%rowtype;
  v_requester_name text;
  v_nudge_count integer;
  v_nudged_at timestamptz := now();
begin
  select *
    into v_request
  from public.commercial_access_requests
  where id = p_request_id
    and module_key = 'commercial'
    and status = 'pending';

  if v_request.id is null then
    return;
  end if;

  if v_request.requester_user_id <> auth.uid()
     or not public.bridge_is_active_member(v_request.organisation_id) then
    raise exception 'Not allowed to remind Commercial access reviewers for this request.';
  end if;

  v_requester_name := coalesce(nullif(trim(v_request.requester_name), ''), nullif(trim(v_request.requester_email), ''), 'A workspace user');
  v_nudge_count := coalesce(nullif(v_request.metadata->>'nudge_count', '')::integer, 0) + 1;

  update public.commercial_access_requests
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_nudged_at', v_nudged_at,
      'nudge_count', v_nudge_count
    ),
    updated_at = v_nudged_at
  where id = v_request.id;

  return query
  with reviewer_targets as (
    select distinct
      ou.user_id,
      lower(nullif(trim(ou.email), '')) as email,
      nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), '') as full_name
    from public.organisation_users ou
    where ou.organisation_id = v_request.organisation_id
      and ou.user_id is not null
      and ou.user_id <> v_request.requester_user_id
      and lower(coalesce(ou.status, 'active')) not in ('deactivated', 'revoked', 'deleted')
      and lower(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')) in (
        'owner',
        'principal',
        'director',
        'partner',
        'admin',
        'super_admin'
      )
      and not exists (
        select 1
        from public.transaction_notifications tn
        where tn.user_id = ou.user_id
          and tn.is_read = false
          and tn.dedupe_key = 'commercial_access_request_reminder:' || v_request.id::text || ':' || ou.user_id::text || ':' || to_char(v_nudged_at, 'YYYYMMDDHH24')
      )
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
      read_at,
      dedupe_key,
      event_type,
      event_data
    )
    select
      null,
      reviewer_targets.user_id,
      'agent',
      'commercial_access_request',
      'Commercial access reminder',
      v_requester_name || ' is still waiting for Commercial workspace access approval.',
      false,
      null,
      'commercial_access_request_reminder:' || v_request.id::text || ':' || reviewer_targets.user_id::text || ':' || to_char(v_nudged_at, 'YYYYMMDDHH24'),
      'CommercialAccessRequested',
      jsonb_build_object(
        'source', 'commercial_access_request_reminder',
        'requestId', v_request.id,
        'requesterUserId', v_request.requester_user_id,
        'requesterEmail', v_request.requester_email,
        'requesterName', v_request.requester_name,
        'workspaceId', v_request.organisation_id,
        'nudgeCount', v_nudge_count,
        'nudgedAt', v_nudged_at,
        'actionRoute', '/settings/users',
        'path', '/settings/users'
      )
    from reviewer_targets
    returning id, user_id
  )
  select inserted.id, inserted.user_id, reviewer_targets.email, reviewer_targets.full_name
  from inserted
  join reviewer_targets on reviewer_targets.user_id = inserted.user_id;
end;
$$;

grant execute on function public.bridge_nudge_commercial_access_request(uuid) to authenticated;

commit;
