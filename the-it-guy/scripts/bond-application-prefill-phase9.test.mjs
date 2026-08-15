import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST,
  BOND_APPLICATION_UX_AUDIT_VERSION,
  buildBondApplicationUxAudit,
} from '../src/modules/bond/application/index.js'

const root = process.cwd()

function runAuditContractChecks() {
  const audit = buildBondApplicationUxAudit()

  assert.equal(audit.version, BOND_APPLICATION_UX_AUDIT_VERSION)
  assert.equal(audit.scope, 'buyer_portal_bond_application_ux')
  assert.equal(audit.status, 'phase_9_audit_complete')
  assert.equal(audit.currentSurfaces.length >= 10, true)
  assert.equal(audit.frictionPoints.length >= 10, true)
  assert.equal(audit.targetUxPrinciples.length >= 7, true)
  assert.equal(audit.phase10RedesignChecklist.length >= 10, true)
  assert.equal(audit.metrics.currentSurfaceCount, audit.currentSurfaces.length)
  assert.equal(audit.metrics.highSeverityFrictionCount >= 5, true)
  assert.equal(audit.gapsByPhase.phase10.includes('modal_density'), true)
  assert.equal(audit.gapsByPhase.phase10.includes('mobile_risk'), true)
  assert.equal(audit.gapsByPhase.phase13.includes('readiness_not_decisioned'), true)
  assert.equal(audit.gapsByPhase.phase14.includes('deep_link_resume_visibility'), true)
  assert.equal(audit.gapsByPhase.phase16.includes('browser_e2e_gap'), true)

  const checklistKeys = BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST.map((item) => item.key)
  assert.ok(checklistKeys.includes('replace_modal_shell_with_task_workspace'))
  assert.ok(checklistKeys.includes('unify_navigation'))
  assert.ok(checklistKeys.includes('extend_confirmation_cards'))
  assert.ok(checklistKeys.includes('preserve_originator_metadata'))
}

async function runStaticChecks() {
  const [clientPortalSource, auditSource, indexSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/ux/bondApplicationUxAudit.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-9-buyer-ux-audit-target-experience.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /buyer-bond-application-title/)
  assert.match(clientPortalSource, /data-bond-prefill-review-panel="true"/)
  assert.match(clientPortalSource, /data-bond-prefill-confirmation-cards="true"/)
  assert.match(clientPortalSource, /data-bond-prefill-section-actions="true"/)
  assert.match(clientPortalSource, /Complete the OTP step/)
  assert.match(clientPortalSource, /Submit Application/)

  assert.match(auditSource, /BOND_APPLICATION_CURRENT_UX_SURFACES/)
  assert.match(auditSource, /BOND_APPLICATION_UX_FRICTION_POINTS/)
  assert.match(auditSource, /BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST/)
  assert.match(auditSource, /Guided, not form-like/)
  assert.match(auditSource, /desktop-first/)

  assert.match(indexSource, /buildBondApplicationUxAudit/)
  assert.match(indexSource, /BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST/)

  assert.match(docSource, /Buyer UX Audit and Target Experience/)
  assert.match(docSource, /The modal still feels like a large desktop form container/)
  assert.match(docSource, /Phase 10 should implement/)
  assert.match(docSource, /does not redesign the live UI yet/)
}

runAuditContractChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 9 checks passed.')
