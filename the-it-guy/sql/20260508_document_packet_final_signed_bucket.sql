begin;

alter table public.document_packet_versions
  add column if not exists final_signed_file_bucket text;

commit;
