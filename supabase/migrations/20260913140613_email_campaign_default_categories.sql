begin;
-- Initialise the platform's existing permission categories for current workspaces.
-- This creates category definitions only; it does not subscribe contacts.
do $$ declare workspace record; begin
  for workspace in select id from public.organisations loop
    perform public.email_campaign_ensure_subscription_types(workspace.id);
  end loop;
end $$;
commit;
