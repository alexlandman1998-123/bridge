-- The existing restrictive mailbox read/work policies continue to apply.
-- Only the author's internal, unsent draft gains a permissive delete policy.
create policy shared_inbox_messages_delete_own_unsent_draft
on public.revo_inbox_messages for delete to authenticated
using (
  created_by = (select auth.uid())
  and direction = 'internal'
  and message_type = 'draft'
  and delivery_status = 'queued'
);
