-- Keep public client portal bootstrap lookups under the API statement timeout.
-- These are idempotent because production environments may already have some
-- of the equivalent legacy SQL-pack indexes.

create index if not exists client_portal_links_active_token_idx
  on public.client_portal_links (token)
  where is_active is true;

create index if not exists client_portal_contexts_transaction_email_idx
  on public.client_portal_contexts (transaction_id, client_email)
  where transaction_id is not null;

create index if not exists client_portal_contexts_seller_workspace_status_idx
  on public.client_portal_contexts (seller_workspace_token, status)
  where seller_workspace_token is not null;

create index if not exists document_packets_transaction_type_updated_idx
  on public.document_packets (transaction_id, packet_type, updated_at desc)
  where transaction_id is not null;

create index if not exists document_packet_versions_packet_version_idx
  on public.document_packet_versions (packet_id, version_number desc);

create index if not exists document_packet_signers_packet_created_idx
  on public.document_packet_signers (packet_id, created_at);

create index if not exists transaction_attorney_assignments_transaction_status_updated_idx
  on public.transaction_attorney_assignments (transaction_id, status, updated_at desc)
  where transaction_id is not null;
