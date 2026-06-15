begin;
create table if not exists public.document_requirement_reminders (
  id uuid primary key default gen_random_uuid(),
  requirement_instance_id uuid references public.document_requirement_instances(id) on delete cascade,
  context_type text not null,
  context_id uuid not null,
  recipient_role text,
  recipient_contact_id uuid,
  recipient_email text,
  reminder_type text not null,
  channel text not null default 'in_app',
  status text not null default 'pending',
  reminder_count integer not null default 0,
  last_reminded_at timestamptz,
  next_reminder_at timestamptz,
  escalation_count integer not null default 0,
  paused_until timestamptz,
  suppressed_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_requirement_reminders_type_check check (
    reminder_type in (
      'missing_required_documents',
      'missing_blocker_documents',
      'rejected_documents',
      'expired_documents',
      'documents_awaiting_review',
      'workflow_gate_blocked',
      'pack_incomplete',
      'stale_upload_request',
      'final_pre_lodgement_check'
    )
  ),
  constraint document_requirement_reminders_channel_check check (
    channel in ('in_app', 'email', 'whatsapp', 'manual', 'system')
  ),
  constraint document_requirement_reminders_status_check check (
    status in ('pending', 'scheduled', 'sent', 'suppressed', 'paused', 'completed', 'failed', 'cancelled')
  )
);
create table if not exists public.document_requirement_reminder_items (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.document_requirement_reminders(id) on delete cascade,
  requirement_instance_id uuid not null references public.document_requirement_instances(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reminder_id, requirement_instance_id)
);
create index if not exists document_requirement_reminders_context_idx
  on public.document_requirement_reminders (context_type, context_id, status, next_reminder_at);
create index if not exists document_requirement_reminders_requirement_idx
  on public.document_requirement_reminders (requirement_instance_id, status, created_at desc);
create index if not exists document_requirement_reminders_recipient_idx
  on public.document_requirement_reminders (recipient_role, recipient_contact_id, recipient_email, status);
create index if not exists document_requirement_reminders_type_channel_idx
  on public.document_requirement_reminders (reminder_type, channel, status);
create index if not exists document_requirement_reminders_metadata_gin_idx
  on public.document_requirement_reminders using gin (metadata_json);
create index if not exists document_requirement_reminder_items_requirement_idx
  on public.document_requirement_reminder_items (requirement_instance_id);
drop trigger if exists document_requirement_reminders_set_updated_at on public.document_requirement_reminders;
create trigger document_requirement_reminders_set_updated_at
before update on public.document_requirement_reminders
for each row
execute function public.bridge_set_updated_at();
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
      'gate_passed',
      'reminder_scheduled',
      'reminder_suppressed',
      'reminder_failed',
      'escalation_created',
      'manual_follow_up_sent',
      'reminder_completed'
    )
  );
alter table if exists public.document_requirement_reminders enable row level security;
alter table if exists public.document_requirement_reminder_items enable row level security;
grant select, insert, update on public.document_requirement_reminders to authenticated;
grant select, insert on public.document_requirement_reminder_items to authenticated;
comment on table public.document_requirement_reminders is
  'Canonical reminder, follow-up and escalation records grouped by context, recipient, pack, gate and reminder type.';
comment on table public.document_requirement_reminder_items is
  'Items included in grouped canonical document reminders.';
comment on table public.document_requirement_events is
  'Audit trail for canonical document requirement lifecycle, workflow gate and reminder activity.';
notify pgrst, 'reload schema';
commit;
