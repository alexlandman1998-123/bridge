begin;

alter table if exists public.document_packet_signers
  drop constraint if exists document_packet_signers_signer_role_check;

alter table if exists public.document_packet_signers
  add constraint document_packet_signers_signer_role_check
  check (signer_role in (
    'purchaser_1',
    'purchaser_2',
    'buyer_spouse',
    'seller',
    'seller_spouse',
    'agent',
    'contractor',
    'witness_1',
    'witness_2',
    'other'
  ));

alter table if exists public.document_signing_fields
  drop constraint if exists document_signing_fields_signer_role_check;

alter table if exists public.document_signing_fields
  add constraint document_signing_fields_signer_role_check
  check (signer_role in (
    'purchaser_1',
    'purchaser_2',
    'buyer_spouse',
    'seller',
    'seller_spouse',
    'agent',
    'contractor',
    'witness_1',
    'witness_2',
    'other'
  ));

commit;
