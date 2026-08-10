import assert from 'node:assert/strict'

import {
  buildConveyancingLaneModel,
  CONVEYANCING_LANE_ORDER,
} from '../attorneyWorkflow/conveyancingLaneModel.js'

const transferWorkflow = {
  key: 'transfer',
  detailKey: 'transfer',
  accentKey: 'transfer',
  title: 'Transfer Attorney',
  required: true,
  statusKey: 'in_progress',
  statusLabel: 'On Track',
  progressPercent: 42,
  nextStep: 'Lodgement readiness',
  assignedDisplay: 'Alpha Conveyancers',
  assignedOrganisation: 'Alpha Conveyancers',
  route: '/transaction/tx-1/transfer/transfer',
  lane: {
    laneKey: 'transfer',
    currentStage: 'lodgement_ready',
    steps: [
      { id: 'transfer-1', stepKey: 'instruction_received', status: 'completed' },
      { id: 'transfer-2', stepKey: 'lodgement_ready', status: 'in_progress' },
      { id: 'transfer-3', stepKey: 'lodged_at_deeds_office', status: 'not_started' },
    ],
  },
}

const bondWorkflow = {
  key: 'bond_registration',
  detailKey: 'bond-registration',
  accentKey: 'bond',
  title: 'Bond Registration',
  required: true,
  statusKey: 'waiting',
  statusLabel: 'Waiting',
  progressPercent: 29,
  nextStep: 'Bond instruction received',
  assignedDisplay: 'Beta Bond Attorneys',
  assignedOrganisation: 'Beta Bond Attorneys',
  route: '/transaction/tx-1/transfer/bond-registration',
}

const cancellationWorkflow = {
  key: 'bond_cancellation',
  detailKey: 'bond-cancellation',
  accentKey: 'cancellation',
  title: 'Bond Cancellation',
  required: false,
  statusKey: 'not_started',
  statusLabel: 'Not Required',
  nextStep: 'Not required',
}

const model = buildConveyancingLaneModel({
  now: '2026-08-10T08:00:00.000Z',
  workflows: [transferWorkflow, bondWorkflow, cancellationWorkflow],
  activityFeed: [
    {
      id: 'activity-transfer',
      title: 'Transfer workflow moved to Lodgement Ready',
      body: 'The transfer attorney confirmed lodgement checks are underway.',
      createdAt: '2026-08-01T08:00:00.000Z',
      authorName: 'Transfer Attorney',
      filterKeys: ['transfer'],
    },
    {
      id: 'activity-bond',
      title: 'Bond attorney update',
      body: 'Awaiting signed bond documents from the buyer.',
      createdAt: '2026-08-02T08:00:00.000Z',
      authorName: 'Bond Attorney',
      filterKeys: ['bond'],
    },
    {
      id: 'activity-cancellation',
      title: 'Cancellation attorney update',
      body: 'Cancellation figures requested.',
      createdAt: '2026-08-03T08:00:00.000Z',
      authorName: 'Cancellation Attorney',
      filterKeys: ['cancellation'],
    },
  ],
})

assert.deepEqual(model.lanes.map((lane) => lane.key), CONVEYANCING_LANE_ORDER)
assert.deepEqual(model.applicableLaneKeys, ['transfer', 'bond'])
assert.equal(model.title, 'Conveyancing')
assert.equal(model.summary.applicableCount, 2)
assert.equal(model.summary.waiting, 1)
assert.equal(model.summary.averageProgress, 36)

const transferLane = model.lanes.find((lane) => lane.key === 'transfer')
assert.equal(transferLane.label, 'Transfer')
assert.equal(transferLane.applicable, true)
assert.equal(transferLane.progressPercent, 42)
assert.equal(transferLane.currentStep.key, 'lodgement_ready')
assert.equal(transferLane.currentStep.label, 'Lodgement Ready')
assert.equal(transferLane.nextStep.key, 'lodged_at_deeds_office')
assert.equal(transferLane.latestUpdate.id, 'activity-transfer')
assert.equal(transferLane.latestUpdate.freshnessKey, 'stale')
assert.equal(transferLane.latestUpdate.freshnessLabel, 'Needs update')
assert.equal(transferLane.activityCount, 1)
assert.equal(transferLane.assignedDisplay, 'Alpha Conveyancers')

const bondLane = model.lanes.find((lane) => lane.key === 'bond')
assert.equal(bondLane.applicable, true)
assert.equal(bondLane.currentStep.key, 'assignment_pending')
assert.equal(bondLane.currentStep.label, 'Bond attorney assignment')
assert.equal(bondLane.nextStep.label, 'Bond instruction received')
assert.equal(bondLane.latestUpdate.id, 'activity-bond')
assert.equal(bondLane.activityCount, 1)

