begin;
create function document_requirement_private.run_delivery_dispatcher() returns jsonb
language plpgsql security definer set search_path='' as $$
declare url text; key text; request_id bigint;
begin
 select decrypted_secret into url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
 select decrypted_secret into key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
 if nullif(trim(url),'') is null or nullif(trim(key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing'); end if;
 select net.http_post(url:=rtrim(url,'/')||'/functions/v1/document-requirement-dispatcher',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||key,'apikey',key),body:='{"limit":10}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return jsonb_build_object('scheduled',true,'requestId',request_id);
end $$;
revoke all on function document_requirement_private.run_delivery_dispatcher() from public,anon,authenticated;
select cron.schedule('arch9-document-requirement-delivery-1m','* * * * *','select document_requirement_private.run_delivery_dispatcher();');
commit;
