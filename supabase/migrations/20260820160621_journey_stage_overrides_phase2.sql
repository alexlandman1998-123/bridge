begin;

create table if not exists public.journey_stage_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  stage_key text not null,
  action_type text not null,
  reason text,
  effective_at timestamptz not null default now(),
  actor_user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  notification_mode text not null default 'internal_only',
  metadata jsonb not null default '{}'::jsonb,
  supersedes_override_id uuid references public.journey_stage_overrides(id) on delete set null,
  linked_activity_table text,
  linked_activity_id uuid,
  created_at timestamptz not null default now(),
  constraint journey_stage_overrides_entity_type_check
    check (entity_type in ('buyer_lead', 'seller_lead', 'developer_lead', 'transaction')),
  constraint journey_stage_overrides_action_type_check
    check (action_type in ('mark_complete', 'jump_to_stage', 'clear_override', 'mark_paid')),
  constraint journey_stage_overrides_notification_mode_check
    check (notification_mode in ('internal_only', 'normal')),
  constraint journey_stage_overrides_reason_required_check
    check (
      action_type not in ('mark_complete', 'jump_to_stage', 'mark_paid')
      or length(trim(coalesce(reason, ''))) >= 8
    ),
  constraint journey_stage_overrides_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint journey_stage_overrides_linked_activity_pair_check
    check (
      (linked_activity_table is null and linked_activity_id is null)
      or (linked_activity_table is not null and linked_activity_id is not null)
    )
);

comment on table public.journey_stage_overrides is
  'Append-only audit records for journey rail catch-up and payment-review actions. Hard evidence gates remain enforced by the application policy and transaction workflows.';
comment on column public.journey_stage_overrides.entity_type is
  'Polymorphic entity bucket: buyer_lead, seller_lead, developer_lead, or transaction.';
comment on column public.journey_stage_overrides.entity_id is
  'Identifier of the lead, developer lead, or transaction the journey action belongs to.';
comment on column public.journey_stage_overrides.action_type is
  'mark_complete and jump_to_stage are catch-up actions; mark_paid records payment status only; clear_override appends a cancellation row.';
comment on column public.journey_stage_overrides.notification_mode is
  'Catch-up rows default to internal_only so historical/offline progress does not trigger stale client messages.';
comment on column public.journey_stage_overrides.supersedes_override_id is
  'Optional pointer to a previous override row cleared or replaced by this append-only event.';
comment on column public.journey_stage_overrides.linked_activity_table is
  'Optional name of the normal activity/audit table row created by the service layer, for cross-surface traceability.';

create index if not exists journey_stage_overrides_entity_idx
  on public.journey_stage_overrides (entity_type, entity_id, created_at desc);
create index if not exists journey_stage_overrides_org_entity_idx
  on public.journey_stage_overrides (organisation_id, entity_type, entity_id, effective_at desc);
create index if not exists journey_stage_overrides_stage_idx
  on public.journey_stage_overrides (organisation_id, entity_type, stage_key, created_at desc);
create index if not exists journey_stage_overrides_actor_idx
  on public.journey_stage_overrides (actor_user_id, created_at desc)
  where actor_user_id is not null;
create index if not exists journey_stage_overrides_supersedes_idx
  on public.journey_stage_overrides (supersedes_override_id)
  where supersedes_override_id is not null;

alter table public.journey_stage_overrides enable row level security;

drop policy if exists journey_stage_overrides_select_member on public.journey_stage_overrides;
create policy journey_stage_overrides_select_member
on public.journey_stage_overrides
for select
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or (
    entity_type = 'transaction'
    and exists (
      select 1
      from public.transactions tx
      where tx.id = journey_stage_overrides.entity_id
        and tx.organisation_id = journey_stage_overrides.organisation_id
        and public.bridge_can_access_transaction_spine(tx.id)
    )
  )
);

drop policy if exists journey_stage_overrides_insert_member on public.journey_stage_overrides;
create policy journey_stage_overrides_insert_member
on public.journey_stage_overrides
for insert
to authenticated
with check (
  auth.uid() is not null
  and actor_user_id = auth.uid()
  and (
    public.bridge_is_active_member(organisation_id)
    or (
      entity_type = 'transaction'
      and exists (
        select 1
        from public.transactions tx
        where tx.id = journey_stage_overrides.entity_id
          and tx.organisation_id = journey_stage_overrides.organisation_id
          and public.bridge_can_access_transaction_spine(tx.id)
      )
    )
  )
);

drop policy if exists journey_stage_overrides_update_linkage_member on public.journey_stage_overrides;
create policy journey_stage_overrides_update_linkage_member
on public.journey_stage_overrides
for update
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or (
    entity_type = 'transaction'
    and exists (
      select 1
      from public.transactions tx
      where tx.id = journey_stage_overrides.entity_id
        and tx.organisation_id = journey_stage_overrides.organisation_id
        and public.bridge_can_access_transaction_spine(tx.id)
    )
  )
)
with check (
  public.bridge_is_active_member(organisation_id)
  or (
    entity_type = 'transaction'
    and exists (
      select 1
      from public.transactions tx
      where tx.id = journey_stage_overrides.entity_id
        and tx.organisation_id = journey_stage_overrides.organisation_id
        and public.bridge_can_access_transaction_spine(tx.id)
    )
  )
);

grant select, insert on table public.journey_stage_overrides to authenticated;
grant update (linked_activity_table, linked_activity_id) on table public.journey_stage_overrides to authenticated;

notify pgrst, 'reload schema';

commit;
