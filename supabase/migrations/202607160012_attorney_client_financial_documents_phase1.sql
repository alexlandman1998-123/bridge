begin;
create extension if not exists "pgcrypto";

create or replace function public.bridge_conveyancer_can_access_record(
  target_organisation_id uuid,
  target_attorney_firm_id uuid,
  target_transaction_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.attorney_firms firm
      join public.attorney_firm_members member on member.firm_id = firm.id
      where firm.id = target_attorney_firm_id
        and firm.organisation_id = target_organisation_id
        and firm.is_active = true
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
    and (
      target_transaction_id is null
      or exists (
        select 1
        from public.transaction_attorney_assignments assignment
        where assignment.transaction_id = target_transaction_id
          and coalesce(assignment.attorney_firm_id, assignment.firm_id) = target_attorney_firm_id
          and coalesce(assignment.assignment_status, assignment.status, 'active') <> 'removed'
      )
    )
$$;

revoke all on function public.bridge_conveyancer_can_access_record(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.bridge_conveyancer_can_access_record(uuid, uuid, uuid)
  to authenticated;

insert into public.document_packs (
  key,
  display_label,
  description,
  applies_to_context,
  default_visible_to_roles,
  sort_order
)
values (
  'attorney_client_financials',
  'Attorney Client Financial Documents',
  'Party-specific invoices and final statements prepared by the transferring attorney. Documents remain internal until an explicit publication workflow grants client access.',
  array['transaction', 'attorney_matter'],
  array['transferring_attorney', 'conveyancing_secretary'],
  150
)
on conflict (key) do update
set
  display_label = excluded.display_label,
  description = excluded.description,
  applies_to_context = excluded.applies_to_context,
  default_visible_to_roles = excluded.default_visible_to_roles,
  sort_order = excluded.sort_order,
  is_active = true;
insert into public.document_definitions (
  key,
  display_label,
  description,
  category,
  pack_key,
  applies_to_context,
  default_requirement_level,
  default_visibility,
  default_upload_roles,
  review_required,
  validity_period_days,
  sort_order,
  metadata_json
)
values
  (
    'buyer_transfer_cost_invoice',
    'Buyer Transfer Cost Invoice',
    'Pro-forma or issued transfer-cost invoice addressed to the buyer.',
    'attorney_client_financials',
    'attorney_client_financials',
    array['transaction', 'attorney_matter'],
    'required',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    true,
    null,
    10,
    '{"intendedRecipientRole":"buyer","clientVisibilityDefault":"internal","publicationRequired":true,"documentPurpose":"pre_registration_invoice","legacyReplacementFor":"attorney_invoice","lodgementBlockingDefault":false,"closeoutBlockingDefault":false}'::jsonb
  ),
  (
    'seller_attorney_invoice',
    'Seller Attorney Invoice',
    'Attorney invoice addressed to the seller for seller-side fees or disbursements.',
    'attorney_client_financials',
    'attorney_client_financials',
    array['transaction', 'attorney_matter'],
    'optional',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    true,
    null,
    20,
    '{"intendedRecipientRole":"seller","clientVisibilityDefault":"internal","publicationRequired":true,"documentPurpose":"seller_invoice","legacyReplacementFor":"attorney_invoice","lodgementBlockingDefault":false,"closeoutBlockingDefault":false}'::jsonb
  ),
  (
    'buyer_final_statement',
    'Buyer Final Statement',
    'Final post-registration statement of account addressed to the buyer.',
    'attorney_client_financials',
    'attorney_client_financials',
    array['transaction', 'attorney_matter'],
    'required',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    true,
    null,
    30,
    '{"intendedRecipientRole":"buyer","clientVisibilityDefault":"internal","publicationRequired":true,"documentPurpose":"post_registration_final_statement","legacyReplacementFor":"attorney_statement","lodgementBlockingDefault":false,"closeoutBlockingDefault":true,"dueBusinessDaysDefault":2}'::jsonb
  ),
  (
    'seller_final_statement',
    'Seller Final Statement',
    'Final post-registration statement of account addressed to the seller.',
    'attorney_client_financials',
    'attorney_client_financials',
    array['transaction', 'attorney_matter'],
    'required',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    true,
    null,
    40,
    '{"intendedRecipientRole":"seller","clientVisibilityDefault":"internal","publicationRequired":true,"documentPurpose":"post_registration_final_statement","legacyReplacementFor":"attorney_statement","lodgementBlockingDefault":false,"closeoutBlockingDefault":true,"dueBusinessDaysDefault":2}'::jsonb
  )
on conflict (key) do update
set
  display_label = excluded.display_label,
  description = excluded.description,
  category = excluded.category,
  pack_key = excluded.pack_key,
  applies_to_context = excluded.applies_to_context,
  default_requirement_level = excluded.default_requirement_level,
  default_visibility = excluded.default_visibility,
  default_upload_roles = excluded.default_upload_roles,
  review_required = excluded.review_required,
  validity_period_days = excluded.validity_period_days,
  sort_order = excluded.sort_order,
  is_active = true,
  metadata_json = excluded.metadata_json;
insert into public.document_requirement_rules (
  id,
  document_definition_key,
  pack_key,
  context_type,
  condition_json,
  requirement_level,
  stage_gates,
  requested_from_role,
  visible_to_roles,
  uploadable_by_roles,
  reviewer_role,
  priority,
  resolver_key
)
values
  (
    '00000000-0000-4000-8001-000000000001'::uuid,
    'buyer_transfer_cost_invoice',
    'attorney_client_financials',
    'transaction',
    '{"all":[{"fact":"context.type","operator":"eq","value":"transaction"}]}'::jsonb,
    'required',
    array['lodgement_ready'],
    'transferring_attorney',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    'transferring_attorney',
    150,
    'attorney_client_financial_documents_v1'
  ),
  (
    '00000000-0000-4000-8001-000000000002'::uuid,
    'seller_attorney_invoice',
    'attorney_client_financials',
    'transaction',
    '{"all":[{"fact":"context.type","operator":"eq","value":"transaction"}]}'::jsonb,
    'optional',
    array['registration_ready'],
    'transferring_attorney',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    'transferring_attorney',
    160,
    'attorney_client_financial_documents_v1'
  ),
  (
    '00000000-0000-4000-8001-000000000003'::uuid,
    'buyer_final_statement',
    'attorney_client_financials',
    'transaction',
    '{"all":[{"fact":"context.type","operator":"eq","value":"transaction"}]}'::jsonb,
    'required',
    array['registration_ready'],
    'transferring_attorney',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    'transferring_attorney',
    170,
    'attorney_client_financial_documents_v1'
  ),
  (
    '00000000-0000-4000-8001-000000000004'::uuid,
    'seller_final_statement',
    'attorney_client_financials',
    'transaction',
    '{"all":[{"fact":"context.type","operator":"eq","value":"transaction"}]}'::jsonb,
    'required',
    array['registration_ready'],
    'transferring_attorney',
    array['transferring_attorney', 'conveyancing_secretary'],
    array['transferring_attorney', 'conveyancing_secretary'],
    'transferring_attorney',
    180,
    'attorney_client_financial_documents_v1'
  )
on conflict (id) do update
set
  document_definition_key = excluded.document_definition_key,
  pack_key = excluded.pack_key,
  context_type = excluded.context_type,
  condition_json = excluded.condition_json,
  requirement_level = excluded.requirement_level,
  stage_gates = excluded.stage_gates,
  requested_from_role = excluded.requested_from_role,
  visible_to_roles = excluded.visible_to_roles,
  uploadable_by_roles = excluded.uploadable_by_roles,
  reviewer_role = excluded.reviewer_role,
  priority = excluded.priority,
  resolver_key = excluded.resolver_key,
  is_active = true;
create table if not exists public.attorney_client_financial_document_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  requirement_level text not null,
  is_enabled boolean not null default true,
  lodgement_blocking boolean not null default false,
  closeout_blocking boolean not null default false,
  due_business_days integer,
  upload_visibility_default text not null default 'internal',
  publication_required boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attorney_firm_id, document_definition_key),
  constraint attorney_client_financial_document_settings_definition_check check (
    document_definition_key in (
      'buyer_transfer_cost_invoice',
      'seller_attorney_invoice',
      'buyer_final_statement',
      'seller_final_statement'
    )
  ),
  constraint attorney_client_financial_document_settings_level_check check (
    requirement_level in ('required', 'optional', 'not_applicable')
  ),
  constraint attorney_client_financial_document_settings_due_days_check check (
    due_business_days is null or due_business_days between 0 and 60
  ),
  constraint attorney_client_financial_document_settings_visibility_check check (
    upload_visibility_default = 'internal'
  )
);
create index if not exists attorney_client_financial_document_settings_scope_idx
  on public.attorney_client_financial_document_settings (organisation_id, attorney_firm_id);
