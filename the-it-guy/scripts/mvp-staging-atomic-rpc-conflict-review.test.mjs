import assert from 'node:assert/strict'
import fs from 'node:fs'

const evidence = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-atomic-rpc-conflict-review-2026-07-19.json', 'utf8'),
)

assert.equal(evidence.targetFunction.requiredSignature, 'public.bridge_create_mvp_transaction(p_payload jsonb)')
assert.equal(evidence.targetFunction.currentDefinition.gitBlob, '12d0ffd8de1669870644de8512afa3de4cceaf68')
assert.equal(evidence.repositoryReview.currentMigrationFilesReferencingTarget.length, 1)
assert.equal(evidence.repositoryReview.reachableGitHistoryChangesContainingTarget.length, 2)
assert.equal(evidence.repositoryReview.differentImplementationFound, false)
assert.equal(evidence.repositoryReview.historicalRenameOrDeleteFound, false)
assert.equal(evidence.stagingReview.namedRpcProbe.code, 'PGRST202')
assert.deepEqual(evidence.stagingReview.generatedRestApiSchema.matchingRpcPaths, [])
assert.equal(evidence.decision, 'no_conflicting_rpc_version_detected')
assert.match(evidence.scope, /No migration, transaction, notification, user, document, or database record was created, updated, or deleted/)

console.log('mvp-staging-atomic-rpc-conflict-review: passed')
