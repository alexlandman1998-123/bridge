begin;

create or replace function public.bridge_is_bond_finance_document_request_surface_phase5d(
  lane_key text,
  document_type text,
  attorney_role text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when lower(coalesce(attorney_role, '')) in (
        'transfer_attorney',
        'bond_attorney',
        'cancellation_attorney'
      ) then false
      when lower(coalesce(lane_key, '')) in ('finance', 'bond', '') then true
      when lower(coalesce(document_type, '')) like any (
        array[
          '%bond%',
          '%finance%',
          '%bank%',
          '%compliance%',
          '%fica%'
        ]
      ) then true
      else false
    end
$$;

create or replace function public.bridge_is_bond_finance_document_surface_phase5d(
  lane_key text,
  stage_key text,
  category text,
  document_type text,
  attorney_role text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when lower(coalesce(attorney_role, '')) in (
        'transfer_attorney',
        'bond_attorney',
        'cancellation_attorney'
      ) then false
      when lower(coalesce(lane_key, '')) in ('finance', 'bond', '') then true
      when lower(coalesce(stage_key, '')) in ('finance', 'bond', '') then true
      when lower(coalesce(category, '')) in (
        'bond_originator',
        'buyer_finance',
        'buyer_identity_fica',
        'property_finance_existing_bond',
        'property_compliance'
      ) then true
      when lower(coalesce(document_type, '')) like any (
        array[
          '%bond%',
          '%finance%',
          '%bank%',
          '%compliance%',
          '%fica%'
        ]
      ) then true
      else false
    end
$$;

create or replace function public.bridge_is_bond_compliance_step_key_phase5d(step_key text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(step_key, '')) like any (
    array[
      '%compliance%',
      '%fica%',
      '%kyc%',
      '%risk%',
      '%verification%'
    ]
  )
$$;

create or replace function public.bridge_is_bond_bank_feedback_step_key_phase5d(step_key text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(step_key, '')) like any (
    array[
      '%bank%',
      '%feedback%',
      '%approval%',
      '%condition%',
      '%rate%'
    ]
  )
$$;

create or replace function public.bridge_can_mutate_bond_finance_details_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_mutate_bond_transaction_canonical(transaction_id, 'finance_details_edit')
$$;

create or replace function public.bridge_can_mutate_bond_document_request_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_mutate_bond_transaction_assigned(transaction_id, 'document_upload')
      or public.bridge_can_mutate_bond_transaction_scoped(transaction_id, 'document_upload')
    )
$$;

create or replace function public.bridge_can_upload_bond_document_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and public.bridge_can_mutate_bond_transaction_canonical(transaction_id, 'document_upload')
$$;

create or replace function public.bridge_can_manage_bond_bank_feedback_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_mutate_bond_transaction_assigned(transaction_id, 'bank_feedback_capture')
      or public.bridge_can_mutate_bond_transaction_scoped(transaction_id, 'bank_feedback_capture')
    )
$$;

create or replace function public.bridge_can_submit_bond_to_banks_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_mutate_bond_transaction_assigned(transaction_id, 'bank_submission')
      or public.bridge_can_mutate_bond_transaction_scoped(transaction_id, 'bank_submission')
    )
$$;

create or replace function public.bridge_can_manage_bond_assignment_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_mutate_bond_transaction_assigned(transaction_id, 'assignment_manage')
      or public.bridge_can_mutate_bond_transaction_scoped(transaction_id, 'assignment_manage')
    )
$$;

create or replace function public.bridge_can_review_bond_compliance_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      auth.uid() = public.bridge_bond_compliance_user_id(transaction_id)
      or public.bridge_can_mutate_bond_transaction_scoped(transaction_id, 'workflow_mutation')
    )
$$;

create or replace function public.bridge_can_mutate_bond_finance_step_phase5d(
  transaction_id uuid,
  step_key text
)
returns boolean
language sql
stable
as $$
  select
    case
      when not public.bridge_is_bond_transaction_canonical_ready(transaction_id) then false
      when public.bridge_is_bond_compliance_step_key_phase5d(step_key) then
        public.bridge_can_review_bond_compliance_phase5d(transaction_id)
      when public.bridge_is_bond_bank_feedback_step_key_phase5d(step_key) then
        public.bridge_can_manage_bond_bank_feedback_phase5d(transaction_id)
      else
        public.bridge_can_mutate_bond_transaction_assigned(transaction_id, 'workflow_mutation')
        or public.bridge_can_mutate_bond_transaction_scoped(transaction_id, 'workflow_mutation')
    end
$$;

create or replace function public.bridge_can_record_bond_finance_event_phase5d(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_transaction_canonical_ready(transaction_id)
    and (
      public.bridge_can_mutate_bond_finance_details_phase5d(transaction_id)
      or public.bridge_can_mutate_bond_document_request_phase5d(transaction_id)
      or public.bridge_can_upload_bond_document_phase5d(transaction_id)
      or public.bridge_can_manage_bond_bank_feedback_phase5d(transaction_id)
      or public.bridge_can_review_bond_compliance_phase5d(transaction_id)
    )
$$;

create policy transaction_subprocess_steps_update_phase5d_bond_finance on public.transaction_subprocess_steps
for update to authenticated
using (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and tsp.process_type in ('finance', 'bond')
      and public.bridge_can_mutate_bond_finance_step_phase5d(
        tsp.transaction_id,
        transaction_subprocess_steps.step_key
      )
  )
)
with check (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and tsp.process_type in ('finance', 'bond')
      and public.bridge_can_mutate_bond_finance_step_phase5d(
        tsp.transaction_id,
        transaction_subprocess_steps.step_key
      )
  )
);

