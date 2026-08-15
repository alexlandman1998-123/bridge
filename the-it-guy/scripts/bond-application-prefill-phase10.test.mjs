import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BOND_APPLICATION_UX_WORKSPACE_VERSION,
  buildBondApplicationUxWorkspaceModel,
} from '../src/modules/bond/application/index.js'

const root = process.cwd()

const sections = [
  { key: 'summary', label: 'Application Summary' },
  { key: 'personal_details', label: 'Personal Details' },
  { key: 'contact_address', label: 'Contact & Address' },
  { key: 'documents', label: 'Documents' },
]

function runWorkspaceModelChecks() {
  const confirmWorkspace = buildBondApplicationUxWorkspaceModel({
    sections,
    activeSectionKey: 'summary',
    sectionStatusByKey: {
      summary: { total: 4, complete: 4, isComplete: true },
      personal_details: { total: 4, complete: 2, hasMissing: true },
      contact_address: { total: 4, complete: 4, isComplete: true },
      documents: { total: 1, complete: 0, hasMissing: true },
    },
    confirmedSectionKeys: ['contact_address'],
    activeConfirmationCards: [{ key: 'application_summary', complete: true }],
    requiredDocuments: [{ key: 'id', label: 'ID Document', complete: false }],
    progressPercent: 62,
  })

  assert.equal(confirmWorkspace.version, BOND_APPLICATION_UX_WORKSPACE_VERSION)
  assert.equal(confirmWorkspace.layout, 'task_workspace')
  assert.equal(confirmWorkspace.nextAction.key, 'confirm_section')
  assert.equal(confirmWorkspace.nextAction.targetSection, 'summary')
  assert.equal(confirmWorkspace.sectionCards.find((section) => section.key === 'contact_address').state, 'buyer_confirmed')
  assert.equal(confirmWorkspace.sectionCards.find((section) => section.key === 'personal_details').state, 'needs_input')
  assert.equal(confirmWorkspace.documentBlockers.length, 1)
  assert.equal(confirmWorkspace.blockerCount >= 2, true)
  assert.equal(confirmWorkspace.summaryCards.some((card) => card.key === 'blockers'), true)

  const missingFieldWorkspace = buildBondApplicationUxWorkspaceModel({
    sections,
    activeSectionKey: 'personal_details',
    sectionStatusByKey: {
      personal_details: { total: 4, complete: 2, hasMissing: true },
    },
    activeConfirmationCards: [{ key: 'primary_applicant', complete: false }],
    firstMissingCard: {
      firstMissingFieldPath: 'applicants.primary.id_number',
      firstMissingFieldLabel: 'ID number',
    },
    progressPercent: 40,
  })

  assert.equal(missingFieldWorkspace.nextAction.key, 'complete_missing_field')
  assert.equal(missingFieldWorkspace.nextAction.fieldPath, 'applicants.primary.id_number')

  const documentWorkspace = buildBondApplicationUxWorkspaceModel({
    sections,
    activeSectionKey: 'documents',
    sectionStatusByKey: Object.fromEntries(sections.map((section) => [section.key, { total: 1, complete: 1, isComplete: true }])),
    confirmedSectionKeys: sections.map((section) => section.key),
    requiredDocuments: [{ key: 'bank_statement', label: 'Bank Statement', complete: false }],
    progressPercent: 95,
  })

  assert.equal(documentWorkspace.nextAction.key, 'upload_document')
  assert.equal(documentWorkspace.nextAction.targetSection, 'documents')

  const submittedWorkspace = buildBondApplicationUxWorkspaceModel({
    sections,
    status: 'Submitted',
  })

  assert.equal(submittedWorkspace.nextAction.key, 'submitted')
  assert.equal(submittedWorkspace.nextAction.disabled, true)
}

async function runStaticChecks() {
  const [clientPortalSource, workspaceSource, indexSource, docSource, phase9Doc] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/ux/bondApplicationUxWorkspace.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-10-buyer-task-workspace-redesign.md'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-9-buyer-ux-audit-target-experience.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /buildBondApplicationUxWorkspaceModel/)
  assert.match(clientPortalSource, /data-bond-ux-task-workspace="phase-10"/)
  assert.match(clientPortalSource, /data-bond-ux-next-action-bar="true"/)
  assert.match(clientPortalSource, /data-bond-ux-section-stepper="true"/)
  assert.match(clientPortalSource, /Guided application path/)
  assert.match(clientPortalSource, /Confirm what is already filled first/)

  assert.match(workspaceSource, /BOND_APPLICATION_UX_WORKSPACE_VERSION/)
  assert.match(workspaceSource, /nextAction/)
  assert.match(workspaceSource, /task_workspace/)
  assert.match(workspaceSource, /upload_document/)
  assert.match(workspaceSource, /confirm_section/)

  assert.match(indexSource, /buildBondApplicationUxWorkspaceModel/)
  assert.match(indexSource, /BOND_APPLICATION_UX_WORKSPACE_VERSION/)

  assert.match(docSource, /Buyer Task Workspace Redesign/)
  assert.match(docSource, /data-bond-ux-task-workspace/)
  assert.match(docSource, /does not remove the legacy detailed fields/)
  assert.match(phase9Doc, /Phase 10 should implement/)
}

runWorkspaceModelChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 10 checks passed.')
