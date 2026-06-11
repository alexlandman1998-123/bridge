begin;

drop function if exists public.bridge_notify_commercial_access_request(uuid);

create function public.bridge_notify_commercial_access_request(p_request_id uuid)
returns table(notification_id uuid, recipient_user_id uuid, recipient_email text, recipient_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.commercial_access_requests%rowtype;
  v_requester_name text;
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
    raise exception 'Not allowed to notify Commercial access reviewers for this request.';
  end if;

  v_requester_name := coalesce(nullif(trim(v_request.requester_name), ''), nullif(trim(v_request.requester_email), ''), 'A workspace user');

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
          and tn.dedupe_key = 'commercial_access_request:' || v_request.id::text || ':' || ou.user_id::text
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
      'Commercial access requested',
      v_requester_name || ' requested access to the Commercial workspace.',
      false,
      null,
      'commercial_access_request:' || v_request.id::text || ':' || reviewer_targets.user_id::text,
      'CommercialAccessRequested',
      jsonb_build_object(
        'source', 'commercial_access_request',
        'requestId', v_request.id,
        'requesterUserId', v_request.requester_user_id,
        'requesterEmail', v_request.requester_email,
        'requesterName', v_request.requester_name,
        'workspaceId', v_request.organisation_id,
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

grant execute on function public.bridge_notify_commercial_access_request(uuid) to authenticated;

drop function if exists public.bridge_notify_commercial_access_decision(uuid);

create function public.bridge_notify_commercial_access_decision(p_request_id uuid)
returns table(notification_id uuid, recipient_user_id uuid, recipient_email text, recipient_name text)
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
    select
      ou.user_id,
      lower(nullif(trim(coalesce(ou.email, v_request.requester_email)), '')) as email,
      coalesce(nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), ''), nullif(trim(v_request.requester_name), '')) as full_name
    from public.organisation_users ou
    where ou.organisation_id = v_request.organisation_id
      and ou.user_id = v_request.requester_user_id
      and not exists (
        select 1
        from public.transaction_notifications tn
        where tn.user_id = v_request.requester_user_id
          and tn.is_read = false
          and tn.dedupe_key = 'commercial_access_decision:' || v_request.id::text || ':' || v_request.status
      )
    limit 1
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
  select inserted.id, inserted.user_id, target_requester.email, target_requester.full_name
  from inserted
  join target_requester on target_requester.user_id = inserted.user_id;
end;
$$;

grant execute on function public.bridge_notify_commercial_access_decision(uuid) to authenticated;

commit;
