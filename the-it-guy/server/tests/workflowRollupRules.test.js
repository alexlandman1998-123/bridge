import assert from 'node:assert/strict'

import {
  PARENT_STAGE_ENUM,
  collectBlockedStages,
  deriveParentStage,
  deriveParentStatusFromRules,
  getActiveFinanceWorkflow,
  resolveWithFallback,
} from '../services/workflowRollupRules.js'
import { calculateProgressPercent } from '../services/workflowProgressCalculator.js'

function step(status, overrides = {}) {
  return {
    key: overrides.key || 'step',
    label: overrides.label || 'Step',
    status,
    required: overrides.required !== false,
    blocking: overrides.blocking !== false,
    ownerRole: overrides.ownerRole || 'agent',
  }
}

function workflow(status, requiredSteps = [], overrides = {}) {
  return {
    workflowKey: overrides.workflowKey || 'workflow',
    status,
    requiredSteps,
    blockers: overrides.blockers || [],
    required: overrides.required !== false,
  }
}

const salesIncomplete = workflow('blocked', [step('complete'), step('pending', { key: 'sign_otp' })], {
  workflowKey: 'sales_otp',
  blockers: [{ code: 'SIGNED_OTP_REQUIRED', severity: 'hard', workflowKey: 'sales_otp', stepKey: 'sign_otp' }],
})

const salesComplete = workflow('ready_for_handoff', [step('complete')], { workflowKey: 'sales_otp' })
const financeBondIncomplete = workflow('blocked', [step('complete'), step('pending', { key: 'bond_approval' })], {
  workflowKey: 'finance_bond',
  blockers: [{ code: 'BOND_APPROVAL_REQUIRED', severity: 'hard', workflowKey: 'finance_bond', stepKey: 'bond_approval' }],
})
const financeBondComplete = workflow('ready_for_handoff', [step('complete')], { workflowKey: 'finance_bond' })
const financeCashIncomplete = workflow('blocked', [step('pending', { key: 'proof_of_funds' })], {
  workflowKey: 'finance_cash',
  blockers: [{ code: 'PROOF_OF_FUNDS_REQUIRED', severity: 'hard', workflowKey: 'finance_cash', stepKey: 'proof_of_funds' }],
})
const financeHybridIncomplete = workflow(
  'blocked',
  [step('complete', { key: 'bond_application' }), step('pending', { key: 'bond_approval' }), step('pending', { key: 'cash_portion_confirmation' })],
  {
    workflowKey: 'finance_hybrid',
    blockers: [
      { code: 'BOND_APPROVAL_REQUIRED', severity: 'hard', workflowKey: 'finance_hybrid', stepKey: 'bond_approval' },
      { code: 'PROOF_OF_FUNDS_REQUIRED', severity: 'hard', workflowKey: 'finance_hybrid', stepKey: 'cash_portion_confirmation' },
    ],
  },
)
const transferIncomplete = workflow('blocked', [step('complete'), step('pending', { key: 'lodgement_submitted' })], {
  workflowKey: 'transfer',
  blockers: [{ code: 'LODGEMENT_REQUIRED', severity: 'hard', workflowKey: 'transfer', stepKey: 'lodgement_submitted' }],
})
const transferComplete = workflow('ready_for_handoff', [step('complete')], { workflowKey: 'transfer' })
const registrationIncomplete = workflow('blocked', [step('complete'), step('pending', { key: 'registration_confirmed' })], {
  workflowKey: 'registration',
  blockers: [{ code: 'REGISTRATION_CONFIRMATION_REQUIRED', severity: 'hard', workflowKey: 'registration', stepKey: 'registration_confirmed' }],
})
const registrationComplete = workflow('complete', [step('complete')], { workflowKey: 'registration' })

assert.equal(
  deriveParentStage({
    transaction: { finance_type: 'bond', lifecycle_state: 'active' },
    workflows: {
      sales_otp: salesIncomplete,
      finance_bond: financeBondIncomplete,
      transfer: transferIncomplete,
      registration: registrationIncomplete,
    },
  }),
  PARENT_STAGE_ENUM.SALES_OTP,
  'sales incomplete should keep the transaction in SALES_OTP',
)

assert.equal(
  deriveParentStage({
    transaction: { finance_type: 'bond', lifecycle_state: 'active' },
    workflows: {
      sales_otp: salesComplete,
      finance_bond: financeBondIncomplete,
      transfer: transferIncomplete,
      registration: registrationIncomplete,
    },
  }),
  PARENT_STAGE_ENUM.FINANCE,
  'sales complete should move the transaction into FINANCE',
)

assert.equal(
  deriveParentStage({
    transaction: { finance_type: 'bond', lifecycle_state: 'active' },
    workflows: {
      sales_otp: salesComplete,
      finance_bond: financeBondComplete,
      transfer: transferIncomplete,
      registration: registrationIncomplete,
    },
  }),
  PARENT_STAGE_ENUM.TRANSFER,
  'bond finance complete should move the transaction into TRANSFER',
)

