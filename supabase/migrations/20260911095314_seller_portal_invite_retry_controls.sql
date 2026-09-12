begin;

create or replace function public.bridge_retry_private_listing_seller_portal_invite(
  p_private_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.private_listing_seller_portal_invite_outbox%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to retry seller portal delivery.';
  end if;

  select * into v_job
  from public.private_listing_seller_portal_invite_outbox
  where private_listing_id = p_private_listing_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No seller portal invitation delivery was found for this listing.';
  end if;
  if not public.bridge_is_active_member(v_job.organisation_id) then
    raise exception 'You do not have access to retry this seller portal invitation.';
  end if;
  if v_job.status = 'sent' then
    return jsonb_build_object('ok', true, 'status', 'sent', 'alreadySent', true);
  end if;
  if v_job.status = 'processing' then
    return jsonb_build_object('ok', true, 'status', 'processing', 'alreadyQueued', true);
  end if;

  update public.private_listing_seller_portal_invite_outbox
  set status = 'queued', attempt_count = 0, next_attempt_at = now(), claimed_at = null,
      last_error = null, updated_at = now()
  where id = v_job.id;

  return jsonb_build_object('ok', true, 'status', 'queued', 'outboxId', v_job.id);
end;
$$;

revoke all on function public.bridge_retry_private_listing_seller_portal_invite(uuid)
  from public, anon, service_role;
grant execute on function public.bridge_retry_private_listing_seller_portal_invite(uuid) to authenticated;

commit;
