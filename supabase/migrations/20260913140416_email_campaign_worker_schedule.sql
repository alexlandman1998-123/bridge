begin;
-- Use the same Vault credentials as the platform's other scheduled workers.
-- The cron command contains secret names only; credentials remain in Vault.
select cron.schedule(
  'arch9-email-campaign-worker',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'arch9_project_url' limit 1) || '/functions/v1/email-campaign-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'arch9_service_role_key' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
commit;
