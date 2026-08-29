import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_IDENTITY_ISSUES,
  buildBondApplicationIdentity,
} from '../src/modules/bond/application/identity/index.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDirectory, '..')
const repositoryRoot = path.resolve(appRoot, '..')

function makeFixture() {
  return {
    transaction: { id: 'transaction-1' },
    bondApplication: {
      id: 'canonical-application-1',
      transactionId: 'transaction-1',
      activeSubmissionId: 'signed-submission-1',
    },
    originatorProgress: {
      id: 'export-package-1',
      transaction_id: 'transaction-1',
      bond_application_id: 'canonical-application-1',
      submission_id: 'signed-submission-1',
      transaction_bond_application_id: 'lender-submission-absa',
    },
    financeWorkflow: {
      workflow: { id: 'finance-workflow-1', transactionId: 'transaction-1' },
      applications: [
        {
          id: 'lender-submission-absa',
          transactionId: 'transaction-1',
          workflowId: 'finance-workflow-1',
          bankName: 'ABSA',
        },
        {
          id: 'lender-submission-fnb',
          transactionId: 'transaction-1',
          workflowId: 'finance-workflow-1',
          bankName: 'FNB',
        },
      ],
      quotes: [
        {
          id: 'quote-absa',
          transactionId: 'transaction-1',
          workflowId: 'finance-workflow-1',
          bondApplicationId: 'lender-submission-absa',
        },
      ],
    },
    serverIdentity: {
      transactionId: 'transaction-1',
      canonicalBondApplicationId: 'canonical-application-1',
      activeSubmissionId: 'signed-submission-1',
      exportPackageId: 'export-package-1',
      financeWorkflowId: 'finance-workflow-1',
      transactionBondApplicationId: 'lender-submission-absa',
      lenderSubmissionIds: ['lender-submission-absa', 'lender-submission-fnb'],
    },
  }
}

{
  const identity = buildBondApplicationIdentity(makeFixture())
  assert.equal(identity.available, true)
  assert.equal(identity.valid, true)
  assert.equal(identity.transactionId, 'transaction-1')
  assert.equal(identity.canonicalBondApplicationId, 'canonical-application-1')
  assert.equal(identity.activeSubmissionId, 'signed-submission-1')
  assert.equal(identity.exportPackageId, 'export-package-1')
  assert.equal(identity.financeWorkflowId, 'finance-workflow-1')
  assert.equal(identity.transactionBondApplicationId, 'lender-submission-absa')
  assert.deepEqual(identity.lenderSubmissionIds, ['lender-submission-absa', 'lender-submission-fnb'])
  assert.notEqual(
    identity.canonicalBondApplicationId,
    identity.transactionBondApplicationId,
    'canonical application ids must remain distinct from lender-submission ids',
  )
}

{
  const fixture = makeFixture()
  fixture.originatorProgress = null
  fixture.serverIdentity = null
  fixture.financeWorkflow = null
  const identity = buildBondApplicationIdentity(fixture)
  assert.equal(identity.available, true, 'an application must remain available before an export package exists')
  assert.equal(identity.valid, true)
  assert.equal(identity.canonicalBondApplicationId, 'canonical-application-1')
  assert.equal(identity.exportPackageId, null)
}

{
  const fixture = makeFixture()
  fixture.originatorProgress.bond_application_id = 'canonical-application-from-another-file'
  const identity = buildBondApplicationIdentity(fixture)
  assert.equal(identity.valid, false)
  assert.ok(identity.issues.some((issue) => issue.code === BOND_APPLICATION_IDENTITY_ISSUES.canonicalApplicationMismatch))
  assert.ok(identity.issues.some((issue) => issue.code === BOND_APPLICATION_IDENTITY_ISSUES.exportPackageApplicationMismatch))
}

{
  const fixture = makeFixture()
  fixture.bondApplication.transactionId = 'transaction-2'
  const identity = buildBondApplicationIdentity(fixture)
  assert.equal(identity.valid, false)
  assert.ok(identity.issues.some((issue) => issue.code === BOND_APPLICATION_IDENTITY_ISSUES.canonicalApplicationTransactionMismatch))
}

{
  const fixture = makeFixture()
  fixture.financeWorkflow.quotes[0].bondApplicationId = 'canonical-application-1'
  const identity = buildBondApplicationIdentity(fixture)
  assert.equal(identity.valid, false)
  assert.ok(identity.issues.some((issue) => issue.code === BOND_APPLICATION_IDENTITY_ISSUES.quoteLenderSubmissionMismatch))
}

{
  const fixture = makeFixture()
  fixture.serverIdentity.transactionBondApplicationId = 'lender-submission-nedbank'
  fixture.originatorProgress.transaction_bond_application_id = 'lender-submission-nedbank'
  const identity = buildBondApplicationIdentity(fixture)
  assert.equal(identity.valid, false)
  assert.ok(identity.issues.some((issue) => issue.code === BOND_APPLICATION_IDENTITY_ISSUES.exportPackageLenderSubmissionMismatch))
}

const migrationPath = path.join(
  repositoryRoot,
  'supabase/migrations/202608280001_agent_bond_application_identity.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
assert.match(migration, /bridge_agent_bond_application_identity/)
assert.match(migration, /bridge_can_access_transaction_spine\(p_transaction_id\)/)
assert.match(migration, /application\.transaction_id = p_transaction_id/)
assert.match(migration, /package\.bond_application_id = v_application\.id/)
assert.match(migration, /package\.transaction_bond_application_id/)
assert.match(migration, /application\.workflow_id = v_finance_workflow_id/)
assert.match(migration, /grant execute on function public\.bridge_agent_bond_application_identity\(uuid, uuid\) to authenticated/)

const apiSource = fs.readFileSync(path.join(appRoot, 'src/lib/api.js'), 'utf8')
assert.match(apiSource, /fetchAgentBondApplicationIdentity\(client, canonicalTransactionId\)/)
assert.match(apiSource, /bondApplicationIdentity = buildBondApplicationIdentity/)
assert.match(apiSource, /bondApplicationIdentity,/)

console.log('bond application identity phase 1 checks passed')
