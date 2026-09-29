begin;

-- Keep the CRM principal as the owner, but send Home Seekers seller alerts to
-- the agency inbox selected for this launch. The seller address still comes
-- from the enquiry itself.
do $home_seekers_recipient$
declare
  v_definition text;
  v_anchor text := E'  v_event_kind := ''new_website_enquiry_principal'';\n\n  v_routing :=';
  v_replacement text := E'  v_event_kind := ''new_website_enquiry_principal'';\n\n  if v_site.organisation_id = ''2958d402-368e-43c9-b728-0098e10505f1''::uuid\n    and v_lead_category = ''seller'' then\n    v_recipient_email := ''alexlandman1998@gmail.com'';\n  end if;\n\n  v_routing :=';
begin
  select pg_catalog.pg_get_functiondef(
    'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'Home Seekers recipient anchor changed; review capture function before release';
  end if;

  execute pg_catalog.replace(v_definition, v_anchor, v_replacement);
end;
$home_seekers_recipient$;

-- A deleted September test lead must never produce a delayed live email.
do $skip_deleted_test$
declare
  v_event public.notification_events%rowtype;
begin
  for v_event in
    select claimed.*
    from public.website_claim_lead_notifications(
      1,
      '01155274-9640-4557-8a42-783635a3a0a0'::uuid
    ) claimed
    where claimed.organisation_id = '2958d402-368e-43c9-b728-0098e10505f1'::uuid
      and claimed.lead_id is null
  loop
    perform public.website_complete_lead_notification(
      '4b144dd0-1729-41c5-aaf7-403aaa2db66e'::uuid,
      v_event.id,
      'skipped',
      null,
      null
    );
  end loop;
end;
$skip_deleted_test$;

-- Scope the schedule to Home Seekers seller events. Other agencies' old
-- queued notifications remain untouched by this release.
create or replace function public.website_run_home_seekers_seller_dispatcher()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_service_role_key text;
  v_event_id uuid;
  v_scheduled integer := 0;
begin
  select secret.decrypted_secret into v_project_url
  from vault.decrypted_secrets secret
  where secret.name = 'arch9_project_url'
  limit 1;

  select secret.decrypted_secret into v_service_role_key
  from vault.decrypted_secrets secret
  where secret.name = 'arch9_service_role_key'
  limit 1;

  if nullif(pg_catalog.btrim(v_project_url), '') is null
    or nullif(pg_catalog.btrim(v_service_role_key), '') is null then
    raise warning 'Home Seekers dispatcher is missing Vault configuration.';
    return pg_catalog.jsonb_build_object('scheduled', 0, 'reason', 'vault_configuration_missing');
  end if;

  for v_event_id in
    select event.id
    from public.notification_events event
    where event.organisation_id = '2958d402-368e-43c9-b728-0098e10505f1'::uuid
      and event.source = 'agency_website'
      and event.automation_key = 'website_lead_received'
      and event.channel = 'email'
      and event.event_key = 'new_website_enquiry_principal'
      and event.payload_json->>'leadCategory' = 'seller'
      and event.status in ('queued', 'failed')
      and event.lead_id is not null
      and event.recipient_email is not null
      and event.dispatch_attempt_count < event.max_dispatch_attempts
      and coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at) <= pg_catalog.clock_timestamp()
    order by coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at), event.created_at
    limit 25
  loop
    perform net.http_post(
      url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/website-lead-dispatcher',
      headers := pg_catalog.jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key,
        'apikey', v_service_role_key
      ),
      body := pg_catalog.jsonb_build_object('eventId', v_event_id),
      timeout_milliseconds := 15000
    );
    v_scheduled := v_scheduled + 1;
  end loop;

  return pg_catalog.jsonb_build_object('scheduled', v_scheduled);
end;
$$;

revoke all on function public.website_run_home_seekers_seller_dispatcher()
  from public, anon, authenticated;
grant execute on function public.website_run_home_seekers_seller_dispatcher()
  to service_role;

do $home_seekers_schedule$
begin
  if not exists (
    select 1 from cron.job job
    where job.jobname = 'arch9-home-seekers-seller-dispatcher-1m'
  ) then
    perform cron.schedule(
      'arch9-home-seekers-seller-dispatcher-1m',
      '* * * * *',
      $schedule$select public.website_run_home_seekers_seller_dispatcher();$schedule$
    );
  end if;
end;
$home_seekers_schedule$;

commit;
