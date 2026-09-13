begin;

-- Phase 3: operational Revo inbox state. This remains provider-neutral: a
-- channel connector may create delivered messages later, while workspace users
-- can already manage ownership, resolution and private notes/drafts.

alter table public.revo_inbox_messages
  add column message_type text not null default 'message'
    check (message_type in ('message', 'note', 'draft', 'system'));

create table public.revo_inbox_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('conversation_created', 'assignment_changed', 'status_changed', 'note_added', 'draft_saved')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, organisation_id)
    references public.revo_inbox_conversations (id, organisation_id)
    on delete cascade
);

create index revo_inbox_activity_conversation_created_at_idx
  on public.revo_inbox_activity (conversation_id, created_at asc);
create index revo_inbox_activity_organisation_created_at_idx
  on public.revo_inbox_activity (organisation_id, created_at desc);

alter table public.revo_inbox_activity enable row level security;
grant select on public.revo_inbox_activity to authenticated;

create policy revo_inbox_activity_member_read
on public.revo_inbox_activity for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

-- The activity table is append-only from the client perspective. A trigger
-- records only allowed inbox mutations so users cannot forge the audit trail.
create or replace function public.revo_inbox_record_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_action text;
  activity_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'revo_inbox_conversations' then
    if tg_op = 'insert' then
      activity_action := 'conversation_created';
    elsif new.assigned_user_id is distinct from old.assigned_user_id then
      activity_action := 'assignment_changed';
      activity_metadata := jsonb_build_object(
        'fromAssignedUserId', old.assigned_user_id,
        'toAssignedUserId', new.assigned_user_id
      );
    elsif new.status is distinct from old.status then
      activity_action := 'status_changed';
      activity_metadata := jsonb_build_object('fromStatus', old.status, 'toStatus', new.status);
    else
      return new;
    end if;

    insert into public.revo_inbox_activity (organisation_id, conversation_id, actor_user_id, action, metadata_json)
    values (new.organisation_id, new.id, (select auth.uid()), activity_action, activity_metadata);
    return new;
  end if;

  if tg_table_name = 'revo_inbox_messages' and tg_op = 'insert' then
    if new.message_type = 'note' then
      activity_action := 'note_added';
    elsif new.message_type = 'draft' then
      activity_action := 'draft_saved';
    else
      return new;
    end if;

    insert into public.revo_inbox_activity (organisation_id, conversation_id, actor_user_id, action, metadata_json)
    values (new.organisation_id, new.conversation_id, (select auth.uid()), activity_action, jsonb_build_object('messageId', new.id));
  end if;
  return new;
end;
$$;

revoke all on function public.revo_inbox_record_activity() from public;

create trigger revo_inbox_conversations_record_activity
after insert or update of assigned_user_id, status on public.revo_inbox_conversations
for each row execute function public.revo_inbox_record_activity();

create trigger revo_inbox_messages_record_activity
after insert on public.revo_inbox_messages
for each row execute function public.revo_inbox_record_activity();

drop policy revo_inbox_conversations_admin_write on public.revo_inbox_conversations;
create policy revo_inbox_conversations_member_update
on public.revo_inbox_conversations for update to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

drop policy revo_inbox_messages_admin_write on public.revo_inbox_messages;
create policy revo_inbox_messages_member_insert_private_work
on public.revo_inbox_messages for insert to authenticated
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
  and created_by = (select auth.uid())
  and direction = 'outbound'
  and message_type in ('note', 'draft')
  and delivery_status = 'queued'
);

create policy revo_inbox_messages_member_update_own_draft
on public.revo_inbox_messages for update to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and created_by = (select auth.uid())
  and message_type = 'draft'
  and delivery_status = 'queued'
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and created_by = (select auth.uid())
  and message_type = 'draft'
  and delivery_status = 'queued'
);

comment on table public.revo_inbox_activity is
  'Append-only Revo-only inbox operational audit trail. Entries are created by database triggers.';
comment on column public.revo_inbox_messages.message_type is
  'Message denotes provider traffic. Note and draft are private workspace records and are never provider-delivered.';

commit;
