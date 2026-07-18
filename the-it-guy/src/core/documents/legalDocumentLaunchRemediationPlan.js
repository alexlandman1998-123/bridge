const ACTIONS = Object.freeze({
  platform_targeting: {
    wave: 1,
    title: 'Target and activate the controlled staging cohort',
    ownerRole: 'platform administrator',
    documentTypes: ['otp', 'mandate'],
    dependsOn: [],
    executionMode: 'configuration_then_controlled_write',
    steps: [
      'Set the intended Supabase project reference and controlled organisation allowlist.',
      'Confirm the organisation is active and contains at least one active agent.',
      'Run the deliberate A3 activation command, then verify the resulting repository state.',
    ],
    commands: ['npm run activate:legal-documents:phase-a3', 'npm run verify:legal-documents:phase-a3'],
    acceptance: 'A3 reports HEALTHY for the intended project and a non-empty controlled cohort.',
  },
  governed_source: {
    wave: 2,
    title: 'Restore and prove the governed document source',
    ownerRole: 'document operations',
    documentTypes: ['otp', 'mandate'],
    dependsOn: ['platform_targeting'],
    executionMode: 'controlled_source_repair',
    steps: [
      'Restore or deliberately replace every missing frozen template storage object.',
      'Run C1 source-integrity verification and C2 deterministic merge/render scenarios.',
      'Refreeze the exact repaired source before requesting a legal decision.',
    ],
    commands: ['npm run restore:legal-documents:phase-c1', 'npm run verify:legal-documents:phase-c1', 'npm run verify:legal-documents:phase-c2', 'npm run freeze:legal-documents:phase-b1'],
    acceptance: 'C1 and C2 report READY_FOR_B1_REFREEZE and B1 freezes the repaired source digest.',
  },
  counsel_approval: {
    wave: 3,
    title: 'Record accountable counsel approval against the repaired digest',
    ownerRole: 'legal counsel',
    documentTypes: ['otp', 'mandate'],
    dependsOn: ['governed_source'],
    executionMode: 'human_decision_then_audited_write',
    steps: [
      'Generate the review dossier for the current B1 manifest.',
      'Have counsel approve or request changes for every exact template digest.',
      'Record the reviewer, decision time, reference, and apply the approved release gates.',
    ],
    commands: ['npm run prepare:legal-documents:phase-b2', 'LEGAL_DOCUMENT_COUNSEL_REVIEW_WRITE=true npm run record:legal-documents:phase-b2 -- --template-id=TEMPLATE_ID --decision=DECISION --reviewed-by=COUNSEL_ID --reviewed-at=ISO_TIMESTAMP --reference=REVIEW_REFERENCE --confirm-content-digest=CONTENT_DIGEST --confirm-project-ref=PROJECT_REF --apply', 'npm run verify:legal-documents:phase-b2', 'npm run apply:legal-documents:phase-b3', 'npm run verify:legal-documents:phase-b3'],
    acceptance: 'B3 reports READY_FOR_RELEASE_GATES with complete counsel evidence for every routed template.',
  },
  renderer_capacity: {
    wave: 4,
    title: 'Qualify renderer isolation, capacity, and backpressure',
    ownerRole: 'release engineer',
    documentTypes: ['otp', 'mandate'],
    dependsOn: ['counsel_approval'],
    executionMode: 'controlled_load_verification',
    steps: [
      'Run renderer isolation and capacity checks using approved governed sources.',
      'Exercise overload boundaries and confirm bounded backpressure behaviour.',
    ],
    commands: ['npm run verify:legal-documents:phase-i2', 'npm run verify:legal-documents:phase-i3'],
    acceptance: 'I3 reports READY_FOR_J1 with controlled targets and passing overload waves.',
  },
  controlled_otp: {
    wave: 5,
    title: 'Complete one controlled OTP journey',
    ownerRole: 'pilot agent and release operator',
    documentTypes: ['otp'],
    dependsOn: ['renderer_capacity'],
    executionMode: 'controlled_user_journey',
    steps: [
      'Use a pilot agent to complete the seller inputs through the ordinary OTP interface.',
      'Generate, review, approve, sign, and securely deliver the final OTP.',
      'Retain the packet, version, signing, delivery, and operational evidence for certification.',
    ],
    commands: ['npm run verify:legal-documents:phase-l1'],
    acceptance: 'L1 reports coverage.otp=true from a controlled generation-to-final-delivery journey.',
  },
  controlled_mandate: {
    wave: 5,
    title: 'Complete one controlled mandate journey',
    ownerRole: 'pilot agent and release operator',
    documentTypes: ['mandate'],
    dependsOn: ['renderer_capacity'],
    executionMode: 'controlled_user_journey',
    steps: [
      'Use a pilot agent to complete the seller inputs through the ordinary mandate interface.',
      'Generate, review, approve, sign, and securely deliver the final mandate.',
      'Retain the packet, version, signing, delivery, and operational evidence for certification.',
    ],
    commands: ['npm run verify:legal-documents:phase-l1'],
    acceptance: 'L1 reports coverage.mandate=true from a controlled generation-to-final-delivery journey.',
  },
  support_lifecycle: {
    wave: 6,
    title: 'Prove support ownership and lifecycle closure',
    ownerRole: 'support operations',
    documentTypes: ['otp', 'mandate'],
    dependsOn: ['controlled_otp', 'controlled_mandate'],
    executionMode: 'controlled_operational_verification',
    steps: [
      'Acknowledge and resolve controlled generation support cases with accountable actors.',
      'Confirm SLA ordering, overdue visibility, lifecycle audits, and completed-case exclusion.',
    ],
    commands: ['npm run verify:legal-documents:phase-k2', 'npm run verify:legal-documents:phase-k3'],
    acceptance: 'K3 reports READY_FOR_L1 with attributable support closure and valid SLA ordering.',
  },
})

