begin;

-- Additive compatibility for the current agency/principal dashboard bundle.
-- The deployed client reads a broad denormalised shape from PostgREST; this
-- migration keeps older or partially migrated demo databases from returning
-- 400s when a selected column is absent.

alter table if exists public.leads
  add column if not exists branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists created_by uuid,
  add column if not exists assigned_agent_email text,
  add column if not exists converted_transaction_id uuid,
  add column if not exists converted_at timestamptz,
  add column if not exists estimated_value numeric,
  add column if not exists seller_onboarding_status text not null default 'not_started',
  add column if not exists mandate_packet_id uuid,
  add column if not exists listing_id uuid;

alter table if exists public.transactions
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_agent_id uuid,
  add column if not exists owner_user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists lifecycle_state text,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz,
  add column if not exists bond_workspace_id uuid,
  add column if not exists bond_region_id uuid,
  add column if not exists bond_workspace_unit_id uuid,
  add column if not exists primary_bond_consultant_user_id uuid,
  add column if not exists assigned_bond_processor_user_id uuid,
  add column if not exists assigned_bond_manager_user_id uuid,
  add column if not exists assigned_bond_compliance_user_id uuid,
  add column if not exists bond_assignment_status text,
  add column if not exists bond_assignment_source text,
  add column if not exists finance_status text,
  add column if not exists compliance_status text,
  add column if not exists compliance_review_required boolean not null default false,
  add column if not exists application_prepared boolean not null default false,
  add column if not exists submitted_to_banks boolean not null default false,
  add column if not exists documents_complete boolean not null default false,
  add column if not exists finance_documents_complete boolean not null default false,
  add column if not exists documents_missing boolean not null default false,
  add column if not exists required_documents_missing boolean not null default false,
  add column if not exists finance_documents_missing boolean not null default false,
  add column if not exists missing_documents_count integer not null default 0,
  add column if not exists uploaded_documents_count integer not null default 0,
  add column if not exists total_required_documents integer not null default 0,
  add column if not exists bank_feedback_pending boolean not null default false,
  add column if not exists bank_feedback_status text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists finance_due_at timestamptz,
  add column if not exists processor_name text,
  add column if not exists assigned_bond_processor_name text,
  add column if not exists compliance_name text,
  add column if not exists gross_commission_percentage numeric,
  add column if not exists gross_commission_amount numeric,
  add column if not exists agent_split_percentage_snapshot numeric,
  add column if not exists agency_split_percentage_snapshot numeric,
  add column if not exists agent_commission_amount numeric,
  add column if not exists agency_commission_amount numeric;

do $$
begin
  if to_regclass('public.leads') is not null then
    update public.leads l
    set assigned_user_id = coalesce(l.assigned_user_id, l.assigned_agent_id),
        created_by = coalesce(l.created_by, l.assigned_agent_id),
        assigned_agent_email = coalesce(l.assigned_agent_email, p.email),
        seller_onboarding_status = coalesce(l.seller_onboarding_status, 'not_started')
    from public.profiles p
    where l.assigned_agent_id = p.id
      and (
        l.assigned_user_id is null
        or l.created_by is null
        or l.assigned_agent_email is null
        or l.seller_onboarding_status is null
      );
  end if;

  if to_regclass('public.transactions') is not null then
    update public.transactions t
    set lifecycle_state = coalesce(t.lifecycle_state, 'active'),
        is_active = coalesce(t.is_active, true),
        finance_status = coalesce(
          t.finance_status,
          case
            when lower(coalesce(t.finance_type, '')) = 'cash' then 'proof_of_funds'
            when t.current_main_stage in ('Finance', 'Attorney', 'Transfer', 'Registration', 'FIN', 'ATTY', 'XFER', 'REG') then 'in_progress'
            else 'not_started'
          end
        ),
        compliance_status = coalesce(t.compliance_status, 'not_started'),
        bond_assignment_status = coalesce(t.bond_assignment_status, 'unassigned'),
        bond_assignment_source = coalesce(t.bond_assignment_source, 'legacy_backfill'),
        documents_complete = coalesce(t.documents_complete, false),
        finance_documents_complete = coalesce(t.finance_documents_complete, false),
        documents_missing = coalesce(t.documents_missing, false),
        required_documents_missing = coalesce(t.required_documents_missing, false),
        finance_documents_missing = coalesce(t.finance_documents_missing, false),
        missing_documents_count = coalesce(t.missing_documents_count, 0),
        uploaded_documents_count = coalesce(t.uploaded_documents_count, 0),
        total_required_documents = coalesce(t.total_required_documents, 0),
        bank_feedback_pending = coalesce(t.bank_feedback_pending, false),
        bank_feedback_status = coalesce(t.bank_feedback_status, 'not_requested'),
        gross_commission_percentage = coalesce(t.gross_commission_percentage, 3.5),
        gross_commission_amount = coalesce(
          t.gross_commission_amount,
          round((coalesce(t.purchase_price, t.sales_price, 0)::numeric * 0.035), 2)
        ),
        agent_split_percentage_snapshot = coalesce(t.agent_split_percentage_snapshot, 60),
        agency_split_percentage_snapshot = coalesce(t.agency_split_percentage_snapshot, 40),
        agent_commission_amount = coalesce(
          t.agent_commission_amount,
          round((coalesce(t.gross_commission_amount, coalesce(t.purchase_price, t.sales_price, 0)::numeric * 0.035) * 0.60), 2)
        ),
        agency_commission_amount = coalesce(
          t.agency_commission_amount,
          round((coalesce(t.gross_commission_amount, coalesce(t.purchase_price, t.sales_price, 0)::numeric * 0.035) * 0.40), 2)
        )
    where t.lifecycle_state is null
      or t.finance_status is null
      or t.compliance_status is null
      or t.bond_assignment_status is null
      or t.bond_assignment_source is null
      or t.bank_feedback_status is null
      or t.gross_commission_percentage is null
      or t.gross_commission_amount is null
      or t.agent_commission_amount is null
      or t.agency_commission_amount is null;
  end if;
end $$;

create index if not exists leads_organisation_assigned_agent_email_idx
  on public.leads (organisation_id, assigned_agent_email);

create index if not exists transactions_organisation_finance_status_idx
  on public.transactions (organisation_id, finance_status);

create index if not exists transactions_organisation_bond_assignment_idx
  on public.transactions (organisation_id, bond_assignment_status);

create index if not exists transactions_organisation_deleted_idx
  on public.transactions (organisation_id, deleted_at)
  where deleted_at is not null;

commit;