create policy transaction_finance_details_update_phase5d_bond_finance on public.transaction_finance_details
for update to authenticated
using (
  public.bridge_can_mutate_bond_finance_details_phase5d(transaction_id)
)
with check (
  public.bridge_can_mutate_bond_finance_details_phase5d(transaction_id)
);

create policy document_requests_insert_phase5d_bond_finance on public.document_requests
for insert to authenticated
with check (
  public.document_requests.transaction_id is not null
  and public.bridge_is_bond_finance_document_request_surface_phase5d(
    public.document_requests.lane_key,
    public.document_requests.document_type,
    public.document_requests.attorney_role
  )
  and public.bridge_can_mutate_bond_document_request_phase5d(public.document_requests.transaction_id)
);

create policy document_requests_update_phase5d_bond_finance on public.document_requests
for update to authenticated
using (
  public.document_requests.transaction_id is not null
  and public.bridge_is_bond_finance_document_request_surface_phase5d(
    public.document_requests.lane_key,
    public.document_requests.document_type,
    public.document_requests.attorney_role
  )
  and public.bridge_can_mutate_bond_document_request_phase5d(public.document_requests.transaction_id)
)
with check (
  public.document_requests.transaction_id is not null
  and public.bridge_is_bond_finance_document_request_surface_phase5d(
    public.document_requests.lane_key,
    public.document_requests.document_type,
    public.document_requests.attorney_role
  )
  and public.bridge_can_mutate_bond_document_request_phase5d(public.document_requests.transaction_id)
);

create policy documents_insert_phase5d_bond_finance on public.documents
for insert to authenticated
with check (
  public.documents.transaction_id is not null
  and public.bridge_is_bond_finance_document_surface_phase5d(
    public.documents.lane_key,
    public.documents.stage_key,
    public.documents.category,
    public.documents.document_type,
    public.documents.attorney_role
  )
  and public.bridge_can_upload_bond_document_phase5d(public.documents.transaction_id)
);

create policy documents_update_phase5d_bond_finance on public.documents
for update to authenticated
using (
  public.documents.transaction_id is not null
  and public.bridge_is_bond_finance_document_surface_phase5d(
    public.documents.lane_key,
    public.documents.stage_key,
    public.documents.category,
    public.documents.document_type,
    public.documents.attorney_role
  )
  and public.bridge_can_upload_bond_document_phase5d(public.documents.transaction_id)
)
with check (
  public.documents.transaction_id is not null
  and public.bridge_is_bond_finance_document_surface_phase5d(
    public.documents.lane_key,
    public.documents.stage_key,
    public.documents.category,
    public.documents.document_type,
    public.documents.attorney_role
  )
  and public.bridge_can_upload_bond_document_phase5d(public.documents.transaction_id)
);

create policy transaction_events_insert_phase5d_bond_finance on public.transaction_events
for insert to authenticated
with check (
  public.transaction_events.transaction_id is not null
  and coalesce(public.transaction_events.visibility_scope, 'internal') <> 'client_visible'
  and public.bridge_can_record_bond_finance_event_phase5d(public.transaction_events.transaction_id)
);

create policy transaction_notifications_insert_phase5d_bond_finance on public.transaction_notifications
for insert to authenticated
with check (
  public.transaction_notifications.transaction_id is not null
  and (
    public.transaction_notifications.user_id = auth.uid()
    or public.bridge_is_admin()
  )
  and public.bridge_can_record_bond_finance_event_phase5d(public.transaction_notifications.transaction_id)
);

create policy transaction_notifications_update_phase5d_bond_finance on public.transaction_notifications
for update to authenticated
using (
  public.transaction_notifications.transaction_id is not null
  and (
    public.transaction_notifications.user_id = auth.uid()
    or public.bridge_is_admin()
  )
  and public.bridge_can_record_bond_finance_event_phase5d(public.transaction_notifications.transaction_id)
)
with check (
  public.transaction_notifications.transaction_id is not null
  and (
    public.transaction_notifications.user_id = auth.uid()
    or public.bridge_is_admin()
  )
  and public.bridge_can_record_bond_finance_event_phase5d(public.transaction_notifications.transaction_id)
);

grant execute on function public.bridge_is_bond_finance_document_request_surface_phase5d(text, text, text) to authenticated;
grant execute on function public.bridge_is_bond_finance_document_surface_phase5d(text, text, text, text, text) to authenticated;
grant execute on function public.bridge_is_bond_compliance_step_key_phase5d(text) to authenticated;
grant execute on function public.bridge_is_bond_bank_feedback_step_key_phase5d(text) to authenticated;
grant execute on function public.bridge_can_mutate_bond_finance_details_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_mutate_bond_document_request_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_upload_bond_document_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_manage_bond_bank_feedback_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_submit_bond_to_banks_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_manage_bond_assignment_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_review_bond_compliance_phase5d(uuid) to authenticated;
grant execute on function public.bridge_can_mutate_bond_finance_step_phase5d(uuid, text) to authenticated;
grant execute on function public.bridge_can_record_bond_finance_event_phase5d(uuid) to authenticated;

commit;
