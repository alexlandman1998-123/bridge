begin;

create table public.revo_inbox_routing_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  priority integer not null default 100 check (priority >= 0),
  enabled boolean not null default true,
  match_json jsonb not null default '{}'::jsonb,
  action_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index revo_inbox_routing_rules_priority_idx
  on public.revo_inbox_routing_rules (organisation_id, enabled, priority asc);
create trigger revo_inbox_routing_rules_set_updated_at
before update on public.revo_inbox_routing_rules
for each row execute function public.set_updated_at_timestamp();

create table public.revo_inbox_sla_policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  source_channel text,
  first_response_minutes integer not null check (first_response_minutes > 0),
  escalation_minutes integer not null check (escalation_minutes >= first_response_minutes),
  escalation_team_id uuid,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger revo_inbox_sla_policies_set_updated_at
before update on public.revo_inbox_sla_policies
for each row execute function public.set_updated_at_timestamp();

create table public.revo_inbox_escalations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null references public.revo_inbox_conversations(id) on delete cascade,
  sla_policy_id uuid references public.revo_inbox_sla_policies(id) on delete set null,
  state text not null default 'open' check (state in ('open', 'acknowledged', 'resolved')),
  reason text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  unique (conversation_id, sla_policy_id, state)
);
create index revo_inbox_escalations_open_idx
  on public.revo_inbox_escalations (organisation_id, state, created_at asc);

alter table public.revo_inbox_routing_rules enable row level security;
alter table public.revo_inbox_sla_policies enable row level security;
alter table public.revo_inbox_escalations enable row level security;
grant select, insert, update, delete on public.revo_inbox_routing_rules, public.revo_inbox_sla_policies to authenticated;
grant select, update on public.revo_inbox_escalations to authenticated;

create policy revo_inbox_routing_rules_member_read on public.revo_inbox_routing_rules for select to authenticated
using (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_active_member(organisation_id));
create policy revo_inbox_routing_rules_admin_write on public.revo_inbox_routing_rules for all to authenticated
using (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_org_admin(organisation_id))
with check (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_org_admin(organisation_id));
create policy revo_inbox_sla_policies_member_read on public.revo_inbox_sla_policies for select to authenticated
using (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_active_member(organisation_id));
create policy revo_inbox_sla_policies_admin_write on public.revo_inbox_sla_policies for all to authenticated
using (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_org_admin(organisation_id))
with check (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_org_admin(organisation_id));
create policy revo_inbox_escalations_member_read on public.revo_inbox_escalations for select to authenticated
using (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_active_member(organisation_id));
create policy revo_inbox_escalations_member_update on public.revo_inbox_escalations for update to authenticated
using (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_active_member(organisation_id))
with check (organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid and public.bridge_is_active_member(organisation_id));

create view public.revo_inbox_analytics
with (security_invoker = true)
as
select
  c.organisation_id,
  ch.channel as source_channel,
  c.assigned_user_id,
  count(*) filter (where c.status not in ('closed', 'spam')) as unresolved_count,
  count(*) filter (where c.unread_count > 0) as unread_count,
  count(*) filter (where e.state = 'open') as open_escalation_count,
  avg(extract(epoch from (coalesce(c.last_outbound_at, now()) - c.last_inbound_at)) / 60.0)
    filter (where c.last_inbound_at is not null and c.last_outbound_at is not null) as average_response_minutes
from public.revo_inbox_conversations c
join public.revo_inbox_channels ch on ch.id = c.channel_id
left join public.revo_inbox_escalations e on e.conversation_id = c.id
group by c.organisation_id, ch.channel, c.assigned_user_id;

grant select on public.revo_inbox_analytics to authenticated;

comment on table public.revo_inbox_routing_rules is 'Revo-only source, listing, team and assignment routing rules; rules are ordered by ascending priority.';
comment on table public.revo_inbox_escalations is 'Durable shared-inbox SLA escalation records; delivery notifications are handled by a worker after operational release.';

commit;
