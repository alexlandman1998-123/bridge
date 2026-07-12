#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ATTORNEY_WORKFLOW_PERMISSION_CONTRACT,
  ATTORNEY_WORKFLOW_PHASES,
} from '../src/core/attorney/attorneyWorkflowLaunchContract.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function assertIncludes(source, expected, message) {
  assert.equal(source.includes(expected), true, message)
}

const permissionServiceSource = read('src/services/permissions/attorneyPermissionService.js')
const attorneyPermissionsSource = read('src/lib/attorneyPermissions.js')
const laneServiceSource = read('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase2AuditSource = read('docs/audits/attorney-workflow-phase2-permission-lock.md')
const packageSource = read('package.json')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')

assert.equal(
  ATTORNEY_WORKFLOW_PERMISSION_CONTRACT.every((item) => item.phase === ATTORNEY_WORKFLOW_PHASES.phase2),
  true,
  'Permission contract rows should remain assigned to Phase 2.',
)
assert.deepEqual(
  ATTORNEY_WORKFLOW_PERMISSION_CONTRACT.map((item) => [item.role, item.mayEditLanes]).sort(),
  [
    ['bond_attorney', ['bond']],
    ['cancellation_attorney', ['cancellation']],
    ['transfer_attorney', ['transfer']],
  ].sort(),
  'Each attorney role should only edit its own lane by default.',
)

assert.doesNotMatch(permissionServiceSource, /PHASE_ONE_SHARED_WORKFLOW_EDITING/, 'Phase 2 must remove the broad Phase 1 edit flag.')
assert.doesNotMatch(permissionServiceSource, /canEditAllWorkflowLanesInPhaseOne/, 'Phase 2 must remove the broad all-lane edit branch.')
assert.match(permissionServiceSource, /const canMutateLane = Boolean\(canActOnLane\)/, 'Lane mutation should derive only from lane access.')
for (const permissionKey of [
  'canUpdateLane',
  'canRequestDocuments',
  'canUploadDocuments',
  'canReviewDocuments',
  'canManageSigning',
]) {
  assert.match(permissionServiceSource, new RegExp(`${permissionKey}: canMutateLane`), `${permissionKey} should be lane-scoped.`)
}
assert.match(permissionServiceSource, /canPublishClientVisible[\s\S]*canMutateLane/, 'Client-visible publishing should require lane mutation rights.')

assert.doesNotMatch(attorneyPermissionsSource, /allow_management_lane_override/, 'Phase 2 override should not depend on a hidden firm column.')
assert.match(attorneyPermissionsSource, /const laneFirmId = normalizeText\(activeLaneAssignment\?\.attorney_firm_id \|\| activeLaneAssignment\?\.firm_id \|\| firmId\)/, 'Lane firm id should be resolved from the active lane assignment.')
assertIncludes(
  attorneyPermissionsSource,
  'const fallbackMembership = activeLaneAssignment\n    ? null',
  'Membership fallback should be disabled when the target lane already has an assigned firm.',
)
assert.match(attorneyPermissionsSource, /const membershipFirmMatchesLane = Boolean\(activeMembership\?\.firmId && \(!laneFirmId \|\| activeMembership\.firmId === laneFirmId\)\)/, 'Management rights should require membership in the lane firm.')
assert.match(attorneyPermissionsSource, /const managementOverrideEnabled = Boolean\(isManagementUser && activeLaneAssignment && overrideFirmId\)/, 'Management override should be tied to an assigned lane.')
assert.match(attorneyPermissionsSource, /isManagementUser && managementOverrideEnabled && canViewMatter && overrideFirmId/, 'Management override should still require matter access.')

assert.match(laneServiceSource, /await assertCanUpdateLane\(\{ user: actor, transactionId: normalizedTransactionId, laneKey: normalizedLaneKey \}\)/, 'Lane step updates should use the scoped permission guard.')
assert.match(laneServiceSource, /await assertCanRequestLaneDocument\(\{ user: actor, transactionId: normalizedTransactionId, laneKey: normalizedLaneKey \}\)/, 'Document requests should use the scoped permission guard.')
assert.match(laneServiceSource, /await assertCanReviewLaneDocument\(\{ user: actor, transactionId: normalizedTransactionId, laneKey: normalizedLaneKey \}\)/, 'Document reviews should use the scoped permission guard.')

assert.match(phase0AuditSource, /\| B-ATTY-0-2 \| Closed \| Security \/ Platform \| Shared Phase 1 workflow editing has been narrowed to lane\/firm scope\. \| Phase 2 \|/)
assert.match(phase2AuditSource, /# Attorney Workflow Phase 2 Permission Lock/)
assert.match(phase2AuditSource, /Decision: GO TO PHASE 3 WITH LANE-SCOPED ATTORNEY MUTATIONS/)

assert.match(packageSource, /"test:attorney-workflow-phase2-permission-lock":\s*"node scripts\/attorney-workflow-phase2-permission-lock\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase2-permission-lock":\s*"node scripts\/attorney-workflow-phase2-permission-lock\.test\.mjs"/)
assert.match(launchReadinessSource, /Attorney workflow Phase 2 permission lock: `docs\/audits\/attorney-workflow-phase2-permission-lock\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase2-permission-lock/)

console.log('attorney workflow Phase 2 permission lock tests passed')
