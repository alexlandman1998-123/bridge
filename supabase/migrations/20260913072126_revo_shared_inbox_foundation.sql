begin;

-- Revo-only shared inbox foundation. Provider credentials, inbound webhooks,
-- outbound sending, and attachments are deliberately outside this migration.

create table public.revo_inbox_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  provider_key text not null check (char_length(btrim(provider_key)) > 0),
  address text not null check (char_length(btrim(address)) > 0),
  display_name text,
  connection_status text not null default 'draft'
    check (connection_status in ('draft', 'connected', 'paused', 'disconnected')),
  is_default boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);

create unique index revo_inbox_channels_organisation_channel_address_key
  on public.revo_inbox_channels (organisation_id, channel, lower(address));
create unique index revo_inbox_channels_one_default_per_channel_key
  on public.revo_inbox_channels (organisation_id, channel)
  where is_default;

create table public.revo_inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  channel_id uuid not null,
  contact_name text,
  contact_address text not null check (char_length(btrim(contact_address)) > 0),
  subject text,
  status text not null default 'open'
    check (status in ('open', 'closed', 'snoozed')),
  assigned_user_id uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (channel_id, organisation_id)
    references public.revo_inbox_channels (id, organisation_id)
    on delete restrict,
  check ((status = 'closed' and closed_at is not null) or status <> 'closed')
);

create index revo_inbox_conversations_organisation_status_activity_idx
  on public.revo_inbox_conversations (organisation_id, status, last_message_at desc nulls last);
create index revo_inbox_conversations_organisation_assignee_activity_idx
  on public.revo_inbox_conversations (organisation_id, assigned_user_id, last_message_at desc nulls last);
create index revo_inbox_conversations_channel_idx
  on public.revo_inbox_conversations (channel_id);

create table public.revo_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_key text not null check (char_length(btrim(provider_key)) > 0),
  provider_message_id text,
  provider_thread_id text,
  sender_address text not null check (char_length(btrim(sender_address)) > 0),
  recipient_addresses text[] not null default '{}'::text[],
  subject text,
  body_text text not null default '',
  body_html text,
  delivery_status text not null default 'received'
    check (delivery_status in ('queued', 'sent', 'delivered', 'read', 'received', 'failed')),
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (conversation_id, organisation_id)
    references public.revo_inbox_conversations (id, organisation_id)
    on delete cascade,
  check (cardinality(recipient_addresses) > 0)
);

create index revo_inbox_messages_conversation_occurred_at_idx
  on public.revo_inbox_messages (conversation_id, occurred_at asc);
create index revo_inbox_messages_organisation_occurred_at_idx
  on public.revo_inbox_messages (organisation_id, occurred_at desc);
create unique index revo_inbox_messages_provider_message_key
  on public.revo_inbox_messages (organisation_id, provider_key, provider_message_id)
  where provider_message_id is not null;

create trigger revo_inbox_channels_set_updated_at
before update on public.revo_inbox_channels
for each row execute function public.set_updated_at_timestamp();

create trigger revo_inbox_conversations_set_updated_at
before update on public.revo_inbox_conversations
for each row execute function public.set_updated_at_timestamp();

alter table public.revo_inbox_channels enable row level security;
alter table public.revo_inbox_conversations enable row level security;
alter table public.revo_inbox_messages enable row level security;

grant select, insert, update on public.revo_inbox_channels to authenticated;
grant select, insert, update on public.revo_inbox_conversations to authenticated;
grant select, insert, update on public.revo_inbox_messages to authenticated;

create policy revo_inbox_channels_member_read
on public.revo_inbox_channels for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

create policy revo_inbox_channels_admin_write
on public.revo_inbox_channels for all to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_org_admin(organisation_id)
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_org_admin(organisation_id)
);

create policy revo_inbox_conversations_member_read
on public.revo_inbox_conversations for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

create policy revo_inbox_conversations_admin_write
on public.revo_inbox_conversations for all to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_org_admin(organisation_id)
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_org_admin(organisation_id)
);

create policy revo_inbox_messages_member_read
on public.revo_inbox_messages for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

create policy revo_inbox_messages_admin_write
on public.revo_inbox_messages for all to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_org_admin(organisation_id)
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_org_admin(organisation_id)
);

comment on table public.revo_inbox_channels is
  'Revo-only shared inbox channel registry. Provider credentials are stored outside this table.';
comment on table public.revo_inbox_conversations is
  'Revo-only shared inbox conversation state for Email and WhatsApp.';
comment on table public.revo_inbox_messages is
  'Revo-only shared inbox message ledger. Raw provider payloads are not stored here.';

commit;
