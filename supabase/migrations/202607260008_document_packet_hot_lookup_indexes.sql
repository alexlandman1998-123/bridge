-- Hot-path indexes for mandate packet lookup, generation status resolution,
-- signing field preparation, and signing event timelines.

create index if not exists document_packets_lead_type_updated_idx
  on public.document_packets (lead_id, packet_type, updated_at desc);

create index if not exists document_packets_org_type_updated_idx
  on public.document_packets (organisation_id, packet_type, updated_at desc);

create index if not exists document_packet_versions_packet_render_version_idx
  on public.document_packet_versions (packet_id, render_status, version_number desc);

create index if not exists document_packet_events_packet_created_idx
  on public.document_packet_events (packet_id, created_at);

create index if not exists document_packet_signers_packet_version_role_idx
  on public.document_packet_signers (packet_id, packet_version_id, signer_role);

create index if not exists document_signing_fields_packet_version_page_created_idx
  on public.document_signing_fields (packet_id, packet_version_id, page_number, created_at);