create or replace function public.bridge_validate_attorney_client_financial_document_setting_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.attorney_firms firm
    where firm.id = new.attorney_firm_id
      and firm.organisation_id = new.organisation_id
      and firm.is_active = true
  ) then
    raise exception 'Attorney financial document setting scope is invalid.' using errcode = '23514';
  end if;

  return new;
end;
$$;
drop trigger if exists attorney_client_financial_document_settings_scope_guard
  on public.attorney_client_financial_document_settings;
create trigger attorney_client_financial_document_settings_scope_guard
before insert or update on public.attorney_client_financial_document_settings
for each row execute function public.bridge_validate_attorney_client_financial_document_setting_scope();
revoke all on function public.bridge_validate_attorney_client_financial_document_setting_scope()
  from public, anon, authenticated;
drop trigger if exists attorney_client_financial_document_settings_set_updated_at
  on public.attorney_client_financial_document_settings;
create trigger attorney_client_financial_document_settings_set_updated_at
before update on public.attorney_client_financial_document_settings
for each row execute function public.bridge_set_updated_at();
insert into public.attorney_client_financial_document_settings (
  organisation_id,
  attorney_firm_id,
  document_definition_key,
  requirement_level,
  lodgement_blocking,
  closeout_blocking,
  due_business_days,
  upload_visibility_default,
  publication_required
)
select
  firm.organisation_id,
  firm.id,
  defaults.document_definition_key,
  defaults.requirement_level,
  defaults.lodgement_blocking,
  defaults.closeout_blocking,
  defaults.due_business_days,
  'internal',
  true
