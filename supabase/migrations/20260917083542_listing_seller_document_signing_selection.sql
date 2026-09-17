alter table public.private_listing_mandate_signing_sessions
  add column if not exists selected_documents jsonb not null default '["mandate"]'::jsonb;

alter table public.private_listing_mandate_signing_sessions
  add constraint private_listing_mandate_signing_sessions_selected_documents_check
  check (
    jsonb_typeof(selected_documents) = 'array'
    and selected_documents <@ '["disclosure", "fica", "mandate"]'::jsonb
    and jsonb_array_length(selected_documents) > 0
  ) not valid;

alter table public.private_listing_mandate_signing_sessions
  validate constraint private_listing_mandate_signing_sessions_selected_documents_check;
