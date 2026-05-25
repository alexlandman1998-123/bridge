begin;

alter table if exists public.document_requirement_events
  drop constraint if exists document_requirement_events_type_check;

alter table if exists public.document_requirement_events
  add constraint document_requirement_events_type_check check (
    event_type in (
      'created',
      'requested',
      'uploaded',
      'replaced',
      'review_started',
      'approved',
      'rejected',
      'needs_reupload',
      'waived',
      'expired',
      'completed',
      'status_changed',
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
      'status_conflict',
      'gate_evaluated',
      'gate_warning_shown',
      'gate_blocked',
      'gate_override_used',
      'gate_passed'
    )
  );

comment on table public.document_requirement_events is
  'Audit trail for canonical document requirement lifecycle events, including resolver, adapter, upload, review, waiver, expiry, packet satisfaction and workflow gate readiness activity.';

notify pgrst, 'reload schema';

commit;
