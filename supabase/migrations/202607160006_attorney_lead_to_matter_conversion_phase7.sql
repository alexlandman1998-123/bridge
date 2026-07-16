begin;

create unique index if not exists transactions_id_org_unique_idx
  on public.transactions (id, organisation_id);

create table if not exists public.attorney_lead_conversions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null,
  lead_id uuid not null,
  transaction_id uuid,
  attorney_assignment_id uuid references public.transaction_attorney_assignments(id) on delete restrict,
  matter_type text not null,
  client_role text not null,
  conversion_status text not null default 'started',
  attempt_count integer not null default 1,
  failure_reason text,
  initiated_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_lead_conversions_lead_org_fkey
    foreign key (lead_id, organisation_id)
    references public.leads(lead_id, organisation_id) on delete cascade,
  constraint attorney_lead_conversions_firm_org_fkey
    foreign key (attorney_firm_id, organisation_id)
    references public.attorney_firms(id, organisation_id) on delete restrict,
  constraint attorney_lead_conversions_transaction_org_fkey
    foreign key (transaction_id, organisation_id)
    references public.transactions(id, organisation_id) on delete restrict,
  constraint attorney_lead_conversions_matter_type_check
    check (matter_type in ('transfer', 'bond', 'cancellation')),
  constraint attorney_lead_conversions_client_role_check
    check (client_role in ('buyer', 'seller', 'borrower', 'owner')),
  constraint attorney_lead_conversions_status_check
    check (conversion_status in ('started', 'completed', 'failed')),
  constraint attorney_lead_conversions_attempt_count_check
    check (attempt_count between 1 and 100),
  constraint attorney_lead_conversions_failure_reason_check
    check (failure_reason is null or char_length(failure_reason) <= 1000),
  constraint attorney_lead_conversions_one_per_lead unique (organisation_id, lead_id),
  constraint attorney_lead_conversions_transaction_unique unique (transaction_id),
  constraint attorney_lead_conversions_assignment_unique unique (attorney_assignment_id)
);

create index if not exists attorney_lead_conversions_org_status_idx
  on public.attorney_lead_conversions (organisation_id, conversion_status, updated_at desc);

alter table public.attorney_lead_conversions enable row level security;

