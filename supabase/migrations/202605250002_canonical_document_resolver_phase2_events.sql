begin;
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
      'rule_unmatched'
    )
  );
notify pgrst, 'reload schema';
commit;
