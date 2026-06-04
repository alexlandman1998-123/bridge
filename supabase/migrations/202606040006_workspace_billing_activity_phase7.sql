begin;

create index if not exists workspace_plan_change_requests_pending_created_idx
  on public.workspace_plan_change_requests (created_at desc)
  where status = 'pending';

create index if not exists workspace_billing_events_request_idx
  on public.workspace_billing_events (request_id, created_at desc)
  where request_id is not null;

create or replace function public.bridge_cancel_workspace_plan_change(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.workspace_plan_change_requests%rowtype;
  v_subscription_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication is required to cancel a plan change request.' using errcode = '28000';
  end if;

  select * into v_request
  from public.workspace_plan_change_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending plan change request was not found.' using errcode = '22023';
  end if;

  if not public.bridge_is_workspace_billing_admin(v_request.organisation_id, v_actor) then
    raise exception 'You do not have permission to cancel billing changes for this workspace.' using errcode = '42501';
  end if;

  select id into v_subscription_id
  from public.workspace_subscriptions
  where organisation_id = v_request.organisation_id
  limit 1;

  update public.workspace_plan_change_requests
  set
    status = 'canceled',
    reviewed_by = v_actor,
    reviewed_at = now(),
    review_note = 'Canceled by workspace billing admin',
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform public.bridge_log_workspace_billing_event(
    v_request.organisation_id,
    v_subscription_id,
    v_request.id,
    'plan_change_canceled',
    v_actor,
    v_request.current_plan_key,
    v_request.requested_plan_key,
    jsonb_build_object('source', 'billing_settings')
  );

  return jsonb_build_object(
    'id', v_request.id,
    'organisationId', v_request.organisation_id,
    'currentPlanKey', v_request.current_plan_key,
    'requestedPlanKey', v_request.requested_plan_key,
    'status', v_request.status,
    'reviewedAt', v_request.reviewed_at,
    'updatedAt', v_request.updated_at
  );
end;
$$;

create or replace function public.bridge_reject_workspace_plan_change(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.workspace_plan_change_requests%rowtype;
  v_subscription_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication is required to reject a plan change request.' using errcode = '28000';
  end if;

  if not public.bridge_is_platform_billing_operator(v_actor) then
    raise exception 'Only platform billing operators can reject plan changes.' using errcode = '42501';
  end if;

  select * into v_request
  from public.workspace_plan_change_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending plan change request was not found.' using errcode = '22023';
  end if;

  select id into v_subscription_id
  from public.workspace_subscriptions
  where organisation_id = v_request.organisation_id
  limit 1;

  update public.workspace_plan_change_requests
  set
    status = 'rejected',
    reviewed_by = v_actor,
    reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform public.bridge_log_workspace_billing_event(
    v_request.organisation_id,
    v_subscription_id,
    v_request.id,
    'plan_change_rejected',
    v_actor,
    v_request.current_plan_key,
    v_request.requested_plan_key,
    jsonb_build_object('reviewNote', nullif(trim(coalesce(p_review_note, '')), ''))
  );

  return jsonb_build_object(
    'id', v_request.id,
    'organisationId', v_request.organisation_id,
    'currentPlanKey', v_request.current_plan_key,
    'requestedPlanKey', v_request.requested_plan_key,
    'status', v_request.status,
    'reviewedAt', v_request.reviewed_at,
    'updatedAt', v_request.updated_at
  );
end;
$$;

grant execute on function public.bridge_cancel_workspace_plan_change(uuid) to authenticated;
grant execute on function public.bridge_reject_workspace_plan_change(uuid, text) to authenticated;

commit;
