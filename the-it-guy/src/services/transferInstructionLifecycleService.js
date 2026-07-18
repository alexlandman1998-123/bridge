import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const COMPLETE_ONBOARDING_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'client_onboarding_complete',
  'awaiting_signed_otp',
  'signed_otp_received',
  'otp_uploaded',
])

function normalize(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function compact(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function isMissingRelation(error) {
  const code = String(error?.code || '').toUpperCase()
  return ['42P01', 'PGRST205'].includes(code) || String(error?.message || '').toLowerCase().includes('does not exist')
}

function isMissingColumn(error) {
  return String(error?.code || '').toUpperCase() === '42703'
}

function getAssignmentStatus(assignment = {}) {
  return normalize(assignment.instruction_status || assignment.instructionStatus)
}

function getRoleplayerStatus(roleplayer = {}) {
  return normalize(roleplayer.assignment_status || roleplayer.assignmentStatus || roleplayer.status)
}

function getAllocationState(assignment = {}) {
  const row = assignment || {}
  const explicit = normalize(row.allocation_state || row.allocationState)
  if (explicit) return explicit
  const instruction = getAssignmentStatus(row)
  const status = normalize(row.assignment_status || row.assignmentStatus || row.status)
  if (instruction === 'declined') return 'declined'
  if (status === 'removed') return 'removed'
  if (instruction === 'accepted' || status === 'active') return 'active'
  return 'awaiting_firm_acceptance'
}

export function buildTransferInstructionLifecycle({
  transaction = {},
  allocations = [],
  roleplayers = [],
  assignments = [],
} = {}) {
  const onboardingStatus = normalize(transaction.onboarding_status || transaction.onboardingStatus)
  const signedOtp = ['signed_otp_received', 'otp_uploaded'].includes(onboardingStatus)
  const onboardingComplete = COMPLETE_ONBOARDING_STATUSES.has(onboardingStatus) || Boolean(
    transaction.onboarding_completed_at || transaction.onboardingCompletedAt || transaction.external_onboarding_submitted_at,
  )
  const transferAllocations = allocations.filter((row) => normalize(row.role_type || row.roleType || 'transfer_attorney') === 'transfer_attorney')
  const activeAllocation = transferAllocations.find((row) =>
    ['awaiting_buyer', 'under_offer', 'instructed', 'converted'].includes(normalize(row.allocation_status || row.status)),
  ) || null
  const latestAllocation = transferAllocations[0] || activeAllocation
  const transferAssignments = assignments.filter((row) => {
    const role = normalize(row.attorney_role || row.attorneyRole)
    const type = normalize(row.assignment_type || row.assignmentType || row.matter_type || row.matterType)
    return role === 'transfer_attorney' || ['transfer', 'transfer_and_bond'].includes(type)
  })
  const activeAssignments = transferAssignments.filter((row) =>
    !['removed', 'declined'].includes(getAllocationState(row)) &&
    !['removed', 'completed'].includes(normalize(row.assignment_status || row.status)),
  )
  const acceptedAssignment = transferAssignments.find((row) => getAssignmentStatus(row) === 'accepted') || null
  const declinedAssignment = transferAssignments.find((row) => getAssignmentStatus(row) === 'declined') || null
  const readyAssignment = transferAssignments.find((row) => getAssignmentStatus(row) === 'ready_for_acceptance') || null
  const currentAssignment = activeAssignments[0] || acceptedAssignment || readyAssignment || declinedAssignment || transferAssignments[0] || null
  const allocationState = getAllocationState(currentAssignment)
  const firmAcceptanceStatus = normalize(currentAssignment?.firm_acceptance_status || currentAssignment?.firmAcceptanceStatus)
  const staffAssignmentStatus = normalize(currentAssignment?.staff_assignment_status || currentAssignment?.staffAssignmentStatus)
  const assignedAttorneyUserId = currentAssignment?.attorney_user_id || currentAssignment?.attorneyUserId || currentAssignment?.primary_attorney_id || currentAssignment?.primaryAttorneyId || null
  const activeTransferRoleplayers = roleplayers.filter((row) => {
    const role = normalize(row.role_type || row.roleType)
    return role === 'transfer_attorney' && !['removed', 'declined', 'rejected'].includes(getRoleplayerStatus(row))
  })

  const issues = []
  if (signedOtp && !transferAssignments.length) issues.push('missing_instruction_assignment')
  if (acceptedAssignment && normalize(latestAllocation?.allocation_status || latestAllocation?.status) !== 'converted') {
    issues.push('accepted_allocation_not_converted')
  }
  if (declinedAssignment && !readyAssignment && !acceptedAssignment && activeTransferRoleplayers.length) {
    issues.push('declined_attorney_still_active')
  }
  if (activeAssignments.length > 1) issues.push('multiple_active_transfer_assignments')
  if (allocationState === 'awaiting_staff_assignment' && firmAcceptanceStatus !== 'accepted') {
    issues.push('staff_assignment_open_before_firm_acceptance')
  }
  if (allocationState === 'awaiting_staff_assignment' && assignedAttorneyUserId) {
    issues.push('person_linked_before_internal_assignment')
  }
  if (allocationState === 'staff_assigned' && (!assignedAttorneyUserId || staffAssignmentStatus !== 'staff_assigned')) {
    issues.push('staff_assigned_state_missing_primary_attorney')
  }
  if (
    allocationState === 'active' &&
    (firmAcceptanceStatus === 'awaiting_firm_acceptance' || staffAssignmentStatus === 'awaiting_staff_assignment' || !assignedAttorneyUserId)
  ) {
    issues.push('active_matter_missing_firm_or_person_gate')
  }
  if (!signedOtp && activeAssignments.some((row) => ['ready_for_acceptance', 'accepted'].includes(getAssignmentStatus(row)))) {
    issues.push('instruction_activated_before_signed_otp')
  }
  if (
    ['instructed', 'converted'].includes(normalize(latestAllocation?.allocation_status || latestAllocation?.status)) &&
    !String(latestAllocation?.transaction_id || latestAllocation?.transactionId || '').trim()
  ) {
    issues.push('allocation_missing_transaction_link')
  }

  const decisionState = currentAssignment
    ? allocationState
    : transferAssignments.length
      ? 'instruction_preparing'
      : 'not_issued'
  const steps = [
    {
      key: 'mandate_firm',
      label: 'Mandate Firm',
      status: transferAllocations.length ? 'complete' : 'pending',
      detail: latestAllocation?.company_name || latestAllocation?.companyName || 'Firm not nominated',
    },
    {
      key: 'buyer_onboarding',
      label: 'Buyer Onboarding',
      status: onboardingComplete ? 'complete' : transaction.id ? 'current' : 'pending',
      detail: onboardingComplete ? 'Buyer details received' : 'Awaiting buyer onboarding',
    },
    {
      key: 'signed_otp',
      label: 'Signed OTP',
      status: signedOtp ? 'complete' : onboardingComplete ? 'current' : 'pending',
      detail: signedOtp ? 'Accepted OTP received' : 'Formal instruction remains locked',
    },
    {
      key: 'firm_nomination',
      label: 'Firm Nomination',
      status: transferAssignments.length ? 'complete' : signedOtp ? 'current' : 'pending',
      detail: transferAssignments.length ? 'Transfer firm nominated' : 'Not yet nominated',
    },
    {
      key: 'firm_acceptance',
      label: 'Firm Acceptance',
      status: ['awaiting_staff_assignment', 'staff_assigned', 'active'].includes(allocationState)
        ? 'complete'
        : allocationState === 'declined'
          ? 'attention'
          : allocationState === 'awaiting_firm_acceptance'
            ? 'current'
            : 'pending',
      detail: allocationState === 'declined'
        ? 'Replacement firm required'
        : allocationState === 'awaiting_firm_acceptance'
          ? 'Awaiting firm decision'
          : ['awaiting_staff_assignment', 'staff_assigned', 'active'].includes(allocationState)
            ? 'Firm accepted nomination'
            : 'Awaiting nomination',
    },
    {
      key: 'internal_assignment',
      label: 'Internal Assignment',
      status: ['staff_assigned', 'active'].includes(allocationState)
        ? 'complete'
        : allocationState === 'awaiting_staff_assignment'
          ? 'current'
          : 'pending',
      detail: assignedAttorneyUserId
        ? 'Primary attorney assigned by firm'
        : allocationState === 'awaiting_staff_assignment'
          ? 'Awaiting primary attorney'
          : 'Firm must accept first',
    },
    {
      key: 'matter_activation',
      label: 'Matter Activation',
      status: allocationState === 'active' ? 'complete' : allocationState === 'staff_assigned' ? 'current' : 'pending',
      detail: allocationState === 'active'
        ? 'Transfer matter active'
        : allocationState === 'staff_assigned'
          ? 'Ready to activate'
          : 'Acceptance and primary attorney required',
    },
  ]

  const blockedIssues = new Set([
    'declined_attorney_still_active',
    'multiple_active_transfer_assignments',
    'staff_assignment_open_before_firm_acceptance',
    'person_linked_before_internal_assignment',
    'staff_assigned_state_missing_primary_attorney',
    'active_matter_missing_firm_or_person_gate',
  ])

  return {
    transactionId: transaction.id || transaction.transaction_id || '',
    listingId: transaction.listing_id || transaction.listingId || '',
    onboardingStatus,
    signedOtp,
    decisionState,
    health: issues.length ? (issues.some((issue) => blockedIssues.has(issue)) ? 'blocked' : 'attention') : allocationState === 'declined' ? 'blocked' : 'on_track',
    issues: compact(issues),
    steps,
    allocation: latestAllocation || null,
    assignment: currentAssignment,
  }
}

async function fetchRows(table, configure) {
  let query = supabase.from(table).select('*')
  query = configure(query)
  const result = await query
  if (result.error) {
    if (isMissingRelation(result.error) || isMissingColumn(result.error)) return []
    throw result.error
  }
  return result.data || []
}

export async function getTransferInstructionLifecycle(transactionId) {
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId || !isSupabaseConfigured || !supabase) return null

  const transactionResult = await supabase.from('transactions').select('*').eq('id', normalizedTransactionId).maybeSingle()
  if (transactionResult.error) throw transactionResult.error
  const transaction = transactionResult.data
  if (!transaction) return null

  const [allocations, roleplayers, assignments] = await Promise.all([
    transaction.listing_id
      ? fetchRows('private_listing_role_players', (query) =>
          query.eq('private_listing_id', transaction.listing_id).eq('role_type', 'transfer_attorney').order('selected_at', { ascending: false }))
      : Promise.resolve([]),
    fetchRows('transaction_role_players', (query) =>
      query.eq('transaction_id', normalizedTransactionId).eq('role_type', 'transfer_attorney').order('updated_at', { ascending: false })),
    fetchRows('transaction_attorney_assignments', (query) =>
      query.eq('transaction_id', normalizedTransactionId).order('updated_at', { ascending: false })),
  ])

  return buildTransferInstructionLifecycle({ transaction, allocations, roleplayers, assignments })
}
