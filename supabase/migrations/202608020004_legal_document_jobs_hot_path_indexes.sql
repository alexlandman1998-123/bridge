begin;

create index if not exists legal_document_jobs_watchdog_generate_created_idx
  on public.legal_document_jobs (created_at)
  where job_type = 'generate_packet_version'
    and status in ('queued','claimed','running','failed');

create index if not exists legal_document_jobs_packet_created_idx
  on public.legal_document_jobs (packet_id, created_at desc);

commit;
