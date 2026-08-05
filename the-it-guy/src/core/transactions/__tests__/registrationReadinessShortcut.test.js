import assert from 'node:assert/strict'
import {
  buildRegistrationReadinessBlockers,
  buildRegistrationReadinessShortcut,
} from '../registrationReadinessShortcut.js'

const cashReady = buildRegistrationReadinessShortcut({
  transaction: {
    id: 'tx-cash',
    finance_type: 'cash',
  },
  workflows: {
    attorney_transfer: {
      workflowKey: 'attorney_transfer',
      readyForHandoff: true,
      requiredSteps: [{ key: 'lodged', status: 'complete' }],
    },
    attorney_bond: {
      workflowKey: 'attorney_bond',
      required: false,
    },
    seller_bond_cancellation: {
      workflowKey: 'seller_bond_cancellation',
      required: false,
    },
  },
})

assert.equal(cashReady.status, 'ready_for_registration')
assert.equal(cashReady.ready, true)
assert.equal(cashReady.requiredLanes.bond, false)
assert.deepEqual(cashReady.blockers, [])
assert.match(cashReady.nextAction.action, /registration date/i)

const bondBlocked = buildRegistrationReadinessShortcut({
  transaction: {
    id: 'tx-bond',
    finance_type: 'bond',
  },
  workflows: {
    attorney_transfer: {
      workflowKey: 'attorney_transfer',
      readyForHandoff: true,
      requiredSteps: [{ key: 'lodged', status: 'complete' }],
    },
    attorney_bond: {
      workflowKey: 'attorney_bond',
      required: true,
      readyForHandoff: false,
      requiredSteps: [{ key: 'lodged', status: 'pending' }],
      blockers: [
        {
          code: 'BANK_CONDITIONS_NOT_SATISFIED',
          message: 'Bank conditions must be satisfied before the bond matter can be lodged.',
          workflowKey: 'attorney_bond',
          stepKey: 'bank_conditions_satisfied',
          ownerRole: 'bond_attorney',
        },
      ],
    },
    seller_bond_cancellation: {
      workflowKey: 'seller_bond_cancellation',
      required: false,
    },
  },
})

assert.equal(bondBlocked.status, 'blocked')
assert.equal(bondBlocked.ready, false)
assert.equal(bondBlocked.requiredLanes.bond, true)
assert.equal(bondBlocked.blockers[0].code, 'BOND_NOT_LODGED')
assert.equal(bondBlocked.blockers[0].message, 'Bank conditions must be satisfied before the bond matter can be lodged.')
assert.equal(bondBlocked.blockers[0].workflowKey, 'attorney_bond')
assert.equal(bondBlocked.blockers[0].ownerRole, 'bond_attorney')

const alreadyRegistered = buildRegistrationReadinessShortcut({
  transaction: {
    id: 'tx-reg',
    lifecycle_state: 'registered',
    registration_date: '2026-08-05',
  },
  workflows: {},
})

assert.equal(alreadyRegistered.status, 'registered')
assert.equal(alreadyRegistered.ready, true)
assert.equal(alreadyRegistered.registered, true)
assert.deepEqual(
  buildRegistrationReadinessBlockers({
    transaction: {
      id: 'tx-reg',
      lifecycle_state: 'registered',
      registration_date: '2026-08-05',
    },
    workflows: {},
  }),
  [],
)

console.log('registration readiness shortcut tests passed')