function actionIdsFor(blocker = {}) {
  const code = String(blocker.code || '').toUpperCase()
  if (code.startsWith('A')) return ['platform_targeting']
  if (code.startsWith('B1_') || code.startsWith('C1_') || code.startsWith('C2_') || blocker.domain === 'rendering') return ['governed_source']
  if (code.startsWith('B2_') || code.startsWith('B3_') || blocker.domain === 'approval') return ['counsel_approval']
  if (code === 'L1_OTP_JOURNEY_UNPROVEN') return ['controlled_otp']
  if (code === 'L1_MANDATE_JOURNEY_UNPROVEN') return ['controlled_mandate']
  if (code === 'I3_CONTROLLED_TARGETS_MISSING') return ['controlled_otp', 'controlled_mandate']
  if (code.startsWith('I') || blocker.domain === 'capacity') return ['renderer_capacity']
  if (code.startsWith('J') || code.startsWith('K') || blocker.domain === 'lifecycle') return ['support_lifecycle']
  return []
}

function genericAction(blocker, index) {
  return {
    id: `manual_${String(blocker.code || index).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    wave: 6,
    title: `Resolve ${blocker.code || 'unclassified launch blocker'}`,
    ownerRole: 'release owner',
    documentTypes: ['otp', 'mandate'],
    dependsOn: [],
    executionMode: 'manual_remediation',
    steps: [blocker.solution || 'Resolve the upstream blocker and rerun its terminal verifier.'],
    commands: ['npm run verify:legal-documents:phase-l1'],
    acceptance: `${blocker.code || 'The blocker'} is absent from the next L1 certificate.`,
  }
}

export function buildLegalDocumentLaunchRemediationPlan(l1 = {}) {
  const blockers = Array.isArray(l1.blockers) ? l1.blockers : []
  const selected = new Map()
  blockers.forEach((blocker, index) => {
    const ids = actionIdsFor(blocker)
    const targets = ids.length ? ids.map((id) => ({ id, ...ACTIONS[id] })) : [genericAction(blocker, index)]
    for (const target of targets) {
      const current = selected.get(target.id) || { ...target, blockerCodes: [], blockerSolutions: [] }
      if (blocker.code && !current.blockerCodes.includes(blocker.code)) current.blockerCodes.push(blocker.code)
      if (blocker.solution && !current.blockerSolutions.includes(blocker.solution)) current.blockerSolutions.push(blocker.solution)
      selected.set(target.id, current)
    }
  })

  const selectedIds = new Set(selected.keys())
  const actions = [...selected.values()]
    .map((action) => ({ ...action, dependsOn: action.dependsOn.filter((id) => selectedIds.has(id)) }))
    .sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id))

  if (actions.length) {
    const dependedOn = new Set(actions.flatMap((action) => action.dependsOn))
    const terminalIds = actions.filter((action) => !dependedOn.has(action.id)).map((action) => action.id)
    actions.push({
      id: 'launch_recertification', wave: 7, title: 'Re-run the consolidated launch certificate', ownerRole: 'release owner', documentTypes: ['otp', 'mandate'], dependsOn: terminalIds,
      executionMode: 'read_only_verification', steps: ['Run L1 after every remediation wave is accepted.', 'Do not widen the cohort unless the certificate reports READY_FOR_L2.'], commands: ['npm run verify:legal-documents:phase-l1'], acceptance: 'L1 reports READY_FOR_L2 with zero blockers and both document journeys covered.', blockerCodes: [], blockerSolutions: [],
    })
  }

  const waves = [...new Set(actions.map((action) => action.wave))].map((wave) => ({ wave, actionIds: actions.filter((action) => action.wave === wave).map((action) => action.id) }))
  const assignedCodes = new Set(actions.flatMap((action) => action.blockerCodes))
  const unassignedBlockers = blockers.filter((blocker) => blocker.code && !assignedCodes.has(blocker.code))
  const planComplete = unassignedBlockers.length === 0 && actions.every((action) => action.ownerRole && action.acceptance && action.commands.length)
  const launchReady = l1.status === 'READY_FOR_L2' && blockers.length === 0
  return {
    status: launchReady ? 'READY_FOR_L3' : planComplete ? 'REMEDIATION_PLAN_READY' : 'PLAN_INCOMPLETE',
    launchReady,
    planComplete,
    blockerCount: blockers.length,
    actions,
    waves,
    unassignedBlockers,
    nextAction: actions[0]?.id || 'proceed_to_l3',
  }
}

export { ACTIONS as LEGAL_DOCUMENT_L2_ACTION_CATALOG }
