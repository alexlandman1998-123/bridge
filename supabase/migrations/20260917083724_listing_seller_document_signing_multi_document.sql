drop index if exists public.private_listing_documents_signing_session_unique;

create unique index if not exists private_listing_documents_signing_session_document_unique
  on public.private_listing_documents (signing_session_id, document_type)
  where signing_session_id is not null;
