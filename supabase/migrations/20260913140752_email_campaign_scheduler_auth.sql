begin;
-- A dedicated random credential isolates the email scheduler from rotated platform keys.
do $$ begin
  if not exists(select 1 from vault.secrets where name='arch9_email_campaign_cron_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'arch9_email_campaign_cron_key','Email campaign scheduler credential');
  end if;
end $$;
select cron.schedule('arch9-email-campaign-worker','* * * * *',$job$
  select net.http_post(
    url := (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='arch9_project_url' limit 1)||'/functions/v1/email-campaign-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-arch9-email-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='arch9_email_campaign_cron_key' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
commit;
