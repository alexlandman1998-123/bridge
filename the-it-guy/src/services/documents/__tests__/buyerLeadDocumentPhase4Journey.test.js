import { describe, expect, it } from 'vitest'
import { reconcileStagedBuyerLeadDocuments } from '../buyerLeadDocumentHandoffService.js'
import { buildBuyerLeadDocumentReadModel, fetchBuyerLeadCanonicalDocumentRows } from '../buyerLeadDocumentReadService.js'
import { buildCanonicalBuyerDocumentCenter } from '../../clientPortalWorkspaceService.js'

const organisationId = '11111111-1111-4111-8111-111111111111'
const leadId = '22222222-2222-4222-8222-222222222222'
const transactionId = '33333333-3333-4333-8333-333333333333'
const filePath = `organisations/${organisationId}/buyer-leads/${leadId}/buyer_id_document/historical-id.pdf`

function journeyClient() {
  const documents = []
  const lead = { lead_id: leadId, organisation_id: organisationId, raw_enquiry_payload: {
    agent_uploaded_buyer_documents: [{ document_type: 'buyer_id_document', storage_bucket: 'documents', storage_path: filePath, fileName: 'historical-id.pdf' }],
  } }
  return {
    documents,
    lead,
    async rpc(_name, args) {
      const document = documents.find(row => row.id === args.p_document_id)
      document.canonical_requirement_instance_id = 'signed-otp-requirement'
      document.status = 'under_review'
      return { data: { ok: true, requirementInstanceId: 'signed-otp-requirement' }, error: null }
    },
    storage: { from() { return { async info() { return { data: { size: 256 }, error: null } } } } },
    from(table) {
      const filters = []
      let insert = null
      const query = {
        select() { return query },
        eq(key, value) { filters.push([key, value]); return query },
        insert(row) { insert = row; return query },
        async maybeSingle() {
          const rows = table === 'transactions'
            ? [{ id: transactionId, organisation_id: organisationId, originating_buyer_lead_id: leadId }]
            : table === 'leads' ? [lead] : documents
          return { data: rows.find((row) => filters.every(([key, value]) => row[key] === value)) || null, error: null }
        },
        async single() {
          const row = { id: `document-${documents.length + 1}`, ...insert }
          documents.push(row)
          return { data: row, error: null }
        },
        then(resolve) {
          return Promise.resolve({ data: (table === 'documents' ? documents : [])
            .filter((row) => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve)
        },
      }
      return query
    },
  }
}

describe('historical buyer file journey', () => {
  it('keeps a pre-transaction OTP available on the buyer lead and shared transaction checklist after conversion', async () => {
    const client = journeyClient()
    const otp = { key: 'uploaded_otp', source: 'agent_otp_upload', storageBucket: 'documents', storagePath: `buyer-otp-documents/${organisationId}/${leadId}/uploaded_otp/signed.pdf`, fileName: 'signed.pdf' }
    client.lead.raw_enquiry_payload = { buyerOtpDocument: otp, buyerOtpDocuments: [otp] }
    const context = { transactionId, organisationId, leadId }
    expect((await reconcileStagedBuyerLeadDocuments(client, context)).summary.needsHandoff).toBe(1)
    expect(client.documents).toHaveLength(0)
    await reconcileStagedBuyerLeadDocuments(client, context, { dryRun: false })
    const agentRows = await fetchBuyerLeadCanonicalDocumentRows(client, context)
    const agent = buildBuyerLeadDocumentReadModel({ leadRows: [otp], canonicalRows: agentRows, hasTransaction: true })
    expect(agent.uploads).toHaveLength(1)
    expect(agent.uploads[0]).toMatchObject({ storagePath: otp.storagePath, isCanonical: true, status: 'under_review' })
    const document = client.documents[0]
    for (const role of ['buyer', 'seller']) {
      const portal = buildCanonicalBuyerDocumentCenter({ documents: [document], requirements: [{
        id: 'signed-otp-requirement', document_definition_key: 'signed_otp', pack_key: 'sale', status: 'under_review',
        satisfied_by_document_id: document.id, document_definitions: { display_label: 'Signed offer to purchase' },
      }] }, '', role)
      expect(portal.requiredDocuments[0]).toMatchObject({ hasUploadedDocument: true, status: 'under_review' })
      expect(portal.requiredDocuments[0].linkedDocument.id).toBe(document.id)
    }
    await reconcileStagedBuyerLeadDocuments(client, context, { dryRun: false })
    expect(client.documents).toHaveLength(1)
    expect(client.lead.raw_enquiry_payload.buyerOtpDocument.storagePath).toBe(document.file_path)
  })

  it('carries one staged file to the transaction, shows it to both parties, and leaves requirements outstanding', async () => {
    const client = journeyClient()
    const context = { transactionId, organisationId, leadId }
    const before = await reconcileStagedBuyerLeadDocuments(client, context)
    expect(before.summary.needsHandoff).toBe(1)
    expect(client.documents).toHaveLength(0)

    const after = await reconcileStagedBuyerLeadDocuments(client, context, { dryRun: false })
    expect(after.handedOff).toBe(1)
    expect(after.summary.alreadyCanonical).toBe(1)
    expect(client.documents).toHaveLength(1)

    const agentRows = await fetchBuyerLeadCanonicalDocumentRows(client, context)
    const agent = buildBuyerLeadDocumentReadModel({ leadRows: client.lead.raw_enquiry_payload.agent_uploaded_buyer_documents, canonicalRows: agentRows, hasTransaction: true })
    expect(agent.uploads).toHaveLength(1)
    expect(agent.stagedCount).toBe(0)
    expect(agent.unmatchedCount).toBe(1)

    const portal = buildCanonicalBuyerDocumentCenter({
      role: 'buyer', transactionId,
      requirements: [{
        id: 'requirement-1', document_definition_key: 'buyer_id_document', pack_key: 'buyer_fica', status: 'required',
        document_definitions: { display_label: 'Buyer ID document' },
      }],
      documents: client.documents.map((document) => ({ ...document, file_name: 'historical-id.pdf' })),
    })
    expect(portal.requiredDocuments[0].status).toBe('required')
    expect(portal.requiredDocuments[0].hasUploadedDocument).toBe(false)
    expect(portal.unmatchedDocuments).toHaveLength(1)
    expect(portal.summary.outstanding).toBe(1)
    expect(portal.summary.uploaded).toBe(1)

    const rerun = await reconcileStagedBuyerLeadDocuments(client, context, { dryRun: false })
    expect(rerun.summary.alreadyCanonical).toBe(1)
    expect(client.documents).toHaveLength(1)
  })
})
