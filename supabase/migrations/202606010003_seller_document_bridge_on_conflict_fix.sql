begin;

drop index if exists public.documents_transaction_source_document_unique_idx;

create unique index if not exists documents_transaction_source_document_unique_idx
  on public.documents (transaction_id, source, source_document_id);

commit;
