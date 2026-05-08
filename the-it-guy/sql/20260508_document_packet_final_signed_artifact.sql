begin;

alter table public.document_packet_versions
  add column if not exists final_signed_file_path text,
  add column if not exists final_signed_file_url text,
  add column if not exists final_signed_file_name text,
  add column if not exists final_signed_document_id uuid references public.documents(id) on delete set null,
  add column if not exists finalised_at timestamptz,
  add column if not exists finalised_by uuid references public.profiles(id) on delete set null;

create index if not exists document_packet_versions_finalised_idx
  on public.document_packet_versions (packet_id, finalised_at desc);

commit;
