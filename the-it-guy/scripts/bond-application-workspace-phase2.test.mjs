import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AGENT_BOND_APPLICATION_WORKSPACE_FALLBACK_VERSION,
  AGENT_BOND_APPLICATION_WORKSPACE_VERSION,
  buildAgentBondApplicationWorkspace,
} from '../src/modules/bond/application/workspace/index.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDirectory, '..')
const repositoryRoot = path.resolve(appRoot, '..')
const migrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/20260828195452_agent_bond_application_workspace_view.sql',
)

function fixture() {
  return {
    transaction: { id: 'transaction-1' },
    bondApplication: {
      id: 'canonical-application-1',
      transactionId: 'transaction-1',
      status: 'ready_for_review',
      revision: 4,
      activeSubmissionId: 'submission-1',
      updatedAt: '2026-08-28T18:00:00Z',
      sharedSections: { applicant: { identityNumber: 'must-not-leak' } },
      metadata: { internal: 'must-not-leak' },
      participants: [{
        id: 'participant-1',
        participantKey: 'primary',
        role: 'primary_applicant',
        status: 'ready_for_submission',
        personId: 'person-private',
        contactId: 'contact-private',
      }],
      documentRequirements: [{
        id: 'requirement-1',
        requirementKey: 'proof_of_income',
        canonicalDocumentType: 'proof_of_income',
        requiredBefore: 'bank_submission',
        satisfactionMode: 'document',
        status: 'active',
      }],
    },
    originatorProgress: {
      id: 'package-1',
      transaction_id: 'transaction-1',
      bond_application_id: 'canonical-application-1',
      submission_id: 'submission-1',
      transaction_bond_application_id: 'lender-application-1',
      destination_key: 'bond_originator_intake',
      status: 'accepted_by_originator',
      documentRequests: [{ id: 'request-1', status: 'sent' }],
      offerCaptures: [],
      grantCaptures: [],
    },
    financeWorkflow: {
      workflow: {
        id: 'finance-workflow-1',
        transactionId: 'transaction-1',
        workflowType: 'bond_hybrid',
        currentStage: 'applications_submitted',
        status: 'active',
      },
      applications: [{
        id: 'lender-application-1',
        transactionId: 'transaction-1',
        workflowId: 'finance-workflow-1',
        bankName: 'ABSA',
        status: 'submitted',
        notes: 'must-not-leak',
      }],
      quotes: [{
        id: 'quote-1',
        transactionId: 'transaction-1',
        workflowId: 'finance-workflow-1',
        bondApplicationId: 'lender-application-1',
        bankName: 'ABSA',
        quoteStatus: 'received',
        notes: 'must-not-leak',
      }],
      decisions: [],
      bankOutcomes: [],
      instruction: null,
    },
    serverIdentity: {
      transactionId: 'transaction-1',
      canonicalBondApplicationId: 'canonical-application-1',
      activeSubmissionId: 'submission-1',
      exportPackageId: 'package-1',
      financeWorkflowId: 'finance-workflow-1',
      transactionBondApplicationId: 'lender-application-1',
      lenderSubmissionIds: ['lender-application-1'],
    },
  }
}

{
  const workspace = buildAgentBondApplicationWorkspace(fixture())
  assert.equal(workspace.version, AGENT_BOND_APPLICATION_WORKSPACE_FALLBACK_VERSION)
  assert.equal(workspace.source, 'client_fallback')
  assert.equal(workspace.available, true)
  assert.equal(workspace.valid, true)
  assert.equal(workspace.identity.canonicalBondApplicationId, 'canonical-application-1')
  assert.equal(workspace.identity.transactionBondApplicationId, 'lender-application-1')
  assert.equal(workspace.application.participantSummary.ready, 1)
  assert.equal(workspace.application.documentRequirementSummary.outstanding, 1)
  assert.equal(workspace.originator.documentRequests.length, 1)
  assert.equal(workspace.finance.applications.length, 1)
  assert.equal(workspace.lastUpdatedAt, '2026-08-28T18:00:00.000Z')

  const serialized = JSON.stringify(workspace)
  assert.ok(!serialized.includes('must-not-leak'))
  assert.ok(!serialized.includes('person-private'))
  assert.ok(!serialized.includes('contact-private'))
  assert.ok(!('sharedSections' in workspace.application))
  assert.ok(!('metadata' in workspace.application))
  assert.ok(!('notes' in workspace.finance.applications[0]))
  assert.ok(!('notes' in workspace.finance.quotes[0]))
}

