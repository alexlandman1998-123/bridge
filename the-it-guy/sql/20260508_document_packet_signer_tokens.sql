begin;

alter table public.document_packet_signers
  add column if not exists signing_token text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_used_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists signed_at timestamptz;

alter table public.document_packet_signers
  drop constraint if exists document_packet_signers_status_check;
alter table public.document_packet_signers
  add constraint document_packet_signers_status_check
  check (status in ('pending', 'ready_to_send', 'sent', 'viewed', 'signed', 'declined', 'expired'));

create unique index if not exists document_packet_signers_signing_token_unique_idx
  on public.document_packet_signers (signing_token)
  where signing_token is not null;

create index if not exists document_packet_signers_token_expiry_idx
  on public.document_packet_signers (token_expires_at);

commit;
