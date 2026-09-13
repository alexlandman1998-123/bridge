import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildKnowledgeFactoryFicaHandoff,
  getKnowledgeFactoryFicaVerificationAvailability,
} from '../src/services/propertyIntelligence/knowledgeFactoryFicaVerificationService.js'

const migration = await readFile('../supabase/migrations/20260913200000_knowledge_factory_fica_verification_handoff_phase4.sql', 'utf8')
const edge = await readFile('../supabase/functions/knowledge-factory-fica/index.ts', 'utf8')

const handoff = buildKnowledgeFactoryFicaHandoff({
  organisationId: 'org-1', party: 'seller', partyType: 'trust', transactionId: 'transaction-1', declarationDocumentId: 'document-1',
  documentReadiness: { declarationReady: true, supportingDocumentsReady: true },
})
assert.equal(handoff.complete, true)
assert.equal(getKnowledgeFactoryFicaVerificationAvailability(handoff, 'not_configured').enabled, false)
assert.match(migration, /transaction_id uuid references public\.transactions/)
assert.match(migration, /declaration_document_id uuid references public\.documents/)
assert.match(migration, /provider_check_statuses jsonb/)
assert.match(edge, /knowledge_factory_fica_adapter_not_configured/)
assert.doesNotMatch(edge, /fetch\(/)
console.log('Knowledge Factory FICA phase 4 boundary checks passed.')