from public.attorney_firms firm
cross join (
  values
    ('buyer_transfer_cost_invoice'::text, 'required'::text, false, false, 0),
    ('seller_attorney_invoice'::text, 'optional'::text, false, false, null::integer),
    ('buyer_final_statement'::text, 'required'::text, false, true, 2),
    ('seller_final_statement'::text, 'required'::text, false, true, 2)
) as defaults(document_definition_key, requirement_level, lodgement_blocking, closeout_blocking, due_business_days)
where firm.organisation_id is not null
  and firm.is_active = true
on conflict (attorney_firm_id, document_definition_key) do nothing;
alter table public.attorney_client_financial_document_settings enable row level security;
drop policy if exists attorney_client_financial_document_settings_select
  on public.attorney_client_financial_document_settings;
create policy attorney_client_financial_document_settings_select
on public.attorney_client_financial_document_settings
for select to authenticated
using (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, null::uuid)
);
drop policy if exists attorney_client_financial_document_settings_write
  on public.attorney_client_financial_document_settings;
create policy attorney_client_financial_document_settings_write
on public.attorney_client_financial_document_settings
for all to authenticated
using (
  public.attorney_user_is_firm_admin(attorney_firm_id)
  and exists (
    select 1
    from public.attorney_firms firm
    where firm.id = attorney_client_financial_document_settings.attorney_firm_id
      and firm.organisation_id = attorney_client_financial_document_settings.organisation_id
      and firm.is_active = true
  )
)
with check (
  public.attorney_user_is_firm_admin(attorney_firm_id)
  and exists (
    select 1
    from public.attorney_firms firm
    where firm.id = attorney_client_financial_document_settings.attorney_firm_id
      and firm.organisation_id = attorney_client_financial_document_settings.organisation_id
      and firm.is_active = true
  )
);
revoke all on public.attorney_client_financial_document_settings from public, anon;
grant select, insert, update, delete on public.attorney_client_financial_document_settings to authenticated;
grant all on public.attorney_client_financial_document_settings to service_role;
comment on table public.attorney_client_financial_document_settings is
  'Firm-scoped requirement defaults for party-specific attorney invoices and final statements. Phase 1 uploads remain internal until a later explicit publication workflow.';
comment on column public.attorney_client_financial_document_settings.upload_visibility_default is
  'Security invariant for Phase 1: attorney uploads must start internal and cannot be client-visible by default.';
notify pgrst, 'reload schema';
commit;
