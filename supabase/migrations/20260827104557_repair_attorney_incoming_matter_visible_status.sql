begin;

update public.transaction_attorney_assignments assignment
set
  instruction_status = 'awaiting_documents',
  updated_at = now()
from public.transactions transaction
where transaction.id = assignment.transaction_id
  and assignment.attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
  and coalesce(assignment.instruction_status, 'new_instruction') = 'new_instruction'
  and coalesce(assignment.assignment_status, assignment.status, 'pending') in ('pending', 'active')
  and coalesce(assignment.allocation_state, 'active') in (
    'awaiting_firm_acceptance',
    'awaiting_staff_assignment',
    'staff_assigned',
    'active'
  )
  and coalesce(transaction.is_active, true) = true
  and (
    transaction.transaction_type in ('development', 'developer_sale', 'development_sale')
    or assignment.scope_metadata->>'source' in (
      'repair_partner_pipeline_assignment_scope',
      'transaction_roleplayer_propagation',
      'agent_firm_nomination'
    )
  );

notify pgrst, 'reload schema';

commit;
