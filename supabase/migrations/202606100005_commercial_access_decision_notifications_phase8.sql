begin;

drop function if exists public.bridge_notify_commercial_access_decision(uuid);

create or replace function public.bridge_notify_commercial_access_decision(p_request_id uuid)
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.commercial_access_requests%rowtype;
  v_title text;
  v_message text;
  v_action_route text;
begin
  select *
    into v_request
  from public.commercial_access_requests
  where id = p_request_id
    and module_key = 'commercial'
    and status in ('approved', 'rejected');

  if v_request.id is null then
    return;
  end if;

  if not public.bridge_is_org_admin(v_request.organisation_id) then
    raise exception 'Only a principal or workspace administrator can notify Commercial access decisions.';
  end if;

  if v_request.status = 'approved' then
    v_title := 'Commercial access approved';
    v_message := 'Your principal approved Commercial access. You can open the Commercial workspace now.';
    v_action_route := '/commercial';
  else
    v_title := 'Commercial access request reviewed';
    v_message := 'Your principal reviewed your Commercial access request. Contact them if you need more detail.';
    v_action_route := '/dashboard';
  end if;

  if v_request.requester_user_id is null then
    return;
  end if;

  return query
  with target_requester as (
    select v_request.requester_user_id as user_id
    where not exists (
      select 1
      from public.transaction_notifications tn
      where tn.user_id = v_request.requester_user_id
        and tn.is_read = false
        and tn.dedupe_key = 'commercial_access_decision:' || v_request.id::text || ':' || v_request.status
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
      target_requester.user_id,
      'agent',
      'commercial_access_decision',
      v_title,
      v_message,
      false,
      null,
      'commercial_access_decision:' || v_request.id::text || ':' || v_request.status,
      'CommercialAccessReviewed',
      jsonb_build_object(
        'source', 'commercial_access_decision',
        'requestId', v_request.id,
        'decision', v_request.status,
        'workspaceId', v_request.organisation_id,
        'reviewedBy', v_request.reviewed_by,
        'reviewedAt', v_request.reviewed_at,
        'actionRoute', v_action_route,
        'path', v_action_route
      )
    from target_requester
    returning id, user_id
  )
  select inserted.id, inserted.user_id
  from inserted;
end;
$$;

grant execute on function public.bridge_notify_commercial_access_decision(uuid) to authenticated;

commit;
