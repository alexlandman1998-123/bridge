begin;

-- Preserve the existing minute schedule and queues. New Supabase secret keys
-- belong in apikey, while legacy JWT service credentials retain Bearer headers.
create or replace function public.bridge_run_marketing_event_worker_phase8()
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_project_url text;
  v_service_role_key text;
  v_request_id bigint;
  v_headers jsonb;
begin
  if current_setting('role') not in ('service_role','none') then
    raise exception 'Worker authorization required';
  end if;
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'arch9_project_url' limit 1;
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets where name = 'arch9_service_role_key' limit 1;
  if nullif(trim(v_project_url), '') is null or nullif(trim(v_service_role_key), '') is null then
    raise warning 'Marketing event worker is missing Vault configuration.';
    return jsonb_build_object('scheduled', false, 'reason', 'vault_configuration_missing');
  end if;
  v_headers := jsonb_build_object('Content-Type','application/json','apikey',v_service_role_key);
  if left(v_service_role_key,10) <> 'sb_secret_' then
    v_headers := v_headers || jsonb_build_object('Authorization','Bearer ' || v_service_role_key);
  end if;
  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/marketing-event-worker',
    headers := v_headers,
    body := jsonb_build_object('limit', 50),
    timeout_milliseconds := 15000
  ) into v_request_id;
  return jsonb_build_object('scheduled', true, 'request_id', v_request_id);
end;
$function$;

revoke all on function public.bridge_run_marketing_event_worker_phase8() from public, anon, authenticated;
grant execute on function public.bridge_run_marketing_event_worker_phase8() to service_role;

commit;
