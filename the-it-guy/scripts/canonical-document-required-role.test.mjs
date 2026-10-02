import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const {
    canonicalInstanceToTransactionRequiredDocument,
    canonicalInstanceToDocumentRequest,
    syncCanonicalInstancesToTransactionRequiredDocuments,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')
  const canonicalInstance = {
    transaction_id: 'transaction-1',
    pack_key: 'transfer',
    status: 'pending',
    requirement_level: 'required',
  }

  const attorneyInstances = ['transfer_attorney', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney'].map((role, index) => ({
    ...canonicalInstance,
    id: `attorney-requirement-${index}`,
    context_type: 'transaction',
    document_definition_key: `attorney_document_${index}`,
    requested_from_role: role,
    visible_to_roles: ['transferring_attorney'],
  }))
  for (const instance of attorneyInstances) {
    const row = canonicalInstanceToTransactionRequiredDocument(instance)
    assert.equal(row.required_from_role, 'attorney')
    assert.equal(row.canonical_requirement_instance_id, instance.id)
    assert.equal(row.visibility_scope, 'shared')
    assert.equal(canonicalInstanceToDocumentRequest(instance).assigned_to_role, instance.requested_from_role)
  }

  const schema = readFileSync('sql/schema.sql', 'utf8')
  const roleConstraint = schema.match(/add constraint transaction_required_documents_required_from_role_check\s+check \(required_from_role in \(([^)]+)\)/)
  assert.ok(roleConstraint, 'Required-document role constraint should exist in the schema')
  const allowedRequiredRoles = new Set([...roleConstraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]))
  for (const role of allowedRequiredRoles) {
    const row = canonicalInstanceToTransactionRequiredDocument({ ...canonicalInstance, requested_from_role: role })
    assert.equal(row.required_from_role, ['buyer', 'seller'].includes(role) ? 'client' : role)
  }
  const savedRows = []
  const syncResult = await syncCanonicalInstancesToTransactionRequiredDocuments({
    transactionId: 'transaction-1',
    instances: attorneyInstances,
    client: {
      from(table) {
        assert.equal(table, 'transaction_required_documents')
        return {
          select() {
            return { eq: async () => ({ data: [], error: null }) }
          },
          upsert(rows) {
            for (const row of rows) {
              assert.equal(allowedRequiredRoles.has(row.required_from_role), true, `Unsupported stored role: ${row.required_from_role}`)
            }
            savedRows.push(...rows)
            return { select: async () => ({ data: rows, error: null }) }
          },
        }
      },
    },
  })
  assert.equal(syncResult.synced, attorneyInstances.length)
  assert.equal(savedRows.length, attorneyInstances.length)

  console.log('Canonical required-document role regression checks passed')
} finally {
  await server.close()
}
