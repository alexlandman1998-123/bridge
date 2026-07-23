-- K2: append-only lifecycle integrity for legal-generation support handoffs.

create unique index if not exists document_packet_events_legal_support_lifecycle_once_k2
  on public.document_packet_events (
    packet_id,
    event_type,
    (event_payload_json ->> 'supportReference')
  )
  where event_type in (
    'legal_generation_support_acknowledged',
    'legal_generation_support_resolved'
  );

create index if not exists document_packet_events_legal_support_reference_k2
  on public.document_packet_events (
    organisation_id,
    (event_payload_json ->> 'supportReference'),
    created_at desc
  )
  where event_type in (
    'legal_generation_support_handoff',
    'legal_generation_support_acknowledged',
    'legal_generation_support_resolved'
  );

comment on index public.document_packet_events_legal_support_lifecycle_once_k2 is
  'Allows at most one K2 acknowledgement and one K2 resolution per packet support reference.';
