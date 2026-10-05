begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create function handoff_private.run_dispatch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; request_id bigint;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then
    return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing');
  end if;
  select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/transaction-handoff-dispatch-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key,'apikey',service_key),
    body:=jsonb_build_object('limit',10),timeout_milliseconds:=15000) into request_id;
  return jsonb_build_object('scheduled',true,'requestId',request_id);
end $$;
revoke all on function handoff_private.run_dispatch() from public,anon,authenticated;
grant execute on function handoff_private.run_dispatch() to service_role;
select cron.schedule('arch9-transaction-handoff-dispatch-1m','* * * * *',$schedule$select handoff_private.run_dispatch();$schedule$);
commit;
