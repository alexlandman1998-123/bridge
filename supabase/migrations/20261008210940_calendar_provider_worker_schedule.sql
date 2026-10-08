begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function private.run_calendar_provider_sync()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text; v_request bigint;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(v_url),'') is null or nullif(trim(v_key),'') is null then
    raise warning 'Calendar provider worker is missing Vault configuration';
    return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing');
  end if;
  select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/calendar-provider-sync-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key,'apikey',v_key),
    body:=jsonb_build_object('limit',5),timeout_milliseconds:=120000) into v_request;
  return jsonb_build_object('scheduled',true,'requestId',v_request);
end; $$;
revoke all on function private.run_calendar_provider_sync() from public, anon, authenticated;
grant execute on function private.run_calendar_provider_sync() to service_role;
select cron.schedule('arch9-calendar-provider-sync-1m','* * * * *',
  $schedule$select private.run_calendar_provider_sync();$schedule$);
commit;
