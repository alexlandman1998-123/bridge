begin;

-- Phase 1 upgrades the original Revo-only connector foundation into the
-- canonical shared-inbox model. Associations deliberately use a generic
-- entity id: Arch9 has multiple listing and lead surfaces, and the inbox must
-- not couple provider ingestion to one of them.

alter table public.revo_inbox_conversations
  drop constraint revo_inbox_conversations_status_check;

update public.revo_inbox_conversations
set status = 'waiting_on_us'
where status = 'snoozed';

alter table public.revo_inbox_conversations
  add constraint revo_inbox_conversations_status_check
  check (status in ('open', 'waiting_on_us', 'waiting_on_client', 'closed', 'spam'));

alter table public.revo_inbox_conversations
  add column if not exists branch_id uuid,
  add column if not exists assigned_team_id uuid,
  add column if not exists unread_count integer not null default 0 check (unread_count >= 0),
  add column if not exists last_outbound_at timestamptz,
  add column if not exists last_read_at timestamptz;

create index if not exists revo_inbox_conversations_organisation_unread_idx
  on public.revo_inbox_conversations (organisation_id, unread_count desc, last_message_at desc nulls last);
create index if not exists revo_inbox_conversations_organisation_branch_idx
  on public.revo_inbox_conversations (organisation_id, branch_id, last_message_at desc nulls last);

alter table public.revo_inbox_messages
  drop constraint revo_inbox_messages_direction_check;

update public.revo_inbox_messages
set direction = 'internal'
where message_type in ('note', 'draft') and direction = 'outbound';

alter table public.revo_inbox_messages
  add constraint revo_inbox_messages_direction_check
  check (direction in ('inbound', 'outbound', 'internal', 'system'));

create table public.revo_inbox_associations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null,
  entity_type text not null check (entity_type in ('contact', 'lead', 'listing', 'transaction', 'viewing')),
  entity_id uuid not null,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conversation_id, entity_type, entity_id),
  foreign key (conversation_id, organisation_id)
    references public.revo_inbox_conversations (id, organisation_id)
    on delete cascade
);

create unique index revo_inbox_associations_one_primary_per_type
  on public.revo_inbox_associations (conversation_id, entity_type)
  where is_primary;
create index revo_inbox_associations_entity_lookup_idx
  on public.revo_inbox_associations (organisation_id, entity_type, entity_id);

alter table public.revo_inbox_associations enable row level security;
grant select, insert, update, delete on public.revo_inbox_associations to authenticated;

create policy revo_inbox_associations_member_read
on public.revo_inbox_associations for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

create policy revo_inbox_associations_member_write
on public.revo_inbox_associations for all to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
  and (created_by is null or created_by = (select auth.uid()))
);

alter table public.revo_inbox_activity
  drop constraint revo_inbox_activity_action_check;
alter table public.revo_inbox_activity
  add constraint revo_inbox_activity_action_check
  check (action in (
    'conversation_created', 'assignment_changed', 'status_changed',
    'note_added', 'draft_saved', 'message_received', 'message_sent',
    'association_created', 'association_removed', 'conversation_read'
  ));

create or replace function public.revo_inbox_refresh_conversation_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    update public.revo_inbox_conversations
    set last_message_at = new.occurred_at,
        last_inbound_at = new.occurred_at,
        last_message_preview = left(new.body_text, 500),
        unread_count = unread_count + 1,
        status = case when status in ('closed', 'spam') then 'open' else status end
    where id = new.conversation_id and organisation_id = new.organisation_id;
  elsif new.direction = 'outbound' and new.message_type = 'message' then
    update public.revo_inbox_conversations
    set last_message_at = new.occurred_at,
        last_outbound_at = new.occurred_at,
        last_message_preview = left(new.body_text, 500),
        status = case when status = 'open' then 'waiting_on_client' else status end
    where id = new.conversation_id and organisation_id = new.organisation_id;
  end if;
  return new;
end;
$$;

revoke all on function public.revo_inbox_refresh_conversation_state() from public;

create trigger revo_inbox_messages_refresh_conversation_state
after insert on public.revo_inbox_messages
for each row execute function public.revo_inbox_refresh_conversation_state();

comment on table public.revo_inbox_associations is
  'Revo-only canonical contact, lead, listing, transaction and viewing associations. Provider webhooks never infer associations from contact name alone.';
comment on column public.revo_inbox_conversations.unread_count is
  'Inbound messages pending review in the Revo shared inbox.';

commit;
