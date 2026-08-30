begin;

-- This RPC is the authenticated app-start payload. It is intentionally scoped
-- to auth.uid() by the function body; remove the default PUBLIC execute grant
-- so only signed-in browser sessions can invoke it.
revoke all on function public.bridge_resolve_current_workspace_context(uuid, text, text) from public, anon;
grant execute on function public.bridge_resolve_current_workspace_context(uuid, text, text) to authenticated;

commit;
