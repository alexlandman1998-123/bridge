begin;

create unique index if not exists matter_financial_entries_one_posted_client_proof_idx
  on public.matter_financial_entries (financial_document_id)
  where financial_document_id is not null
    and entry_status = 'posted'
    and source_type = 'client_payment_proof';

comment on index public.matter_financial_entries_one_posted_client_proof_idx is
  'Prevents attorneys from posting the same client-submitted proof of payment to the matter ledger more than once.';

commit;
