begin;

alter table if exists public.private_listing_document_requirements
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.private_listing_documents
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.transaction_required_documents
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.document_requests
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.documents
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.document_packets
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.document_packet_versions
  add column if not exists canonical_requirement_instance_id uuid
  references public.document_requirement_instances(id) on delete set null;

alter table if exists public.document_requirement_events
  drop constraint if exists document_requirement_events_type_check;

alter table if exists public.document_requirement_events
  add constraint document_requirement_events_type_check check (
    event_type in (
      'created',
      'requested',
      'uploaded',
      'review_started',
      'approved',
      'rejected',
      'waived',
      'expired',
      'completed',
      'reminder_sent',
      'visibility_changed',
      'regenerated',
      'marked_not_applicable',
      'reactivated',
      'rule_matched',
      'rule_unmatched',
      'legacy_synced',
      'legacy_upload_linked',
      'legacy_status_imported',
      'packet_linked',
      'document_request_created',
      'mapping_missing',
      'sync_skipped',
      'status_conflict'
    )
  );

do $$
begin
  if to_regclass('public.private_listing_document_requirements') is not null then
    create index if not exists private_listing_document_requirements_canonical_idx
      on public.private_listing_document_requirements (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    create index if not exists private_listing_documents_canonical_idx
      on public.private_listing_documents (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;

  if to_regclass('public.transaction_required_documents') is not null then
    create index if not exists transaction_required_documents_canonical_idx
      on public.transaction_required_documents (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;

  if to_regclass('public.document_requests') is not null then
    create index if not exists document_requests_canonical_idx
      on public.document_requests (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;

  if to_regclass('public.documents') is not null then
    create index if not exists documents_canonical_requirement_idx
      on public.documents (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;

  if to_regclass('public.document_packets') is not null then
    create index if not exists document_packets_canonical_requirement_idx
      on public.document_packets (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;

  if to_regclass('public.document_packet_versions') is not null then
    create index if not exists document_packet_versions_canonical_requirement_idx
      on public.document_packet_versions (canonical_requirement_instance_id)
      where canonical_requirement_instance_id is not null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.private_listing_document_requirements') is not null then
    comment on column public.private_listing_document_requirements.canonical_requirement_instance_id is
      'Compatibility link from legacy private listing requirement rows to canonical document requirement instances.';
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    comment on column public.private_listing_documents.canonical_requirement_instance_id is
      'Compatibility link from legacy private listing uploads to canonical document requirement instances.';
  end if;

  if to_regclass('public.transaction_required_documents') is not null then
    comment on column public.transaction_required_documents.canonical_requirement_instance_id is
      'Compatibility link from legacy transaction required documents to canonical document requirement instances.';
  end if;

  if to_regclass('public.document_requests') is not null then
    comment on column public.document_requests.canonical_requirement_instance_id is
      'Compatibility link from legacy document request follow-ups to canonical document requirement instances.';
  end if;

  if to_regclass('public.documents') is not null then
    comment on column public.documents.canonical_requirement_instance_id is
      'Compatibility link from uploaded document artifacts to canonical document requirement instances.';
  end if;

  if to_regclass('public.document_packets') is not null then
    comment on column public.document_packets.canonical_requirement_instance_id is
      'Compatibility link from generated document packets to canonical document requirement instances.';
  end if;

  if to_regclass('public.document_packet_versions') is not null then
    comment on column public.document_packet_versions.canonical_requirement_instance_id is
      'Compatibility link from generated packet versions to canonical document requirement instances.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