const cancellationLane = model.lanes.find((lane) => lane.key === 'cancellation')
assert.equal(cancellationLane.applicable, false)
assert.equal(cancellationLane.statusLabel, 'Not Required')
assert.equal(cancellationLane.currentStep.label, 'Not required')
assert.equal(cancellationLane.nextStep.label, 'Not required')
assert.equal(cancellationLane.latestUpdate.id, 'activity-cancellation')

const cancellationOnly = buildConveyancingLaneModel({
  now: '2026-08-10T08:00:00.000Z',
  workflows: [
    transferWorkflow,
    {
      ...bondWorkflow,
      required: false,
      progressPercent: 0,
    },
    {
      ...cancellationWorkflow,
      required: true,
      statusKey: 'blocked',
      statusLabel: 'Blocked',
      progressPercent: 18,
      assignedDisplay: 'Gamma Cancellation Attorneys',
      lane: {
        laneKey: 'cancellation',
        currentStage: 'cancellation_figures_requested',
        steps: [
          { id: 'cancel-1', stepKey: 'cancellation_instruction_received', status: 'completed' },
          { id: 'cancel-2', stepKey: 'cancellation_figures_requested', status: 'blocked' },
          { id: 'cancel-3', stepKey: 'cancellation_figures_received', status: 'not_started' },
        ],
      },
    },
  ],
  activityFeed: [
    {
      id: 'cancel-latest',
      title: 'Bond cancellation workflow blocked',
      body: 'Waiting for the bank to issue figures.',
      createdAt: '2026-08-04T10:00:00.000Z',
      filterKeys: ['cancellation'],
    },
  ],
})

assert.deepEqual(cancellationOnly.applicableLaneKeys, ['transfer', 'cancellation'])
assert.equal(cancellationOnly.summary.blocked, 1)
assert.equal(cancellationOnly.lanes.find((lane) => lane.key === 'cancellation').currentStep.key, 'cancellation_figures_requested')
assert.equal(cancellationOnly.lanes.find((lane) => lane.key === 'cancellation').nextStep.key, 'cancellation_figures_received')
assert.equal(cancellationOnly.lanes.find((lane) => lane.key === 'cancellation').latestUpdate.id, 'cancel-latest')

const internalPreferred = buildConveyancingLaneModel({
  now: '2026-08-10T08:00:00.000Z',
  workflows: [transferWorkflow],
  activityFeed: [
    {
      id: 'shared-transfer-update',
      title: 'Transfer attorney shared update',
      body: 'The transfer attorney is preparing the lodgement pack.',
      createdAt: '2026-08-05T08:00:00.000Z',
      laneKey: 'transfer',
      attorneyRole: 'transfer_attorney',
      visibility: 'professional_shared',
    },
    {
      id: 'internal-transfer-note',
      title: 'Internal attorney note',
      body: 'Internal fee allocation note.',
      createdAt: '2026-08-06T08:00:00.000Z',
      laneKey: 'transfer',
      attorneyRole: 'transfer_attorney',
      visibility: 'internal',
      category: 'internal',
      type: 'internal_note',
    },
  ],
})

assert.equal(internalPreferred.lanes.find((lane) => lane.key === 'transfer').latestUpdate.id, 'internal-transfer-note')

const agentVisible = buildConveyancingLaneModel({
  now: '2026-08-10T08:00:00.000Z',
  workflows: [transferWorkflow],
  audience: 'agent',
  activityFeed: [
    {
      id: 'shared-transfer-update',
      title: 'Transfer attorney shared update',
      body: 'The transfer attorney is preparing the lodgement pack.',
      createdAt: '2026-08-05T08:00:00.000Z',
      laneKey: 'transfer',
      attorneyRole: 'transfer_attorney',
      visibility: 'professional_shared',
    },
    {
      id: 'internal-transfer-note',
      title: 'Internal attorney note',
      body: 'Internal fee allocation note.',
      createdAt: '2026-08-06T08:00:00.000Z',
      laneKey: 'transfer',
      attorneyRole: 'transfer_attorney',
      visibility: 'internal',
      category: 'internal',
      type: 'internal_note',
    },
  ],
})

assert.equal(agentVisible.lanes.find((lane) => lane.key === 'transfer').latestUpdate.id, 'shared-transfer-update')
assert.equal(agentVisible.lanes.find((lane) => lane.key === 'transfer').latestUpdate.freshnessKey, 'current')
assert.equal(agentVisible.lanes.find((lane) => lane.key === 'transfer').latestUpdate.freshnessLabel, 'Updated 5 days ago')
assert.equal(agentVisible.lanes.find((lane) => lane.key === 'transfer').activityCount, 1)

console.log('conveyancingLaneModel tests passed')