drop policy if exists attorney_lead_conversions_select on public.attorney_lead_conversions;
create policy attorney_lead_conversions_select on public.attorney_lead_conversions
for select to authenticated
using (
  exists (
    select 1
    from public.leads lead
    where lead.lead_id = attorney_lead_conversions.lead_id
      and lead.organisation_id = attorney_lead_conversions.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

revoke all on table public.attorney_lead_conversions from public, anon, authenticated;
grant select on table public.attorney_lead_conversions to authenticated;

create or replace function public.bridge_enforce_attorney_converted_lead_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_domain <> 'attorney' then
    return new;
  end if;

  if old.converted_transaction_id is not null
    and new.converted_transaction_id is distinct from old.converted_transaction_id then
    raise exception 'Converted Attorney Lead transaction lineage is immutable';
  end if;

  if old.converted_transaction_id is not null
    and (
      new.assigned_user_id is distinct from old.assigned_user_id
      or new.branch_id is distinct from old.branch_id
    ) then
    raise exception 'Converted Attorney Lead ownership is immutable; reassign the Matter instead';
  end if;

  if new.converted_transaction_id is not null
    and (
      new.converted_at is null
      or new.stage <> 'won'
      or new.status <> 'won'
      or new.closed_at is null
    ) then
    raise exception 'Converted Attorney Leads must remain closed as Won';
  end if;

  return new;
end;
$$;

revoke all on function public.bridge_enforce_attorney_converted_lead_state() from public, anon, authenticated;

drop trigger if exists trg_enforce_attorney_converted_lead_state on public.leads;
create trigger trg_enforce_attorney_converted_lead_state
before update on public.leads
for each row execute function public.bridge_enforce_attorney_converted_lead_state();

create or replace function public.bridge_convert_attorney_lead_to_matter(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_detail public.attorney_lead_details%rowtype;
  v_contact public.contacts%rowtype;
  v_firm public.attorney_firms%rowtype;
  v_existing public.attorney_lead_conversions%rowtype;
  v_conversion_id uuid;
  v_transaction_id uuid;
  v_assignment_id uuid;
  v_existing_assignment_id uuid;
  v_existing_matter_type text;
  v_client_projection_id uuid;
  v_assigned_user_id uuid;
  v_assignee_branch_id uuid;
  v_assignee_department_id uuid;
  v_assignee_role text;
  v_assignee_name text;
  v_assignee_email text;
  v_matter_type text := lower(trim(coalesce(p_payload ->> 'matter_type', '')));
  v_client_role text := lower(trim(coalesce(p_payload ->> 'client_role', '')));
  v_property_address text;
  v_property_value numeric;
  v_finance_type text := lower(trim(coalesce(p_payload ->> 'finance_type', 'cash')));
  v_conversion_note text := nullif(trim(coalesce(p_payload ->> 'conversion_note', '')), '');
  v_attorney_role text;
  v_client_name text;
  v_now timestamptz := now();
  v_error text;
begin
  if auth.uid() is null or p_organisation_id is null or p_lead_id is null then
    raise exception 'Attorney Lead conversion requires authentication and workspace context';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 16384 then
    raise exception 'Invalid Attorney Lead conversion payload';
  end if;

  select lead.* into v_lead
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_id = p_lead_id
    and lead.lead_domain = 'attorney'
  for update;

  if not found then
    raise exception 'Attorney Lead not found';
  end if;
  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'assign'
  ) then
    raise exception 'Not authorised to convert this Attorney Lead';
  end if;

  select conversion.* into v_existing
  from public.attorney_lead_conversions conversion
  where conversion.organisation_id = p_organisation_id
    and conversion.lead_id = p_lead_id
  for update;

  if v_existing.conversion_status = 'completed'
    and v_existing.transaction_id is not null
    and v_existing.attorney_assignment_id is not null then
    return jsonb_build_object(
      'success', true,
      'existing', true,
      'lead_id', p_lead_id,
      'transaction_id', v_existing.transaction_id,
      'assignment_id', v_existing.attorney_assignment_id,
      'matter_type', v_existing.matter_type
    );
  end if;

  select firm.* into v_firm
  from public.attorney_firms firm
  where firm.organisation_id = p_organisation_id
    and firm.is_active = true
  order by firm.created_at asc
  limit 1;
  if not found then
    raise exception 'Active Attorney firm not found';
  end if;

  if v_lead.converted_transaction_id is not null then
    select
      assignment.id,
      coalesce(nullif(assignment.matter_type, ''), nullif(assignment.assignment_type, ''))
    into v_existing_assignment_id, v_existing_matter_type
    from public.transaction_attorney_assignments assignment
    join public.transactions transaction on transaction.id = assignment.transaction_id
    where assignment.transaction_id = v_lead.converted_transaction_id
      and transaction.organisation_id = p_organisation_id
      and coalesce(assignment.attorney_firm_id, assignment.firm_id) = v_firm.id
      and coalesce(assignment.assignment_status, assignment.status) = 'active'
    order by assignment.is_primary desc nulls last, assignment.created_at asc
    limit 1;

    if v_existing_assignment_id is null then
      raise exception 'Attorney Lead already has a transaction link that requires manual review';
    end if;

    insert into public.attorney_lead_conversions (
      organisation_id, attorney_firm_id, lead_id, transaction_id, attorney_assignment_id,
      matter_type, client_role, conversion_status, initiated_by, started_at, completed_at
    ) values (
      p_organisation_id, v_firm.id, p_lead_id, v_lead.converted_transaction_id, v_existing_assignment_id,
      case when v_existing_matter_type in ('transfer', 'bond', 'cancellation') then v_existing_matter_type else 'transfer' end,
      case when v_client_role in ('buyer', 'seller', 'borrower', 'owner') then v_client_role else 'buyer' end,
      'completed', auth.uid(), coalesce(v_lead.converted_at, v_now), coalesce(v_lead.converted_at, v_now)
    )
    on conflict (organisation_id, lead_id) do update
    set transaction_id = excluded.transaction_id,
        attorney_assignment_id = excluded.attorney_assignment_id,
        matter_type = excluded.matter_type,
        client_role = excluded.client_role,
        conversion_status = 'completed',
        failure_reason = null,
        completed_at = excluded.completed_at,
        failed_at = null,
        updated_at = v_now;

    return jsonb_build_object(
      'success', true,
      'existing', true,
      'lead_id', p_lead_id,
      'transaction_id', v_lead.converted_transaction_id,
      'assignment_id', v_existing_assignment_id,
      'matter_type', coalesce(v_existing_matter_type, 'transfer')
    );
  end if;

  insert into public.attorney_lead_conversions (
    organisation_id,
    attorney_firm_id,
    lead_id,
    matter_type,
    client_role,
    conversion_status,
    initiated_by,
    started_at
  ) values (
    p_organisation_id,
    v_firm.id,
    p_lead_id,
    case when v_matter_type in ('transfer', 'bond', 'cancellation') then v_matter_type else 'transfer' end,
    case when v_client_role in ('buyer', 'seller', 'borrower', 'owner') then v_client_role else 'buyer' end,
    'started',
    auth.uid(),
    v_now
  )
  on conflict (organisation_id, lead_id) do update
  set matter_type = excluded.matter_type,
      client_role = excluded.client_role,
      conversion_status = 'started',
      failure_reason = null,
      initiated_by = auth.uid(),
      started_at = v_now,
      completed_at = null,
      failed_at = null,
      attempt_count = least(public.attorney_lead_conversions.attempt_count + 1, 100),
      updated_at = v_now
  returning id into v_conversion_id;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id,
    p_lead_id,
    auth.uid(),
    'Conversion Started',
    'Attorney Lead conversion started',
    v_now,
    initcap(coalesce(nullif(v_matter_type, ''), 'Matter'))
  );

  begin
    if v_matter_type not in ('transfer', 'bond', 'cancellation') then
      raise exception 'Choose Transfer, Bond Registration, or Bond Cancellation';
    end if;
    if v_client_role not in ('buyer', 'seller', 'borrower', 'owner') then
      raise exception 'Choose the client role for this Matter';
    end if;
    if (v_matter_type = 'transfer' and v_client_role not in ('buyer', 'seller'))
      or (v_matter_type = 'bond' and v_client_role not in ('buyer', 'borrower', 'owner'))
      or (v_matter_type = 'cancellation' and v_client_role not in ('seller', 'owner')) then
      raise exception 'The selected client role is not valid for this Matter type';
    end if;
    if v_lead.stage not in ('qualified', 'quote_sent', 'follow_up', 'won') then
      raise exception 'Qualify the Attorney Lead before converting it to a Matter';
    end if;
    if char_length(coalesce(v_conversion_note, '')) > 1000 then
      raise exception 'Conversion note is too long';
    end if;

    select detail.* into v_detail
    from public.attorney_lead_details detail
    where detail.organisation_id = p_organisation_id
      and detail.lead_id = p_lead_id;
    if not found then
      raise exception 'Attorney Lead service details are missing';
    end if;

    select contact.* into v_contact
    from public.contacts contact
    where contact.organisation_id = p_organisation_id
      and contact.contact_id = v_lead.contact_id;
    if not found then
      raise exception 'Attorney Lead client contact is missing';
    end if;

    v_client_name := nullif(trim(concat_ws(' ', v_contact.first_name, v_contact.last_name)), '');
    if v_client_name is null then
      raise exception 'Client name is required before conversion';
    end if;

    v_property_address := nullif(trim(coalesce(p_payload ->> 'property_address', v_detail.property_address)), '');
    if v_property_address is null or char_length(v_property_address) > 1000 then
      raise exception 'A valid property address is required before conversion';
    end if;

    if nullif(trim(p_payload ->> 'property_value'), '') is not null then
      if trim(p_payload ->> 'property_value') !~ '^[0-9]+([.][0-9]{1,2})?$' then
        raise exception 'Invalid Matter value';
      end if;
      v_property_value := trim(p_payload ->> 'property_value')::numeric;
    else
      v_property_value := v_detail.property_value;
    end if;
    if v_property_value is not null and (v_property_value < 0 or v_property_value > 9999999999.99) then
      raise exception 'Matter value exceeds the supported range';
    end if;

    if v_matter_type = 'bond' then
      v_finance_type := 'bond';
    elsif v_matter_type = 'cancellation' then
      v_finance_type := 'cash';
    elsif v_finance_type not in ('cash', 'bond', 'combination', 'hybrid') then
      raise exception 'Choose a valid finance type';
    end if;

    v_assigned_user_id := coalesce(
      nullif(trim(p_payload ->> 'assigned_user_id'), '')::uuid,
      v_lead.assigned_user_id
    );
    if v_assigned_user_id is null then
      raise exception 'Assign an active Attorney before conversion';
    end if;

    select
      coalesce(member.primary_branch_id, member.branch_id),
      member.department_id,
      lower(trim(coalesce(
        nullif(trim(member.organisation_role), ''),
        nullif(trim(member.workspace_role), ''),
        nullif(trim(member.role), ''),
        nullif(trim(member.app_role), ''),
        'viewer'
      ))),
      coalesce(
        nullif(trim(concat_ws(' ', member.first_name, member.last_name)), ''),
        nullif(trim(member.email), ''),
        'Attorney team member'
      ),
      nullif(lower(trim(member.email)), '')
    into v_assignee_branch_id, v_assignee_department_id, v_assignee_role, v_assignee_name, v_assignee_email
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id = v_assigned_user_id
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
      and coalesce(member.workspace_type, 'attorney_firm') in ('attorney', 'attorney_firm')
    order by member.updated_at desc nulls last, member.created_at desc
    limit 1;

    if not found then
      select
        coalesce(firm_member.primary_branch_id, firm_member.branch_id),
        firm_member.department_id,
        lower(trim(firm_member.role)),
        coalesce(
          nullif(trim(profile.full_name), ''),
          nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
          nullif(trim(profile.email), ''),
          'Attorney team member'
        ),
        nullif(lower(trim(profile.email)), '')
      into v_assignee_branch_id, v_assignee_department_id, v_assignee_role, v_assignee_name, v_assignee_email
      from public.attorney_firm_members firm_member
      join public.attorney_firms firm on firm.id = firm_member.firm_id
      left join public.profiles profile on profile.id = firm_member.user_id
      where firm.organisation_id = p_organisation_id
        and firm_member.user_id = v_assigned_user_id
        and firm_member.status = 'active'
      order by firm_member.updated_at desc nulls last, firm_member.created_at desc
      limit 1;
    end if;

    if not found then
      raise exception 'Matter owner must be an active member of this Attorney firm';
    end if;
    if v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney'
    ) then
      raise exception 'Choose an Attorney-qualified Matter owner';
    end if;
    if v_matter_type = 'bond' and v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'bond_attorney'
    ) then
      raise exception 'Choose a Bond Attorney-qualified Matter owner';
    end if;
    if v_matter_type in ('transfer', 'cancellation') and v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'transfer_attorney'
    ) then
      raise exception 'Choose a Transfer Attorney-qualified Matter owner';
    end if;

    v_attorney_role := case
      when v_matter_type = 'bond' then 'bond_attorney'
      when v_matter_type = 'cancellation' then 'cancellation_attorney'
      else 'transfer_attorney'
    end;

    insert into public.buyers (name, phone, email)
    values (v_client_name, v_contact.phone, v_contact.email)
    returning id into v_client_projection_id;

    v_transaction_id := gen_random_uuid();
    insert into public.transactions (
      id,
      organisation_id,
      assigned_branch_id,
      assigned_user_id,
      buyer_id,
      transaction_reference,
      transaction_type,
      property_address_line_1,
      property_description,
      purchase_price,
      sales_price,
      finance_type,
      stage,
      current_main_stage,
      current_sub_stage_summary,
      risk_status,
      next_action,
      comment,
      attorney,
      assigned_attorney_email,
      owner_user_id,
      created_by,
      is_active,
      lifecycle_state,
      attorney_stage,
      operational_state,
      waiting_on_role,
      originating_lead_id,
      buyer_contact_id,
      seller_contact_id,
      seller_name,
      seller_email,
      seller_phone,
      last_meaningful_activity_at,
      created_at,
      updated_at
    ) values (
      v_transaction_id,
      p_organisation_id,
      coalesce(v_lead.branch_id, v_assignee_branch_id),
      v_assigned_user_id,
      v_client_projection_id,
      'AL-' || upper(right(replace(v_transaction_id::text, '-', ''), 8)),
      'attorney_originated_matter',
      v_property_address,
      v_property_address,
      v_property_value,
      v_property_value,
      v_finance_type,
      'Proceed to Attorneys',
      'ATTY',
      'Firm-originated Matter opened',
      'On Track',
      'Complete initial client and property verification',
      coalesce(v_conversion_note, 'Matter created directly from an Attorney Lead.'),
      v_firm.name,
      v_assignee_email,
      v_assigned_user_id,
      auth.uid(),
      true,
      'active',
      'instruction_received',
      'on_track',
      'client',
      p_lead_id,
      case when v_client_role in ('buyer', 'borrower') then v_contact.contact_id else null end,
      case when v_client_role in ('seller', 'owner') then v_contact.contact_id else null end,
      case when v_client_role in ('seller', 'owner') then v_client_name else null end,
      case when v_client_role in ('seller', 'owner') then v_contact.email else null end,
      case when v_client_role in ('seller', 'owner') then v_contact.phone else null end,
      v_now,
      v_now,
      v_now
    );

    insert into public.transaction_attorney_assignments (
      transaction_id,
      firm_id,
      attorney_firm_id,
      assignment_type,
      matter_type,
      department_id,
      attorney_department_id,
      primary_attorney_id,
      attorney_user_id,
      assigned_user_id,
      assigned_organisation_id,
      assigned_branch_id,
      attorney_role,
      status,
      assignment_status,
      instruction_status,
      instruction_accepted_at,
      instruction_accepted_by,
      instruction_decision_note,
      instruction_decision_source,
      is_primary,
      visibility_scope,
      assigned_by,
      assigned_at
    ) values (
      v_transaction_id,
      v_firm.id,
      v_firm.id,
      v_matter_type,
      v_matter_type,
      v_assignee_department_id,
      v_assignee_department_id,
      v_assigned_user_id,
      v_assigned_user_id,
      v_assigned_user_id,
      p_organisation_id,
      coalesce(v_lead.branch_id, v_assignee_branch_id),
      v_attorney_role,
      'active',
      'active',
      'accepted',
      v_now,
      auth.uid(),
      coalesce(v_conversion_note, 'Firm-originated Attorney Lead conversion'),
      'attorney_lead_conversion',
      true,
      'assigned_matter',
      auth.uid(),
      v_now
    )
    returning id into v_assignment_id;

    update public.leads
    set assigned_user_id = v_assigned_user_id,
        branch_id = coalesce(branch_id, v_assignee_branch_id),
        assigned_at = coalesce(assigned_at, v_now),
        ownership_status = 'assigned',
        converted_transaction_id = v_transaction_id,
        converted_at = v_now,
        stage = 'won',
        status = 'won',
        closed_at = v_now,
        next_follow_up_at = null,
        updated_at = v_now
    where organisation_id = p_organisation_id
      and lead_id = p_lead_id;

    update public.attorney_lead_conversions
    set transaction_id = v_transaction_id,
        attorney_assignment_id = v_assignment_id,
        matter_type = v_matter_type,
        client_role = v_client_role,
        conversion_status = 'completed',
        failure_reason = null,
        completed_at = v_now,
        failed_at = null,
        updated_at = v_now
    where id = v_conversion_id;

    insert into public.lead_activities (
      organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
    ) values (
      p_organisation_id,
      p_lead_id,
      auth.uid(),
      'Conversion Completed',
      initcap(v_matter_type) || ' Matter created for ' || v_client_name,
      v_now,
      'Won'
    );

    return jsonb_build_object(
      'success', true,
      'existing', false,
      'lead_id', p_lead_id,
      'transaction_id', v_transaction_id,
      'assignment_id', v_assignment_id,
      'matter_type', v_matter_type
    );
  exception when others then
    v_error := left(sqlerrm, 1000);

    update public.attorney_lead_conversions
    set conversion_status = 'failed',
        failure_reason = v_error,
        failed_at = now(),
        completed_at = null,
        updated_at = now()
    where id = v_conversion_id;

    insert into public.lead_activities (
      organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
    ) values (
      p_organisation_id,
      p_lead_id,
      auth.uid(),
      'Conversion Failed',
      v_error,
      now(),
      'Failed'
    );

    return jsonb_build_object(
      'success', false,
      'existing', false,
      'lead_id', p_lead_id,
      'error_code', 'conversion_failed',
      'message', v_error
    );
  end;
end;
$$;

revoke all on function public.bridge_convert_attorney_lead_to_matter(uuid, uuid, jsonb) from public, anon;
grant execute on function public.bridge_convert_attorney_lead_to_matter(uuid, uuid, jsonb) to authenticated;

comment on table public.attorney_lead_conversions is
  'Idempotent lineage between a firm-originated Attorney Lead, its transaction, and accepted active Attorney assignment.';
comment on function public.bridge_convert_attorney_lead_to_matter(uuid, uuid, jsonb) is
  'Explicit atomic Attorney Lead-to-Matter conversion that never enters the Incoming Matters queue.';

commit;
