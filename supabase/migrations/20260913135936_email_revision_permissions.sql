begin;
-- Production default privileges are broader than a fresh local database.
-- Keep revision history append-only, including protection from TRUNCATE.
revoke all on public.email_campaign_revisions from public, anon, authenticated;
grant select, insert on public.email_campaign_revisions to authenticated;
commit;
