begin;

-- Read-only, tenant-scoped delivery evidence. Dispatch leases, frozen provider
-- payloads and shared account quotas remain server-only.
create function public.email_campaign_delivery_status(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  campaign public.email_campaigns%rowtype;
  job public.email_campaign_dispatch_jobs%rowtype;
  policy public.email_sending_policies%rowtype;
  controls jsonb;
  explanation text;
begin
  select * into campaign from public.email_campaigns where id=p_campaign_id;
  if not found or auth.uid() is null
    or not coalesce(public.bridge_has_organisation_membership(campaign.organisation_id),false)
    or not coalesce(campaign.created_by=auth.uid() or public.email_campaign_can_send(campaign.organisation_id),false) then
    raise exception 'This campaign is not available in your workspace.' using errcode='42501';
  end if;
  select * into job from public.email_campaign_dispatch_jobs where campaign_id=campaign.id;
  select * into policy from public.email_sending_policies where organisation_id=campaign.organisation_id;
  controls := public.email_campaign_controls_status(campaign.organisation_id);
  if job.status in ('queued','running','failed') then
    explanation := case
      when job.status='failed' then job.last_error
      when policy.manual_paused_at is not null then 'Your organisation has paused email sending. Queued recipients are retained; resume sending in Email settings.'
      when policy.paused_at is not null or policy.self_service_blocked then coalesce(nullif(policy.pause_reason,''),'Email sending has a safety stop. Contact your workspace administrator before retrying.')
      when not coalesce((controls->>'account_ready')::boolean,false) then 'Arch9 sending capacity is unavailable. Queued recipients are retained; contact your workspace administrator.'
      else job.last_error
    end;
  end if;
  return jsonb_build_object('state',coalesce(job.status,'not_queued'),
    'message',nullif(left(explanation,1000),''),'nextAttemptAt',case when job.status='queued' then job.run_at else null end,
    'attempts',coalesce(job.attempts,0),'updatedAt',job.updated_at);
end $$;
revoke all on function public.email_campaign_delivery_status(uuid) from public,anon;
grant execute on function public.email_campaign_delivery_status(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
