import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    resolveCurrentBondAssignment,
    normaliseLegacyBondAssignment,
    prepareBondAssignmentPayload,
  } = await server.ssrLoadModule('/src/services/bondAssignmentService.js')

  const canonicalAssignments = [
    { assignmentType: 'bond', attorneyRole: 'bond_attorney', status: 'active', attorneyUser: { email: 'bond.attorney@example.test', name: 'Bond Attorney' } },
    { assignmentType: 'transfer', attorneyRole: 'transfer_attorney', status: 'active', attorneyUser: { email: 'transfer.attorney@example.test', name: 'Transfer Attorney' } },
  ]

  const canonicalResolved = resolveCurrentBondAssignment({
    transaction: {
      assigned_bond_originator_email: 'legacy.fallback@example.test',
      bond_originator: 'Legacy Originator',
    },
    assignments: canonicalAssignments,
  })
  assert.equal(canonicalResolved.bondAttorneyEmail, 'bond.attorney@example.test')
  assert.equal(canonicalResolved.bondAttorneyName, 'Bond Attorney')
  assert.equal(canonicalResolved.bondOriginatorEmail, 'bond.attorney@example.test')
  assert.equal(canonicalResolved.bondOriginatorName, 'Bond Attorney')

  const participantFallback = resolveCurrentBondAssignment({
    transaction: {
      assigned_bond_originator_email: 'legacy.only@example.test',
      bond_originator: 'Legacy Originator',
      participants: [
        { participantRole: 'bond_originator', name: 'Participant Originator', email: 'participant@example.test', status: 'active' },
      ],
    },
    assignments: [],
  })
  assert.equal(participantFallback.bondOriginatorEmail, 'participant@example.test')
  assert.equal(participantFallback.bondOriginatorName, 'Participant Originator')

  const participantOnly = resolveCurrentBondAssignment({
    transaction: {
      participants: [
        { participant_role: 'bond_originator', name: 'Participant Originator', email: 'participant@example.test', status: 'active' },
      ],
    },
  })
  assert.equal(participantOnly.bondOriginatorEmail, 'participant@example.test')
  assert.equal(participantOnly.bondOriginatorName, 'Participant Originator')

  const assignedEmailFallback = resolveCurrentBondAssignment({
    transaction: {
      assigned_bond_originator_email: 'assigned@example.test',
      bond_originator: '',
    },
    assignments: [],
  })
  assert.equal(assignedEmailFallback.bondOriginatorEmail, 'assigned@example.test')
  assert.equal(assignedEmailFallback.bondOriginatorName, '')

  const textOnlyFallback = resolveCurrentBondAssignment({
    transaction: {
      bond_originator: 'Text Originator',
      assigned_bond_originator_email: '',
    },
    assignments: [],
  })
  assert.equal(textOnlyFallback.bondOriginatorEmail, '')
  assert.equal(textOnlyFallback.bondOriginatorName, 'Text Originator')

  const payloadMissing = prepareBondAssignmentPayload({})
  assert.equal(payloadMissing.attorney, null)
  assert.equal(payloadMissing.assigned_attorney_email, null)
  assert.equal(payloadMissing.assigned_bond_originator_email, null)
  assert.equal(payloadMissing.bond_originator, null)

  const payloadFromLegacy = prepareBondAssignmentPayload({
    transaction: {
      assigned_bond_originator_email: 'legacy-payload@example.test',
      bond_originator: 'Legacy Payload',
      assigned_attorney_email: 'legacy-attorney@example.test',
      attorney: 'Legacy Attorney',
    },
  })
  assert.equal(payloadFromLegacy.assigned_bond_originator_email, 'legacy-payload@example.test')
  assert.equal(payloadFromLegacy.bond_originator, 'Legacy Payload')
  assert.equal(payloadFromLegacy.assigned_attorney_email, 'legacy-attorney@example.test')
  assert.equal(payloadFromLegacy.attorney, 'Legacy Attorney')

  const payloadFromCanonicalParticipantMix = prepareBondAssignmentPayload({
    transaction: {
      participants: [
        { role_type: 'bond_originator', name: 'Participant Originator', email: 'participant@example.test', status: 'active' },
      ],
    },
    assignments: [
      { assignmentType: 'bond', attorneyRole: 'bond_attorney', status: 'active', attorneyUser: { email: 'bond.attorney@example.test', name: 'Bond Attorney' } },
    ],
  })
  assert.equal(payloadFromCanonicalParticipantMix.assigned_bond_originator_email, 'participant@example.test')
  assert.equal(payloadFromCanonicalParticipantMix.bond_originator, 'Participant Originator')

  const missingAssign = resolveCurrentBondAssignment()
  assert.equal(missingAssign.bondOriginatorEmail, '')
  assert.equal(missingAssign.bondOriginatorName, '')

  const legacyNormalised = normaliseLegacyBondAssignment({
    assigned_bond_originator_email: 'Legacy.Email@Example.Test',
    bond_originator: 'Legacy Name',
    assigned_attorney_email: 'attorney@example.test',
    attorney: 'Attorney Name',
  })
  assert.equal(legacyNormalised.assignedBondOriginatorEmail, 'legacy.email@example.test')
  assert.equal(legacyNormalised.assignedBondOriginatorName, 'Legacy Name')
  assert.equal(legacyNormalised.assignedBondAttorneyEmail, 'attorney@example.test')
  assert.equal(legacyNormalised.assignedBondAttorneyName, 'Attorney Name')

  const normaliseSafe = normaliseLegacyBondAssignment(null)
  assert.equal(normaliseSafe.assignedBondOriginatorEmail, '')
  assert.equal(normaliseSafe.assignedBondOriginatorName, '')

  console.log('bondAssignmentService tests passed')
} finally {
  await server.close()
}