{
  const base = fixture()
  const workspaceView = {
    version: AGENT_BOND_APPLICATION_WORKSPACE_VERSION,
    available: true,
    identity: base.serverIdentity,
    application: base.bondApplication,
    originator: {
      package: {
        id: 'package-1',
        transactionId: 'transaction-1',
        canonicalBondApplicationId: 'canonical-application-1',
        transactionBondApplicationId: 'lender-application-1',
      },
      progressEvents: [],
      documentRequests: [],
      offerCaptures: [],
      grantCaptures: [],
    },
    finance: base.financeWorkflow,
    guarantees: {
      steps: [{ workflowKey: 'attorney_bond', stepKey: 'guarantees_issued', status: 'not_started' }],
    },
    lastUpdatedAt: '2026-08-28T19:54:52Z',
  }
  const workspace = buildAgentBondApplicationWorkspace({
    ...base,
    workspaceView,
  })
  assert.equal(workspace.source, 'database_rpc')
  assert.equal(workspace.version, AGENT_BOND_APPLICATION_WORKSPACE_VERSION)
  assert.equal(workspace.valid, true)
  assert.equal(workspace.guarantees.steps[0].stepKey, 'guarantees_issued')
  assert.equal(workspace.lastUpdatedAt, '2026-08-28T19:54:52Z')
}

{
  const workspace = buildAgentBondApplicationWorkspace({
    transaction: {
      id: 'transaction-awaiting-application',
      finance_managed_by: 'bond_originator',
      bond_originator: 'BetterBond Demo Desk',
    },
  })
  assert.equal(workspace.application, null)
  assert.equal(workspace.originatorAssigned, true)
  assert.equal(workspace.available, false)
  assert.equal(workspace.valid, true)
}

{
  const base = fixture()
  const workspace = buildAgentBondApplicationWorkspace({
    ...base,
    workspaceView: {
      version: AGENT_BOND_APPLICATION_WORKSPACE_VERSION,
      available: true,
      identity: { ...base.serverIdentity, canonicalBondApplicationId: 'wrong-application' },
      application: base.bondApplication,
      originator: { package: null },
      finance: base.financeWorkflow,
      guarantees: { steps: [] },
    },
  })
  assert.equal(workspace.valid, false, 'a mismatched server application must invalidate the workspace')
}

{
  const base = fixture()
  const workspace = buildAgentBondApplicationWorkspace({
    ...base,
    bondApplication: null,
  })
  assert.equal(workspace.valid, true)
  assert.equal(workspace.available, true)
  assert.equal(workspace.applicationSource, 'originator_package_reference')
  assert.equal(workspace.application.id, 'canonical-application-1')
  assert.equal(workspace.application.transactionId, 'transaction-1')
}

{
  const base = fixture()
  const workspace = buildAgentBondApplicationWorkspace({
    ...base,
    bondApplication: null,
    originatorProgress: {
      ...base.originatorProgress,
      bond_application_id: null,
    },
    serverIdentity: null,
  })
  assert.equal(workspace.application, null, 'an uncorrelated package must not invent an application reference')
  assert.equal(workspace.applicationSource, 'unavailable')
}

const migration = fs.readFileSync(migrationPath, 'utf8')
assert.match(migration, /bridge_agent_bond_application_workspace_view/)
assert.match(migration, /bridge_can_access_transaction_spine\(p_transaction_id\)/)
assert.doesNotMatch(migration, /auth\.role\(/, 'new RPC must not use deprecated auth.role() checks')
assert.match(migration, /package\.bond_application_id = v_application\.id/)
assert.match(migration, /request\.bond_application_id = v_application\.id/)
assert.match(migration, /offer\.bond_application_id = v_application\.id/)
assert.match(migration, /grant_capture\.bond_application_id = v_application\.id/)
assert.match(migration, /lender_application\.workflow_id = v_finance_workflow\.id/)
assert.match(migration, /quote\.workflow_id = v_finance_workflow\.id/)
assert.match(migration, /step\.workflow_key = 'attorney_bond'/)
assert.match(migration, /step\.step_key in \('guarantees_issued', 'guarantee_wording_accepted'\)/)
assert.match(migration, /grant execute on function public\.bridge_agent_bond_application_workspace_view\(uuid, uuid\) to authenticated/)
assert.match(migration, /grant execute on function public\.bridge_agent_bond_application_workspace_view\(uuid, uuid\) to service_role/)

for (const forbiddenField of ['destination_payload_json', 'snapshot_json', 'person_id', 'contact_id']) {
  assert.ok(!migration.includes(forbiddenField), `workspace RPC must not expose ${forbiddenField}`)
}

const apiSource = fs.readFileSync(path.join(appRoot, 'src/lib/api.js'), 'utf8')
assert.match(apiSource, /fetchAgentBondApplicationWorkspaceView\(client, canonicalTransactionId\)/)
assert.match(apiSource, /bondApplicationWorkspace = buildAgentBondApplicationWorkspace/)
assert.match(apiSource, /bondApplicationWorkspace,/)

console.log('bond application workspace phase 2 checks passed')
