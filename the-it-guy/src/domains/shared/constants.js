// shared owns these operations and their existing recovery behavior.
import { CANONICAL_FINANCE_TYPES } from '../../core/transactions/financeType'
import { PROPERTY_CATEGORIES } from '../../lib/propertyTaxonomy'

export const FINANCE_TYPES = [...CANONICAL_FINANCE_TYPES]

export const RISK_STATUSES = ['On Track', 'At Risk', 'Delayed', 'Blocked']

export const CLIENT_ISSUE_STATUSES = ['Open', 'In Progress', 'Addressed', 'Resolved', 'Completed', 'Closed']

export const ALTERATION_REQUEST_STATUSES = [
  'Pending Review',
  'Approved',
  'Declined',
  'Quote Sent',
  'Accepted',
  'In Progress',
  'Completed',
]

export const TRUST_INVESTMENT_FORM_STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved']

export const ONBOARDING_LIFECYCLE_STATUSES = [
  'transaction_created',
  'awaiting_client_onboarding',
  'client_onboarding_complete',
  'otp_uploaded',
  'awaiting_signed_otp',
  'signed_otp_received',
  'awaiting_supporting_documents',
  'documents_in_review',
]

export const REVIEW_ELIGIBLE_STAGES = new Set(['Registered', 'Handover Complete', 'Occupied'])

export const OCCUPATIONAL_RENT_STATUSES = ['not_applicable', 'pending_setup', 'active', 'overdue', 'settled', 'closed']

export const PROFILE_ROLE_VALUES = ['viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client']

export const FIRM_TYPE_VALUES = ['attorney', 'developer', 'agency']

export const TRANSACTION_ACCESS_LEVEL_VALUES = ['private', 'shared', 'restricted']

export const ATTORNEY_LEGAL_ROLE_VALUES = ['transfer', 'bond', 'cancellation']

export const ATTORNEY_LEGAL_ROLE_REQUIRED = ['transfer']

export const RESERVATION_STATUSES = ['not_required', 'pending', 'paid', 'verified', 'rejected']

export const FUNDING_SOURCE_STATUSES = ['planned', 'pending', 'paid', 'verified']

export const TRANSACTION_NOTIFICATION_TYPES = [
  'participant_assigned',
  'document_uploaded',
  'readiness_updated',
  'workflow_updated',
  'lane_handoff',
  'registration_completed',
  'overdue_missing_docs',
  'additional_document_requested',
  'commercial_access_request',
  'commercial_access_decision',
]

export const DOCUMENT_REQUEST_STATUS_TYPES = [
  'requested',
  'uploaded',
  'under_review',
  'reviewed',
  'rejected',
  'completed',
  'cancelled',
]

export const DOCUMENT_REQUEST_PRIORITY_TYPES = ['required', 'important', 'optional', 'normal', 'urgent']

export const CHECKLIST_ITEM_STATUS_TYPES = ['pending', 'in_progress', 'completed', 'blocked', 'waived']

export const TRANSACTION_LIFECYCLE_STATES = ['active', 'registered', 'completed', 'archived', 'cancelled']

export const TRANSACTION_TYPE_VALUES = ['developer_sale', 'private_property']

export const TRANSACTION_PROPERTY_TYPE_VALUES = [...PROPERTY_CATEGORIES]

const EMPTY_DASHBOARD_METRICS = {
  totalDevelopments: 0,
  totalUnits: 0,
  activeTransactions: 0,
  unitsInTransfer: 0,
  unitsRegistered: 0,
  totalRevenue: 0,
}

export const EMPTY_STATE = {
  dashboardMetrics: EMPTY_DASHBOARD_METRICS,
}