assert.equal(
  getActiveFinanceWorkflow(
    { finance_type: 'cash' },
    { finance_cash: financeCashIncomplete, finance_bond: financeBondComplete },
  ).workflowKey,
  'finance_cash',
  'cash finance should use finance_cash',
)

const hybridWorkflow = getActiveFinanceWorkflow(
  { finance_type: 'hybrid' },
  { finance_hybrid: financeHybridIncomplete, finance_cash: financeCashIncomplete },
)
assert.equal(hybridWorkflow.workflowKey, 'finance_hybrid', 'hybrid finance should use finance_hybrid')
assert.equal(
  hybridWorkflow.blockers.some((blocker) => blocker.code === 'PROOF_OF_FUNDS_REQUIRED') &&
    hybridWorkflow.blockers.some((blocker) => blocker.code === 'BOND_APPROVAL_REQUIRED'),
  true,
  'hybrid finance should require both cash and bond conditions',
)

assert.equal(
  deriveParentStage({
    transaction: { finance_type: 'cash', lifecycle_state: 'active' },
    workflows: {
      sales_otp: salesComplete,
      finance_cash: workflow('ready_for_handoff', [step('complete')], { workflowKey: 'finance_cash' }),
      transfer: transferComplete,
      registration: registrationIncomplete,
    },
  }),
  PARENT_STAGE_ENUM.REGISTRATION,
  'transfer complete should move the transaction into REGISTRATION',
)

assert.equal(
  deriveParentStage({
    transaction: { finance_type: 'cash', lifecycle_state: 'active' },
    workflows: {
      sales_otp: salesComplete,
      finance_cash: workflow('ready_for_handoff', [step('complete')], { workflowKey: 'finance_cash' }),
      transfer: transferComplete,
      registration: registrationComplete,
    },
  }),
  PARENT_STAGE_ENUM.COMPLETE,
  'registration confirmed should move the transaction into COMPLETE',
)

assert.equal(
  deriveParentStage({
    transaction: { finance_type: 'bond', lifecycle_state: 'cancelled' },
    workflows: {
      sales_otp: salesComplete,
      finance_bond: financeBondComplete,
      transfer: transferComplete,
      registration: registrationComplete,
    },
  }),
  PARENT_STAGE_ENUM.CANCELLED,
  'cancelled transactions should always return CANCELLED',
)

const unknownFinanceWorkflow = getActiveFinanceWorkflow({ finance_type: '' }, {})
assert.equal(unknownFinanceWorkflow.status, 'blocked', 'missing finance type should create a blocked finance workflow')
assert.equal(
  unknownFinanceWorkflow.blockers.some((blocker) => blocker.code === 'FINANCE_TYPE_REQUIRED'),
  true,
  'missing finance type should create a FINANCE_TYPE_REQUIRED blocker',
)

assert.equal(
  deriveParentStatusFromRules({
    parentStage: PARENT_STAGE_ENUM.FINANCE,
    workflows: { finance: unknownFinanceWorkflow },
    activeWorkflow: unknownFinanceWorkflow,
    blockers: unknownFinanceWorkflow.blockers,
  }),
  'blocked',
  'hard blockers should force parent status to blocked',
)

assert.equal(
  calculateProgressPercent({
    sales_otp: workflow('active', [step('complete'), step('pending')], { workflowKey: 'sales_otp' }),
    finance: workflow('active', [step('complete'), step('complete'), step('pending')], { workflowKey: 'finance_bond' }),
    transfer: workflow('active', [step('complete'), step('pending'), step('pending')], { workflowKey: 'transfer' }),
    registration: workflow('not_started', [step('not_started'), step('not_started')], { workflowKey: 'registration' }),
  }),
  38,
  'progress should be calculated from weighted required step completion',
)

assert.deepEqual(
  collectBlockedStages(
    {
      sales_otp: salesComplete,
      finance_bond: financeBondIncomplete,
      transfer: transferIncomplete,
      registration: registrationIncomplete,
    },
    { finance_type: 'bond' },
  ),
  [PARENT_STAGE_ENUM.FINANCE, PARENT_STAGE_ENUM.TRANSFER, PARENT_STAGE_ENUM.REGISTRATION],
  'blocked stages should follow workflow blockers, including the active finance branch',
)

assert.deepEqual(
  resolveWithFallback(
    { current_main_stage: 'FIN', lifecycle_state: 'active' },
    {},
  ),
  {
    usedLegacyFallback: true,
    value: PARENT_STAGE_ENUM.FINANCE,
  },
  'legacy fallback should only run when workflow data is missing',
)

assert.equal(
  resolveWithFallback(
    { current_main_stage: 'OTP', finance_type: 'bond', lifecycle_state: 'active' },
    {
      sales_otp: salesComplete,
      finance_bond: financeBondIncomplete,
      transfer: transferIncomplete,
      registration: registrationIncomplete,
    },
  ).usedLegacyFallback,
  false,
  'legacy fallback should not run when workflow data exists',
)

console.log('workflowRollupRules tests passed')
